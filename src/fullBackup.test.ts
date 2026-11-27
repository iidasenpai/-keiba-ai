import {describe,it,expect} from 'vitest';
import {createFullBackup,readFullBackup} from './fullBackup';
import {writeDetailZip,openDetailZip,FULL_BACKUP_ZIP} from './detailZip';
describe('full backup without a whole-history JSON string',()=>{
 const records=()=>[{id:'r1',horses:[{id:'h1',finish:'1',recentRuns:[{index:50}]}],predictionLock:{horses:[{id:'h1',finish:'',recentRuns:[{index:50}]}],models:{A:{predictions:[{umaban:'1',rank:1}]}}}},{id:'r2',status:'pending',horses:[{id:'h2',name:'日本語の馬'}]}];
 it('restores all settings, frozen candidates, results and pending records exactly',async()=>{
  const state={engineVersion:12,learned:{pace:1.2},learningHistory:[{raceId:'r1'}],weights:{best:15,avg5:50,dist:15,course:20},horses:[{name:'入力中'}]},rs=records(),snapshot=JSON.stringify({state,rs}),stages:string[]=[];
  const blob=await createFullBackup(state,rs,stage=>stages.push(stage)),out=await readFullBackup(blob);
  expect(out.state).toEqual(state);expect(out.savedRaces).toEqual(rs);expect(JSON.stringify({state,rs})).toBe(snapshot);expect(stages).toContain('作成');expect(stages).toContain('検証');
  expect(out.savedRaces[0].horses[0]).not.toBe(out.savedRaces[0].predictionLock.horses[0]);
 });
 it('supports empty histories and legacy JSON backups',async()=>{
  expect((await readFullBackup(await createFullBackup({},[]))).savedRaces).toEqual([]);
  const old={type:'nar-ai-full-backup',state:{raceDate:'2026-11-27'},savedRaces:records()};expect(await readFullBackup(new Blob([JSON.stringify(old)]))).toEqual(old);
 });
 it('rejects a detail-only ZIP and invalid JSON without returning a partial restore',async()=>{
  const detail=await writeDetailZip(records(),'2026-10-29');await expect(readFullBackup(detail.blob)).rejects.toThrow();await expect(readFullBackup(new Blob(['{}']))).rejects.toThrow();
 });
 it('verifies the state and rejects corrupted compressed data',async()=>{
  const blob=await createFullBackup({raceDate:'2026-11-27'},records()),zip=await openDetailZip(blob,FULL_BACKUP_ZIP);expect((await zip.readState()).raceDate).toBe('2026-11-27');
  const bytes=new Uint8Array(await blob.arrayBuffer());bytes[60]^=255;await expect(readFullBackup(new Blob([bytes]))).rejects.toThrow();
 });
});
