import {finite,modelRows} from './modelSafety';
import {commentScore} from './assessments';
export const NAGOYA_MIX_VERSION='nagoya-head-recent-v1';
export const SONODA_AUX_VERSION='sonoda-evidence-aux-v1';
// Keep the frozen first choice; only reorder the other ranked horses by recent evidence.
export function nagoyaHeadRecent(current:any[],track:string){
 if(track!=='名古屋')return null;
 const ranked=[...current].filter(h=>finite(h._rank)!==null&&finite(h._finalScore)!==null).sort((a,b)=>a._rank-b._rank);
 if(!ranked.length)return [];
 const recent=modelRows(current),byNo=new Map(ranked.map(h=>[String(h.umaban),h]));
 const order=[ranked[0],...recent.map(p=>byNo.get(String(p.umaban))).filter(Boolean),...ranked];
 const seen=new Set();return order.filter(h=>{if(seen.has(h.id))return false;seen.add(h.id);return true}).map((h,i)=>({...h,_rank:i+1}));
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function sourceFor(h:any,kind:string,meta:any){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(meta.raceDate||'')||!/^\d+$/.test(String(meta.raceNo)))return false;
 return (h.inputSources||[]).some((s:any)=>{try{const u=new URL(s.url);const m=u.pathname.match(/^\/chihou\/(cyokyo|danwa)\/2\/(\d{16})$/);const id=m?.[2];const at=Date.parse(s.capturedAt);return s.kind===kind&&u.hostname==='s.keibabook.co.jp'&&m?.[1]===(kind==='training'?'cyokyo':'danwa')&&id?.slice(0,4)===meta.raceDate.slice(0,4)&&id?.slice(12)===meta.raceDate.slice(5).replace('-','')&&Number(id?.slice(10,12))===Number(meta.raceNo)&&id?.slice(6,8)==='37'&&Number.isFinite(at)&&at<Date.parse(meta.scheduledStart);}catch{return false;}});
}
// Experimental only: existing base/context remain intact; add small, source-backed adjustments.
export function sonodaAuxInputs(current:any[],meta:any){
 if(meta.track!=='園田')return null;
 return current.map(h=>{const training=sourceFor(h,'training',meta)&&String(h.trainingNote||'').trim()?finite(h.trainingScore):null;
 const comment=sourceFor(h,'comment',meta)&&String(h.comment||'').trim()?commentScore(h.comment):null;
 const trainingAdj=training===null?0:clamp((training-70)/7,-1,1),commentAdj=comment===null?0:clamp((comment-55)/10,-.5,.5);
 const base=finite(h._finalScore);return {...h,_finalScore:base===null?null:base+trainingAdj+commentAdj,sonodaAuxEvidence:{version:SONODA_AUX_VERSION,trainingAdj,commentAdj,total:trainingAdj+commentAdj,trainingObserved:training!==null,commentObserved:comment!==null}};});
}
