import {oiMode} from './oiModel';
export default function OiModelPanel({horses,meta,locked}:{horses:any[],meta:any,locked:boolean}){
 if(meta.track!=='大井')return null;
 const dedicated=[1200,1600].includes(Number(meta.distance));
 const applied=horses.some(h=>h.oiModelVersion==='oi-specialist-v1');
 return <section className="mx-3 mt-3 rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs"><strong>{locked&&!applied?'保存時の従来予想':oiMode(meta.distance)+'（大井モデルv1）'}</strong>
 <p className="mt-2">{locked&&!applied?'この保存予想には専用モデルを後付けしません。':dedicated?'このレースの◎・印は大井専用計算です。近走指数で本命2頭を選び、13頭以上では3番手以降に近走中央値を15%混ぜて並べます。':'この距離は従来の計算を使います。専用配分の有効性が確認できていないためです。'}</p>
 {dedicated&&applied&&<p className="mt-2">専用計算では人気・オッズ・馬体重・H設定・調教コメントの点数を上乗せしません。調教・コメントの入力自体は保持します。指数不足の馬は判断困難とし、架空の点数を与えません。</p>}
 <details className="mt-2"><summary>馬ごとの評価材料</summary>{horses.map(h=><p key={h.id} className="mt-1">{h.umaban} {h.name}：{h.oiEvidence?`近走 ${h.oiEvidence.recent==null?'不明':Number(h.oiEvidence.recent).toFixed(1)}／${h.oiEvidence.risks.join('・')||'追加の不足表示なし'}`:'専用計算の保存なし'}</p>)}</details>
 <p className="mt-2">専用版の将来精度は未確認です。過去の保存予想・結果は保持します。</p></section>;
}
