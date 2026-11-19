import {describe,it,expect} from 'vitest';
import {oiModel} from './oiModel';
import {oiPeakCandidate,OI_PEAK_VERSION} from './oiPeakCandidate';
import {makeLock,applyResult} from './raceIntegrity';
import {pairedReport} from './candidateEvaluation';
const meta={track:'大井',distance:'1200',surface:'ダート',raceDate:'2026-11-20',raceNo:'1',scheduledStart:'2026-11-20T06:00:00Z'};
const now='2026-11-20T05:00:00Z';
const run=(index:number,extra:any={})=>({index,source:'NAR',surface:'ダート',date:'2026-11-01',...extra});
const input=()=>Array.from({length:7},(_,i)=>({id:String(i+1),umaban:String(i+1),name:'馬'+(i+1),finish:'',_recentIndex:100-i*5,recentRuns:[run(100-i*5),run(100-i*5)]}));
const order=(hs:any[])=>hs.filter(h=>h._rank).slice().sort((a,b)=>a._rank-b._rank).map(h=>h.umaban);
describe('大井の相手候補 oi-peak3-tail-v1',()=>{
 it('大井1200/1600mだけ対象。1400mや他場では候補を作らない',()=>{
  const current=oiModel(input(),meta);
  expect(oiPeakCandidate(current,{...meta,track:'船橋'})).toBeNull();expect(oiPeakCandidate(current,{...meta,distance:1400})).toBeNull();
  expect(oiPeakCandidate(current,{...meta,distance:1600})).not.toBeNull();
 });
 it('◎○と本予想を固定し、相手だけを差分の25%で変更する',()=>{
  const hs=input();hs[5].recentRuns=[run(130),run(120)];const current=oiModel(hs,meta),before=JSON.stringify(current),out=oiPeakCandidate(current,meta)!;
  expect(order(out).slice(0,2)).toEqual(order(current).slice(0,2));expect(order(out).slice(2)).not.toEqual(order(current).slice(2));
  const h=out.find(h=>h.umaban==='6');expect(h.oiPeakEvidence.adjustment).toBe((130-75)*.25);expect(h._finalScore).toBe(75+(130-75)*.25);
  expect(JSON.stringify(current)).toBe(before);
 });
 it('保存近5走の条件を満たす最大3走を使用し、古い6走目を使わない',()=>{
  const hs=input();hs[4].recentRuns=[run(200,{surface:'芝'}),run(81),run(82),run(83),run(190),run(999)];
  const h=oiPeakCandidate(oiModel(hs,meta),meta)!.find(h=>h.umaban==='5');expect(h.oiPeakEvidence.peak).toBe(83);expect(h.oiPeakEvidence.eligibleCount).toBe(3);
 });
 it('中央・日付不明・発走後の実績を除外し、2走未満と発走時刻不明は補正0',()=>{
  const hs=input();hs[4].recentRuns=[run(200,{source:'JRA'}),run(200,{date:''}),run(200,{date:'2026-11-21'}),run(81)];
  const current=oiModel(hs,meta),h=oiPeakCandidate(current,meta)!.find(h=>h.umaban==='5');expect(h.oiPeakEvidence.adjustment).toBe(0);
  expect(oiPeakCandidate(current,{...meta,scheduledStart:''})!.every(h=>h.oiPeakEvidence.adjustment===0)).toBe(true);
 });
 it('未知・取消馬に点や順位を作らず、同点は馬番順',()=>{
  const hs=input();hs[5]._recentIndex=null;hs[6]={...hs[6],raceStatus:'取消'} as any;hs[3]._recentIndex=hs[2]._recentIndex;
  const out=oiPeakCandidate(oiModel(hs,meta),meta)!;for(const h of out.slice(5)){expect(h._rank).toBeNull();expect(h._finalScore).toBeNull();}
  expect(order(out).slice(2,4)).toEqual(['3','4']);
 });
 it('人気・オッズ・馬体重では候補を変更しない',()=>{
  const current=oiModel(input(),meta),a=oiPeakCandidate(current,meta)!,b=oiPeakCandidate(current.map(h=>({...h,ninki:'1',odds:'1.0',bodyWeight:'999'})),meta)!;
  expect(order(a)).toEqual(order(b));expect(a.map(h=>h._finalScore)).toEqual(b.map(h=>h._finalScore));
 });
 it('同時固定で候補版・根拠を保存し、既存モデルは不変。結果後にも再計算しない',()=>{
  const current=oiModel(input(),meta),candidate=oiPeakCandidate(current,meta),old=makeLock(current,current,meta,now),lock=makeLock(current,current,meta,now,{OiPeak3:candidate});
  const {OiPeak3,...others}=lock.models;expect(others).toEqual(old.models);expect(OiPeak3.version).toBe(OI_PEAK_VERSION);expect(OiPeak3.diagnostics).toHaveLength(7);
  const record={...meta,id:'r',status:'saved',horses:current,predictionLock:lock};
  const complete=applyResult(record,record,['1','2','3'],'2026-11-20T07:00:00Z');expect(complete.predictionLock).toEqual(lock);
  expect(pairedReport([complete],'OiPeak3',OI_PEAK_VERSION).n).toBe(1);
 });
 it('空候補は的中0で分母に残し、別版と1400mには保存しない',()=>{
  const current=oiModel(input(),meta),lock=makeLock(current,current,meta,now,{OiPeak3:[]});
  const record={...meta,id:'r',status:'saved',horses:current,predictionLock:lock};const complete=applyResult(record,record,['1','2','3'],'2026-11-20T07:00:00Z');
  const report=pairedReport([complete],'OiPeak3',OI_PEAK_VERSION);expect(report.n).toBe(1);expect(report.candidateEmpty).toBe(1);expect(report.candidate).toBe(0);
  expect(pairedReport([complete],'OiPeak3','other-version').n).toBe(0);
  expect(makeLock(current,current,{...meta,distance:'1400'},now,{OiPeak3:current}).models.OiPeak3).toBeUndefined();
 });
});
