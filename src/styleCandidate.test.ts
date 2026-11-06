import {describe,expect,it} from 'vitest';
import {STYLE_FIXED_BONUS,STYLE_FIXED_VERSION,styleFixedBonus,styleFixedInputs} from './styleCandidate';
import {pairedReport,raceHits,verdictOf,mcnemarExact,MIN_RACES_FOR_VERDICT} from './candidateEvaluation';

describe('脚質候補 style-fixed-v1',()=>{
  it('加点幅は検証前に固定した値で、不明・自在は0',()=>{
    expect(STYLE_FIXED_BONUS).toEqual({'逃':3,'先':2,'差':0,'追':-3});
    for(const s of ['自在','',undefined,null,'マクリ'])expect(styleFixedBonus(s)).toBe(0);
  });
  it('点のない馬に点を作らず、入力を変更せず、根拠を残す',()=>{
    const input=[{id:'a',_finalScore:30,runningStyle:'追'},{id:'b',_finalScore:null,runningStyle:'逃'},{id:'c',_finalScore:20,runningStyle:''}];
    const copy=JSON.parse(JSON.stringify(input));
    const out=styleFixedInputs(input);
    expect(input).toEqual(copy);
    expect(out[0]._finalScore).toBe(27);expect(out[0].styleFixedEvidence).toEqual({version:STYLE_FIXED_VERSION,style:'追',bonus:-3,baseScore:30});
    expect(out[1]._finalScore).toBeNull();expect(out[1].styleFixedEvidence).toBeUndefined();
    expect(out[2]._finalScore).toBe(20);expect(out[2].styleFixedEvidence?.bonus).toBe(0);
  });
});

describe('候補と現行のレース単位比較',()=>{
  const horses=[1,2,3,4,5,6,7].map(n=>({id:String(n),name:'馬'+n,umaban:String(n),finish:String(n<=3?n:'')}));
  const rows=(order:number[])=>order.map((n,i)=>({id:String(n),umaban:String(n),rank:i+1,score:100-i}));
  const rec=(cur:number[],cand:number[],id:string)=>({id,status:'completed',track:'園田',distance:'1400',raceNo:'1',resultOrder:'1-2-3',horses,scheduledStart:'2026-11-05T10:00:00.000Z',firstCompletedAt:'2026-11-05T11:00:00.000Z',predictionLock:{lockedAt:'2026-11-05T09:00:00.000Z',build:'b',horses,models:{current:rows(cur),StyleFixed:{version:STYLE_FIXED_VERSION,predictions:rows(cand)}}}});
  it('上位5頭で1〜3着全捕捉・◎勝を数える',()=>{
    expect(raceHits(rec([1,2,3,4,5,6,7],[1,2,3,4,5,6,7],'x'),'current')).toEqual({top5:1,top6:1,win:1,place:1,empty:false});
    expect(raceHits(rec([7,6,5,4,1,2,3],[1,2,3,4,5,6,7],'x'),'current')).toEqual({top5:0,top6:0,win:0,place:0,empty:false});
  });
  it('版が違う候補は混ぜず、差とCIを返す',()=>{
    const records=[rec([4,5,6,7,1,2,3],[1,2,3,4,5,6,7],'1'),rec([1,2,3,4,5,6,7],[1,2,3,4,5,6,7],'2'),{...rec([1,2,3,4,5,6,7],[1,2,3,4,5,6,7],'3'),predictionLock:{...rec([1],[1],'3').predictionLock,models:{current:rows([1,2,3,4,5,6,7]),StyleFixed:{version:'style-fixed-v2',predictions:rows([1,2,3,4,5,6,7])}}}}];
    const r=pairedReport(records,'StyleFixed',STYLE_FIXED_VERSION);
    expect(r.n).toBe(2);expect(r.current).toBe(50);expect(r.candidate).toBe(100);expect(r.diff).toBe(50);
    expect(r.lo).toBeLessThanOrEqual(r.diff);expect(r.hi).toBeGreaterThanOrEqual(r.diff);
  });
  it('距離区分で絞り込む(800mを選んで1400mが混ざらない)',()=>{
    const a={...rec([4,5,6,7,1,2,3],[1,2,3,4,5,6,7],'a'),distance:'800'},b={...rec([4,5,6,7,1,2,3],[1,2,3,4,5,6,7],'b'),distance:'1400'};
    expect(pairedReport([a,b],'StyleFixed',STYLE_FIXED_VERSION,{distance:'800'}).n).toBe(1);
    expect(pairedReport([a,b],'StyleFixed',STYLE_FIXED_VERSION,{distance:'1400-1500'}).n).toBe(1);
    expect(pairedReport([a,b],'StyleFixed',STYLE_FIXED_VERSION).n).toBe(2);
  });
  it('候補が空予想のレースは分母に残して的中0、現行が空なら比較外で件数表示',()=>{
    const good=rec([1,2,3,4,5,6,7],[1,2,3,4,5,6,7],'g');
    const candEmpty=rec([1,2,3,4,5,6,7],[],'c'),curEmpty=rec([],[1,2,3,4,5,6,7],'u');
    const r=pairedReport([good,candEmpty,curEmpty],'StyleFixed',STYLE_FIXED_VERSION);
    expect(r.n).toBe(2);expect(r.candidateEmpty).toBe(1);expect(r.currentEmpty).toBe(1);
    expect(r.current).toBe(100);expect(r.candidate).toBe(50);
  });
  it('少数では改善・悪化を判定しない',()=>{
    const r=pairedReport([rec([4,5,6,7,1,2,3],[1,2,3,4,5,6,7],'1')],'StyleFixed',STYLE_FIXED_VERSION);
    expect(r.n).toBe(1);expect(r.diff).toBe(100);expect(r.verdict).toBe('insufficient');
    expect(verdictOf(MIN_RACES_FOR_VERDICT-1,0.5,3,9,0,0.004)).toBe('insufficient');
  });
  it('正確McNemar検定の値',()=>{
    expect(mcnemarExact(4,0)).toBeCloseTo(0.125,10);expect(mcnemarExact(8,0)).toBeCloseTo(0.0078125,10);
    expect(mcnemarExact(5,5)).toBe(1);expect(mcnemarExact(0,0)).toBe(1);expect(mcnemarExact(10,2)).toBeCloseTo(0.03857421875,10);
  });
  it('30R中 候補のみ成功4・現行のみ0・残り同結果でも「改善」とせず傾向・未確定',()=>{
    const A=[1,2,3,4,5,6,7],X=[4,5,6,7,1,2,3];
    const recs=[...Array.from({length:4},(_,i)=>rec(X,A,'w'+i)),...Array.from({length:26},(_,i)=>rec(A,A,'s'+i))];
    const r=pairedReport(recs,'StyleFixed',STYLE_FIXED_VERSION);
    expect(r.n).toBe(30);expect(r.candOnly).toBe(4);expect(r.currOnly).toBe(0);expect(r.pValue).toBeCloseTo(0.125,10);
    expect(r.lo).toBeGreaterThan(0);expect(r.verdict).toBe('trendBetter');
  });
  it('p<0.05かつCIが0を含まなければ改善・悪化、向きが逆なら悪化',()=>{
    const A=[1,2,3,4,5,6,7],X=[4,5,6,7,1,2,3];
    const mk=(w:number,l:number)=>[...Array.from({length:w},(_,i)=>rec(X,A,'w'+i)),...Array.from({length:l},(_,i)=>rec(A,X,'l'+i)),...Array.from({length:30-w-l},(_,i)=>rec(A,A,'s'+i))];
    expect(pairedReport(mk(8,0),'StyleFixed',STYLE_FIXED_VERSION).verdict).toBe('better');
    expect(pairedReport(mk(0,8),'StyleFixed',STYLE_FIXED_VERSION).verdict).toBe('worse');
    expect(pairedReport(mk(5,5),'StyleFixed',STYLE_FIXED_VERSION).verdict).toBe('unclear');
  });
});
