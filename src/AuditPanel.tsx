import {useMemo,useState,useEffect} from 'react';
import {resultIssues,repairLegacyResult,predictionView} from './raceIntegrity';
import {finite,nonStarter,fieldAudit,summarizeModels,raceDiagnostics,validateFullResults,validateBet,ledgerSummary,MODEL_VERSION,outcomeStats,modelRows,wilson} from './modelSafety';

const pct=(x:number,n:number)=>n?`${x}/${n} (${(100*x/n).toFixed(1)}%)`:'未集計';
const box='rounded-xl border border-slate-200 bg-white p-3 mt-3';
const input='block w-full rounded border border-slate-300 p-2 text-xs';
export default function AuditPanel({records,currentId,onCommit}:{records:any[],currentId:string|null,onCommit:(records:any[])=>Promise<void>}) {
  const [open,setOpen]=useState(false),[selected,setSelected]=useState('');
  const [rows,setRows]=useState<any[]>([]),[evidence,setEvidence]=useState(''),[date,setDate]=useState('');
  const [verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [bet,setBet]=useState({type:'単勝',selection:'',stake:'100',status:'参考',odds:'',oddsAt:''});
  const [payouts,setPayouts]=useState<Record<string,string>>({}),[payoutSource,setPayoutSource]=useState('');
  const race=records.find(r=>r.id===selected);
  const valid=useMemo(()=>records.filter(r=>r.status==='completed'&&!resultIssues(r).length),[records]);
  const quarantined=useMemo(()=>records.filter(r=>r.status==='completed'&&resultIssues(r).length),[records]);
  const groups=useMemo(()=>summarizeModels(valid),[valid]);
  const diagnostics=useMemo(()=>raceDiagnostics(records),[records]);
  const ledger=useMemo(()=>ledgerSummary(records),[records]);
  useEffect(()=>{if(currentId){setSelected(currentId);}},[currentId]);
  useEffect(()=>{
    if(!race){setRows([]);return;}
    setRows(race.horses.map(h=>({umaban:String(h.umaban),name:h.name||'',finish:h.finish||'',raceStatus:h.raceStatus||(!h.finish?'未入力':'')})));
    setDate(race.raceDate||'');setVerified(false);setEvidence('');
  },[selected,race]);
  async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await fn();setMessage('保存しました');}catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした');}finally{setBusy(false);}}
  async function update(record:any){await onCommit(records.map(r=>r.id===record.id?record:r));}
  async function saveResults(){
    if(!race)throw new Error('対象レースを選んでください');
    if(!date)throw new Error('開催日を確認してください');
    validateFullResults(race.horses,rows);
    const now=new Date().toISOString();
    const repaired=repairLegacyResult(race,rows,{identityVerified:verified,evidence,raceDate:date},now);
    await update(repaired);
  }
  async function saveBet(){
    if(!race?.predictionLock)throw new Error('予測固定済みのレースを選んでください');
    if(race.status==='completed')throw new Error('結果確定後に購入記録は追加できません');
    const now=new Date().toISOString();
    const row=validateBet({...bet,odds:finite(bet.odds),oddsAt:bet.odds?now:null},race,now);
    await update({...race,bets:[...(race.bets||[]),row],updatedAt:now});
    setBet(b=>({...b,selection:''}));
  }
  async function settle(id:string){
    if(!race||race.status!=='completed'||resultIssues(race).length)throw new Error('整合する結果を先に保存してください');
    const payout=finite(payouts[id]);
    if(payout===null||payout<0||!Number.isInteger(payout)||!payoutSource.trim())throw new Error('払戻総額（外れは0円）と参照元を入力してください');
    const now=new Date().toISOString();
    await update({...race,bets:race.bets.map((b:any)=>b.id!==id?b:{...b,settlements:[...(b.settlements||[]),{at:now,payout,source:payoutSource}]}),updatedAt:now});
  }
  const conditionRows=useMemo(()=>{
    const m=new Map<string,any[]>();
    for(const r of valid){const key=`${r.track} / ${r.distance}m / ${r.horses.filter(h=>!nonStarter(h)).length>=12?'12頭以上':'11頭以下'} / ${r.predictionLock?.modelVersion||'旧保存'}`;m.set(key,[...(m.get(key)||[]),r]);}
    return [...m].map(([key,rs])=>({key,...outcomeStats(rs)})).sort((a,b)=>b.n-a.n);
  },[valid]);
  return <section id="audit-panel" className="mx-3 mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
    <button className="w-full text-left font-black text-sky-950" onClick={()=>setOpen(v=>!v)}>データ確認・固定モデル比較 {open?'▲':'▼'}</button>
    <div className="text-xs mt-2">全{records.length}件 / 結果整合{valid.length}件 / 隔離・予想未照合{quarantined.length}件 / 待ち{records.filter(r=>r.status!=='completed').length}件</div>
    <div className="text-[11px] mt-1">現行 {MODEL_VERSION}。近走重視A・近走単独・PLACEを保存時に同時固定。旧Bの4/5位入替は新規予測に使いません。</div>
    {open&&<>
      {message&&<div role="status" className="my-3 rounded border bg-white p-2 text-sm">{message}</div>}
      <div className={box}>
        <h3 className="font-bold text-sm">同じ版・同じ対象で比較</h3>
        <p className="text-xs my-2">旧保存、時刻未確認、発走前確認済みを別集計。指数不足馬がいるレースも分母に残します。候補内の全捕捉と実際の買い目の的中は別です。</p>
        {groups.map(g=><div key={g.version} className="my-3">
          <div className="text-xs font-bold">{g.version} / {g.stats.n}件 / 順位不足を含む{g.stats.unknown}件</div>
          <div className="overflow-x-auto"><table className="text-[11px] w-full text-left"><thead><tr>{['候補','頭1着','軸3着内','4頭全捕捉','5頭全捕捉','6頭全捕捉'].map(x=><th className="p-2 whitespace-nowrap" key={x}>{x}</th>)}</tr></thead><tbody>{(g.models.length?g.models:[{key:'旧保存',...g.stats}]).map(m=><tr key={m.key}>{[m.key,pct(m.win,m.n),pct(m.place,m.n),pct(m.top4,m.n),pct(m.top5,m.n),pct(m.top6,m.n)].map((x,i)=><td className="p-2 whitespace-nowrap border-t" key={i}>{x}</td>)}</tr>)}</tbody></table></div>
          {g.stats.n>0&&<div className="text-[10px]">現行の頭1着率の参考95%区間：{Math.round((wilson(g.stats.win,g.stats.n)?.low||0)*100)}〜{Math.round((wilson(g.stats.win,g.stats.n)?.high||0)*100)}%。小標本・同日同場の偏りを含みます。</div>}
        </div>)}
        {!groups.length&&<p className="text-xs">結果確定後に集計されます。</p>}
      </div>
      <details className={box}><summary className="text-sm font-bold">競馬場・距離・頭数別（版ごと）</summary><div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr><th>条件</th><th>頭1着</th><th>5頭全捕捉</th></tr></thead><tbody>{conditionRows.map(r=><tr key={r.key}><td className="p-2 text-left">{r.key}</td><td>{pct(r.win,r.n)}</td><td>{pct(r.top5,r.n)}</td></tr>)}</tbody></table></div></details>
      <div className={box}>
        <h3 className="font-bold text-sm">照合が必要なデータ</h3>
        <p className="text-xs">開催識別なし{diagnostics.unidentified.length}件 / 馬名空欄{diagnostics.unnamed}頭 / 同一開催IDの予測{diagnostics.duplicates.length}組。旧データは自動で開催日を推定・統合しません。</p>
        {quarantined.map(r=><div key={r.id} className="mt-2 border-t pt-2 text-xs"><b>{r.title}</b> / {r.savedAt?.slice(0,10)}保存<div>{resultIssues(r).join(' / ')}</div><button className="underline" onClick={()=>setSelected(r.id)}>照合画面へ</button></div>)}
      </div>
      <div className={box}>
        <h3 className="font-bold text-sm">結果・全着順・出走状態の照合</h3>
        <select aria-label="照合するレース" className={input} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">レースを選択</option>{records.map(r=><option key={r.id} value={r.id}>{r.title} / {r.raceDate||r.savedAt?.slice(0,10)||'日付未確認'} / {r.id.slice(0,6)}</option>)}</select>
        {race&&<>
          <div className="text-xs mt-2">保存予測・入力を保持して結果訂正の履歴を追加します。旧不整合の結果を修復しても、元予想の対象を証明できなければ予想成績・学習へ戻しません。同着は元データを保持して照合待ちにします。</div>
          <label className="text-xs block mt-2">照合済み開催日<input aria-label="照合開催日" type="date" className={input} value={date} onChange={e=>setDate(e.target.value)} /></label>
          <div className="overflow-x-auto"><table className="w-full text-xs my-2"><thead><tr><th>馬番</th><th>馬名</th><th>着順</th><th>状態</th></tr></thead><tbody>{rows.map((h,i)=><tr key={h.umaban}>
            <td>{h.umaban}</td><td><input aria-label={`${h.umaban}番馬名`} className="border p-1 w-32" value={h.name} onChange={e=>setRows(xs=>xs.map((x,j)=>i===j?{...x,name:e.target.value}:x))}/></td>
            <td><input aria-label={`${h.umaban}番着順`} className="border p-1 w-12" inputMode="numeric" value={h.finish} onChange={e=>setRows(xs=>xs.map((x,j)=>i===j?{...x,finish:e.target.value,raceStatus:e.target.value?'':'未入力'}:x))}/></td>
            <td><select aria-label={`${h.umaban}番状態`} className="border p-1" value={h.raceStatus} onChange={e=>setRows(xs=>xs.map((x,j)=>i===j?{...x,raceStatus:e.target.value,finish:e.target.value?'':x.finish}:x))}>{['','未入力','取消','除外','中止','失格'].map(t=><option key={t} value={t}>{t||'着順あり'}</option>)}</select></td>
          </tr>)}</tbody></table></div>
          <label className="text-xs block">参照元・照合メモ<input aria-label="照合根拠" className={input} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="照合した出馬表・結果ページ" /></label>
          <label className="text-xs block my-2"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/> 開催日・出走馬・結果を元データで照合した</label>
          <button disabled={busy||!verified} className="bg-sky-800 disabled:opacity-40 text-white rounded p-2 text-xs" onClick={()=>run(saveResults)}>照合結果を保存</button>
        </>}
      </div>
      <div className={box}>
        <h3 className="font-bold text-sm">買い目と払戻の記録</h3>
        <p className="text-xs">購入{ledger.purchased}組 / 払戻入力済{ledger.settled}組 / 未精算{ledger.pending}組 / 発走時刻未確認{ledger.unverified}組</p>
        <p className="text-xs">精算済み購入額 {ledger.stake}円・払戻 {ledger.payout}円・回収率 {ledger.roi===null?'未集計':(ledger.roi*100).toFixed(1)+'%'}。未精算・参考・見送りは回収率から除外。</p>
        {race&&<>
          <p className="text-xs my-2">対象：{race.title}。購入履歴は追加保存し、購入額・組合せを後から書き換えません。</p>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="券種" className={input} value={bet.type} onChange={e=>setBet(b=>({...b,type:e.target.value}))}>{['単勝','複勝','馬連','ワイド','三連複','三連単'].map(x=><option key={x}>{x}</option>)}</select>
            <input aria-label="買い目" className={input} value={bet.selection} onChange={e=>setBet(b=>({...b,selection:e.target.value}))} placeholder="1組ずつ 例1-2-3"/>
            <select aria-label="購入状態" className={input} value={bet.status} onChange={e=>setBet(b=>({...b,status:e.target.value}))}>{['参考','購入','見送り'].map(x=><option key={x}>{x}</option>)}</select>
            <input aria-label="購入額" className={input} value={bet.stake} onChange={e=>setBet(b=>({...b,stake:e.target.value}))} inputMode="numeric" placeholder="購入額（円）"/>
            <input aria-label="記録時オッズ" className={input} value={bet.odds} onChange={e=>setBet(b=>({...b,odds:e.target.value}))} inputMode="decimal" placeholder="現在確認したオッズ（任意）"/>
          </div>
          <button disabled={busy||race.status==='completed'} onClick={()=>run(saveBet)} className="mt-2 rounded bg-slate-800 p-2 text-xs text-white disabled:opacity-40">買い目を記録</button>
          <label className="text-xs block mt-3">確定払戻の参照元<input aria-label="払戻参照元" className={input} value={payoutSource} onChange={e=>setPayoutSource(e.target.value)}/></label>
          {(race.bets||[]).map((b:any)=><div key={b.id} className="mt-2 border-t pt-2 text-xs"><b>{b.status} / {b.type} {b.selection} / {b.stake}円</b><div>{b.beforeStart?'発走前記録':'発走時刻未確認'} / {b.recordedAt}</div>{b.settlements?.length>0&&<div>払戻 {b.settlements.at(-1).payout}円（訂正履歴{b.settlements.length}件）</div>}{b.status==='購入'&&<div className="flex gap-2"><input aria-label={`払戻${b.id}`} className={input} placeholder="この1組の払戻総額・外れ0" value={payouts[b.id]||''} inputMode="numeric" onChange={e=>setPayouts(x=>({...x,[b.id]:e.target.value}))}/><button disabled={busy} className="shrink-0 underline" onClick={()=>run(()=>settle(b.id))}>払戻保存</button></div>}</div>)}
        </>}
      </div>
    </>}
  </section>;
}
