export const SNAPSHOT_KEY = 'nar-consistent-snapshot-v1';
const DB_NAME = 'nar-ai-storage', STORE_NAME = 'keyval';
const openDb = () => new Promise<IDBDatabase>((resolve,reject) => {
  let settled = false;
  const req = indexedDB.open(DB_NAME,1);
  const fail = (error: any) => { if (!settled) { settled=true; clearTimeout(timer); reject(error); } };
  const timer = setTimeout(()=>fail(new Error('保存領域が応答しません。今の入力を保全してから再試行してください')),10000);
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME); };
  req.onsuccess = () => {
    if (settled) { req.result.close(); return; }
    settled=true; clearTimeout(timer);
    req.result.onversionchange = () => req.result.close();
    resolve(req.result);
  };
  req.onerror = () => fail(req.error);
  req.onblocked = () => fail(new Error('別のタブを閉じて保存を再試行してください'));
});
let queue: Promise<any> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const task = queue.then(work); queue = task.catch(() => {}); return task;
}
export const storage = {
  async getMany(keys: string[]): Promise<Record<string,string|null>> {
    await queue;
    const db = await openDb();
    return await new Promise((resolve,reject) => {
      const tx = db.transaction(STORE_NAME,'readonly');
      const values: Record<string,string|null> = {};
      let expired = false;
      const timer = setTimeout(()=> { expired=true; tx.abort(); },20000);
      for (const key of keys) {
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => { values[key] = typeof request.result === 'string' ? request.result : localStorage.getItem(key); };
      }
      tx.oncomplete = () => { clearTimeout(timer); db.close(); resolve(values); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); db.close(); reject(expired ? new Error('読込が時間切れになりました。保存データは変更していません') : tx.error || new Error('読込失敗')); };
    });
  },
  async get(key: string): Promise<{value: string|null}> { return { value:(await storage.getMany([key]))[key] }; },
  set(key: string,value: string): Promise<void> { return storage.setMany({[key]:value}); },
  setMany(values: Record<string,string>, expectedRevision?: number): Promise<void> {
    return serialize(async () => {
      const db = await openDb();
      await new Promise<void>((resolve,reject) => {
        const tx = db.transaction(STORE_NAME,'readwrite'), store = tx.objectStore(STORE_NAME);
        let conflict: Error|null = null;
        const timer = setTimeout(()=> { conflict=new Error('保存が時間切れになりました。入力を保持しています。再試行してください'); tx.abort(); },20000);
        const write = () => {
          try { Object.entries(values).forEach(([key,value]) => store.put(value,key)); }
          catch(e) { conflict = e instanceof Error ? e : new Error('保存失敗'); tx.abort(); }
        };
        if (expectedRevision !== undefined) {
          const read = store.get(SNAPSHOT_KEY);
          read.onsuccess = () => {
            try {
              const revision = read.result ? Number(JSON.parse(read.result).revision || 0) : 0;
              if (revision !== expectedRevision) { conflict = new Error('別タブの更新を検出しました。全データを書き出してから再読込してください'); tx.abort(); }
              else write();
            } catch (e) { conflict = e instanceof Error ? e : new Error('保存形式エラー'); tx.abort(); }
          };
        } else write();
        tx.oncomplete = () => { clearTimeout(timer); db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { clearTimeout(timer); db.close(); reject(conflict || tx.error || new Error('保存失敗')); };
      });
    });
  }
};
