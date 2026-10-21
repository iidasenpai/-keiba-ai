import {verifiedBeforeStart,nonStarter,finite} from './modelSafety';
import {resultIssues} from './raceIntegrity';
export function distanceGroup(distance:any){const d=Number(distance);return d===800?'800':d===1400||d===1500?'1400-1500':d===2000?'2000':'other';}
export function fixedComparison(records:any[],date='',keys=['current','A','Recent','Place'],options:any={}){
 const eligible=records.filter(r=>r.status==='completed'&&!r.evaluationExcluded&&!resultIssues(r).length&&verifiedBeforeStart(r)&&(!date||r.raceDate===date)&&(!options.track||r.track===options.track)&&(!options.distance||distanceGroup(r.distance)===options.distance));
 const build=options.build||[...eligible].sort((a,b)=>String(b.predictionLock?.lockedAt).localeCompare(String(a.predictionLock?.lockedAt)))[0]?.predictionLock?.build;
 const rows=eligible.filter(r=>r.predictionLock?.build===build).sort((a,b)=>String(a.scheduledStart).localeCompare(String(b.scheduledStart))||String(a.id).localeCompare(String(b.id)));
 const totals=Object.fromEntries(keys.map(k=>[k,{n:0,win:0,place:0,top5:0,payoutN:0,payout:0,refundN:0,missingPayout:0,lossRun:0,longestLoss:0,partialField:0}]));let unranked=0,comparable=0,auxChanged=0;
 for(const r of rows){
  const active=new Set(r.horses.filter(h=>!nonStarter(h)).map(h=>String(h.umaban)));
  const actual=r.horses.filter(h=>[1,2,3].includes(finite(h.finish))).sort((a,b)=>Number(a.finish)-Number(b.finish));
  const sets=Object.fromEntries(keys.map(k=>{const m=r.predictionLock.models?.[k];return [k,[...(Array.isArray(m)?m:m?.predictions||[])].filter(h=>active.has(String(h.umaban))&&finite(h.rank)!==null&&finite(h.score)!==null).sort((a,b)=>a.rank-b.rank)];}));
  if(!sets.current?.length){unranked++;continue;}if(Object.values(sets).some(xs=>!xs.length))continue;comparable++;
  if(sets.UrawaCondition&&sets.UrawaConditionAux&&String(sets.UrawaCondition[0].umaban)!==String(sets.UrawaConditionAux[0].umaban))auxChanged++;
  for(const [k,picks] of Object.entries(sets)){
   const t=totals[k];t.n++;const f=actual.find(h=>String(h.umaban)===String(picks[0].umaban))?.finish;
   t.win+=Number(Number(f)===1);t.place+=Number([1,2,3].includes(Number(f)));
   t.partialField+=Number(picks.length<active.size);
   const m=r.predictionLock.models[k],originalPicks=[...(Array.isArray(m)?m:m.predictions)].filter(h=>finite(h.rank)!==null&&finite(h.score)!==null).sort((a,b)=>a.rank-b.rank);
   const originalTop=originalPicks[0],refund=originalTop&&!active.has(String(originalTop.umaban));
   const originalWin=originalTop&&String(originalTop.umaban)===String(actual[0]?.umaban);
   if(!refund){t.lossRun=originalWin?0:t.lossRun+1;t.longestLoss=Math.max(t.longestLoss,t.lossRun);}
   const payout=r.resultPayout;
   if(refund){t.payoutN++;t.payout+=100;t.refundN++;}
   else if(payout&&String(payout.umaban)===String(actual[0]?.umaban)&&finite(payout.amount)!==null&&Number(payout.amount)>=100){t.payoutN++;if(originalWin)t.payout+=Number(payout.amount);}else t.missingPayout++;
   const top=new Set(picks.slice(0,5).map(h=>String(h.umaban)));t.top5+=Number(actual.length===3&&actual.every(h=>top.has(String(h.umaban))));
  }
 }
 return {totals,comparable,unranked,verified:rows.length,build,auxChanged};
}
