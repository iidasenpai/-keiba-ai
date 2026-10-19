import {useMemo,useState} from 'react';
import {MODEL_VERSION,MODEL_BUILD,verifiedBeforeStart,nonStarter,finite} from './modelSafety';
import {resultIssues} from './raceIntegrity';
export function fixedComparison(records:any[],date=''){
 const rows=records.filter(r=>r.status==='completed'&&!r.evaluationExcluded&&!resultIssues(r).length&&verifiedBeforeStart(r)&&r.predictionLock?.modelVersion===MODEL_VERSION&&r.predictionLock?.build===MODEL_BUILD&&(!date||r.raceDate===date));
 const totals=Object.fromEntries(['current','A','Recent','Place'].map(k=>[k,{n:0,win:0,place:0,top5:0}]));
 let unranked=0,comparable=0;
 for(const r of rows){
  const active=new Set(r.horses.filter(h=>!nonStarter(h)).map(h=>String(h.umaban)));
  const actual=r.horses.filter(h=>[1,2,3].includes(finite(h.finish))).sort((a,b)=>Number(a.finish)-Number(b.finish));
  const sets=Object.fromEntries(Object.keys(totals).map(k=>{const m=r.predictionLock.models?.[k];return [k,[...(Array.isArray(m)?m:m?.predictions||[])].filter(h=>active.has(String(h.umaban))&&finite(h.rank)!==null).sort((a,b)=>a.rank-b.rank)];}));
  if(!sets.current.length){unranked++;continue;}
  if(Object.values(sets).some(xs=>!xs.length))continue;
  comparable++;
  for(const [k,picks] of Object.entries(sets)){
   const t=totals[k];t.n++;const f=actual.find(h=>String(h.umaban)===String(picks[0].umaban))?.finish;
   t.win+=Number(Number(f)===1);t.place+=Number([1,2,3].includes(Number(f)));
   const top=new Set(picks.slice(0,5).map(h=>String(h.umaban)));t.top5+=Number(actual.length===3&&actual.every(h=>top.has(String(h.umaban))));
  }
 }
 return {totals,comparable,unranked,verified:rows.length};
}
const label={current:'現モデル',A:'近走重視A',Recent:'近走指数のみ',Place:'3着内向け候補'};
export default function ModelComparisonPanel({records}:{records:any[]}){
 const dates=useMemo(()=>[...new Set(records.filter(r=>r.status==='completed').map(r=>r.raceDate).filter(Boolean))].sort().reverse(),[records]);
 const [chosen,setChosen]=useState('latest');const date=chosen==='latest'?dates[0]||'':chosen;
 const data=useMemo(()=>fixedComparison(records,date),[records,date]);
 const pct=(n,d)=>d?`${n}/${d} (${(100*n/d).toFixed(1)}%)`:'未集計';
 return <section className="mx-3 mt-3 rounded-xl border border-indigo-200 bg-white p-3 text-xs">
  <details><summary className="font-black text-indigo-950">保存した事前予想でモデルを比較</summary>
   <label className="mt-2 block">対象日 <select aria-label="モデル比較の対象日" value={chosen} onChange={e=>setChosen(e.target.value)} className="rounded border p-2"><option value="latest">直近の結果日</option><option value="">全期間</option>{dates.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
   <p className="my-2">同じレース・同じエンジン版の発走前固定予想だけを比較。比較可能{data.comparable}R、順位を付けなかった{data.unranked}Rは対象外。</p>
   <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>モデル</th><th>1位が勝利</th><th>1位が3着内</th><th>上位5頭に1〜3着全頭</th></tr></thead><tbody>{Object.entries(data.totals).map(([k,t])=><tr key={k} className="border-t"><td className="py-2">{label[k]}</td><td>{pct(t.win,t.n)}</td><td>{pct(t.place,t.n)}</td><td>{pct(t.top5,t.n)}</td></tr>)}</tbody></table></div>
   <p className="mt-2 text-amber-900">これは的中状況の比較です。回収率ではありません。少数の結果だけで重みを変更せず、次の開催でも事前に保存して比較します。</p>
  </details>
 </section>;
}
