import {describe,it,expect} from 'vitest';
import {probabilityCandidates,probabilityReport} from './probabilityCandidates';
import {makeLock} from './raceIntegrity';
import {buildMarketSnapshot,marketSourceEntry} from './marketSnapshot';
const now='2026-11-26T01:00:00.000Z',start='2026-11-26T02:00:00.000Z';
const rows=[1,2,3].map((n)=>({id:String(n),umaban:String(n),name:'馬'+n,odds:String(n*2),ninki:String(n),raceStatus:'',finish:'',actualFinish:null,_finalScore:50-n,_rank:n,predictedScore:50-n}));
function horses(){const entry=marketSourceEntry(buildMarketSnapshot({rows,capturedAt:'2026-11-26T00:59:00.000Z'}));return rows.map(h=>({...h,inputSources:[entry]}));}
const meta={track:'浦和',distance:'1400',raceNo:'1',raceDate:'2026-11-26',scheduledStart:start};
describe('確率候補の固定',()=>{
 it('3分布の合計は1で、保存後に入力を変えても確率は固定',()=>{
 const hs=horses(),lock=makeLock(hs,hs,meta,now);const frozen=JSON.stringify(lock.probabilities);
 for(const candidate of Object.values(lock.probabilities.models) as any[])expect(candidate.predictions.reduce((a,h)=>a+h.probability,0)).toBeCloseTo(1,12);
 hs[0]._finalScore=99;expect(JSON.stringify(lock.probabilities)).toBe(frozen);
 });
 it('取得時刻不明ならモデル単独だけを生成する',()=>{
 const p=probabilityCandidates(rows,meta,now);expect(p.models.Model.status).toBe('ready');expect(p.models.Market.status).toBe('unavailable');expect(p.models.Combined.status).toBe('unavailable');
 });
 it('点数不足なら市場だけ生成し、共通比較から除く',()=>{
 const hs=horses();hs[0]._finalScore=null as any;const p=probabilityCandidates(hs,meta,now);expect(p.models.Model.status).toBe('unavailable');expect(p.models.Market.status).toBe('ready');expect(p.models.Combined.status).toBe('unavailable');
 });
 it('取消は生成分布から除く',()=>{
 const hs=horses();hs[2].raceStatus='取消';const entry=marketSourceEntry(buildMarketSnapshot({rows:hs,capturedAt:'2026-11-26T00:59:00.000Z'}));hs.forEach(h=>h.inputSources=[entry]);
 expect(probabilityCandidates(hs,meta,now).models.Market.predictions).toHaveLength(2);
 });
 it('結果がなければ成績に入れない',()=>{expect(probabilityReport([{status:'pending'}]).n).toBe(0);});
});

describe('確率の対応比較',()=>{
 function record(day:string){const hs=horses(),lock=makeLock(hs,hs,meta,now);return {status:'completed',raceDate:day,scheduledStart:start,completedAt:'2026-11-26T03:00:00.000Z',horses:hs.map((h,i)=>({...h,finish:String(i+1)})),predictionLock:lock};}
 it('保存確率から損失と開催日単位の区間を集計する',()=>{
 const a=record('2026-11-26'),b=record('2026-11-27');const report=probabilityReport([a,b]);
 expect(report.n).toBe(2);expect(report.days).toBe(2);expect(report.ci).not.toBeNull();
 const p=a.predictionLock.probabilities.models.Market.predictions[0].probability;
 expect(report.totals.Market.loss/2).toBeCloseTo(-Math.log(p),12);
 expect(probabilityReport([a,b],{date:'2026-11-26'}).n).toBe(1);
 });
 it('固定後の取消を再正規化して評価しない',()=>{
 const r=record('2026-11-26');r.horses[2].raceStatus='取消';
 const report=probabilityReport([r]);expect(report.n).toBe(0);expect(report.excluded).toBe(1);
 });
 it('確率が不正なレースを除外する',()=>{
 const r=record('2026-11-26');r.predictionLock.probabilities.models.Model.predictions[0].probability=0;
 expect(probabilityReport([r]).excluded).toBe(1);
 });
});
