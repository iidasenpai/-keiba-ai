// v12: pure scoring, evidence and archive helpers. Historical records are never migrated in place.
export const MODEL_VERSION = 'nar-safe-v12.2';
export const MODEL_BUILD = 'v12.2-sha256-06220dcd4ac66d518ed842e537ed6c93f6069e6b57b072cc0a765899860a2ce1';
export const ACTIVE_FACTORS = ['training','comment','pace','jockey','body','ground','classFit','gate','pedigree','condition'];
export const finite = (v:any):number|null => {
  if (v == null || String(v).trim()==='' || /^[-—–未]+$/.test(String(v).trim())) return null;
  const text=String(v).replace(/,/g,'').replace(/\*$/, '').trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value=Number(text); return Number.isFinite(value)?value:null;
};
export const bounded=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export const nonStarter=(h:any)=>['取消','除外','DNS'].includes(String(h.raceStatus||''));
export const identity=(h:any)=>String(h.id||h.umaban);
export const jstDate=(v:any=Date.now())=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
export const instant=(v:any)=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?t:null;};
export function raceInstant(date:string,time:string):string|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
  const t=instant(`${date}T${time}:00+09:00`); if(t===null)return null;
  const d=new Date(t); if(jstDate(d)!==date || Number(time.slice(0,2))>23 || Number(time.slice(3))>59)return null;
  return d.toISOString();
}
export function eventKey(r:any):string|null {
  if(/^\d{4}-\d{2}-\d{2}$/.test(r.raceDate||'')&&r.track&&finite(r.raceNo)!==null)return `${r.raceDate}|${r.track}|${Number(r.raceNo)}`;
  if(r.sourceRaceId && r.sourceName)return `${r.sourceName}:${r.sourceRaceId}`;
  return null;
}
export function validWeights(v:any):boolean{return !!v&&['best','avg5','dist','course'].every(k=>finite(v[k])!==null&&Number(v[k])>=0&&Number(v[k])<=100)&&['best','avg5','dist','course'].some(k=>Number(v[k])>0);}
export function observed(h:any,key:string):number|null {
  if(key==='dist'&&finite(h.distSamples)===0||key==='course'&&finite(h.courseSamples)===0)return null;
  const source=h.factorSources?.[key];
  if(source && !['manual','source','measured'].includes(source))return null;
  if(!source && h._autoCompleted && ['groundFit','classFit','gateFit','pedigreeFit','condition','bodyChange','jockeyIndex'].includes(key))return null;
  return finite(h[key]);
}
export function cleanInputs(h:any):any {
  const next={...h,factorSources:{...(h.factorSources||{})}};
  for(const key of ['groundFit','classFit','jockeyIndex','gateFit','pedigreeFit','condition','bodyChange']) {
    if(h._autoCompleted && !next.factorSources[key])next.factorSources[key]='legacy-unverified';
  }
  // Missing stays missing. No invented 50-point suitability or 0kg measurement.
  return next;
}
export function fieldAudit(horses:any[]) {
  const active=horses.filter(h=>!nonStarter(h));
  const measured=(h:any,k:string)=>observed(h,k)!==null;
  const unknown=active.filter(h=>finite(h._base)===null);
  const unnamed=active.filter(h=>!String(h.name||'').trim());
  const dist=active.filter(h=>measured(h,'dist')).length, course=active.filter(h=>measured(h,'course')).length;
  const recent=active.filter(h=>(h._recentMeta?.usableCount??h._recentMeta?.runs?.length??0)>0||finite(h.avg5)!==null).length;
  const core=active.length-unknown.length;
  const total=active.length||1;
  const score=Math.round(100*(core*.45+recent*.25+dist*.15+course*.15)/total);
  const issues=[unknown.length?`指数不足 ${unknown.length}頭`:null,unnamed.length?`馬名未照合 ${unnamed.length}頭`:null,dist<active.length?`距離実測 ${dist}/${active.length}`:null,course<active.length?`コース実測 ${course}/${active.length}`:null].filter(Boolean) as string[];
  return {score,label:unknown.length?'未知馬あり':score>=85?'実測充実':'適性証拠に不足',issues,core,recent,dist,course,unknown:unknown.length,total:active.length,training:active.filter(h=>observed(h,'trainingScore')!==null).length,comments:active.filter(h=>String(h.comment||'').trim()).length};
}
export function estimatePace(horses:any[]) {
  const profiles=horses.filter(h=>!nonStarter(h)).map(h=>h._styleProfile).filter(p=>p?.evidence>=2);
  if(profiles.length<Math.max(3,horses.filter(h=>!nonStarter(h)).length*.6))return {S:0,M:0,H:0,label:'材料不足・中立',evidence:profiles.length};
  const leaders=profiles.reduce((a,p)=>a+Number(p.probabilities?.['逃']||0),0);
  const forward=profiles.reduce((a,p)=>a+Number(p.probabilities?.['先']||0),0);
  // Predeclared hypothesis; never tuned against the race's outcome.
  const H=bounded((leaders-1)*.35+Math.max(0,forward-3)*.08,0,.75);
  const S=bounded((1.4-leaders)*.4,0,.6);
  return {S,M:1-S-H,H,label:'脚質から推定',evidence:profiles.length};
}
export function paceExpected(profile:any,manual:string,forecast:any,table:any):number {
  const probabilities=profile?.probabilities||{};
  const ps=Object.values(probabilities).reduce((a:number,b:any)=>a+Number(b||0),0) as number;
  if(!ps || !profile?.evidence)return 0;
  const expectation=(pace:string)=>Object.entries(probabilities).reduce((a,[style,p])=>a+Number(p||0)*Number(table[pace]?.[style]||0),0)/ps;
  const confidence=bounded(Number(profile.confidence||0)/100,0,1);
  return confidence*(manual==='AUTO'?['S','M','H'].reduce((a,k)=>a+Number(forecast[k]||0)*expectation(k),0):expectation(manual));
}
export function scoreParts(h:any,recent:number|null,w:any,evidence:any={}) {
  const values:any={best:finite(h.best),avg5:recent??finite(h.avg5),dist:observed(h,'dist'),course:observed(h,'course')};
  const weights={...w},asOf=evidence.asOf??Date.now();
  if(evidence.surface&&h.bestSurface&&h.bestSurface!==evidence.surface)values.best=null;
  const bestAt=instant(h.bestDate?`${h.bestDate}T00:00:00+09:00`:null);
  if(bestAt!==null){if(bestAt>=asOf)values.best=null;else weights.best*=Math.pow(.5,(asOf-bestAt)/(86400000*7*Math.max(1,evidence.halfLifeWeeks||16)));}
  for(const [key,sampleKey] of [['dist','distSamples'],['course','courseSamples']]){const count=finite(h[sampleKey]);if(count!==null&&count>=0)weights[key]*=count/(count+2);}
  const parts=Object.entries(values).filter(([k,v])=>v!==null&&Number(weights[k])>0);
  const denominator=parts.reduce((a,[k])=>a+Number(weights[k]),0);
  const base=denominator?parts.reduce((a,[k,v])=>a+Number(v)*Number(weights[k]),0)/denominator:null;
  const effective=Object.fromEntries(Object.keys(values).map(k=>[k,values[k]!==null&&denominator?Number(weights[k]||0)/denominator:0]));
  return {base,values,effective,bestUndated:bestAt===null,missing:Object.entries(values).filter(([,v])=>v===null).map(([k])=>k)};
}
// A softmax-derived reference, not a calibrated claim of betting probability.
// Top-three inclusion is exact under this Plackett-Luce reference model.
export function fieldProbabilities(horses:any[]) {
  const active=horses.filter(h=>!nonStarter(h));
  const scored=active.map(h=>finite(h._selectionScore??h._finalScore)).filter((x):x is number=>x!==null);
  const center=scored.length?scored.reduce((a,b)=>a+b,0)/scored.length:0;
  const strengths=active.map(h=>Math.exp(bounded(((finite(h._selectionScore??h._finalScore)??center)-center)/12,-8,8)));
  const total=strengths.reduce((a,b)=>a+b,0);
  const rows=active.map((h,i)=>({id:identity(h),win:strengths[i]/(total||1),place:0,unknown:finite(h._base)===null}));
  const count=Math.min(3,active.length);
  function draw(used:number[],prob:number,sum:number) {
    if(used.length===count){for(const i of used)rows[i].place+=prob;return;}
    for(let i=0;i<active.length;i++)if(!used.includes(i))draw([...used,i],prob*strengths[i]/sum,sum-strengths[i]);
  }
  if(active.length)draw([],1,total);
  return new Map(rows.map(x=>[x.id,x]));
}
export function rankRows(rows:any[],key='_rank'):any[] {
  return [...rows].filter(h=>!nonStarter(h)&&finite(h[key])!==null).sort((a,b)=>Number(a[key])-Number(b[key])||Number(a.umaban)-Number(b.umaban));
}
export function modelRows(horses:any[],key='_recentIndex') {
  return [...horses].filter(h=>!nonStarter(h)&&finite(h[key])!==null).sort((a,b)=>Number(b[key])-Number(a[key])||Number(a.umaban)-Number(b.umaban)).map((h,i)=>({id:h.id,umaban:h.umaban,rank:i+1,score:h[key]}));
}
export function verifiedBeforeStart(r:any):boolean {
  const start=instant(r.scheduledStart),lock=instant(r.predictionLock?.lockedAt),result=instant(r.firstCompletedAt||r.completedAt);
  return !!(r.predictionLock && start!==null && lock!==null && lock<start && (result===null||start<=result));
}
export function eligibleHistory(records:any[],cutoff:string,excludeId?:string) {
  const at=instant(cutoff)??Date.now();
  return records.filter(r=>r.id!==excludeId&&!r.evaluationExcluded&&r.status==='completed'&&
    instant(r.firstCompletedAt||r.completedAt)!==null&&(instant(r.resultUpdatedAt||r.completedAt) as number)<at)
    .sort((a,b)=>(instant(a.firstCompletedAt||a.completedAt) as number)-(instant(b.firstCompletedAt||b.completedAt) as number)||String(a.id).localeCompare(String(b.id)));
}
export function outcomeStats(records:any[],getRows=(r:any)=>rankRows(r.predictionLock?.horses||r.horses)) {
  let n=0,win=0,place=0,top4=0,top5=0,top6=0,unknown=0;
  for(const r of records) {
    const actual=(r.horses||[]).filter((h:any)=>[1,2,3].includes(Number(h.finish)));
    if(actual.length!==3||new Set(actual.map((h:any)=>Number(h.finish))).size!==3||r.evaluationExcluded)continue;
    n++;const rows=getRows(r)||[];const first=rows[0];
    if(!first||(r.predictionLock?.horses||r.horses).some((h:any)=>!nonStarter(h)&&finite(h._rank)===null))unknown++;
    const f=(h:any)=>actual.find((x:any)=>String(x.umaban)===String(h?.umaban))?.finish;
    win+=Number(Number(f(first))===1);place+=Number([1,2,3].includes(Number(f(first))));
    for(const k of [4,5,6]) {
      const set=new Set(rows.slice(0,k).map((h:any)=>String(h.umaban)));
      const hit=Number(actual.every((h:any)=>set.has(String(h.umaban))));
      if(k===4)top4+=hit;if(k===5)top5+=hit;if(k===6)top6+=hit;
    }
  }
  return {n,win,place,top4,top5,top6,unknown};
}
export function wilson(hits:number,n:number) {
  if(!n)return null;
  const z=1.96,p=hits/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return {rate:p,low:Math.max(0,c-m),high:Math.min(1,c+m)};
}
export function summarizeModels(records:any[]) {
  const groups=new Map<string,any[]>();
  for(const r of records){const version=(r.predictionLock?.modelVersion||'旧保存（固定なし）')+(r.predictionLock?.build?` [${r.predictionLock.build.slice(-8)}]`:'');const key=`${version} / ${verifiedBeforeStart(r)?'発走前確認済':'時刻未確認'}`;groups.set(key,[...(groups.get(key)||[]),r]);}
  return [...groups].map(([version,rs])=>({version,stats:outcomeStats(rs),models:[...new Set(rs.flatMap(r=>Object.keys(r.predictionLock?.models||{})))].map(key=>{
    const matched=rs.filter(r=>r.predictionLock?.models?.[key]);
    return {key,...outcomeStats(matched,r=>{const m=r.predictionLock.models[key];return (Array.isArray(m)?m:m.predictions)||[];})};
  })}));
}
export function scoreComment(raw:any) {
  const text=String(raw||'').split(/[。！？\n]/);let score=55;
  for(const sentence of text){
    const negative=/様子見|半信半疑|良化途上|状態ひと息|疲れ|まだ.{0,12}ない|期待.{0,4}(?:できない|薄)|順調.{0,4}(?:でない|ではない)/.test(sentence);
    if(negative){score-=5;continue;}
    if(/好仕上がり|態勢.{0,3}整|好調|上向|良くなって/.test(sentence))score+=4;
    if(/ここ目標|巻き返せる|好レース|楽しみ/.test(sentence))score+=3;
    if(/使いつつ|課題|出遅れ|気ムラ/.test(sentence))score-=3;
  }
  return Math.round(bounded(score,35,75));
}
export function raceDiagnostics(records:any[]) {
  const groups=new Map<string,any[]>();
  for(const r of records){const key=eventKey(r);if(key)groups.set(key,[...(groups.get(key)||[]),r]);}
  return {duplicates:[...groups].filter(([,rs])=>rs.length>1),unidentified:records.filter(r=>!eventKey(r)),unnamed:records.reduce((a,r)=>a+(r.horses||[]).filter((h:any)=>!h.name).length,0)};
}
export function latestLearning(history:any[]) {
  const rows=history.flatMap(h=>Array.isArray(h.records)?[h,...h.records]:[h]);
  return [...rows].sort((a,b)=>(instant(b.at||b.processedAt)||0)-(instant(a.at||a.processedAt)||0))[0]||null;
}
export function validateFullResults(horses:any[],rows:any[]) {
  if(rows.length!==horses.length)throw new Error('全頭の結果を確認してください');
  const seen=new Set<string>(),finishes=new Set<number>();
  for(const row of rows){
    if(!String(row.name||'').trim())throw new Error('馬名を照合してください');
    if(seen.has(String(row.umaban))||!horses.some(h=>String(h.umaban)===String(row.umaban)))throw new Error('結果の馬番が不一致です');
    seen.add(String(row.umaban));const f=finite(row.finish);
    if(f!==null){if(!Number.isInteger(f)||f<1||f>horses.length||finishes.has(f))throw new Error('着順が重複・範囲外です（同着は未対応）');finishes.add(f);if(row.raceStatus)throw new Error('着順と出走状態を重複入力できません');}
    else if(!['取消','除外','中止','失格','未入力'].includes(row.raceStatus))throw new Error('未入力馬には出走状態を選んでください');
  }
  if(![1,2,3].every(f=>finishes.has(f)))throw new Error('1〜3着をそろえてください');
}
export function validateBet(bet:any,race:any,now:string) {
  const count:any={'単勝':1,'複勝':1,'馬連':2,'ワイド':2,'三連複':3,'三連単':3};
  const selections=String(bet.selection||'').match(/\d+/g)||[];
  if(!count[bet.type]||selections.length!==count[bet.type]||new Set(selections).size!==selections.length||selections.some(x=>!(race.horses||[]).some((h:any)=>String(h.umaban)===String(Number(x))&&!nonStarter(h))))throw new Error('券種・組合せを確認してください（1行1組）');
  if(!['購入','見送り','参考'].includes(bet.status))throw new Error('購入状態が不正です');
  const stake=finite(bet.stake);
  if(bet.status==='購入'&&(stake===null||stake<=0||!Number.isInteger(stake)))throw new Error('購入金額を正の整数で入力してください');
  const start=instant(race.scheduledStart);if(bet.status==='購入'&&start!==null&&(instant(now) as number)>=start)throw new Error('発走後は購入記録を新規作成できません');
  return {...bet,id:crypto.randomUUID(),selection:selections.map(Number).join('-'),stake:bet.status==='購入'?stake:0,recordedAt:now,beforeStart:start!==null&&(instant(now) as number)<start,settlements:[]};
}
export function ledgerSummary(records:any[]) {
  const bets=records.flatMap(r=>(r.bets||[]).map((b:any)=>({...b,raceId:r.id})));
  const purchased=bets.filter(b=>b.status==='購入'),settled=purchased.filter(b=>b.settlements?.length);
  const stake=settled.reduce((a,b)=>a+Number(b.stake),0),payout=settled.reduce((a,b)=>a+Number(b.settlements[b.settlements.length-1].payout),0);
  return {purchased:purchased.length,pending:purchased.length-settled.length,settled:settled.length,stake,payout,roi:stake?payout/stake:null,unverified:purchased.filter(b=>!b.beforeStart).length};
}
function base64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export async function encodeArchive(records:any[]) {
  const raw=JSON.stringify(records);
  if(typeof CompressionStream==='undefined')return raw;
  const zipped=await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return JSON.stringify({encoding:'nar-gzip-v1',data:base64(new Uint8Array(zipped))});
}
export async function decodeArchive(text:string) {
  const data=JSON.parse(text);if(Array.isArray(data))return data;
  if(data?.encoding!=='nar-gzip-v1'||typeof DecompressionStream==='undefined')throw new Error('保存形式を読み込めません。この端末のブラウザを更新してください');
  const bytes=Uint8Array.from(atob(data.data),c=>c.charCodeAt(0));
  const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const rows=JSON.parse(raw);if(!Array.isArray(rows))throw new Error('保存レース形式が不正です');return rows;
}
