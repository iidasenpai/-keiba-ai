// Read raw stored strings only. Do not parse/decompress the race archive or
// open the normal app, whose autosave could otherwise run during recovery.
const DB_NAME = 'nar-ai-storage';
const STORE_NAME = 'keyval';
export type RescueEntry = {key:string; source:'indexedDB'|'localStorage'};

function openExisting():Promise<IDBDatabase|null> {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const request=indexedDB.open(DB_NAME);
    const timer=setTimeout(()=>finish(new Error('保存領域が応答しません。他の競馬アプリのタブを閉じて再試行してください。')),10000);
    function finish(error?:Error, db?:IDBDatabase|null) {
      if(settled){db?.close();return;}
      settled=true;clearTimeout(timer);
      if(error)reject(error);else resolve(db||null);
    }
    request.onupgradeneeded=()=>{
      // Opening a missing database would create one. Abort that transaction.
      request.transaction?.abort();
      finish(undefined,null);
    };
    request.onsuccess=()=>finish(undefined,request.result);
    request.onerror=()=>{if(!settled)finish(request.error||new Error('保存領域を開けません'));};
    request.onblocked=()=>finish(new Error('別タブが保存領域を使用しています。競馬アプリの他のタブを閉じてください。'));
  });
}

async function readExisting<T>(read:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T|null> {
  const db=await openExisting();
  if(!db)return null;
  if(!db.objectStoreNames.contains(STORE_NAME)){db.close();return null;}
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readonly');
      const req=read(tx.objectStore(STORE_NAME));
      const timer=setTimeout(()=>tx.abort(),20000);
      tx.oncomplete=()=>{clearTimeout(timer);resolve(req.result);};
      tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(tx.error||new Error('保存データを読み出せません。元のデータは変更していません。'));};
    });
  } finally {db.close();}
}

export async function listRescueEntries():Promise<RescueEntry[]> {
  const keys=await readExisting(store=>store.getAllKeys());
  const entries:RescueEntry[]=(keys||[]).filter((key):key is string=>typeof key==='string'&&key.startsWith('nar-')).map(key=>({key,source:'indexedDB'}));
  // Keep both copies if legacy localStorage and IndexedDB differ. Neither is
  // silently preferred or overwritten during a rescue.
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith('nar-'))entries.push({key,source:'localStorage'});
  }
  return entries;
}

export async function readRescueEntry(entry:RescueEntry):Promise<Blob> {
  const raw=entry.source==='indexedDB'?await readExisting(store=>store.get(entry.key)):localStorage.getItem(entry.key);
  if(typeof raw!=='string')throw new Error('保存データが見つからないか、対応しない形式です。');
  return rawRescueBlob(raw);
}

export function rawRescueBlob(raw:string):Blob {
  // Exact stored JSON string; avoid parsing, base64 decoding or pretty-printing.
  return new Blob([raw],{type:'application/json;charset=utf-8'});
}
