import {useMemo} from 'react';
import {probabilityReport} from './probabilityCandidates';
export default function ProbabilityComparison({records,date,options}:{records:any[],date:string,options:any}){
 const report=useMemo(()=>probabilityReport(records,{...options,date}),[records,date,options.track,options.distance,options.build]);
 const names={Model:'モデルのみ',Market:'市場のみ',Combined:'市場90%＋モデル10%'};
 return <div className="mt-3 rounded border p-2"><strong>勝率予測の事前比較</strong><p>温度12・合成比率は未学習の仮設定。共通{report.n}R／{report.days}開催日、比較対象外{report.excluded}R。新規に固定保存した確率を集計します。</p>
 <table className="mt-2 w-full text-left"><thead><tr><th>候補</th><th>対数損失</th><th>Brier</th><th>◎勝率</th></tr></thead><tbody>{Object.entries(report.totals).map(([k,t]:any)=><tr key={k}><td>{names[k]}</td><td>{report.n?(t.loss/report.n).toFixed(4):'—'}</td><td>{report.n?(t.brier/report.n).toFixed(4):'—'}</td><td>{report.n?(100*t.wins/report.n).toFixed(1)+'%':'—'}</td></tr>)}</tbody></table>
 <p>市場のみ−併用の対数損失差 {report.difference?.toFixed(4)??'—'}。開催日単位95%区間 {report.ci?report.ci.map(v=>v.toFixed(4)).join('〜'):'未算出'}。正の差は併用側が良好です。開催日が少ない間は参考値です。</p>
 <details><summary>確率帯別の較正</summary>{Object.entries(report.totals).map(([k,t]:any)=><div key={k}><strong>{names[k]}</strong>{t.bins.map((b,i)=><p key={i}>{i*20}〜{(i+1)*20}%帯 {b.n}頭／平均予測 {b.n?(100*b.sum/b.n).toFixed(1):'—'}%／実際の勝率 {b.n?(100*b.wins/b.n).toFixed(1):'—'}%</p>)}</div>)}</details>
 <p>固定後に取消・除外で出走馬が変わったレースと、全頭確率がそろわないレースは比較対象外です。回収率・購入判断は未集計です。</p></div>;
}
