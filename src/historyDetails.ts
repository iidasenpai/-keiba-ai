// Archive only redundant calculation copies. Original inputs used by learning,
// fixed scores, all model candidates, market snapshots and results stay live.
export const DETAIL_VERSION='nar-detail-archive-v1';
export const reviewKeys=['id','umaban','name','finish','actualFinish','raceStatus','mark','_autoMark','_rank','predictedScore','_finalScore'];
const validDay=(s:any)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function detailCutoff(now=new Date(),days=30){
 const day=now.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
 return new Date(Date.parse(day+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
}
export function detailEligible(r:any,cutoff:string){return r?.status==='completed'&&validDay(r.raceDate)&&r.raceDate<cutoff&&!r.detailArchive;}
function smallReviewHorse(h:any){if(!h||typeof h!=='object')return h;return Object.fromEntries(Object.entries(h).filter(([k])=>reviewKeys.includes(k)));}
export function compactDetailRecord(r:any,archiveId:string,cutoff:string){
 let changed=false;
 const walk=(v:any):any=>{
  if(!v||typeof v!=='object')return v;
  if(Array.isArray(v))return v.map(walk);
  const out:any={};
  for(const [k,x] of Object.entries(v)){
   if(k==='_recentMeta'&&x&&typeof x==='object'&&!Array.isArray(x)&&Array.isArray((x as any).runs)){
    // fieldAudit's legacy fallback reads runs.length. Preserve that exact count.
    const {runs,...meta}=x as any;out[k]={...meta,archivedRunCount:runs.length};changed=true;
   }else out[k]=walk(x);
  }
  return out;
 };
 const out=walk(r);
 if(r.review&&typeof r.review==='object'){
  const v={...r.review};
  for(const key of ['actual','missed'])if(Array.isArray(v[key]))v[key]=v[key].map(smallReviewHorse);
  if(v.top)v.top=smallReviewHorse(v.top);
  if(JSON.stringify(v)!==JSON.stringify(r.review)){changed=true;out.review=v;}
 }
 if(!changed)return r;
 out.detailArchive={version:DETAIL_VERSION,archiveId,cutoff,date:r.raceDate};return out;
}
export function detailCandidates(records:any[],cutoff:string){return records.filter(r=>detailEligible(r,cutoff)&&compactDetailRecord(r,'preview',cutoff)!==r);}
// Restore only archived details to records that still belong to this ZIP.
// Never replace scores, rankings, results, or edits made after the ZIP export.
export function restoreDetailRecord(current:any,original:any,archiveId:string){
 if(current.id!==original.id||current.detailArchive?.archiveId!==archiveId)return current;
 if(current.track!==original.track||String(current.raceNo)!==String(original.raceNo)||current.raceDate!==original.raceDate)throw Error('復元対象のレースが一致しません');
 const merge=(c:any,o:any):any=>{
  if(!c||typeof c!=='object'||!o||typeof o!=='object')return c;
  if(Array.isArray(c))return c.map((v,i)=>merge(v,o[i]));
  const out:any={};for(const k of Object.keys(c))out[k]=merge(c[k],o[k]);
  if(o._recentMeta?.runs&&c._recentMeta&&!('runs' in c._recentMeta)){
   out._recentMeta={...c._recentMeta,runs:o._recentMeta.runs};
   if(!Object.prototype.hasOwnProperty.call(o._recentMeta,'archivedRunCount'))delete out._recentMeta.archivedRunCount;
  }
  return out;
 };
 const out=merge(current,original);
 if(current.review&&original.review){
  const restoreHorse=(c:any,o:any)=>c&&o?{...o,...c}:c;
  out.review={...current.review};
  for(const key of ['actual','missed'])if(Array.isArray(current.review[key]))out.review[key]=current.review[key].map(c=>restoreHorse(c,original.review[key]?.find(o=>String(o.id||o.umaban)===String(c.id||c.umaban))));
  if(current.review.top)out.review.top=restoreHorse(current.review.top,original.review.top);
 }
 delete out.detailArchive;return out;
}
export async function detailDigest(r:any){const bytes=new TextEncoder().encode(JSON.stringify(r));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
