import {afterEach,describe,expect,it,vi} from 'vitest';
import {listRescueEntries,readRescueEntry,rawRescueBlob} from './rescueStorage';

afterEach(()=>{ vi.unstubAllGlobals(); });
function storedFixture(values:Record<string,string>) {
  const modes:string[]=[];
  const close=vi.fn();
  const db={objectStoreNames:{contains:()=>true},close,transaction:(_name:string,mode:string)=>{
    modes.push(mode);
    const tx:any={objectStore:()=>({
      getAllKeys:()=>({result:Object.keys(values)}),
      get:(key:string)=>({result:values[key]})
    }),abort:vi.fn()};
    queueMicrotask(()=>tx.oncomplete?.());return tx;
  }};
  vi.stubGlobal('indexedDB',{open:()=>{const request:any={result:db};queueMicrotask(()=>request.onsuccess());return request;}});
  vi.stubGlobal('localStorage',{length:1,key:()=> 'nar-tool-state',getItem:()=>'{"legacy":true}'});
  return {modes,close};
}
describe('read-only startup rescue',()=>{
  it('lists only NAR keys without loading archive values and retains legacy copies',async()=>{
    const fixture=storedFixture({'nar-tool-state':'{}','nar-saved-races':'not valid JSON',other:'private'});
    expect(await listRescueEntries()).toEqual([
      {key:'nar-tool-state',source:'indexedDB'},
      {key:'nar-saved-races',source:'indexedDB'},
      {key:'nar-tool-state',source:'localStorage'}
    ]);
    expect(fixture.modes).toEqual(['readonly']);expect(fixture.close).toHaveBeenCalledOnce();
  });
  it('exports the exact raw archive, including malformed JSON, with no parsing or writes',async()=>{
    const raw='broken { 日本語😀 \\ [ '+ 'x'.repeat(2_000_000);
    const fixture=storedFixture({'nar-saved-races':raw});
    const blob=await readRescueEntry({key:'nar-saved-races',source:'indexedDB'});
    expect(await blob.text()).toBe(raw);expect(fixture.modes).toEqual(['readonly']);
  });
  it('does not confuse a legacy copy with the IndexedDB value',async()=>{
    const fixture=storedFixture({'nar-tool-state':'{"new":true}'});
    expect(await (await readRescueEntry({key:'nar-tool-state',source:'localStorage'})).text()).toBe('{"legacy":true}');
    expect(fixture.modes).toEqual([]);
  });
  it('aborts accidental database creation on a new origin',async()=>{
    const abort=vi.fn();
    vi.stubGlobal('indexedDB',{open:()=>{const request:any={transaction:{abort}};queueMicrotask(()=>request.onupgradeneeded());return request;}});
    vi.stubGlobal('localStorage',{length:0});
    expect(await listRescueEntries()).toEqual([]);expect(abort).toHaveBeenCalledOnce();
  });
  it('does not expand a compressed archive envelope',async()=>{
    const raw='{"encoding":"nar-gzip-v1","data":"H4sI..."}';
    expect(await rawRescueBlob(raw).text()).toBe(raw);
  });
});
