import {useMemo,useState} from 'react';
import {pairedReport,MIN_RACES_FOR_VERDICT} from './candidateEvaluation';
import {nonStarter} from './modelSafety';
import {OI_MODEL_BUILD} from './oiModel';
import {OI_PEAK_VERSION} from './oiPeakCandidate';
export default function OiPeakComparison({records,date,options}:{records:any[];date:string;options:any}){
 const [distance,setDistance]=useState(''),[size,setSize]=useState('');
 const report=useMemo(()=>{
  const scoped=records.filter(r=>r.track==='大井'&&[1200,1600].includes(Number(r.distance))&&r.predictionLock?.models?.OiModel?.version==='oi-specialist-v1'&&(!date||r.raceDate===date)&&(!distance||Number(r.distance)===Number(distance))&&(!size||(size==='13+'?(r.predictionLock.horses||[]).filter((h:any)=>!nonStarter(h)).length>=13:(r.predictionLock.horses||[]).filter((h:any)=>!nonStarter(h)).length<=12)));
  return pairedReport(scoped,'OiPeak3',OI_PEAK_VERSION,{track:options.track||undefined,distance:options.distance||undefined,build:options.build,excludeOiSpecialist:false});
 },[records,date,options.track,options.distance,options.build,distance,size]);
 const pct=(x:number)=>report.n?x.toFixed(1)+'%':'未集計';
 const verdict={insufficient:`判定不可（${MIN_RACES_FOR_VERDICT}R未満）`,better:'改善傾向（別開催で再確認）',worse:'悪化傾向（別開催で再確認）',trendBetter:'改善傾向・未確定',trendWorse:'悪化傾向・未確定',unclear:'観測差0・優劣未確定'}[report.verdict];
 return <div className="mt-3 rounded border border-indigo-200 p-3">
  <strong>大井1200・1600m：相手選択の比較候補</strong>
  <p className="mt-2">◎○は固定し、3番手以下だけ直近の高い指数を25%反映。本予想には未適用。新規保存から現行と同時固定し、過去の予想には後付けしません。</p>
  <div className="mt-2 flex flex-wrap gap-3">
   <label>専用距離 <select aria-label="大井候補の距離" value={distance} onChange={e=>setDistance(e.target.value)}><option value="">1200・1600m</option><option value="1200">1200m</option><option value="1600">1600m</option></select></label>
   <label>保存時頭数 <select aria-label="大井候補の頭数" value={size} onChange={e=>setSize(e.target.value)}><option value="">全頭数</option><option value="12-">12頭以下</option><option value="13+">13頭以上</option></select></label>
  </div>
  <p className="mt-2">主指標：上位5頭で1〜3着を全捕捉。共通{report.n}R（候補が空 {report.candidateEmpty}R／現行順位なしで比較外 {report.currentEmpty}R）。現行 {pct(report.current)} → 候補 {pct(report.candidate)}。</p>
  {report.n>0&&<><p>差 {report.diff>=0?'+':''}{report.diff.toFixed(1)}pt／95%CI {report.lo.toFixed(1)}〜{report.hi.toFixed(1)}pt／{verdict}</p><p>候補のみ成功 {report.candOnly}R・現行のみ成功 {report.currOnly}R／正確McNemar p={report.pValue<.001?'<0.001':report.pValue.toFixed(3)}</p><p>◎勝率 {pct(report.winCurrent)} → {pct(report.winCandidate)}／◎3着内率 {pct(report.placeCurrent)} → {pct(report.placeCandidate)}</p></>}
  <p className="mt-2 text-gray-600">頭数は固定時点の取消・除外を除いた数。上の対象日・会場・距離区分・計算版も適用します。「直近の保存版」はこの欄では大井専用版（{OI_MODEL_BUILD.slice(-8)}）を使います。1400mは対象外です。</p>
  <p className="mt-2 text-gray-600">同じ芝ダ・地方・日付が確認できる発走前の実績を、保存近5走から最大3走使用（2走以上必要）。未知馬に点は作りません。30R以上・95%CIが0を含まない・正確検定p&lt;0.05を満たしても、自動採用しません。過去データで見つけた仮設定のため、今後の事前比較で確認します。</p>
 </div>;
}
