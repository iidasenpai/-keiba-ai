import {verifiedBeforeStart} from './modelSafety';
import {resultIssues} from './raceIntegrity';
import {frozenRows,distanceGroup} from './modelComparison';
// 候補と現行を「同じレース同士」で比較する。主指標は上位5頭で1〜3着をすべて拾えた率。
// 差はレース単位のブートストラップ（決定的な乱数）で95%CIを出す。馬単位では再標本化しない。
export const MIN_RACES_FOR_VERDICT=30; // これ未満はCIがあっても改善・悪化を判定しない
export const ALPHA=0.05;
export type Verdict='insufficient'|'better'|'worse'|'trendBetter'|'trendWorse'|'unclear';
export type PairedReport={key:string;version:string;n:number;candidateEmpty:number;currentEmpty:number;candOnly:number;currOnly:number;pValue:number;current:number;candidate:number;diff:number;lo:number;hi:number;winCurrent:number;winCandidate:number;placeCurrent:number;placeCandidate:number;top6Current:number;top6Candidate:number;verdict:Verdict};
function mulberry32(a:number){return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function top3Actual(r:any){return r.horses.filter((h:any)=>[1,2,3].includes(Number(h.finish))).sort((a:any,b:any)=>Number(a.finish)-Number(b.finish));}
// 結果が揃っていなければ null。保存した予想が空(順位を作れなかった)なら empty=true で全指標0。
export function raceHits(r:any,key:string){
  const actual=top3Actual(r);
  if(actual.length!==3)return null;
  const picks=frozenRows(r,key);
  if(!picks.length)return {top5:0,top6:0,win:0,place:0,empty:true};
  const inTop=(k:number)=>{const s=new Set(picks.slice(0,k).map((h:any)=>String(h.umaban)));return actual.every((h:any)=>s.has(String(h.umaban)));};
  const first=String(picks[0].umaban);
  return {top5:Number(inTop(5)),top6:Number(inTop(6)),win:Number(first===String(actual[0].umaban)),place:Number(actual.some((h:any)=>String(h.umaban)===first)),empty:false};
}
// 対応のある2値(上位5頭で全捕捉できたか)の正確McNemar検定(両側)。結果が異なるレース数だけで決まる。
// b=候補のみ成功, c=現行のみ成功。H0: b,cは同じ確率。p=min(1,2*P(X<=min(b,c)|Bin(b+c,0.5)))
export function mcnemarExact(b:number,c:number):number{
  const m=b+c;if(m===0)return 1;
  const k=Math.min(b,c),ln2=Math.log(2);let lc=0,sum=0; // lc=log C(m,i)
  for(let i=0;i<=k;i++){if(i>0)lc+=Math.log(m-i+1)-Math.log(i);sum+=Math.exp(lc-m*ln2);}
  return Math.min(1,2*sum);
}
// 改善・悪化は「30R以上」「CIが0を含まない」「正確検定p<0.05」がすべて同じ向きでそろったときだけ。
// そろわない間は、差の向きに応じて「傾向・未確定」。
export function verdictOf(n:number,lo:number,hi:number,candOnly=0,currOnly=0,pValue=1):Verdict{
  if(n<MIN_RACES_FOR_VERDICT)return 'insufficient';
  if(pValue<ALPHA&&candOnly>currOnly&&lo>0)return 'better';
  if(pValue<ALPHA&&candOnly<currOnly&&hi<0)return 'worse';
  return candOnly>currOnly?'trendBetter':candOnly<currOnly?'trendWorse':'unclear';
}
export function pairedReport(records:any[],key:string,version:string,options:{track?:string;distance?:string;build?:string;excludeOiSpecialist?:boolean;iterations?:number;seed?:number}={}):PairedReport{
  const rows=records.filter(r=>r.status==='completed'&&!r.evaluationExcluded&&!resultIssues(r).length&&verifiedBeforeStart(r)&&r.predictionLock?.models?.[key]?.version===version&&(!options.track||r.track===options.track)&&(!options.distance||distanceGroup(r.distance)===options.distance)&&(!options.build||r.predictionLock?.build===options.build)&&!(options.excludeOiSpecialist&&r.predictionLock?.models?.OiModel));
  const pairs:{c:any;k:any}[]=[];let candidateEmpty=0,currentEmpty=0;
  for(const r of rows){
    const c=raceHits(r,'current'),k=raceHits(r,key);
    if(!c||!k)continue;
    if(c.empty){currentEmpty++;continue;}   // 現行が順位を作れていないレースは比較できない(分母から除き件数だけ表示)
    if(k.empty)candidateEmpty++;            // 候補が保存済みで選べなかったレースは外さず、的中0として分母に残す
    pairs.push({c,k});
  }
  const n=pairs.length,mean=(f:(p:any)=>number)=>n?pairs.reduce((a,p)=>a+f(p),0)/n*100:0;
  const candOnly=pairs.filter(p=>p.k.top5>p.c.top5).length,currOnly=pairs.filter(p=>p.k.top5<p.c.top5).length,pValue=mcnemarExact(candOnly,currOnly);
  const d=pairs.map(p=>p.k.top5-p.c.top5),it=options.iterations??2000,rnd=mulberry32(options.seed??20261106),bs:number[]=[];
  if(n)for(let i=0;i<it;i++){let s=0;for(let j=0;j<n;j++)s+=d[Math.floor(rnd()*n)];bs.push(s/n*100);}
  bs.sort((a,b)=>a-b);
  const lo=bs.length?bs[Math.floor(it*0.025)]:0,hi=bs.length?bs[Math.floor(it*0.975)-1]:0;
  return {key,version,n,candidateEmpty,currentEmpty,candOnly,currOnly,pValue,current:mean(p=>p.c.top5),candidate:mean(p=>p.k.top5),diff:mean(p=>p.k.top5-p.c.top5),lo,hi,winCurrent:mean(p=>p.c.win),winCandidate:mean(p=>p.k.win),placeCurrent:mean(p=>p.c.place),placeCandidate:mean(p=>p.k.place),top6Current:mean(p=>p.c.top6),top6Candidate:mean(p=>p.k.top6),verdict:verdictOf(n,lo,hi,candOnly,currOnly,pValue)};
}
