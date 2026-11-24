// Saved evidence is read-only; current/locked horse objects remain independent.
// Pool only identical evidence inside ONE race, not across different races.
// The temporary keys can be released as soon as this race has been parsed.
const evidenceKeys=new Set(['pastRunEvidence','recentRuns','recentPositions','inputSources','formEvidence','_recentMeta','_styleProfile','_contextComponents','_effectiveLearned','_paceDistribution','_factorValues','_coreWeights']);
export function shareArchiveEvidence(record:any):any {
  const pool=new Map<string,any>();
  function walk(value:any):void {
    if(!value||typeof value!=='object')return;
    for(const key of Object.keys(value)){
      const child=value[key];
      if(child&&typeof child==='object'&&evidenceKeys.has(key)){
        const text=JSON.stringify(child);
        const previous=pool.get(text);
        if(previous!==undefined)value[key]=previous;
        else pool.set(text,child);
      }else if(child&&typeof child==='object')walk(child);
    }
  }
  walk(record);return record;
}

// Convert only a small aligned base64 slice per pull. The previous decoder
// simultaneously retained a full binary string, byte array and Blob (~115 MB
// for the rescued archive), before even constructing the saved race objects.
export function base64ByteStream(text:string,start=0,end=text.length):ReadableStream<Uint8Array> {
  let offset=start;
  return new ReadableStream<Uint8Array>({pull(controller){
    if(offset>=end){controller.close();return;}
    const next=Math.min(end,offset+65536),part=text.slice(offset,next);
    if(!/^[A-Za-z0-9+/]*={0,2}$/.test(part)||(next<end&&part.includes('='))||(end-start)%4!==0){controller.error(new Error('保存データのbase64が不正です'));return;}
    const binary=atob(part),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    offset=next;controller.enqueue(bytes);
  }});
}

export function archiveCompressedBytes(text:string):ReadableStream<Uint8Array> {
  // Fast path for the existing encodeArchive format, without JSON.parse making
  // another 51 MB copy of its base64 data string. Other valid envelopes retain
  // the old general parser for compatibility.
  const head=/^\s*\{\s*"encoding"\s*:\s*"nar-gzip-v1"\s*,\s*"data"\s*:\s*"/.exec(text);
  const tail=/"\s*\}\s*$/.exec(text);
  if(head&&tail&&tail.index>=head[0].length)return base64ByteStream(text,head[0].length,tail.index);
  const data=JSON.parse(text);
  if(data?.encoding!=='nar-gzip-v1'||typeof data.data!=='string')throw new Error('保存形式を読み込めません');
  return base64ByteStream(data.data);
}
