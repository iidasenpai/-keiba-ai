import {useMemo,useState} from 'react';
import {verifiedBeforeStart,nonStarter,finite} from './modelSafety';
import {resultIssues} from './raceIntegrity';
export {fixedComparison,distanceGroup} from './modelComparison';
import {fixedComparison,fixedFieldSummary} from './modelComparison';
const label={NagoyaHeadRecent:'名古屋：現行◎＋近走順の相手',SonodaAux:'園田：調教・コメント補正候補',VenueCandidate:'会場別の検証候補',OiBaseline:'従来方式（同時保存）',Training:'調教補正候補',current:'現モデル（保存時）',A:'近走重視A',Recent:'近走指数のみ',Place:'3着内向け候補',Balanced:'近走70候補',Simple85:'近走85・補助点上限候補',Simple85Core:'近走85・基礎点のみ'};
export default function ModelComparisonPanel({records}:{records:any[]}){
 const dates=useMemo(()=>[...new Set(records.filter(r=>r.status==='completed').map(r=>r.raceDate).filter(Boolean))].sort().reverse(),[records]);
 const builds=useMemo(()=>[...new Set(records.filter(r=>r.status==='completed'&&verifiedBeforeStart(r)).sort((a,b)=>String(b.predictionLock.lockedAt).localeCompare(String(a.predictionLock.lockedAt))).map(r=>r.predictionLock?.build).filter(Boolean))] as string[],[records]);
 const [chosen,setChosen]=useState('latest'),[buildChosen,setBuild]=useState('latest'),[track,setTrack]=useState(''),[distance,setDistance]=useState('');
 const date=chosen==='latest'?dates[0]||'':chosen,build=buildChosen==='latest'?builds[0]:buildChosen;
 const options={track,distance,build};
 const field=fixedFieldSummary(records,date,options);
 const data=fixedComparison(records,date,undefined,options),balanced=fixedComparison(records.filter(r=>r.predictionLock?.models?.Balanced?.version==='balanced-v12.6'),date,['current','Balanced'],options);
 const candidate=fixedComparison(records.filter(r=>r.predictionLock?.models?.Simple85?.version==='simple85-v12.7'),date,['current','Simple85','Simple85Core'],options);
 const training=fixedComparison(records.filter(r=>r.predictionLock?.models?.Training?.version==='structured-training-v1'),date,['current','Training'],options);
 const oi=fixedComparison(records.filter(r=>r.track==='大井'&&r.predictionLock?.models?.OiModel?.version==='oi-specialist-v1'),date,['current','OiBaseline'],options);
 const venue=fixedComparison(records.filter(r=>r.predictionLock?.models?.VenueCandidate?.version==='venue-candidate-v1'),date,['current','VenueCandidate'],options);
 const nagoya=fixedComparison(records.filter(r=>r.predictionLock?.models?.NagoyaHeadRecent?.version==='nagoya-head-recent-v1'),date,['current','NagoyaHeadRecent'],options);
 const sonoda=fixedComparison(records.filter(r=>r.predictionLock?.models?.SonodaAux?.version==='sonoda-evidence-aux-v1'),date,['current','SonodaAux'],options);
 const pct=(n,d)=>d?`${n}/${d} (${(100*n/d).toFixed(1)}%)`:'未集計';
 return <section className="mx-3 mt-3 rounded-xl border border-indigo-200 bg-white p-3 text-xs"><details><summary className="font-black text-indigo-950">保存した事前予想でモデルを比較</summary>
  <div className="mt-2 flex flex-wrap gap-2"><label>対象日 <select aria-label="モデル比較の対象日" value={chosen} onChange={e=>setChosen(e.target.value)}><option value="latest">直近の結果日</option><option value="">全期間</option>{dates.map(d=><option key={d}>{d}</option>)}</select></label>
  <label>計算版 <select aria-label="比較する計算版" value={buildChosen} onChange={e=>setBuild(e.target.value)}><option value="latest">直近の保存版</option>{builds.map(b=><option key={b} value={b}>{b.split('-sha256-')[0]} {b.slice(-8)}</option>)}</select></label>
  <label>会場 <select aria-label="比較する会場" value={track} onChange={e=>setTrack(e.target.value)}><option value="">全場</option>{[...new Set(records.map(r=>r.track).filter(Boolean))].sort().map(t=><option key={t}>{t}</option>)}</select></label>
  <label>距離 <select aria-label="比較する距離区分" value={distance} onChange={e=>setDistance(e.target.value)}><option value="">全距離</option><option value="800">800m</option><option value="1400-1500">1400〜1500m</option><option value="2000">2000m</option><option value="other">その他</option></select></label></div>
  <p className="my-2">同じレース・同じ計算版の発走前固定予想だけを比較。現行の集計対象{field.comparable}R、順位なし{field.unranked}R。旧版は版を選んで確認できます。結果で判明した取消・除外による順位の繰り上げは行いません。</p>
  <div className="mt-3 rounded border p-2"><strong>◎以外も含めた全体成績</strong>
   <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th>保存順位・印</th><th>1着</th><th>2着</th><th>3着</th><th>3着以内</th><th>取消・除外</th></tr></thead><tbody>{field.ranks.map(t=><tr key={t.rank} className="border-t"><td className="py-2">{t.rank}位 {['◎','○','▲','△','△','☆'][t.rank-1]}</td><td>{pct(t.win,t.n)}</td><td>{pct(t.second,t.n)}</td><td>{pct(t.third,t.n)}</td><td>{pct(t.place,t.n)}</td><td>{t.nonstarters}頭</td></tr>)}</tbody></table></div>
   <p className="mt-2 text-gray-600">印は自動順位の対応。手動の印変更とは別に、保存順位を集計します。取消・除外も元の選択に残すため、この割合は出走馬だけの勝率・複勝率とは異なります。</p>
   <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th>会場</th><th>上位3頭に勝ち馬</th><th>上位2頭が1・2着</th><th>上位5頭に1〜3着</th><th>上位6頭に1〜3着</th></tr></thead><tbody>{[...field.tracks.map((t:any)=>t),{track:'合計',...field.totals.current}].map((t:any)=><tr key={t.track} className="border-t"><td className="py-2">{t.track}</td><td>{pct(t.winner3,t.n)}</td><td>{pct(t.pair2,t.n)}</td><td>{pct(t.top5,t.n)}</td><td>{pct(t.top6,t.n)}</td></tr>)}</tbody></table></div>
   <p className="mt-2 text-gray-600">1・2着および1〜3着の包含は着順不問です。頭数を増やすと買い目も増えるため、包含率の上昇だけで改善とは判断しません。</p>
  </div>
  <div className="mt-3 rounded border p-2"><strong>会場別候補の事前比較</strong><p>新たに保存した共通{venue.comparable}R。本番予想には適用しません。</p>{Object.entries(venue.totals).map(([k,t])=><p key={k}>{label[k]}：3着内 {pct(t.place,t.n)}／勝利 {pct(t.win,t.n)}</p>)}</div>
  {[['名古屋の相手選択候補',nagoya],['園田の調教・コメント候補',sonoda]].map(([title,comparison]:any)=><div key={title} className="mt-3 rounded border p-2"><strong>{title}</strong><p>新規保存時から同時固定した共通{comparison.comparable}R。本予想には未適用。指数不足で順位のない馬は候補でも順位を作らず、的中保証として扱いません。</p>{Object.entries(comparison.totals).map(([k,t]:any)=><p key={k}>{label[k]}：◎勝利 {pct(t.win,t.n)}／◎3着内 {pct(t.place,t.n)}／上位5頭で1〜3着 {pct(t.top5,t.n)}</p>)}</div>)}
  <p className="my-2 font-bold">保存モデル間の比較：共通{data.comparable}R</p>
  <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>モデル</th><th>1位が勝利</th><th>1位が3着内</th><th>上位3頭に勝ち馬</th><th>上位5頭に1〜3着全頭</th><th>上位6頭に1〜3着全頭</th></tr></thead><tbody>{Object.entries(data.totals).map(([k,t])=><tr key={k} className="border-t"><td className="py-2">{label[k]}</td><td>{pct(t.win,t.n)}</td><td>{pct(t.place,t.n)}</td><td>{pct(t.winner3,t.n)}</td><td>{pct(t.top5,t.n)}</td><td>{pct(t.top6,t.n)}</td></tr>)}</tbody></table></div>
  <div className="mt-3 rounded border p-2"><strong>近走85候補の事前検証</strong><p>現行と候補を同時に固定した{candidate.comparable}R。結果後の再計算は含めません。</p>{Object.entries(candidate.totals).map(([k,t])=><p key={k}>{label[k]}：勝利 {pct(t.win,t.n)}／3着内 {pct(t.place,t.n)}／上位5頭 {pct(t.top5,t.n)}</p>)}<p>候補は次の新規保存から記録。本命・印は現行を使用し、自動採用しません。候補の補助点は合計±2点、馬体重・人気・騎手・順位学習の上乗せは0です。</p></div>
  <div className="mt-3 rounded border p-2"><strong>調教補正あり・なしの比較</strong><p>発走前に両方を保存した共通{training.comparable}R。主予想は従来のままです。</p>{Object.entries(training.totals).map(([k,t])=><p key={k}>{label[k]}：勝利 {pct(t.win,t.n)}／3着内 {pct(t.place,t.n)}／上位5頭 {pct(t.top5,t.n)}／上位6頭 {pct(t.top6,t.n)}</p>)}<p>調教未取得の過去予想に候補は後付けしません。</p></div>
  <div className="mt-3 rounded border p-2"><strong>大井専用モデルの成績</strong><p>主予想は大井専用モデル。従来方式も同時保存した共通{oi.comparable}R。</p>{Object.entries(oi.totals).map(([k,t])=><p key={k}>{k==='current'?'大井専用モデル':label[k]}：勝利 {pct(t.win,t.n)}／3着内 {pct(t.place,t.n)}／上位5頭 {pct(t.top5,t.n)}／上位6頭 {pct(t.top6,t.n)}</p>)}<p>過去の旧データをこの事前成績に混ぜません。</p></div>
  <details className="mt-2"><summary>近走70候補の比較</summary>{Object.entries(balanced.totals).map(([k,t])=><p key={k}>{label[k]}：勝利 {pct(t.win,t.n)}／3着内 {pct(t.place,t.n)}</p>)}</details>
  <p className="mt-2 text-amber-900">的中状況の比較で、回収率ではありません。未見の開催で検証し、少数結果だけで係数を採用しません。</p>
 </details></section>;
}
