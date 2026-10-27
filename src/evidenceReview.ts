import {finite,nonStarter,scoreParts} from './modelSafety';
const clamp=(x:number,l:number,h:number)=>Math.max(l,Math.min(h,x));
export const SIMPLE_VERSION='simple85-v12.7';
export function raceClassFromName(v:any){const text=String(v||'').normalize('NFKC');return text.match(/[ABC][123](?:[ABC][123])?/i)?.[0].toUpperCase()||text.match(/[23]歳/)?.[0]||'';}
export function formRowEvidence(row:any={}){
 const text=String(row?.text||'');const past=Array.isArray(row?.pastRuns)?row.pastRuns:[];
 const headers=(text.match(/(?:^|\n)\d{2}\/\d{2}\s+[^\s]+\s+\d{1,2}R(?:\n|$)/g)||[]).length;
 const positions=(text.match(/(?:^|\n)(?:-|\d{1,2})(?:\s+(?:-|\d{1,2})){1,3}(?=\n|$)/g)||[]).length;
 const structured=past.filter(r=>Number(r.distance)>0&&Number(r.fieldSize)>0&&Array.isArray(r.positions)&&r.positions.filter(x=>finite(x)!==null&&Number(x)>0).length>=2).length;
 const runs=structured||Math.min(headers,positions);
 return {runs,courseRecord:!!row.courseRecord||/[^\s]+[ダ芝]\d{3,4}m\s+\d+\s+\d+\s+\d+\s+\d+/.test(text),layoff:finite(row.layoffWeeks)!==null||/(?:中|休養)\s*\d+\s*週|連闘/.test(text),declaredUnavailable:row.historyStatus==='unavailable'&&!!String(row.historyReason||'').trim()};
}
export function sourceDetailIssues(d:any){
 const issues:string[]=[];const rows=d.sources.form?.rows||[];
 for(const h of d.sources.race.rows){
  if(['取消','除外'].includes(h.raceStatus))continue;
  const standard=d.sources.standard?.rows.find(r=>r.umaban===h.umaban),recent=d.sources.recent?.rows.find(r=>r.umaban===h.umaban);
  const hadRuns=standard?.cells?.slice(3,10).some(v=>finite(v)!==null)||recent?.cells?.slice(4,9).some(v=>v!=='-'&&String(v).trim());
  if(!hadRuns)continue; // Absence of indices is not proof of prior starts. Do not invent a history.
  const row=rows.find(r=>r.umaban===h.umaban),e=formRowEvidence(row);
  if(!e.runs)issues.push(`${h.umaban} ${h.name}：過去走の距離・頭数・通過順が未取得${e.declaredUnavailable?'（'+row.historyReason+'）':''}`);
 }
 return issues;
}
export function structuredFormFields(row:any,meta:any){
 const out:any={};if(!row)return out;
 if(Array.isArray(row.pastRuns))out.pastRunEvidence=row.pastRuns.map((r:any)=>({...r}));
 if(Array.isArray(row.pastRuns))out.recentPositions=row.pastRuns.filter(r=>r.surface===(meta.surface||'ダート')&&r.positions?.filter(x=>finite(x)!==null&&Number(x)>0).length>=2).map(r=>({track:r.track,distance:r.distance,positions:r.positions,fieldSize:r.fieldSize,date:r.date||'',raceClass:r.raceClass||'',weight:r.weight??''}));
 if(row.courseRecord)out.courseRecord={...row.courseRecord};
 if(finite(row.layoffWeeks)!==null)out.layoffWeeks=Number(row.layoffWeeks);
 if(typeof row.jockeyChange==='boolean')out.jockeyChange=row.jockeyChange;
 if(typeof row.style==='string'&&['逃','先','差','追','自在'].includes(row.style))out.runningStyle=row.style;
 if(row.historyStatus)out.historyStatus=row.historyStatus;if(row.historyReason)out.historyReason=row.historyReason;
 out.formEvidence=formRowEvidence(row);return out;
}
export function uncertainty(h:any,meta:any={}){
 const issues:string[]=[];const runs=(h.recentRuns||[]).filter(r=>finite(r.index)!==null&&(!r.surface||r.surface===(meta.surface||'ダート')));
 if(!runs.length)issues.push('使用できる近走指数なし');else if(runs.length<3)issues.push(`近走指数${runs.length}走のみ`);
 const dates=runs.map(r=>r.date||r.raceDate).filter(Boolean);if(dates.length<runs.length)issues.push('近走の日付未確認あり（出走順で評価）');
 if(runs.length&&!h.recentPositions?.length)issues.push('通過順未取得');
 const asOf=Date.parse(meta.scheduledStart||meta.raceDate+'T00:00:00+09:00');
 if(dates.length===runs.length&&dates.length&&Number.isFinite(asOf)){
  const days=Math.floor((asOf-Math.max(...dates.map(d=>Date.parse(d+'T00:00:00+09:00'))))/86400000);if(days>=84)issues.push(`最終確認出走から${days}日`);
 }
 if(runs.length&&!runs.some(r=>Number(r.distance)===Number(meta.distance)))issues.push('近5走に同距離の指数なし');
 if(finite(h.distSamples)===null||finite(h.courseSamples)===null)issues.push('距離・コース指数の実測本数未確認');
 const previous=(h.recentPositions||[]).find(r=>r.track===meta.track&&r.raceClass)?.raceClass;
 if(previous&&meta.raceClass&&previous!==meta.raceClass)issues.push(`クラス変更 ${previous}→${meta.raceClass}（相手強化度は未判定）`);
 if(!meta.raceClass)issues.push('今回クラス未確認');
 return issues;
}
// Predeclared candidate hypothesis: distance agreement precedes venue agreement.
export function candidateRecent(h:any,meta:any){
 const runs=(h.recentRuns||[]).slice(0,5).filter(r=>finite(r.index)!==null&&(!r.surface||r.surface===meta.surface));
 if(!runs.length)return finite(h._recentIndex);
 const dateMode=runs.every(r=>r.date||r.raceDate),asOf=Math.min(Date.now(),Date.parse(meta.scheduledStart)||Date.now());
 let sum=0,total=0;
 runs.forEach((r,i)=>{
  const sameDistance=Number(r.distance)===Number(meta.distance),near=Math.abs(Number(r.distance)-Number(meta.distance))<=200;
  const condition=sameDistance?(r.track===meta.track?1:.9):near?.7:.4;
  const age=dateMode?Math.max(0,(asOf-Date.parse((r.date||r.raceDate)+'T00:00:00+09:00'))/86400000):0;
  const weight=[1.45,1.22,1.05,.88,.72][i]*condition*Math.pow(.5,age/56);
  sum+=Number(r.index)*weight;total+=weight;
 });
 return total>0?sum/total:null;
}
export function simple85(horses:any[],meta:any={},includeAux=true){
 const scored=horses.map(h=>{
  const recent=finite(h._recentIndex)===null?null:candidateRecent(h,meta);const core=scoreParts({...h,best:h._best,dist:'',course:''},recent,{best:15,avg5:85,dist:0,course:0},{surface:meta.surface,asOf:Date.parse(meta.scheduledStart)||Date.now(),halfLifeWeeks:16});
  // The candidate uses recent runs only as recent evidence; old avg5 is not a hidden fallback after surface filtering.
  const base=nonStarter(h)||recent===null?null:core.base;
  const tr=['浦和','船橋','大井','川崎','門別'].includes(meta.track)?finite(h._trainingScore):null,co=finite(h._commentScore),learned=Number(h._effectiveLearned?.pace)||1;
  const training=includeAux&&tr!==null?clamp((tr-70)/7,-1,1):0;
  const comment=includeAux&&co!==null?clamp((co-55)/10,-.5,.5):0;
  const pace=includeAux&&h._styleProfile?.evidence?clamp(Number(h._paceAdj||0)/learned,-1,1):0;
  const adjustment=clamp(training+comment+pace,-2,2),risk=uncertainty(h,meta);
  return {...h,_base:base,_finalScore:base===null?null:base+adjustment,predictedScore:base===null?null:base+adjustment,_rank:null,_unknownAbility:base===null&&!nonStarter(h),candidateVersion:includeAux?SIMPLE_VERSION:SIMPLE_VERSION+'-core',candidateEvidence:{base,recent,training,comment,pace,adjustment,risks:risk},uncertainty:risk};
 });
 const ordered=scored.filter(h=>h._finalScore!==null).sort((a,b)=>b._finalScore-a._finalScore||Number(a.umaban)-Number(b.umaban));
 const ranks=new Map(ordered.map((h,i)=>[h.id,i+1]));return scored.map(h=>({...h,_rank:ranks.get(h.id)??null}));
}
