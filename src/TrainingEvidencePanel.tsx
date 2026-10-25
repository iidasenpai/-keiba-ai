import {finite} from './modelSafety';
export default function TrainingEvidencePanel({horses,model,locked}:{horses:any[],model:any,locked:boolean}){
 const covered=horses.filter(h=>h.structuredTraining);
 if(!covered.length&&!model)return null;
 const rows=Array.isArray(model)?model:model?.predictions||[];
 const diagnostics=Array.isArray(model)?model.map(h=>({umaban:h.umaban,...h.trainingCandidateEvidence})):model?.diagnostics||[];
 const order=rows.filter(h=>finite(h.rank??h._rank)!==null&&finite(h.score??h._finalScore)!==null).slice().sort((a,b)=>(a.rank??a._rank)-(b.rank??b._rank));
 return <section className="mx-3 mt-3 rounded-xl border border-orange-200 bg-white p-3 text-xs"><details><summary className="font-black text-orange-950">専門紙の調教と補正候補</summary>
 <p className="my-2">調教欄を取得 {covered.length}/{horses.length}頭。{locked?'保存時の調教と候補順位を表示します。':'保存時に従来予想と候補を同時固定します。'} 主予想の印は従来のままです。候補の効果は未検証です。</p>
 <p className="my-2 font-bold">調教補正候補：{order.length?order.slice(0,6).map(h=>h.umaban+'番').join(' → '):'未保存・順位なし'}</p>
 <p>今回の時計に対応する短評の分類を±0.35点、条件の揃った時計比較を最大±0.25点とする試行ルールです。未取得・軽め調整・時計なしは、それだけでは減点しません。</p>
 <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th>馬</th><th>候補補正</th><th>今回の実施日・根拠</th></tr></thead><tbody>{covered.map(h=>{const d=diagnostics.find(x=>String(x.umaban)===String(h.umaban));return <tr key={h.id} className="border-t"><td className="py-2">{h.umaban} {h.name}</td><td>{d?`${d.adjustment>=0?'+':''}${Number(d.adjustment).toFixed(2)}`:'記録なし'}</td><td>{d?.workoutDate||'今回の時計なし'}<br/>{d?.reason||'比較候補の保存なし'}{h.structuredTraining.sessions.map((s,i)=><div key={i}>{s.date} {s.going} {s.course}：{s.clocks.join('－')}秒 {s.effort}{s.timedDistance===null?'（計時距離未確認・時計補正0）':`（${s.timedDistance}m）`}</div>)}<a href={h.structuredTraining.sourceUrl} target="_blank" rel="noreferrer" className="underline">出典の紙面</a></td></tr>;})}</tbody></table></div>
 <p className="mt-2 text-gray-600">日付入りの記録でも前走以前なら今回の採点には使いません。結果入力後は保存済みの順位・補正を保持し、過去の予想に調教を後付けしません。</p>
 </details></section>;
}
