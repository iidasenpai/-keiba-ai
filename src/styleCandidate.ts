import {finite} from './modelSafety';
// 検証用の固定候補。本予想・既存係数・学習には一切影響しない。
// 幅は検証開始前に固定した仮設定（成績差ptを換算した最適値ではない）。変更する場合は必ず別バージョンで記録する。
export const PACE_CANDIDATE_VERSION='pace-candidate-v1';
export const STYLE_FIXED_VERSION='style-fixed-v1';
export const STYLE_FIXED_BONUS:Record<string,number>={'逃':3,'先':2,'差':0,'追':-3};
export const STYLE_FIXED_RULE='現行の最終スコアにだけ脚質加点(逃+3・先+2・差0・追-3)。脚質不明・自在は0。AUTO/展開補正なし候補とは組み合わせない。順位付けは現行と同一の計算(頭の固定・ヒモ補正・同点処理)。未採用の検証候補。';
export function styleFixedBonus(style:any):number{
  const s=String(style??'').trim();
  return Object.prototype.hasOwnProperty.call(STYLE_FIXED_BONUS,s)?STYLE_FIXED_BONUS[s]:0;
}
// computed は現行計算後・順位付け前の馬配列(能力点 _finalScore を持つ)。
// 加点だけを入力点に足し、順位付けは現行と完全に同じ計算(頭の固定・ヒモ補正・同点処理)に通す。
// 点のない馬(未知馬)には点を作らず、元の配列も変更しない。加点0なら現行と同一の入力になる。
export function styleFixedInputs(computed:any[]):any[]{
  return computed.map(h=>{
    const base=finite(h._finalScore);
    if(base===null)return h;
    const bonus=styleFixedBonus(h.runningStyle);
    return {...h,_finalScore:base+bonus,styleFixedEvidence:{version:STYLE_FIXED_VERSION,style:String(h.runningStyle||''),bonus,baseScore:base}};
  });
}
