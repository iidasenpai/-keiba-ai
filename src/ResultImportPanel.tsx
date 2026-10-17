import {useMemo,useState} from 'react';
import {prepareResultBatch,planResultImport} from './resultImport';
export default function ResultImportPanel({records,onApply,ready}:{records:any[],onApply:(batch:any)=>Promise<any>,ready:boolean}){
 const [batch,setBatch]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState<any>(null);
 const plan=useMemo(()=>batch?planResultImport(records,batch):null,[records,batch]);
 const read=async(e:any)=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setError('');setDone(null);try{if(f.size>8000000)throw Error('結果ファイルは8MB以内にしてください');setBatch(prepareResultBatch(JSON.parse(await f.text())));}catch(e){setError(e.message);setBatch(null);}};
 return <section className="mx-3 mt-3 rounded-xl border border-purple-200 bg-white p-3 text-xs"><div className="font-black text-purple-900">結果ファイルを一括反映・学習</div><p className="my-2 text-gray-600">ChatGPTから受け取った結果JSONを選択。保存済み予想と照合し、確定した全頭の着順・回顧を更新します。</p><input aria-label="結果一括ファイル" type="file" accept=".json,application/json" disabled={!ready||busy} onChange={read}/>
 {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
 {batch&&plan&&<><p className="mt-2 font-bold">{batch.raceDate} 対象{batch.expectedTotal}R · 確定{batch.races.length}R · 未確定・取得不可{batch.errors.length}R</p><p>反映可能：保存予想{plan.actions.length}件 · スキップ{plan.skipped.length}件</p><p className="my-1 text-gray-600">固定した予想順位を保持。学習ONなら結果反映後に再計算します。未確定分は後の結果ファイルで追記できます。</p><button disabled={!ready||busy||!plan.actions.length} className="rounded-lg bg-purple-700 px-4 py-2 font-bold text-white disabled:opacity-40" onClick={async()=>{setBusy(true);setError('');try{setDone(await onApply(batch));}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'結果を保存中…':'結果を反映して回顧・学習'}</button><div className="mt-2 max-h-48 overflow-auto">{plan.skipped.map((r,i)=><p key={i} className="text-amber-800">{r.label}：{r.reason}</p>)}{batch.errors.map((r,i)=><p key={'e'+i} className="text-gray-600">{r.track}{r.raceNo}R：{r.message}</p>)}</div></>}
 {done&&<p role="status" className="mt-2 text-green-800">結果{done.updated}件を保存。{done.learned?'学習を更新しました。':'学習OFFのため結果・回顧のみ反映しました。'}</p>}
 </section>;
}
