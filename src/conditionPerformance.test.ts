import {describe,it,expect} from 'vitest';
import {aggregatePerformance,conditionLabel,performanceRecords,wilson} from './conditionPerformance';
const fixture=(id='a',date='2026-11-01',n=6)=>{
 const horses=Array.from({length:n},(_,i)=>({id:String(i+1),umaban:String(i+1),name:'馬'+(i+1),finish:i<3?String(i+1):'',_rank:i+1,predictedScore:80-i}));
 return {id,track:'園田',distance:'1400',surface:'ダート',raceNo:'1',raceDate:date,status:'completed',scheduledStart:date+'T06:00:00Z',firstCompletedAt:date+'T07:00:00Z',resultOrder:'1-2-3',horses,predictionLock:{lockedAt:date+'T05:00:00Z',modelVersion:'v1',build:'b1',horses:horses.map(h=>({...h,finish:''}))}};
};
describe('condition performance',()=>{
 it('uses frozen ranking rather than edited live scores',()=>{
  const r=fixture();r.predictionLock.horses.forEach((h,i)=>h._rank=6-i);r.horses.forEach((h,i)=>h._rank=i+1);
  const a=aggregatePerformance(performanceRecords([r]).rows);expect(a.total.top5).toBe(0);expect(a.total.wins).toBe(0);
 });
 it('keeps only the earliest prediction per event and version',()=>{
  const a=fixture(),b=fixture('b');b.predictionLock.lockedAt='2026-11-01T05:30:00Z';
  const x=performanceRecords([b,a]);expect(x.rows.map(r=>r.id)).toEqual(['a']);expect(x.excluded.duplicate).toBe(1);
 });
 it('excludes after-start locks, pending records, inconsistent results and conflicting duplicates',()=>{
  const late=fixture('late');late.predictionLock.lockedAt='2026-11-01T06:01:00Z';const pending={...fixture('p'),status:'pending'};const bad={...fixture('bad'),resultOrder:'2-1-3'};
  const x=performanceRecords([late,pending,bad]);expect(x.rows.length).toBe(0);expect(x.excluded.unverified).toBe(1);expect(x.excluded.pending).toBe(1);expect(x.excluded.invalid).toBe(1);
  const a=fixture(),b=fixture('b');b.horses[0].finish='2';b.horses[1].finish='1';b.resultOrder='2-1-3';expect(performanceRecords([a,b]).excluded.conflict).toBe(2);
 });
 it('does not combine builds or distances',()=>{
  const a=fixture(),b=fixture('b');b.predictionLock.build='b2';expect(performanceRecords([a,b]).rows.length).toBe(2);
  const c=fixture('c','2026-11-02');c.distance='1230';expect(aggregatePerformance([a,c]).conditions.length).toBe(2);
 });
 it('does not treat a five-runner race as evidence for top-five coverage',()=>{
  const a=aggregatePerformance([fixture('x','2026-11-01',5)]).total;expect(a.n).toBe(1);expect(a.top5N).toBe(0);expect(a.wins).toBe(1);
 });
 it('keeps empty predictions as failures and missing denominators as no interval',()=>{
  const r=fixture();r.predictionLock.horses.forEach(h=>{h._rank=null;h.predictedScore=null;});const a=aggregatePerformance(performanceRecords([r]).rows);expect(a.total.n).toBe(1);expect(a.total.top5).toBe(0);expect(a.total.wins).toBe(0);expect(wilson(0,0)).toBe(null);
 });
 it('does not call a single perfect race a strong condition',()=>{
  const a=aggregatePerformance([fixture()]);expect(conditionLabel(a.conditions[0],a.total)).toBe('参考・少数');const c=wilson(1,1)!;expect(c[0]<0.3).toBe(true);expect(c[1]<=1.00001).toBe(true);
 });
});
