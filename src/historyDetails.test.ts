import {describe,it,expect} from 'vitest';
import {detailCutoff,compactDetailRecord,detailCandidates,restoreDetailRecord} from './historyDetails';
import {writeDetailZip,openDetailZip} from './detailZip';
import {applyDetailZip} from './historyDetailActions';
import {fieldAudit} from './modelSafety';
const fixture=()=>({id:'r1',raceDate:'2026-10-28',track:'浦和',raceNo:'1',status:'completed',horses:[{id:'h1',umaban:'1',name:'馬',finish:'1',comment:'状態良好',recentRuns:[{index:50}],_rank:1,_finalScore:52,_recentMeta:{runs:[{index:50}]}}],predictionLock:{horses:[{id:'h1',umaban:'1',name:'馬',_rank:1,_finalScore:52,_recentMeta:{runs:[{index:50}]}}],models:{PaceOff:{predictions:[{umaban:'1',rank:1,score:52}]}}},review:{grade:'A',actual:[{id:'h1',umaban:'1',name:'馬',finish:'1',recentRuns:[{index:50}]}],notes:['固定した回顧']}});
describe('detail archiving',()=>{
 it('uses 30 JST calendar dates, keeps boundary, unknown dates and unfinished races',()=>{
  const cutoff=detailCutoff(new Date('2026-11-26T16:00:00Z'));expect(cutoff).toBe('2026-10-29');
  expect(detailCandidates([fixture(),{...fixture(),raceDate:cutoff},{...fixture(),raceDate:undefined},{...fixture(),status:'pending'}],cutoff)).toHaveLength(1);
 });
 it('retains all learned inputs, scores, candidates, results and legacy audit counts',()=>{
  const r=fixture(),before=JSON.stringify(r),n=compactDetailRecord(r,'zip1','2026-10-29');
  expect(JSON.stringify(r)).toBe(before);expect(n.horses[0].comment).toBe(r.horses[0].comment);expect(n.horses[0].recentRuns).toEqual(r.horses[0].recentRuns);
  expect(n.horses[0]._finalScore).toBe(52);expect(n.predictionLock.models).toEqual(r.predictionLock.models);expect(n.review.notes).toEqual(r.review.notes);
  expect(n.horses[0]._recentMeta.runs).toBeUndefined();expect(fieldAudit(n.horses)).toEqual(fieldAudit(r.horses));
  expect(restoreDetailRecord(n,r,'zip1')).toEqual(r);
 });
 it('round trips a standard ZIP and compacts only after every original is verified',async()=>{
  const r=fixture(),z=await writeDetailZip([r],'2026-10-29'),zip=await openDetailZip(z.blob);
  expect(await zip.readRace(zip.manifest.files[0])).toEqual(r);
  const result=await applyDetailZip([r],zip);expect(result.count).toBe(1);expect(result.records).toHaveLength(1);
  const restored=await applyDetailZip(result.records,zip,true);expect(restored.records).toEqual([r]);
  await expect(applyDetailZip([{...r,resultOrder:'2-1-3'}],zip)).rejects.toThrow('更新');
 });
 it('does not overwrite result changes made after archiving when restoring details',()=>{
  const r=fixture(),n=compactDetailRecord(r,'zip1','2026-10-29');n.horses[0].finish='2';n.resultOrder='2-1-3';
  const restored=restoreDetailRecord(n,r,'zip1');expect(restored.horses[0].finish).toBe('2');expect(restored.resultOrder).toBe('2-1-3');expect(restored.horses[0]._recentMeta.runs).toEqual([{index:50}]);
 });
 it('rejects a corrupt ZIP before it can be used',async()=>{
  const {blob}=await writeDetailZip([fixture()],'2026-10-29'),b=new Uint8Array(await blob.arrayBuffer());b[60]^=255;
  await expect((async()=>{const z=await openDetailZip(new Blob([b]));await z.readRace(z.manifest.files[0]);})()).rejects.toThrow();
 });
});
