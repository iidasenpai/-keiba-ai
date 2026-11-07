// Parse an archive array incrementally. Keep only one record's JSON text at a
// time, rather than a second, fully decompressed copy of the entire archive.
export class ArchiveArrayReader {
  private started=false;
  private ended=false;
  private quoted=false;
  private escaped=false;
  private depth=0;
  private fragments:string[]=[];
  private count=0;
  readonly rows:any[]=[];
  private value(last:boolean) {
    const text=this.fragments.join('').trim();
    this.fragments=[];
    if (!text) {
      if (last && this.count===0) return;
      throw new Error('保存レースのJSON配列が不正です');
    }
    this.rows.push(JSON.parse(text));
    this.count++;
  }
  feed(chunk:string) {
    let start=0;
    for(let i=0;i<chunk.length;i++) {
      const c=chunk[i];
      if(this.ended) {
        if(!/\s/.test(c)) throw new Error('保存レース末尾に不正なデータがあります');
        start=i+1; continue;
      }
      if(!this.started) {
        if(/\s/.test(c)){start=i+1;continue;}
        if(c!=='[') throw new Error('保存レース形式が不正です');
        this.started=true;start=i+1;continue;
      }
      if(this.quoted) {
        if(this.escaped)this.escaped=false;
        else if(c==='\\')this.escaped=true;
        else if(c==='"')this.quoted=false;
        continue;
      }
      if(c==='"'){this.quoted=true;continue;}
      if(c==='{'||c==='['){this.depth++;continue;}
      if(c===']'&&this.depth===0) {
        this.fragments.push(chunk.slice(start,i));this.value(true);
        this.ended=true;start=i+1;continue;
      }
      if(c==='}'||c===']') {
        if(this.depth===0)throw new Error('保存レースの括弧が不正です');
        this.depth--;continue;
      }
      if(c===','&&this.depth===0) {
        this.fragments.push(chunk.slice(start,i));this.value(false);start=i+1;
      }
    }
    if(start<chunk.length)this.fragments.push(chunk.slice(start));
  }
  finish() {
    if(!this.started||!this.ended||this.quoted||this.depth)throw new Error('保存レースのJSONが途中で切れています');
    return this.rows;
  }
}

// Yield between chunks so the loading screen can paint and the browser can
// collect temporary buffers. This does not change record order or contents.
const yieldToBrowser=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
export async function decodeArchiveStream(text:string):Promise<any[]> {
  const parser=new ArchiveArrayReader();
  if(text.trimStart().startsWith('[')) {
    for(let i=0;i<text.length;i+=65536){parser.feed(text.slice(i,i+65536));if(i%1048576===0)await yieldToBrowser();}
    return parser.finish();
  }
  const data=JSON.parse(text);
  if(data?.encoding!=='nar-gzip-v1'||typeof data.data!=='string'||typeof DecompressionStream==='undefined')throw new Error('保存形式を読み込めません。この端末のブラウザを更新してください');
  // Avoid Uint8Array.from(string, callback), which creates large iterator
  // intermediates for a base64 archive on mobile browsers.
  const binary=atob(data.data),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const decoder=new TextDecoder();
  let sinceYield=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      parser.feed(decoder.decode(value,{stream:true}));
      sinceYield+=value.byteLength;
      if(sinceYield>=1048576){await yieldToBrowser();sinceYield=0;}
    }
    parser.feed(decoder.decode());
    return parser.finish();
  } finally {reader.releaseLock();}
}
