// Lossless, race-local references for identical immutable evidence. Horse
// objects and current/result/frozen scores always remain independent.
const keys=new Set(['pastRunEvidence','recentRuns','recentPositions','inputSources','formEvidence','_recentMeta','_styleProfile','_contextComponents','_effectiveLearned','_paceDistribution','_factorValues','_coreWeights']);
export function packArchiveRecord(record:any){
 const pool:any[]=[],indices=new Map<string,number>();
 const walk=(v:any):any=>{
  if(!v||typeof v!=='object')return v;
  if(Array.isArray(v))return v.map(walk);
  return Object.fromEntries(Object.entries(v).map(([k,x])=>{
   if(keys.has(k)&&x&&typeof x==='object'){
    const text=JSON.stringify(x);let i=indices.get(text);if(i===undefined){i=pool.length;indices.set(text,i);pool.push(x);}
    return [k,{$narRef:i}];
   }return [k,walk(x)];
  }));
 };
 return {format:'nar-shared-record-v1',value:walk(record),pool};
}
export function unpackArchiveRecord(packed:any){
 if(packed?.format!=='nar-shared-record-v1'||!Array.isArray(packed.pool)||!packed.value||typeof packed.value!=='object'||packed.pool.length>100000)throw Error('共有資料の保存形式が不正です');
 const walk=(v:any):any=>{
  if(!v||typeof v!=='object')return v;
  if(Array.isArray(v))return v.map(walk);
  return Object.fromEntries(Object.entries(v).map(([k,x]:[string,any])=>{
   if(keys.has(k)&&x&&typeof x==='object'){
    const i=x.$narRef;if(Object.keys(x).length!==1||!Number.isInteger(i)||i<0||i>=packed.pool.length||!packed.pool[i]||typeof packed.pool[i]!=='object')throw Error('共有資料の参照先が不正です');
    return [k,packed.pool[i]];
   }return [k,walk(x)];
  }));
 };
 return walk(packed.value);
}
