import {describe,it,expect} from 'vitest';
import {historyIndex,horseInsights} from './horseInsights';
const h=(finish:any,extra:any={})=>({name:'テストホース',finish,...extra});
const r=(date:string,no:number,horse:any,extra:any={})=>({raceDate:date,raceNo:String(no),track:'大井',surface:'ダート',distance:'1200',status:'completed',horses:[horse],...extra});
const evidence=(date:string)=>[{date}];
describe('read-only horse history',()=>{
 it('limits display-only indexing to requested horses without changing their histories',()=>{
  const rows=[r('2026-10-01',1,h('1')),r('2026-10-02',1,h('2')),r('2026-10-03',1,h('1',{name:'別の馬'}))];
  const all=historyIndex(rows),limited=historyIndex(rows,['テスト ホース']);
  expect([...limited.keys()]).toEqual(['テストホース']);expect(limited.get('テストホース')).toEqual(all.get('テストホース'));
  expect(historyIndex(rows,[]).size).toBe(0);
 });
 it('excludes current/future days, cancellations, pending and missing results; separates conditions',()=>{
  const idx=historyIndex([r('2026-10-01',1,h('1')),r('2026-10-02',1,h('2'),{distance:'1600'}),r('2026-10-03',1,h('3'),{track:'金沢'}),r('2026-10-04',1,h('',{raceStatus:'取消'})),r('2026-10-05',1,h('')),r('2026-10-06',1,h('1'),{status:'pending'}),r('2026-11-16',1,h('1')),r('2026-11-17',1,h('1')),r('2026-10-07',1,h('1'),{surface:'芝'})]);
  const out=horseInsights(idx,h(''),{raceDate:'2026-11-16',track:'大井',distance:1200,surface:'ダート'});
  expect(out.all.n).toBe(3);expect(out.venue.n).toBe(2);expect(out.same.n).toBe(1);expect(out.same.rate).toBe(1);expect(out.same.reference).toBe(true);
 });
 it('deduplicates corrected versions and keeps DNF as a non-placement',()=>{
  const idx=historyIndex([r('2026-10-01',1,h('1'),{savedAt:'2026-10-01T10:00:00Z'}),r('2026-10-01',1,h('4'),{updatedAt:'2026-10-02T10:00:00Z'}),r('2026-10-03',1,h('',{raceStatus:'中止'}))]);
  const out=horseInsights(idx,h(''),{raceDate:'2026-11-16',track:'大井',distance:1200});expect(out.same.n).toBe(2);expect(out.same.top3).toBe(0);
 });
 it('classifies layoff sequences only with linked previous dates, not gaps between saved races',()=>{
  const idx=historyIndex([r('2026-08-01',1,h('2',{layoffWeeks:12})),r('2026-08-15',1,h('3',{layoffWeeks:2,pastRunEvidence:evidence('2026-08-01')})),r('2026-09-01',1,h('1',{layoffWeeks:2,pastRunEvidence:evidence('2026-08-15')})),r('2026-10-01',1,h('1'))]);
  const out=horseInsights(idx,h(''),{raceDate:'2026-11-16',track:'大井',distance:1200});expect([out.rest.n,out.second.n,out.third.n,out.unclassified]).toEqual([1,1,1,1]);expect(out.stage).toBe(null);
  expect(horseInsights(idx,h('',{layoffWeeks:2,pastRunEvidence:evidence('2026-08-01')}),{raceDate:'2026-08-15',track:'大井',distance:1200}).stage).toBe(2);
 });
 it('does not invent a layoff from incomplete saved history or use savedAt as a race date',()=>{
  const idx=historyIndex([r('2026-01-01',1,h('1')),r('2026-10-01',1,h('1')),r('',1,h('1'),{savedAt:'2026-09-01'})]);
  const out=horseInsights(idx,h(''),{raceDate:'2026-11-16',track:'大井',distance:1200});expect(out.rest.n).toBe(0);expect(out.all.n).toBe(2);
 });
});
