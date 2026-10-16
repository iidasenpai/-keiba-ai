import {useState} from 'react';
import {prepareSources} from './sourceImport';
const LABEL={race:'出馬表・展開',form:'詳細',standard:'標準指数',recent:'近5走',training:'調教',comment:'厩舎コメント'};
export default function SourceImportPanel({onApply}:{onApply:(draft:any)=>void}){
 const [files,setFiles]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState('');
 let draft:any=null,issue='';try{if(files.length)draft=prepareSources(files.map(f=>f.data));}catch(e){issue=e.message;}
 const add=async(e:any)=>{const chosen=Array.from(e.target.files||[]) as File[];e.target.value='';setBusy(true);setError('');setDone('');try{
  if(chosen.length+files.length>8)throw Error('8ファイル以内で選んでください');
  const loaded=[];for(const f of chosen){if(f.size>4000000)throw Error('ファイルは4MB以内にしてください');loaded.push({name:f.name,data:JSON.parse(await f.text())});}setFiles(prev=>[...prev,...loaded]);
 }catch(e){setError('読込できません：'+e.message);}finally{setBusy(false);}};
 return <div className="mx-3 mt-3 rounded-xl border border-sky-200 bg-white p-3 text-xs">
  <div className="font-black text-sky-900">Safariで取得したファイルを一括取込</div>
  <p className="my-2 text-gray-600">netkeibaと競馬ブックの取得ファイルを選択。馬番・馬名と開催情報を照合して、現在の入力へ反映します。</p>
  <input aria-label="Safari取得ファイル" type="file" multiple accept=".json,.txt,application/json,text/plain" onChange={add} disabled={busy}/>
  {files.map((f,i)=><div key={i} className="mt-1">{f.name} <button onClick={()=>{setFiles(v=>v.filter((_,n)=>n!==i));setDone('');}} className="text-red-600">外す</button></div>)}
  {(error||issue)&&<p role="alert" className="mt-2 text-red-700">{error||issue}</p>}
  {draft&&<><p className="mt-2 font-bold">{draft.meta.raceDate} {draft.meta.track}{draft.meta.raceNo}R {draft.meta.distance}m · {draft.sources.race.roster.length}頭</p>
   <p className="mt-1">取得済み：{Object.keys(draft.sources).map(k=>LABEL[k]).join('・')}</p>
   {!!draft.absent.length&&<p className="mt-1 text-amber-800">未取得：{draft.absent.map(k=>LABEL[k]).join('・')}（空欄で取り込みます）</p>}
   {!!draft.errors.length&&<p className="mt-1 text-amber-800">取得時の注意：{draft.errors.join(' / ')}</p>}
   <p className="mt-1 text-gray-600">新しい入力として開きます。今の未保存入力を置き換えます。保存済み予測・結果は保持します。</p>
   <button disabled={busy} onClick={()=>{try{onApply(draft);setDone('入力へ反映しました。各馬の値を確認してから予測を保存してください。');setError('');}catch(e){setError(e.message);}}} className="mt-2 rounded-lg bg-sky-700 px-4 py-2 font-bold text-white">{draft.absent.length?'取得済みデータを入力へ反映':'6ページを入力へ反映'}</button>
  </>}
  {done&&<p role="status" className="mt-2 text-green-800">{done}</p>}
 </div>;
}
