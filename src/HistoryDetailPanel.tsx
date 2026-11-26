import {useMemo,useState} from 'react';
import {detailCutoff,detailCandidates} from './historyDetails';
import {writeDetailZip,openDetailZip} from './detailZip';
export default function HistoryDetailPanel({records,onApply}:{records:any[];onApply:(zip:Awaited<ReturnType<typeof openDetailZip>>,restore:boolean)=>Promise<number>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const cutoff=detailCutoff();
 const candidates=useMemo(()=>open?detailCandidates(records,cutoff):[],[records,cutoff,open]);
 const download=async()=>{
  setBusy(true);setMessage('ZIPを作成しています。元データはまだ変更していません。');
  try{
   const {blob}=await writeDetailZip(candidates,cutoff,n=>{if(n%10===0)setMessage(`ZIP作成中 ${n}/${candidates.length}レース`);});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`nar-details-before-${cutoff}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage('ZIPの保存操作を開始しました。端末の「ファイル」に保存できたら、②で同じZIPを選んでください。まだ軽量化はしていません。');
  }catch(e){setMessage(e instanceof Error?e.message:'ZIPを作成できませんでした。');}finally{setBusy(false);}
 };
 const select=(restore:boolean)=>{
  const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;setBusy(true);setMessage('ZIPを検証しています。');
   try{const zip=await openDetailZip(file),n=await onApply(zip,restore);setMessage(restore?`${n}レースの退避した詳細を戻しました。`:`${n}レースを軽量化しました。予想順位・結果・比較候補・学習用入力は残っています。`);}
   catch(e){setMessage((e instanceof Error?e.message:'処理に失敗しました。')+' 元の保存データは保持しています。');}finally{setBusy(false);}
  };input.click();
 };
 return <details className="mb-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="font-bold">古い詳細をZIPへ退避して軽量化</summary>
  {open&&<><p className="mt-2">直近30日はそのまま保存。{cutoff}より前の結果入力済みレースのうち、計算用の重複資料・古い回顧内の余分な馬データを退避します。レース自体と成績・学習に必要な入力は残します。開催日不明・結果待ちは対象外です。</p>
   <p className="mt-2 font-bold">今回の対象：{candidates.length}レース</p>
   <div className="mt-2 flex flex-wrap gap-2"><button disabled={busy||!candidates.length} onClick={download} className="rounded bg-emerald-800 px-3 py-2 font-bold text-white disabled:opacity-40">① 詳細のZIPを保存</button><button disabled={busy} onClick={()=>select(false)} className="rounded border border-emerald-700 bg-white px-3 py-2 font-bold">② 保存したZIPを選んで軽量化</button><button disabled={busy} onClick={()=>select(true)} className="rounded border bg-white px-3 py-2">ZIPから詳細を戻す</button></div>
   <p role="status" className="mt-2 whitespace-pre-wrap">{message}</p><p className="mt-2 text-gray-600">ZIPの内容と現在の保存レースが一致しない場合は処理を中止します。ZIPは大切に保管してください。自動削除はしません。</p>
  </>}
 </details>;
}
