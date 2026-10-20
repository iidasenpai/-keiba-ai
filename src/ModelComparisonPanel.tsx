import {useMemo,useState} from 'react';
import {verifiedBeforeStart,nonStarter,finite} from './modelSafety';
import {resultIssues} from './raceIntegrity';
export {fixedComparison,distanceGroup} from './modelComparison';
import {fixedComparison} from './modelComparison';
const label={current:'現モデル（保存時）',A:'近走重視A',Recent:'近走指数のみ',Place:'3着内向け候補',Balanced:'近走70候補',Simple85:'近走85・補助点上限候補',Simple85Core:'近走85・基礎点のみ'};
export default function ModelComparisonPanel({records}:{records:any[]}){
 const dates=useMemo(()=>[...new Set(records.filter(r=>r.status==='completed').map(r=>r.raceDate).filter(Boolean))].sort().reverse(),[records]);
 const builds=useMemo(()=>[...new Set(records.filter(r=>r.status==='completed'&&verifiedBeforeStart(r)).sort((a,b)=>String(b.predictionLock.lockedAt).localeCompare(String(a.predictionLock.lockedAt))).map(r=>r.predictionLock?.build).filter(Boolean))] as string[],[records]);
 const [chosen,setChosen]=useState('latest'),[buildChosen,setBuild]=useState('latest'),[track,setTrack]=useState(''),[distance,setDistance]=useState('');
 const date=chosen==='latest'?dates[0]||'':chosen,build=buildChosen==='latest'?builds[0]:buildChosen;
 const options={track,distance,build};
 const data=fixedComparison(records,date,undefined,options),balanced=fixedComparison(records.filter(r=>r.predictionLock?.models?.Balanced?.version==='balanced-v12.6'),date,['current','Balanced'],options);
 const candidate=fixedComparison(records.filter(r=>r.predictionLock?.models?.Simple85?.version==='simple85-v12.7'),date,['current','Simple85','Simple85Core'],options);
 const pct=(n,d)=>d?`${n}/${d} (${(100*n/d).toFixed(1)}%)`:'未集計';
 return <section className="mx-3 mt-3 rounded-xl border border-indigo-200 bg-white p-3 text-xs"><details><summary className="font-black text-indigo-950">保存した事前予想でモデルを比較</summary>
  <div className="mt-2 flex flex-wrap gap-2"><label>対象日 <select aria-label="モデル比較の対象日" value={chosen} onChange={e=>setChosen(e.target.value)}><option value="latest">直近の結果日</option><option value="">全期間</option>{dates.map(d=><option key={d}>{d}</option>)}</select></label>
  <label>計算版 <select aria-label="比較する計算版" value={buildChosen} onChange={e=>setBuild(e.target.value)}><option value="latest">直近の保存版</option>{builds.map(b=><option key={b} value={b}>{b.startsWith('v12.7')?'v12.7':'旧版'} {b.slice(-8)}</option>)}</select></label>
  <label>会場 <select aria-label="比較する会場" value={track} onChange={e=>setTrack(e.target.value)}><option value="">全場</option>{[...new Set(records.map(r=>r.track).filter(Boolean))].sort().map(t=><option key={t}>{t}</option>)}</select></label>
  <label>距離 <select aria-label="比較する距離区分" value={distance} onChange={e=>setDistance(e.target.value)}><option value="">全距離</option><option value="800">800m</option><option value="1400-1500">1400〜1500m</option><option value="2000">2000m</option><option value="other">その他</option></select></label></div>
  <p className="my-2">同じレース・同じ計算版の発走前固定予想だけを比較。比較可能{data.comparable}R、順位なし{data.unranked}R。旧版は版を選んで確認できます。</p>
  <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>モデル</th><th>1位が勝利</th><th>1位が3着内</th><th>上位5頭に1〜3着全頭</th></tr></thead><tbody>{Object.entries(data.totals).map(([k,t])=><tr key={k} className="border-t"><td className="py-2">{label[k]}</td><td>{pct(t.win,t.n)}</td><td>{pct(t.place,t.n)}</td><td>{pct(t.top5,t.n)}</td></tr>)}</tbody></table></div>
  <div className="mt-3 rounded border p-2"><strong>近走85候補の事前検証</strong><p>現行と候補を同時に固定した{candidate.comparable}R。結果後の再計算は含めません。</p>{Object.entries(candidate.totals).map(([k,t])=><p key={k}>{label[k]}：勝利 {pct(t.win,t.n)}／3着内 {pct(t.place,t.n)}／上位5頭 {pct(t.top5,t.n)}</p>)}<p>候補は次の新規保存から記録。本命・印は現行を使用し、自動採用しません。候補の補助点は合計±2点、馬体重・人気・騎手・順位学習の上乗せは0です。</p></div>
  <details className="mt-2"><summary>近走70候補の比較</summary>{Object.entries(balanced.totals).map(([k,t])=><p key={k}>{label[k]}：勝利 {pct(t.win,t.n)}／3着内 {pct(t.place,t.n)}</p>)}</details>
  <p className="mt-2 text-amber-900">的中状況の比較で、回収率ではありません。未見の開催で検証し、少数結果だけで係数を採用しません。</p>
 </details></section>;
}
