import {finite,nonStarter} from './modelSafety';

// A prospective hypothesis, not fitted to race outcomes. The main model is unchanged.
export const CONDITION_VERSION='urawa-condition-v12.8-1';
const DAY=86400000;
const JRA=new Set(['札幌','函館','福島','新潟','東京','中山','中京','京都','阪神','小倉']);
const surface=(s:any)=>String(s||'').startsWith('ダ')?'ダート':s==='芝'?'芝':'';
export const conditionBand=(d:any)=>Number(d)>0?(Number(d)<=1000?'短距離':Number(d)<=1700?'中距離':'長距離'):'';
const asOf=(meta:any)=>Date.parse(meta.scheduledStart||`${meta.raceDate}T00:00:00+09:00`);
const dateOf=(v:any)=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?Date.parse(v+'T00:00:00+09:00'):NaN;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));

export function conditionEvidence(h:any,meta:any){
 const at=asOf(meta),target=finite(meta.distance),targetSurface=surface(meta.surface);
 const known=(h.recentRuns||[]).slice(0,5).filter(r=>finite(r.index)!==null);
 const eligible=known.filter(r=>targetSurface&&surface(r.surface)===targetSurface&&finite(r.distance)!==null&&target!==null&&conditionBand(r.distance)===conditionBand(target)&&Math.abs(Number(r.distance)-target)<=200&&r.source==='NAR'&&!JRA.has(r.track));
 const future=eligible.filter(r=>Number.isFinite(dateOf(r.date||r.raceDate))&&dateOf(r.date||r.raceDate)>at);
 const usable=Number.isFinite(at)?eligible.filter(r=>!future.includes(r)):[];
 const latest=known[0],last=dateOf(latest?.date||latest?.raceDate);
 const days=Number.isFinite(last)&&Number.isFinite(at)?Math.floor((at-last)/DAY):null;
 const risks:string[]=[];
 if(!targetSurface||target===null||!Number.isFinite(at))risks.push('今回の馬場・距離・日時が未確認');
 if(usable.length<3)risks.push(`比較可能な近走 ${usable.length}走（3走未満）`);
 if(!usable.length)risks.push('同じ馬場・距離±200m・同距離帯の地方指数なし');
 if(known.some(r=>r.source==='JRA'||JRA.has(r.track)))risks.push('中央指数は換算未検証のため候補点から除外');
 if(usable.some(r=>r.track!==meta.track))risks.push('他場指数あり・場間換算未検証');
 if(usable.some(r=>!Number.isFinite(dateOf(r.date||r.raceDate))))risks.push('比較実績の日付未確認あり');
 if(days===null)risks.push('直近出走日未確認');else if(days<0)risks.push('直近出走日が今回より未来');else if(days>=90)risks.push(`最終確認出走から${days}日`);
 if(future.length)risks.push('今回より未来の日付の指数を除外');
 if(usable.length&&!usable.some(r=>r.track===meta.track&&Number(r.distance)===target))risks.push('同場・同距離の近走指数なし');
 return {usable,risks,days,sourceCount:known.length,compatibleCount:usable.length};
}

export function conditionCandidate(horses:any[],meta:any,aux=false){
 if(meta.track!=='浦和')return [];
 const evidence=horses.map(h=>conditionEvidence(h,meta));
 const pool=evidence.flatMap((e,i)=>nonStarter(horses[i])?[]:e.usable.map(r=>Number(r.index))).sort((a,b)=>a-b);
 const prior=pool.length?pool.length%2?pool[(pool.length-1)/2]:(pool[pool.length/2-1]+pool[pool.length/2])/2:null;
 const at=asOf(meta);
 const scored=horses.map((h,i)=>{
  const e=evidence[i];let total=0,sum=0,support=0;
  e.usable.forEach((r,j)=>{
   const date=dateOf(r.date||r.raceDate),dated=Number.isFinite(date),age=dated?Math.max(0,(at-date)/DAY):0;
   const agreement=Number(r.distance)===Number(meta.distance)?(r.track===meta.track?1:.9):.7;
   const freshness=dated?Math.pow(.5,age/56):.5;
   const w=[1.45,1.22,1.05,.88,.72][j]*agreement*freshness;
   total+=w;sum+=Number(r.index)*w;support+=agreement*freshness;
  });
  const recent=total>0?sum/total:null,best=e.usable.length?Math.max(...e.usable.map(r=>Number(r.index))):null;
  const strength=support/(support+2);
  const base=!nonStarter(h)&&recent!==null&&prior!==null ? .85*recent+.15*best : null;
  // Absolute evidence support also falls with age; normalizing old weights alone would cancel that effect.
  const shrunk=base===null?null:prior+(base-prior)*strength;
  const training=aux&&finite(h._trainingScore)!==null?clamp((Number(h._trainingScore)-70)/7,-1,1):0;
  const comment=aux&&finite(h._commentScore)!==null?clamp((Number(h._commentScore)-55)/10,-.5,.5):0;
  const adjustment=training+comment,score=shrunk===null?null:shrunk+adjustment;
  return {...h,finish:'',actualFinish:null,_rank:null,predictedScore:score,_finalScore:score,candidateVersion:CONDITION_VERSION+(aux?'-aux':''),candidateEvidence:{base:shrunk,unshrunk:base,recent,best,prior,strength,support,compatibleCount:e.compatibleCount,days:e.days,training,comment,adjustment,risks:e.risks},uncertainty:e.risks};
 });
 const sorted=scored.filter(h=>h._finalScore!==null).sort((a,b)=>b._finalScore-a._finalScore||Number(a.umaban)-Number(b.umaban));
 const ranks=new Map(sorted.map((h,i)=>[String(h.id||h.umaban),i+1]));
 return scored.map(h=>({...h,_rank:ranks.get(String(h.id||h.umaban))??null}));
}
