import {finite,nonStarter,verifiedBeforeStart} from './modelSafety';
import {lockMarketSnapshot,snapshotFromHorses} from './marketSnapshot';
export const PROBABILITY_VERSION='probability-shadow-v1-t12-market90';
export const PROBABILITY_CONFIG={scoreField:'_finalScore',temperature:12,modelWeight:0.1,marketWeight:0.9,fit:'unfitted-fixed-exploratory'};
const normalize=(logs:number[])=>{const max=Math.max(...logs),values=logs.map(x=>Math.exp(x-max)),total=values.reduce((a,b)=>a+b,0);return values.map(x=>x/total);};
export function probabilityCandidates(horses:any[],metadata:any,now:string){
 const active=horses.filter(h=>!nonStarter(h));
 const market=lockMarketSnapshot(snapshotFromHorses(horses,metadata.sourceName),now,metadata.scheduledStart);
 const scoreReady=active.length>=2&&active.every(h=>finite(h._finalScore)!==null);
 const model=scoreReady?normalize(active.map(h=>Number(h._finalScore)/12)):null;
 const odds=new Map(market.rows.map(h=>[String(h.umaban),Number(h.odds)]));
 const marketReady=market.candidate.usable&&active.every(h=>odds.get(String(h.umaban))>=1);
 const q=marketReady?normalize(active.map(h=>-Math.log(odds.get(String(h.umaban))))):null;
 const combined=model&&q?normalize(model.map((p,i)=>.1*Math.log(p)+.9*Math.log(q[i]))):null;
 const entry=(probabilities:number[]|null,reason:string)=>({status:probabilities?'ready':'unavailable',reason:probabilities?null:reason,predictions:probabilities?active.map((h,i)=>({umaban:String(h.umaban),name:h.name,probability:probabilities[i]})):[]});
 return {version:PROBABILITY_VERSION,config:{...PROBABILITY_CONFIG},lockedAt:now,models:{
 Model:entry(model,'全出走馬の点数がそろっていません'),Market:entry(q,market.candidate.reason||'市場情報不明'),Combined:entry(combined,model?market.candidate.reason||'市場情報不明':'全出走馬の点数がそろっていません')
 }};
}
// Every reported comparison uses exactly the same races and frozen probabilities.
export function probabilityReport(records:any[],options:any={}){
 const keys=['Model','Market','Combined'];const totals:any=Object.fromEntries(keys.map(k=>[k,{loss:0,brier:0,wins:0,bins:Array.from({length:5},()=>({n:0,sum:0,wins:0}))}]));
 const days=new Map<string,number[]>();let n=0,excluded=0;
 for(const r of records){
  if(r.status!=='completed'||(options.date&&r.raceDate!==options.date)||(options.track&&r.track!==options.track)||(options.build&&r.predictionLock?.build!==options.build)||(options.distance&&options.distance!==distanceBand(r.distance)))continue;
  const saved=r.predictionLock?.probabilities;
  if(saved?.version!==PROBABILITY_VERSION)continue;
  const winner=r.horses.filter(h=>finite(h.finish)===1);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.raceDate||'')||saved.lockedAt!==r.predictionLock.lockedAt||JSON.stringify(saved.config)!==JSON.stringify(PROBABILITY_CONFIG)||!verifiedBeforeStart(r)||r.evaluationExcluded||winner.length!==1||keys.some(k=>saved.models[k]?.status!=='ready')){excluded++;continue;}
  const active=r.horses.filter(h=>!nonStarter(h));
  const identity=(xs:any[])=>xs.map(h=>String(h.umaban)+'|'+h.name).sort().join('\n');
  if(keys.some(k=>{const p=saved.models[k].predictions;return identity(p)!==identity(active)||p.some(h=>!Number.isFinite(h.probability)||h.probability<=0||h.probability>1)||Math.abs(p.reduce((a,h)=>a+h.probability,0)-1)>1e-8;})){excluded++;continue;}
  const losses:any={};
  for(const k of keys){const ps=saved.models[k].predictions,t=totals[k];const hit=ps.find(h=>h.umaban===String(winner[0].umaban));losses[k]=-Math.log(hit.probability);t.loss+=losses[k];t.brier+=ps.reduce((a,h)=>a+(h.probability-Number(h.umaban===hit.umaban))**2,0);t.wins+=Number([...ps].sort((a,b)=>b.probability-a.probability||Number(a.umaban)-Number(b.umaban))[0].umaban===hit.umaban);
   for(const h of ps){const b=t.bins[Math.min(4,Math.floor(h.probability*5))];b.n++;b.sum+=h.probability;b.wins+=Number(h.umaban===hit.umaban);}
  }
  n++;const list=days.get(r.raceDate)||[];list.push(losses.Market-losses.Combined);days.set(r.raceDate,list);
 }
 const blocks=[...days.values()];let seed=20261126;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const samples:number[]=[];
 if(blocks.length>=2)for(let b=0;b<2000;b++){let sum=0,count=0;for(let i=0;i<blocks.length;i++){const block=blocks[Math.floor(random()*blocks.length)];sum+=block.reduce((a,v)=>a+v,0);count+=block.length;}samples.push(sum/count);}
 samples.sort((a,b)=>a-b);
 return {n,excluded,days:blocks.length,totals,difference:n?(totals.Market.loss-totals.Combined.loss)/n:null,ci:samples.length?[samples[49],samples[1949]]:null};
}
function distanceBand(v:any){const d=Number(v);return d===800?'800':d===1400||d===1500?'1400-1500':d===2000?'2000':'other';}
