import {verifiedBeforeStart,nonStarter,finite} from './modelSafety';
import {resultIssues} from './raceIntegrity';
export function distanceGroup(distance:any){const d=Number(distance);return d===800?'800':d===1400||d===1500?'1400-1500':d===2000?'2000':'other';}
export function fixedComparison(records:any[],date='',keys=['current','A','Recent','Place'],options:any={}){
 const eligible=records.filter(r=>r.status==='completed'&&!r.evaluationExcluded&&!resultIssues(r).length&&verifiedBeforeStart(r)&&(!date||r.raceDate===date)&&(!options.track||r.track===options.track)&&(!options.distance||distanceGroup(r.distance)===options.distance));
 const build=options.build||[...eligible].sort((a,b)=>String(b.predictionLock?.lockedAt).localeCompare(String(a.predictionLock?.lockedAt)))[0]?.predictionLock?.build;
 const rows=eligible.filter(r=>r.predictionLock?.build===build);
 const totals=Object.fromEntries(keys.map(k=>[k,{n:0,win:0,place:0,top5:0}]));let unranked=0,comparable=0;
 for(const r of rows){
  const active=new Set(r.horses.filter(h=>!nonStarter(h)).map(h=>String(h.umaban)));
  const actual=r.horses.filter(h=>[1,2,3].includes(finite(h.finish))).sort((a,b)=>Number(a.finish)-Number(b.finish));
  const sets=Object.fromEntries(keys.map(k=>{const m=r.predictionLock.models?.[k];return [k,[...(Array.isArray(m)?m:m?.predictions||[])].filter(h=>active.has(String(h.umaban))&&finite(h.rank)!==null&&finite(h.score)!==null).sort((a,b)=>a.rank-b.rank)];}));
  if(!sets.current?.length){unranked++;continue;}if(Object.values(sets).some(xs=>!xs.length))continue;comparable++;
  for(const [k,picks] of Object.entries(sets)){
   const t=totals[k];t.n++;const f=actual.find(h=>String(h.umaban)===String(picks[0].umaban))?.finish;
   t.win+=Number(Number(f)===1);t.place+=Number([1,2,3].includes(Number(f)));
   const top=new Set(picks.slice(0,5).map(h=>String(h.umaban)));t.top5+=Number(actual.length===3&&actual.every(h=>top.has(String(h.umaban))));
  }
 }
 return {totals,comparable,unranked,verified:rows.length,build};
}
