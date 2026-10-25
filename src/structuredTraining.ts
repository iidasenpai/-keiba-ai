import {finite,nonStarter} from './modelSafety';

export const TRAINING_CANDIDATE_VERSION='structured-training-v1';
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const norm=(v:any)=>String(v||'').normalize('NFKC').replace(/[\s・･]/g,'');
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const median=(xs:number[])=>{const a=[...xs].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};

// This path is separate from the legacy free-text training scorer.
export function validateStructuredTraining(page:any,form:any){
 if(page.representation!=='structured-workouts-v1'||!form)throw Error('構造化調教には過去走詳細が必要です');
 for(const row of page.rows){
  if(!Array.isArray(row.sessions)||row.sessions.length>30||![-1,0,1].includes(row.summarySignal))throw Error('調教記録の形式が不正です');
  if(typeof row.signalDate!=='string'||row.signalDate!==''&&!validDate(row.signalDate))throw Error('調教評価の日付が不正です');
  if(!['light','recorded','unknown'].includes(row.preparation))throw Error('調教の取得状態が不正です');
  for(const s of row.sessions){
   if(!validDate(s.date)||s.date>=page.meta.raceDate||s.date>new Date(page.capturedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}))throw Error('調教実施日が不正です');
   if(typeof s.course!=='string'||!s.course.trim()||s.course.length>50||!['良','稍重','重','不良'].includes(s.going))throw Error('調教コース・馬場が不正です');
   if(typeof s.effort!=='string'||!s.effort.trim()||s.effort.length>50||!Array.isArray(s.clocks)||s.clocks.length<1||s.clocks.length>6||s.clocks.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<9||v>180)||s.clocks.some((v,i)=>i>0&&v>=s.clocks[i-1]))throw Error('調教時計・追い方が不正です');
   if(s.timedDistance!==null&&(!Number.isInteger(s.timedDistance)||s.timedDistance<200||s.timedDistance>1200||s.timedDistance!==s.clocks.length*200))throw Error('調教の計時区間が不正です');
  }
  if(row.signalDate&&!row.sessions.some(s=>s.date===row.signalDate))throw Error('調教評価に対応する実施記録がありません');
  const f=form.rows.find(h=>h.umaban===row.umaban&&norm(h.name)===norm(row.name));
  if(!f)throw Error('調教と過去走詳細の馬情報が一致しません');
 }
}

export function structuredTrainingFields(page:any,form:any):Map<string,any>{
 validateStructuredTraining(page,form);
 return new Map<string,any>(page.rows.map(row=>{
  const f=form.rows.find(h=>h.umaban===row.umaban);
  const dates=(f.pastRuns||[]).map(r=>r.date).filter(validDate).sort();
  return [row.umaban,{structuredTraining:{version:TRAINING_CANDIDATE_VERSION,sourceUrl:page.url,capturedAt:page.capturedAt,track:page.meta.track,raceDate:page.meta.raceDate,raceNo:page.meta.raceNo,umaban:row.umaban,name:row.name,lastRaceDate:dates.at(-1)||'',sessions:row.sessions.map(s=>({...s,clocks:[...s.clocks]})),summarySignal:row.summarySignal,signalDate:row.signalDate,preparation:row.preparation}}];
 }));
}

function currentWorkout(h:any,meta:any){
 const t=h.structuredTraining;
 if(!t||typeof t.sourceUrl!=='string'||!Array.isArray(t.sessions)||t.version!==TRAINING_CANDIDATE_VERSION||t.track!==meta.track||t.raceDate!==meta.raceDate||String(t.raceNo)!==String(meta.raceNo)||t.umaban!==String(h.umaban)||norm(t.name)!==norm(h.name)||!validDate(t.lastRaceDate))return null;
 // Recompute the cutoff; never trust a source-provided "current" boolean.
 const last=[t.lastRaceDate,...(h.recentRuns||[]).map(r=>r.date||r.raceDate),...(h.recentPositions||[]).map(r=>r.date)].filter(validDate).sort().at(-1);
 return [...t.sessions].filter(s=>s&&Array.isArray(s.clocks)&&s.clocks.length>0&&s.clocks.length<=6&&s.clocks.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=9&&v<=180)&&typeof s.course==='string'&&typeof s.effort==='string'&&validDate(s.date)&&s.date>last&&s.date<meta.raceDate&&(Date.parse(meta.raceDate)-Date.parse(s.date))/86400000<=14).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
}
const effortGroup=(s:string)=>/馬なり|馬也/.test(s)?'easy':/一杯|叩|強目|Ｇ前追|気合/.test(s)?'urged':'unknown';

export function trainingImpacts(horses:any[],meta:any){
 const prepared=horses.map(h=>({h,s:currentWorkout(h,meta)}));
 return new Map(prepared.map(({h,s})=>{
  let qualitative=0,clock=0,peers=0;let reason='調教未取得・今回の時計なし：補正0';
  if(s&&!nonStarter(h)){
   const t=h.structuredTraining;
   qualitative=t.signalDate===s.date&&[-1,0,1].includes(t.summarySignal)?t.summarySignal*.35:0;
   reason='今回の記録あり。区間・比較材料が不足する時計は加減点しない';
   if(Number.isInteger(s.timedDistance)&&s.timedDistance===s.clocks.length*200&&s.course!=='未確認'&&effortGroup(s.effort)!=='unknown'){
    const group=prepared.filter(p=>p.s&&!nonStarter(p.h)&&p.h.structuredTraining.sourceUrl.split('/PDF/')[0]===t.sourceUrl.split('/PDF/')[0]&&p.s.course===s.course&&p.s.going===s.going&&p.s.timedDistance===s.timedDistance&&effortGroup(p.s.effort)===effortGroup(s.effort)&&Math.abs(Date.parse(p.s.date)-Date.parse(s.date))<=3*86400000);
    peers=group.length;
    if(peers>=4){
     const full=group.map(p=>p.s.clocks[0]),last=group.map(p=>p.s.clocks.at(-1)),fm=median(full),lm=median(last);
     const fz=(fm-s.clocks[0])/Math.max(.5,median(full.map(x=>Math.abs(x-fm)))*1.4826),lz=(lm-s.clocks.at(-1))/Math.max(.2,median(last.map(x=>Math.abs(x-lm)))*1.4826);
     // A deliberately slow overall run with a quick finish is not a negative assessment.
     if(fz*lz>0)clock=clamp((fz+lz)/2,-1,1)*.25*peers/(peers+8);
     reason='同場・同コース・同計時距離・同馬場・同追い方の近接日記録で比較';
    }
   }
  }
  return [String(h.id),{adjustment:clamp(qualitative+clock,-.6,.6),qualitative,clock,peers,workoutDate:s?.date||'',timedDistance:s?.timedDistance??null,reason}];
 }));
}

export function trainingCandidateInputs(horses:any[],meta:any){
 if(!horses.some(h=>h.structuredTraining))return null;
 const impacts=trainingImpacts(horses,meta);
 return horses.map(h=>{const evidence=impacts.get(String(h.id));const score=finite(h._finalScore);return {...h,_finalScore:score===null?null:score+evidence.adjustment,trainingCandidateEvidence:evidence};});
}
