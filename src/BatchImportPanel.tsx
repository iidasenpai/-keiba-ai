import {useState,useMemo} from 'react';
import {prepareBatch} from './sourceImport';
export default function BatchImportPanel({inbox,onImport,onOpen,onRun,ready,summary}:{inbox:any,onImport:(raw:any)=>void,onOpen:(draft:any)=>void,onRun:(drafts:any[])=>void,ready:boolean,summary:any}){
 const labels={race:'出馬表',form:'詳細',standard:'標準指数',recent:'近5走',training:'調教',comment:'厩舎コメント'};
 const [error,setError]=useState(''),[reading,setReading]=useState(false);
 const batch=useMemo(()=>{try{return inbox?prepareBatch(inbox):null;}catch{return null;}},[inbox]);
 const read=async(e:any)=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setReading(true);setError('');try{
  if(f.size>32000000)throw Error('32MB以内のファイルを選んでください');
  const raw=JSON.parse(await f.text());prepareBatch(raw);onImport(raw);
 }catch(e){setError('読み込めません：'+e.message);}finally{setReading(false);}};
 return <section className="mx-3 mt-3 rounded-xl border border-sky-200 bg-white p-3 text-xs">
  <div className="font-black text-sky-900">一括予想ファイルを読み込む</div>
  <p className="my-2 text-gray-600">ChatGPTから受け取ったJSONファイルを選びます。予想はこのアプリの現在の設定・ロジックで計算します。</p>
  <input aria-label="一括予想ファイル" type="file" accept=".json,application/json" onChange={read} disabled={reading||!ready}/>
  {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
  {batch&&<>
   <p className="mt-2 font-bold">{batch.raceDate} 対象{batch.expectedTotal}レース · 取得済み{batch.drafts.length} · 取得失敗{batch.errors.length}</p>
   <p className="mt-1 text-gray-600">全頭・開催情報の照合済み。未取得項目は各レースに表示します。</p>
   <p className="mt-1 text-amber-800">一括保存は、発走時刻が確認できる発走前のレースが対象です。保存済み・発走済みは理由を表示してスキップします。</p>
   <button disabled={!ready||!batch.drafts.length} onClick={()=>onRun(batch.drafts)} className="my-2 rounded-lg bg-sky-700 px-4 py-2 font-bold text-white disabled:opacity-40">全レースを予想して保存</button>
   <div className="max-h-80 overflow-auto">{batch.drafts.map(d=><div key={d.key} className="flex items-center justify-between gap-2 border-t py-2"><div><strong>{d.meta.track}{d.meta.raceNo}R</strong> {d.meta.startTime||'時刻未取得'} {d.sources.race.roster.length}頭{d.absent.length>0&&<span className="block text-amber-800">未取得：{d.absent.map(k=>labels[k]).join('・')}</span>}{d.errors.length>0&&<span className="block text-amber-800">取得時の注意：{d.errors.join(' / ')}</span>}</div><button disabled={!ready} onClick={()=>onOpen(d)} className="shrink-0 rounded border px-2 py-2">開いて予想</button></div>)}</div>
   {batch.errors.map(e=><p key={e.key} className="mt-1 text-red-700">{e.track}{e.raceNo}R：{e.message}</p>)}
  </>}
  {summary&&<div role="status" className="mt-3 border-t pt-2"><strong>今回の処理：保存{summary.results.filter(r=>r.ok).length}件 / 処理{summary.results.length}件{summary.cancelled?'（中止）':''}</strong><p>未処理{summary.total-summary.results.length}件</p>{summary.results.map((r,i)=><p key={i} className={r.ok?'text-green-800':'text-amber-800'}>{r.label}：{r.ok?'予測を固定して保存':r.error}</p>)}</div>}
 </section>;
}
