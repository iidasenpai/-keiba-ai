import { useState } from 'react';
import { wilson } from './modelSafety';
import { resultIssues, predictionView } from './raceIntegrity';
import { runLab, DEFAULT_WEIGHTS } from './evaluation';

const pct = (n: number, d: number) => {
  if (!d) return '—';
  const w = wilson(n, d)!;
  return `${(100 * n / d).toFixed(1)}% (${(100 * w.low).toFixed(0)}〜${(100 * w.high).toFixed(0)}%)`;
};
const fmt = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const wtext = (w: any) => `最高${w.best}/近走${w.avg5}/距離${w.dist}/コース${w.course}`;
const verdictText: any = {
  adopt: '未来レースでも現行より良い結果でした。採用を検討できます（ただし重みの変更は手動で行ってください）。',
  keep: '未来レースでは現行の重みを上回りませんでした。現状維持が妥当です。',
  insufficient: '検証できるレースが少なく、判断できません。結果登録を増やしてください。',
};

function Table({ title, r, hasOdds }: { title: string; r: any; hasOdds?: boolean }) {
  const rows: [string, any][] = [['現行の重み（固定）', r.fixed], ['検証で選んだ設定', r.chosen]];
  if (r.odds) rows.push(['人気順（オッズ1位が上位）', r.odds]);
  return <div className="mt-3 rounded border p-2">
    <strong>{title}</strong>
    <p className="mt-1">検証{r.oosN}R（最初の{r.minTrain}Rは学習のみ）。設定の切替 {r.switches}回。</p>
    <div className="mt-1 overflow-x-auto"><table className="w-full text-left"><thead><tr><th>方式</th><th>1位が勝利</th><th>1位が3着内</th><th>勝ち馬の対数損失</th><th>勝ち馬の平均順位</th></tr></thead><tbody>
      {rows.map(([name, a]) => <tr key={name} className="border-t"><td className="py-1">{name}</td><td>{pct(a.hit, a.n)}</td><td>{pct(a.place, a.n)}</td><td>{fmt(a.ll)}</td><td>{fmt(a.rank, 2)}</td></tr>)}
      <tr className="border-t text-gray-600"><td className="py-1">ランダム（期待値）</td><td>{r.oosN ? `${(100 * r.randomHit / r.oosN).toFixed(1)}%` : '—'}</td><td colSpan={3} /></tr>
    </tbody></table></div>
    {r.best && <p className="mt-1">全期間で見た最良: {wtext(r.best.weights)}{hasOdds ? `／オッズ併用 ${r.best.blend}` : ''}（損失 {fmt(r.best.defaultLl)}→{fmt(r.best.trainLl)}。選んだレースを含むため参考値）</p>}
    <p className="mt-1 font-bold">{verdictText[r.verdict]}</p>
  </div>;
}

export default function WeightLabPanel({ records }: { records: any[] }) {
  const [out, setOut] = useState<any>(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const run = () => {
    setBusy(true); setErr('');
    setTimeout(() => {
      try {
        const rows = records.filter(r => r.status === 'completed' && r.predictionLock && !resultIssues(r).length).map(predictionView);
        setOut(runLab(rows));
      } catch (e) { setErr(e instanceof Error ? e.message : '検証に失敗しました'); }
      setBusy(false);
    }, 30);
  };
  return <section className="mx-3 mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs"><details>
    <summary className="font-black text-emerald-950">重み・オッズ併用の検証（未来レース方式）</summary>
    <p className="my-2">保存した事前予想の入力値から、重みを変えた場合を再計算します。各レースは「そのレースより前のレースだけ」で設定を選んで評価するため、結果を見てからの当てはめにはなりません。現行の重みは {wtext(DEFAULT_WEIGHTS)}。調教・コメント・脚質などの補正は含まず、基礎点だけの比較です。</p>
    <button className="rounded bg-emerald-700 px-3 py-1 font-bold text-white disabled:opacity-50" disabled={busy} onClick={run}>{busy ? '検証中…' : '検証を実行'}</button>
    {err && <p className="mt-2 text-red-700">{err}</p>}
    {out && <div>
      <p className="mt-2">保存{out.total}R中、検証に使えるのは{out.usable}R（オッズが全頭揃うのは{out.withOdds}R）。</p>
      <Table title="① 重みだけを変えた場合" r={out.weightsOnly} />
      {out.withMarket ? <Table title="② オッズ併用を加えた場合（オッズ全頭ありのレースのみ）" r={out.withMarket} hasOdds /> : <p className="mt-2 text-gray-600">オッズ併用の検証にはオッズが全頭揃うレースが41R以上必要です。</p>}
      <p className="mt-2 text-amber-900">的中率の区間は95%信頼区間です。区間が広い間は差を過信しないでください。回収率ではなく的中の検証です。</p>
    </div>}
  </details></section>;
}
