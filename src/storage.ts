export const SNAPSHOT_KEY = 'nar-consistent-snapshot-v1';
const DB_NAME = 'nar-ai-storage', STORE_NAME = 'keyval';
const openDb = () => new Promise<IDBDatabase>((resolve,reject) => {
  const req = indexedDB.open(DB_NAME,1);
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
  req.onblocked = () => reject(new Error('別のタブを閉じて保存を再試行してください'));
});
let queue: Promise<any> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const task = queue.then(work); queue = task.catch(() => {}); return task;
}
export const storage = {
  async get(key: string): Promise<{value: string|null}> {
    await queue;
    try {
      const db = await openDb();
      const value = await new Promise<string|null>((resolve,reject) => {
        const tx = db.transaction(STORE_NAME,'readonly'), req = tx.objectStore(STORE_NAME).get(key);
        let value: string|null = null;
        req.onsuccess = () => { value = typeof req.result === 'string' ? req.result : null; };
        tx.oncomplete = () => { db.close(); resolve(value); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      });
      return { value: value ?? localStorage.getItem(key) };
    } catch (e) {
      // A canonical snapshot is never silently replaced by stale fallback data.
      if (key === SNAPSHOT_KEY) throw e;
      return { value: localStorage.getItem(key) };
    }
  },
  set(key: string,value: string): Promise<void> { return storage.setMany({[key]:value}); },
  setMany(values: Record<string,string>, expectedRevision?: number): Promise<void> {
    return serialize(async () => {
      const db = await openDb();
      await new Promise<void>((resolve,reject) => {
        const tx = db.transaction(STORE_NAME,'readwrite'), store = tx.objectStore(STORE_NAME);
        let conflict: Error|null = null;
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
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { db.close(); reject(conflict || tx.error || new Error('保存失敗')); };
      });
    });
  }
};
