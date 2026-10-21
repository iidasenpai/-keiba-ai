import {conditionEvidence} from './conditionCandidate';
import {nonStarter,finite} from './modelSafety';
export default function ConditionEvidencePanel({horses,meta,models,locked}:{horses:any[],meta:any,models:any,locked:boolean}){
 const active=horses.filter(h=>!nonStarter(h)),top=[...active].filter(h=>finite(h._rank)!==null).sort((a,b)=>a._rank-b._rank)[0];
 const evidence=top?conditionEvidence(top,meta):null;
 const missing=active.filter(h=>conditionEvidence(h,meta).compatibleCount===0).length;
 return <section className="mx-3 mt-3 rounded-xl border border-amber-200 bg-white p-3 text-xs"><strong>比較条件と不確実性</strong>
 <p className="mt-2">{top?`現行◎ ${top.umaban} ${top.name}`:'現行の順位なし'}：{evidence?`比較可能な地方近走 ${evidence.compatibleCount}走`:'材料未確認'}。同じ馬場・同距離帯・距離±200mで確認します。</p>
 {evidence?.risks.length?<ul className="mt-2 list-disc pl-5">{evidence.risks.map(s=><li key={s}>{s}</li>)}</ul>:<p className="mt-2">上記条件の不足はありません。的中・収益の検証は別途必要です。</p>}
 <p className="mt-2">全{active.length}頭のうち比較可能な指数がない馬：{missing}頭。これらの馬が弱いという意味ではありません。</p>
 <p className="mt-2 text-amber-900">購入推奨は未検証。実績不足を理由にした自動見送りは適用せず、全レースの現行順位を表示します。</p>
 {meta.track==='浦和'&&<details className="mt-3"><summary className="font-bold">浦和の比較候補を見る</summary><p className="my-2">{locked?'保存時の候補のみ表示。候補のない過去予想へは追加しません。':'次の新規保存時に現行と同時固定します。'} 条件限定案は10/21の探索再計算で悪化したため未採用です。候補の印はメインへ反映しません。</p>
 {['UrawaCondition','UrawaConditionAux'].map((key)=>{
  const m=models?.[key];const rows=Array.isArray(m)?m:(m?.predictions||[]);const sorted=rows.filter(h=>finite(h._rank??h.rank)!==null&&finite(h._finalScore??h.score)!==null).sort((a,b)=>(a._rank??a.rank)-(b._rank??b.rank));
  return <div key={key} className="mt-2 rounded border p-2"><b>{key.endsWith('Aux')?'条件候補＋調教・コメント':'条件候補・基礎のみ'}</b><p>{sorted.length?sorted.slice(0,5).map(h=>`${h.umaban}番`).join(' → '):'候補順位なし'}</p><p>順位あり {sorted.length}/{active.length}頭</p></div>;
 })}<p className="mt-2">中央指数の換算、他場間の換算は未検証。条件に合う指数がない馬は候補順位を付けず、比較できない範囲も記録します。</p></details>}
 </section>;
}
