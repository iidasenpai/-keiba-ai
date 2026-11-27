import {packArchiveRecord,unpackArchiveRecord} from './archivePacking';
// Standard ZIP/deflate using native gzip streams. One race is compressed or
// expanded at a time; never stringify the complete history into one string.
import {DETAIL_VERSION,detailDigest} from './historyDetails';
const enc=new TextEncoder(),dec=new TextDecoder();
const u16=(v:DataView,o:number,n:number)=>v.setUint16(o,n,true);
const u32=(v:DataView,o:number,n:number)=>v.setUint32(o,n,true);
function bytes(n:number){const a=new Uint8Array(n);return {a,v:new DataView(a.buffer)};}
export const FULL_BACKUP_ZIP='nar-full-backup-zip-v1';
export async function writeDetailZip(records:any[],cutoff:string,onProgress?:(n:number)=>void,full?:{state:any}){
 if(typeof CompressionStream==='undefined'||typeof DecompressionStream==='undefined')throw Error('このブラウザはZIPの圧縮・検証に対応していません');
 if(records.length>9998)throw Error('バックアップの対象件数が多すぎます');
 const archiveId=crypto.randomUUID(),files:any[]=[],parts:BlobPart[]=[],central:BlobPart[]=[];let offset=0;
 const add=async(name:string,text:string)=>{
  const plain=enc.encode(text);if(plain.length>32_000_000)throw Error('1レースのデータが大きすぎます');const g=new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  if(g[0]!==31||g[1]!==139||g[2]!==8||g[3]!==0)throw Error('対応しない圧縮形式です');
  const tail=new DataView(g.buffer,g.byteOffset+g.length-8,8),crc=tail.getUint32(0,true),size=tail.getUint32(4,true),data=g.slice(10,-8),nb=enc.encode(name);
  const l=bytes(30);u32(l.v,0,0x04034b50);u16(l.v,4,20);u16(l.v,6,0x800);u16(l.v,8,8);u16(l.v,12,33);u32(l.v,14,crc);u32(l.v,18,data.length);u32(l.v,22,size);u16(l.v,26,nb.length);
  const c=bytes(46);u32(c.v,0,0x02014b50);u16(c.v,4,20);u16(c.v,6,20);u16(c.v,8,0x800);u16(c.v,10,8);u16(c.v,14,33);u32(c.v,16,crc);u32(c.v,20,data.length);u32(c.v,24,size);u16(c.v,28,nb.length);u32(c.v,42,offset);
  parts.push(l.a,nb,data);central.push(c.a,nb);offset+=30+nb.length+data.length;
 };
 for(let i=0;i<records.length;i++){
  const r=records[i],name=`races/${String(i).padStart(5,'0')}.json`;
  files.push({name,id:r.id,digest:await detailDigest(r),...(full?{packed:true}:{})});await add(name,JSON.stringify(full?packArchiveRecord(r):r));onProgress?.(i+1);
  if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 const stateDigest=full?await detailDigest(full.state):undefined;
 if(full)await add('state.json',JSON.stringify(full.state));
 const manifest={type:full?FULL_BACKUP_ZIP:DETAIL_VERSION,archiveId,cutoff,exportedAt:new Date().toISOString(),files,...(full?{stateDigest}:{})};
 await add('manifest.json',JSON.stringify(manifest));const size=central.reduce((n,p)=>n+(p as Uint8Array).byteLength,0),e=bytes(22);
 u32(e.v,0,0x06054b50);u16(e.v,8,files.length+(full?2:1));u16(e.v,10,files.length+(full?2:1));u32(e.v,12,size);u32(e.v,16,offset);
 return {blob:new Blob([...parts,...central,e.a],{type:'application/zip'}),manifest};
}
export async function openDetailZip(file:Blob,expectedType=DETAIL_VERSION){
 const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());let pos=-1;
 for(let i=tail.length-22;i>=0;i--)if(new DataView(tail.buffer).getUint32(i,true)===0x06054b50){pos=i;break;}
 if(pos<0)throw Error('ZIP形式を確認できません');
 const e=new DataView(tail.buffer,pos),count=e.getUint16(10,true),size=e.getUint32(12,true),start=e.getUint32(16,true);
 if(e.getUint16(4,true)||e.getUint16(6,true)||count<1||count>10000||start+size>file.size||size>4_000_000)throw Error('対応しないZIP形式です');
 const cd=new Uint8Array(await file.slice(start,start+size).arrayBuffer()),entries=new Map<string,any>();let p=0;
 for(let i=0;i<count;i++){
  if(p+46>cd.length)throw Error('ZIPの一覧が途中で切れています');const v=new DataView(cd.buffer,p);
  if(v.getUint32(0,true)!==0x02014b50||v.getUint16(10,true)!==8||(v.getUint16(8,true)&1))throw Error('対応しないZIP項目です');
  const nl=v.getUint16(28,true),extra=v.getUint16(30,true),comment=v.getUint16(32,true),name=dec.decode(cd.slice(p+46,p+46+nl));
  if(entries.has(name)||(!/^races\/\d{5}\.json$/.test(name)&&name!=='manifest.json'&&name!=='state.json'))throw Error('ZIP内のファイル名が不正です');
  entries.set(name,{name,crc:v.getUint32(16,true),compressed:v.getUint32(20,true),size:v.getUint32(24,true),offset:v.getUint32(42,true)});p+=46+nl+extra+comment;
 }
 const read=async(name:string)=>{
  const item=entries.get(name);if(!item||item.size>32_000_000||item.compressed>32_000_000)throw Error('ZIP内のファイルがありません、または大きすぎます');
  const h=new DataView(await file.slice(item.offset,item.offset+30).arrayBuffer());if(h.byteLength!==30||h.getUint32(0,true)!==0x04034b50)throw Error('ZIPのデータが壊れています');
  const at=item.offset+30+h.getUint16(26,true)+h.getUint16(28,true);if(at+item.compressed>start)throw Error('ZIP項目の範囲が不正です');
  const footer=bytes(8);u32(footer.v,0,item.crc);u32(footer.v,4,item.size);
  const gz=new Blob([new Uint8Array([31,139,8,0,0,0,0,0,0,255]),file.slice(at,at+item.compressed),footer.a]);
  const reader=gz.stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks:Uint8Array[]=[];let n=0;
  try{while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>item.size||n>32_000_000)throw Error('ZIPの展開サイズが不正です');chunks.push(r.value);}}finally{reader.releaseLock();}
  if(n!==item.size)throw Error('ZIPの展開サイズが一致しません');
  return JSON.parse(await new Blob(chunks).text(),(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('不正なデータ項目です');return v;});
 };
 const manifest=await read('manifest.json');
 if(manifest.type!==expectedType||typeof manifest.archiveId!=='string'||!Array.isArray(manifest.files)||manifest.files.length+(expectedType===FULL_BACKUP_ZIP?2:1)!==count||(expectedType!==FULL_BACKUP_ZIP&&!/^\d{4}-\d{2}-\d{2}$/.test(manifest.cutoff)))throw Error('選択したZIPの種類または形式が違います');
 const ids=new Set(),names=new Set();for(const row of manifest.files){if(typeof row.id!=='string'||ids.has(row.id)||names.has(row.name)||!entries.has(row.name)||!/^races\/\d{5}\.json$/.test(row.name)||!/^[0-9a-f]{64}$/.test(row.digest))throw Error('ZIPのレース一覧が不正です');ids.add(row.id);names.add(row.name);}
 return {manifest,readRace:async(row:any)=>{const stored=await read(row.name),r=row.packed?unpackArchiveRecord(stored):stored;if(r.id!==row.id||await detailDigest(r)!==row.digest)throw Error('退避したレースの検証に失敗しました');return r;},readState:async()=>{if(expectedType!==FULL_BACKUP_ZIP)throw Error('全データバックアップではありません');const state=await read('state.json');if(!state||typeof state!=='object'||Array.isArray(state)||await detailDigest(state)!==manifest.stateDigest)throw Error('設定データの検証に失敗しました');return state;}};
}
