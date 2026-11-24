import {describe,it,expect} from 'vitest';
import {archiveCompressedBytes,base64ByteStream,shareArchiveEvidence} from './archiveMemory';
describe('archive memory preservation',()=>{
 it('shares identical evidence but keeps independent horses and frozen predictions',()=>{
  const record={horses:[{finish:1,recentRuns:[{index:45,date:'2026-11-01'}]}],predictionLock:{horses:[{finish:'',recentRuns:[{index:45,date:'2026-11-01'}]}]}};
  const original=JSON.stringify(record),result=shareArchiveEvidence(record);
  expect(JSON.stringify(result)).toBe(original);
  expect(result.horses[0]).not.toBe(result.predictionLock.horses[0]);
  expect(result.horses[0].recentRuns).toBe(result.predictionLock.horses[0].recentRuns);
  result.horses[0].finish=2;expect(result.predictionLock.horses[0].finish).toBe('');
 });
 it('does not pool distinct evidence or different races',()=>{
  const first=shareArchiveEvidence({horses:[{recentRuns:[{index:1}]},{recentRuns:[{index:2}]}]});
  const second=shareArchiveEvidence({horses:[{recentRuns:[{index:1}]}]});
  expect(first.horses[0].recentRuns).not.toBe(first.horses[1].recentRuns);
  expect(first.horses[0].recentRuns).not.toBe(second.horses[0].recentRuns);
 });
 it('decodes aligned chunks including final padding with bounded chunks',async()=>{
  const raw='日本語😀'.repeat(40000),bytes=new TextEncoder().encode(raw);
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const reader=base64ByteStream(btoa(binary)).getReader();const chunks:Uint8Array[]=[];
  while(true){const item=await reader.read();if(item.done)break;expect(item.value.length).toBeLessThanOrEqual(49152);chunks.push(item.value);}
  expect(await new Blob(chunks).text()).toBe(raw);
 });
 it('reads reordered legacy envelopes and rejects invalid input',async()=>{
  expect(await new Response(archiveCompressedBytes('{"data":"YWJj","encoding":"nar-gzip-v1"}')).text()).toBe('abc');
  await expect(new Response(archiveCompressedBytes('{"encoding":"nar-gzip-v1","data":"!!!!"}')).arrayBuffer()).rejects.toThrow();
 });
});
