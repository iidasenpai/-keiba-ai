import {describe,expect,it} from 'vitest';
import {buildMarketSnapshot,marketTiming,marketCandidateStatus,mergeMarketSnapshots,keepExistingMarketOnHorses,marketSourceEntry,snapshotFromHorses,lockMarketSnapshot,marketText} from './marketSnapshot';
import {prepareSources} from './sourceImport';
import {sourceFingerprint,planDraftUpdate} from './predictionUpdates';
import {makeLock} from './raceIntegrity';

const iso=(offsetMs:number)=>new Date(Date.now()+offsetMs).toISOString();
const MIN=60000;
const roster=[['1','アルファ'],['2','ベータ'],['3','ガンマ'],['4','デルタ']].map(([umaban,name])=>({umaban,name}));
const rowsOf=(odds:any[],ninki:any[],status:string[]=[])=>roster.map((h,i)=>({umaban:h.umaban,name:h.name,sex:'牡3',jockey:'騎手'+i,weight:'55.0',odds:odds[i],ninki:ninki[i],bodyChange:'',raceStatus:status[i]||''}));
function bundle(rows:any[],extra:any={},capturedAt=iso(-10*MIN)){
 return {format:'nar-source-bundle',version:1,errors:[],pages:[{kind:'race',url:'https://nar.sp.netkeiba.com/race/shutuba.html?race_id=202648112512',capturedAt,
  meta:{raceDate:'2026-11-25',track:'名古屋',raceNo:'12',distance:'1500',raceName:'テスト',startTime:'16:30',surface:'ダート'},
  text:'テスト本文',roster,rows,...extra}]};
}
const full=()=>rowsOf(['2.1','5.5','8.0','12.3'],['1','2','3','4']);

describe('市場スナップショット',()=>{
 it('正常な全頭取得は complete で、取得時刻の根拠(declared)と発走前の順序を確認できる',()=>{
  const captured=iso(-30*MIN),locked=iso(-10*MIN),start=iso(30*MIN);
  const s=buildMarketSnapshot({rows:full(),capturedAt:captured,siteUpdatedAt:iso(-31*MIN),sourceName:'netkeiba'});
  expect(s.status).toBe('complete');
  expect(s.counts).toEqual({total:4,starters:4,scratched:0,withOdds:4,withPopularity:4,missing:0,invalid:0});
  expect(s.capturedAtBasis).toBe('declared');expect(s.siteUpdatedAtBasis).toBe('declared');
  expect(marketTiming(s,locked,start)).toBe('pre-start-verified');
  const locked_=lockMarketSnapshot(s,locked,start);
  expect(locked_.lockedAt).toBe(locked);expect(locked_.capturedAt).toBe(new Date(captured).toISOString());
  expect(locked_.capturedAt).not.toBe(locked_.lockedAt);
  expect(locked_.candidate.usable).toBe(true);
 });
 it('一部欠損は partial。欠損理由を残し、市場候補は生成不可',()=>{
  const s=buildMarketSnapshot({rows:rowsOf(['2.1','','8.0','abc'],['1','','3','4']),capturedAt:iso(-30*MIN),missingReason:'取得元に未掲載'});
  expect(s.status).toBe('partial');
  expect(s.rows.map(r=>r.captureStatus)).toEqual(['ok','missing','ok','invalid']);
  expect(s.rows[1].missingReason).toBe('取得元に未掲載');
  const timing=marketTiming(s,iso(-10*MIN),iso(30*MIN));
  const c=marketCandidateStatus(s,timing);
  expect(c.usable).toBe(false);expect(c.reason).toContain('生成不可');
 });
 it('取消馬は出走頭数から除き、残り全頭がそろえば complete',()=>{
  const s=buildMarketSnapshot({rows:rowsOf(['2.1','5.5','','12.3'],['1','2','','3'],['','','取消','']),capturedAt:iso(-30*MIN)});
  expect(s.counts.scratched).toBe(1);expect(s.counts.starters).toBe(3);
  expect(s.rows[2].captureStatus).toBe('scratched');
  expect(s.status).toBe('complete');
 });
 it('発走後に取得したオッズは発走前の根拠にならない。固定後の取得も同様',()=>{
  const start=iso(30*MIN);
  const after=buildMarketSnapshot({rows:full(),capturedAt:iso(31*MIN)});
  expect(marketTiming(after,iso(-10*MIN),start)).toBe('captured-after-start');
  expect(marketCandidateStatus(after,'captured-after-start').usable).toBe(false);
  const afterLock=buildMarketSnapshot({rows:full(),capturedAt:iso(-5*MIN)});
  expect(marketTiming(afterLock,iso(-10*MIN),start)).toBe('captured-after-lock');
  expect(marketTiming(buildMarketSnapshot({rows:full(),capturedAt:iso(-30*MIN)}),iso(-10*MIN),'')).toBe('start-time-unknown');
 });
 it('取得時刻の根拠がなければ不明のまま。lockedAt で代用しない',()=>{
  const s=buildMarketSnapshot({rows:full()});
  expect(s.capturedAt).toBeNull();expect(s.capturedAtBasis).toBe('unknown');
  expect(marketTiming(s,iso(-10*MIN),iso(30*MIN))).toBe('capture-time-unknown');
  expect(lockMarketSnapshot(s,iso(-10*MIN),iso(30*MIN)).candidate.usable).toBe(false);
  // オッズが1頭もなければ、ページ取得時刻があってもオッズ取得時刻にしない
  const none=buildMarketSnapshot({rows:rowsOf(['','','',''],['','','','']),pageCapturedAt:iso(-30*MIN)});
  expect(none.status).toBe('missing');expect(none.capturedAt).toBeNull();
 });
});

describe('入力形式の互換性(sourceImport)',()=>{
 it('旧形式(文字列のオッズ・人気、marketブロックなし)を読み込める。取得時刻はページ取得時刻を根拠にする',()=>{
  const d=prepareSources([bundle(full())]);
  expect(d.sources.race.rows[0].odds).toBe('2.1');
  expect(d.market.status).toBe('complete');
  expect(d.market.capturedAtBasis).toBe('page');
 });
 it('旧形式の空欄(10月19日以降の入力)は読み込めて、missing と記録される',()=>{
  const d=prepareSources([bundle(rowsOf(['','','',''],['','','','']))]);
  expect(d.market.status).toBe('missing');expect(d.market.counts.withOdds).toBe(0);
 });
 it('新形式(数値・null・market ブロック・欠損理由)を読み込める',()=>{
  const rows=rowsOf([2.1,5.5,null,undefined],[1,2,null,undefined]);
  rows[2]={...rows[2],oddsMissingReason:'取得元に未掲載'} as any;
  const captured=iso(-20*MIN);
  const d=prepareSources([bundle(rows,{market:{capturedAt:captured,siteUpdatedAt:null,source:'netkeiba',missingReason:null}})]);
  expect(d.sources.race.rows[0].odds).toBe('2.1');
  expect(d.sources.race.rows[2].odds).toBe('');
  expect(d.market.capturedAtBasis).toBe('declared');
  expect(d.market.siteUpdatedAtBasis).toBe('unknown');
  expect(d.market.rows[2].missingReason).toBe('取得元に未掲載');
  expect(d.market.status).toBe('partial');
 });
 it('不正な市場ブロックは拒否する',()=>{
  expect(()=>prepareSources([bundle(full(),{market:{capturedAt:'昨日'}})])).toThrow();
  expect(()=>prepareSources([bundle(full(),{market:{capturedAt:iso(60*MIN)}})])).toThrow();
  expect(()=>prepareSources([bundle(rowsOf([{},'1','1','1'] as any,['1','2','3','4']))])).toThrow();
 });
 it('指紋: 旧形式は市場ブロックなしで従来どおり、ブロックを足すと変わる',()=>{
  const a=prepareSources([bundle(full())]),b=prepareSources([bundle(full())]);
  expect(sourceFingerprint(a)).toBe(sourceFingerprint(b));
  const withMarket=prepareSources([bundle(full(),{market:{capturedAt:iso(-20*MIN)}})]);
  expect(sourceFingerprint(withMarket)).not.toBe(sourceFingerprint(a));
 });
});

describe('再取得で既存の市場情報を上書きしない',()=>{
 const complete=(at:number)=>buildMarketSnapshot({rows:full(),capturedAt:iso(at*MIN)});
 const empty=()=>buildMarketSnapshot({rows:rowsOf(['','','',''],['','','','']),pageCapturedAt:iso(-1*MIN),missingReason:'取得失敗'});
 it('空データでは既存を保持し、試行を記録する',()=>{
  const old=complete(-30),r=mergeMarketSnapshots(old,empty(),'2026-11-25T01:00:00.000Z');
  expect(r.adopted).toBe('existing');expect(r.snapshot!.status).toBe('complete');
  expect(r.snapshot!.capturedAt).toBe(old.capturedAt);
  expect(r.snapshot!.attempts![0].outcome).toBe('kept-existing');
 });
 it('既存が欠損なら新しい取得を採用する(再試行で埋められる)',()=>{
  const r=mergeMarketSnapshots(empty(),complete(-5));
  expect(r.adopted).toBe('incoming');expect(r.snapshot!.status).toBe('complete');
 });
 it('部分取得は完全な既存を置き換えない。逆に完全な新しい取得は部分取得を置き換える',()=>{
  const partial=buildMarketSnapshot({rows:rowsOf(['2.1','','',''],['1','','','']),capturedAt:iso(-5*MIN)});
  expect(mergeMarketSnapshots(complete(-30),partial).adopted).toBe('existing');
  expect(mergeMarketSnapshots(partial,complete(-5)).adopted).toBe('incoming');
 });
 it('より古い取得時刻のデータには戻さない',()=>{
  expect(mergeMarketSnapshots(complete(-5),complete(-30)).adopted).toBe('existing');
 });
 it('馬データでは馬番・馬名が一致する馬のオッズ・人気だけ既存を保持する',()=>{
  const existing=[{umaban:'1',name:'アルファ',odds:'2.1',ninki:'1'},{umaban:'2',name:'ベータ',odds:'5.5',ninki:'2'}];
  const incoming=[{umaban:'1',name:'アルファ',odds:'',ninki:'',jockey:'新'},{umaban:'2',name:'別の馬',odds:'',ninki:''}];
  const out=keepExistingMarketOnHorses(incoming,existing);
  expect(out[0]).toMatchObject({odds:'2.1',ninki:'1',jockey:'新'});
  expect(out[1].odds).toBe('');
 });
});

describe('固定(makeLock)との連携',()=>{
 const horses=(inputSources:any[]|undefined,odds=['2.1','5.5','8.0','12.3'])=>roster.map((h,i)=>({id:'h'+h.umaban,umaban:h.umaban,name:h.name,odds:odds[i],ninki:String(i+1),raceStatus:'',finish:'',actualFinish:null,_finalScore:50-i,_rank:i+1,predictedScore:50-i,...(inputSources?{inputSources}:{})}));
 const lock=(hs:any[],now:string,start:string)=>makeLock(hs,hs,{scheduledStart:start,sourceName:'netkeiba',track:'名古屋',distance:'1500',raceNo:'12'},now);
 it('lockedAt と取得時刻は別々に保存され、発走前の順序が確認される',()=>{
  const captured=iso(-30*MIN),now=iso(-10*MIN),start=iso(30*MIN);
  const entry=marketSourceEntry(buildMarketSnapshot({rows:full(),capturedAt:captured,siteUpdatedAt:null,sourceName:'netkeiba'}));
  const l=lock(horses([{kind:'race',url:'https://nar.sp.netkeiba.com/race/shutuba.html?race_id=202648112512',capturedAt:iso(-31*MIN)},entry]),now,start);
  expect(l.lockedAt).toBe(now);
  expect(l.marketSnapshot.capturedAt).toBe(new Date(captured).toISOString());
  expect(l.marketSnapshot.timing).toBe('pre-start-verified');
  expect(l.marketSnapshot.candidate.usable).toBe(true);
  expect(l.marketSnapshot.rows).toHaveLength(4);
 });
 it('時刻の根拠がない過去形式の馬データは「取得時刻不明」になる',()=>{
  const l=lock(horses(undefined),iso(-10*MIN),iso(30*MIN));
  expect(l.marketSnapshot.capturedAt).toBeNull();
  expect(l.marketSnapshot.timing).toBe('capture-time-unknown');
  expect(l.marketSnapshot.candidate.usable).toBe(false);
 });
 it('欠損のある固定は生成不可と理由を記録するが、固定自体は成功する',()=>{
  const l=lock(horses(undefined,['2.1','','8.0','12.3']),iso(-10*MIN),iso(30*MIN));
  expect(l.marketSnapshot.status).toBe('partial');
  expect(l.marketSnapshot.candidate.reason).toContain('生成不可');
 });
 it('発走後取得のオッズは固定に残るが市場候補は生成不可',()=>{
  const entry=marketSourceEntry(buildMarketSnapshot({rows:full(),capturedAt:iso(31*MIN)}));
  const l=lock(horses([entry]),iso(-10*MIN),iso(30*MIN));
  expect(l.marketSnapshot.timing).toBe('captured-after-start');
  expect(l.marketSnapshot.candidate.usable).toBe(false);
 });
 it('取り込み元が空の既存データから snapshotFromHorses で再構成できる',()=>{
  const s=snapshotFromHorses(horses([{kind:'race',url:'https://nar.sp.netkeiba.com/race/shutuba.html?race_id=1',capturedAt:iso(-31*MIN)}]));
  expect(s.capturedAtBasis).toBe('unknown');
  expect(marketText(null)).toBe('');expect(marketText(3.5)).toBe('3.5');
 });
});

// applySourceDraft(NARPredictionTool.tsx)と同じ手順を、画面なしで再現する。
function applyDraft(draft:any,current:any[],same=true){
 let next=draft.sources.race.rows.map((r:any)=>({umaban:r.umaban,name:r.name,odds:String(r.odds??''),ninki:String(r.ninki??''),raceStatus:r.raceStatus||''}));
 const existing=same&&current.length?snapshotFromHorses(current):null;
 const merge=mergeMarketSnapshots(existing,draft.market||null,'2026-11-25T01:00:00.000Z');
 if(merge.adopted==='existing'&&existing)next=keepExistingMarketOnHorses(next,current);
 const entry=marketSourceEntry(merge.snapshot);
 return next.map((h:any)=>({...h,inputSources:[...Object.values(draft.sources).map((p:any)=>({kind:p.kind,url:p.url,capturedAt:p.capturedAt})),...(entry?[entry]:[])]}));
}
describe('取り込み(applySourceDraft相当)での保持と再試行',()=>{
 it('1回目に取得できたオッズは、2回目の空取得で消えない。3回目に新しい取得があれば更新できる',()=>{
  const d1=prepareSources([bundle(full(),{market:{capturedAt:iso(-40*MIN)}},iso(-40*MIN))]);
  const h1=applyDraft(d1,[]);
  expect(h1[0].odds).toBe('2.1');
  const d2=prepareSources([bundle(rowsOf(['','','',''],['','','','']),{market:{capturedAt:iso(-20*MIN),missingReason:'取得失敗'}},iso(-20*MIN))]);
  const h2=applyDraft(d2,h1);
  expect(h2.map((h:any)=>h.odds)).toEqual(['2.1','5.5','8.0','12.3']);
  expect(snapshotFromHorses(h2).capturedAt).toBe(new Date(d1.market.capturedAt!).toISOString());
  expect(snapshotFromHorses(h2).attempts!.map((a:any)=>a.outcome)).toEqual(['adopted','kept-existing']);
  const d3=prepareSources([bundle(rowsOf(['2.0','5.0','9.0','11.0'],['1','2','3','4']),{market:{capturedAt:iso(-5*MIN)}},iso(-5*MIN))]);
  const h3=applyDraft(d3,h2);
  expect(h3[0].odds).toBe('2.0');
  expect(snapshotFromHorses(h3).capturedAt).toBe(new Date(d3.market.capturedAt!).toISOString());
 });
 it('最初から空の取り込みは missing と理由が残り、後の取得で埋められる',()=>{
  const d0=prepareSources([bundle(rowsOf(['','','',''],['','','','']),{market:{capturedAt:null,missingReason:'入力ファイルにオッズなし'}})]);
  const h0=applyDraft(d0,[]);
  const s0=snapshotFromHorses(h0);
  expect(s0.status).toBe('missing');expect(s0.missingReason).toBe('入力ファイルにオッズなし');
  const d1=prepareSources([bundle(full(),{market:{capturedAt:iso(-5*MIN)}})]);
  expect(applyDraft(d1,h0)[2].odds).toBe('8.0');
 });
 it('別のレースの下書きには既存のオッズを持ち込まない',()=>{
  const d1=prepareSources([bundle(full(),{market:{capturedAt:iso(-40*MIN)}})]);
  const h1=applyDraft(d1,[]);
  const d2=prepareSources([bundle(rowsOf(['','','',''],['','','','']))]);
  expect(applyDraft(d2,h1,false).map((h:any)=>h.odds)).toEqual(['','','','']);
 });
});

describe('既存の更新判定(planDraftUpdate)が market エントリで止まらない',()=>{
 it('固定時の馬データに market の記録があっても、新しい入力での再予想を許可する',()=>{
  const d=prepareSources([bundle(full(),{market:{capturedAt:iso(-5*MIN)}},iso(-5*MIN))]);
  const startIso=new Date('2026-11-25T16:30:00+09:00').toISOString();
  const old=Date.now()-60*MIN;
  const entry=marketSourceEntry(buildMarketSnapshot({rows:full(),capturedAt:new Date(old).toISOString()}));
  const lockHorses=roster.map(h=>({id:'h'+h.umaban,umaban:h.umaban,name:h.name,odds:'1',ninki:'1',inputSources:[{kind:'race',url:'x',capturedAt:new Date(old).toISOString()},entry]}));
  const record={id:'r1',raceDate:'2026-11-25',track:'名古屋',raceNo:'12',distance:'1500',surface:'ダート',scheduledStart:startIso,sourceRaceId:d.sourceRaceId,sourceName:'netkeiba',status:'pending',
   horses:lockHorses.map(h=>({...h,finish:'',actualFinish:null})),predictionLock:{horses:lockHorses,sourceFingerprint:'old-fingerprint'}};
  const plan=planDraftUpdate([record],d,Date.parse(startIso)-3600000);
  expect(plan.reason).toContain('再予想できます');
  expect(plan.canUpdate).toBe(true);
 });
});

 describe('市場情報と取得証拠の対応',()=>{
 it('明示的な取得時刻不明はページ時刻で補わない',()=>{
 const d=prepareSources([bundle(full(),{market:{capturedAt:null}})]);
 expect(d.market.capturedAt).toBeNull();
 });
 it('時刻不明の完全取得で既知時刻を失わない',()=>{
 const old=buildMarketSnapshot({rows:full(),capturedAt:iso(-30*MIN)});
 expect(mergeMarketSnapshots(old,buildMarketSnapshot({rows:full()})).adopted).toBe('existing');
 });
 it('取り込み後に手入力した値へ元の取得時刻を流用しない',()=>{
 const d=prepareSources([bundle(full())]);const hs=applyDraft(d,[]);
 expect(snapshotFromHorses(hs).capturedAt).not.toBeNull();
 hs[0].odds='99';expect(snapshotFromHorses(hs).capturedAt).toBeNull();
 });
 it('別の出走馬構成に以前のスナップショットを流用しない',()=>{
 const old=buildMarketSnapshot({rows:full(),capturedAt:iso(-30*MIN)});
 const rows=full();rows[0].name='別馬';
 expect(mergeMarketSnapshots(old,buildMarketSnapshot({rows})).adopted).toBe('incoming');
 });
 it('0倍台は有効な単勝倍率として使わない',()=>{
 expect(buildMarketSnapshot({rows:rowsOf(['0.5','2','3','4'],['1','2','3','4'])}).status).toBe('partial');
 });
 });
