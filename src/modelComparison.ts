import {verifiedBeforeStart,finite} from './modelSafety';
import {resultIssues} from './raceIntegrity';
export function distanceGroup(distance:any){const d=Number(distance);return d===800?'800':d===1400||d===1500?'1400-1500':d===2000?'2000':'other';}
// Evaluate exactly the frozen selections. Later cancellations never promote a lower pick.
export function frozenRows(r:any,key='current') {
 const m=r.predictionLock?.models?.[key];
 return [...(Array.isArray(m)?m:m?.predictions||[])].filter(h=>finite(h.rank)!==null&&finite(h.score)!==null).sort((a,b)=>Number(a.rank)-Number(b.rank));
}
function actualTop3(r:any){return r.horses.filter(h=>[1,2,3].includes(finite(h.finish))).sort((a,b)=>Number(a.finish)-Number(b.finish));}
function selectionStats(r:any,picks:any[]) {
 const actual=actualTop3(r),first=String(picks[0]?.umaban),winner=String(actual[0]?.umaban);
 const top=(k:number)=>new Set(picks.slice(0,k).map(h=>String(h.umaban)));
 return {win:Number(first===winner),place:Number(actual.some(h=>String(h.umaban)===first)),winner3:Number(top(3).has(winner)),pair2:Number(actual.length===3&&actual.slice(0,2).every(h=>top(2).has(String(h.umaban)))),top5:Number(actual.length===3&&actual.every(h=>top(5).has(String(h.umaban)))),top6:Number(actual.length===3&&actual.every(h=>top(6).has(String(h.umaban))))};
}
export function fixedFieldSummary(records:any[],date='',options:any={}) {
 const comparison=fixedComparison(records,date,['current'],options);
 const rows=records.filter(r=>r.status==='completed'&&!r.evaluationExcluded&&!resultIssues(r).length&&verifiedBeforeStart(r)&&(!date||r.raceDate===date)&&(!options.track||r.track===options.track)&&(!options.distance||distanceGroup(r.distance)===options.distance)&&r.predictionLock?.build===comparison.build&&frozenRows(r).length);
 const ranks=Array.from({length:6},(_,i)=>({rank:i+1,n:0,win:0,second:0,third:0,place:0,nonstarters:0}));
 const tracks:any={};
 for(const r of rows){
  const picks=frozenRows(r),actual=actualTop3(r),stats=selectionStats(r,picks);
  const t=tracks[r.track]||(tracks[r.track]={track:r.track,n:0,win:0,place:0,winner3:0,pair2:0,top5:0,top6:0});t.n++;
  for(const [k,v] of Object.entries(stats))t[k]+=v;
  for(const s of ranks){const p=picks[s.rank-1];if(!p)continue;s.n++;const f=finite(actual.find(h=>String(h.umaban)===String(p.umaban))?.finish);s.win+=Number(f===1);s.second+=Number(f===2);s.third+=Number(f===3);s.place+=Number(f!==null);s.nonstarters+=Number(['取消','除外','DNS'].includes(String(r.horses.find(h=>String(h.umaban)===String(p.umaban))?.raceStatus||'')));}
 }
 return {...comparison,ranks,tracks:Object.values(tracks)};
}
export function fixedComparison(records:any[],date='',keys=['current','A','Recent','Place'],options:any={}){
 const eligible=records.filter(r=>r.status==='completed'&&!r.evaluationExcluded&&!resultIssues(r).length&&verifiedBeforeStart(r)&&(!date||r.raceDate===date)&&(!options.track||r.track===options.track)&&(!options.distance||distanceGroup(r.distance)===options.distance));
 const build=options.build||[...eligible].sort((a,b)=>String(b.predictionLock?.lockedAt).localeCompare(String(a.predictionLock?.lockedAt)))[0]?.predictionLock?.build;
 const rows=eligible.filter(r=>r.predictionLock?.build===build);
 const totals=Object.fromEntries(keys.map(k=>[k,{n:0,win:0,place:0,winner3:0,pair2:0,top5:0,top6:0}]));let unranked=0,comparable=0;
 for(const r of rows){
  const sets=Object.fromEntries(keys.map(k=>[k,frozenRows(r,k)]));
  if(!sets.current?.length){unranked++;continue;}if(Object.values(sets).some(xs=>!xs.length))continue;comparable++;
  for(const [k,picks] of Object.entries(sets)){
   const t=totals[k];t.n++;
   for(const [metric,value] of Object.entries(selectionStats(r,picks)))t[metric]+=value;
  }
 }
 return {totals,comparable,unranked,verified:rows.length,build};
}
