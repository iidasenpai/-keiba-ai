import {describe,it,expect} from 'vitest';
import {packArchiveRecord,unpackArchiveRecord} from './archivePacking';
import {encodeArchive,decodeArchive} from './modelSafety';
describe('lossless packed storage',()=>{
 it('preserves fields and independent current/frozen horses while sharing evidence',()=>{
  const record={id:'r',horses:[{id:'h',finish:'1',recentRuns:[{index:55}]}],predictionLock:{horses:[{id:'h',finish:'',recentRuns:[{index:55}]}]}};
  const out=unpackArchiveRecord(JSON.parse(JSON.stringify(packArchiveRecord(record))));expect(out).toEqual(record);
  expect(out.horses[0]).not.toBe(out.predictionLock.horses[0]);expect(out.horses[0].recentRuns).toBe(out.predictionLock.horses[0].recentRuns);
  out.horses[0].finish='2';expect(out.predictionLock.horses[0].finish).toBe('');
 });
 it('reads new compressed storage and legacy plain and gzip data',async()=>{
  const rs=[{id:'r',horses:[{recentRuns:[{index:55}]}]}];const encoded=await encodeArchive(rs);expect(await decodeArchive(encoded)).toEqual(rs);const envelope=JSON.parse(encoded);expect(await decodeArchive(JSON.stringify({data:envelope.data,encoding:envelope.encoding}))).toEqual(rs);
  expect(await decodeArchive(JSON.stringify(rs))).toEqual(rs);
  const gzip=new Uint8Array(await new Response(new Blob([JSON.stringify(rs)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  expect(await decodeArchive(JSON.stringify({encoding:'nar-gzip-v1',data:btoa(Array.from(gzip,b=>String.fromCharCode(b)).join(''))}))).toEqual(rs);
 });
 it('rejects corrupt evidence references',()=>{
  expect(()=>unpackArchiveRecord({format:'nar-shared-record-v1',pool:[],value:{recentRuns:{$narRef:1}}})).toThrow();
 });
});
