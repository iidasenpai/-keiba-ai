import {eventKey,finite,nonStarter,raceInstant} from './modelSafety';
const supplemental=['浦和','船橋','大井','川崎','門別'];
const normalize=(s:any)=>String(s||'').normalize('NFKC').replace(/[\s・･]/g,'');
export function sourceFingerprint(d:any){
 const text=JSON.stringify(Object.keys(d.sources).sort().map(k=>{const p=d.sources[k];return [k,p.meta,p.roster,p.rows,p.text,p.paceText||''];}));
 let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619)>>>0;b=(Math.imul(b,33)^text.charCodeAt(i))>>>0;}
 return text.length+':'+a.toString(16)+':'+b.toString(16);
}
export function missingSupplemental(d:any){return supplemental.includes(d.meta.track)?['training','comment'].filter(k=>!d.sources[k]):[];}
export function savedForDraft(records:any[],d:any){return records.filter(r=>eventKey(r)===eventKey(d.meta));}
export function planDraftUpdate(records:any[],d:any,now=Date.now()){
 const matches=savedForDraft(records,d),record=matches[0];
 const stop=(reason:string)=>({record,canUpdate:false,reason});
 if(!record)return stop('まだ保存されていません');
 if(matches.length!==1)return stop('同じレースの保存が複数あります。保存履歴で確認してください');
 const start=raceInstant(d.meta.raceDate,d.meta.startTime||'');
 if(!start||Date.parse(start)<=now)return stop('発走後・発走時刻不明のため更新できません');
 if(record.status!=='pending'||!record.predictionLock||record.resultOrder||record.firstCompletedAt||record.completedAt||record.resultImport||record.horses.some(h=>finite(h.finish)!==null||finite(h.actualFinish)!==null))return stop('結果登録済み・固定情報不明のため更新できません');
 if(record.sourceRaceId!==d.sourceRaceId||String(record.distance)!==d.meta.distance||record.scheduledStart!==start||(record.surface||'ダート')!==(d.meta.surface||'ダート'))return stop('元レース・距離・発走時刻・馬場種別が一致しません');
 const roster=xs=>xs.map(h=>String(h.umaban)+'|'+normalize(h.name)).sort().join('\n');
 if(roster(record.predictionLock.horses)!==roster(d.sources.race.roster))return stop('保存予想と馬番・馬名が一致しません');
 const old=record.predictionLock,oldKinds=new Set(old.horses.flatMap(h=>(h.inputSources||[]).map(p=>p.kind)));
 if(old.horses.some(h=>finite(h.trainingScore)!==null))oldKinds.add('training');
 if(old.horses.some(h=>String(h.comment||'').trim()))oldKinds.add('comment');
 if([...oldKinds].some(k=>!d.sources[String(k)]))return stop('保存予想より取得項目が減るため更新しません');
 const previousTimes=new Map<string,number>();
 for(const h of old.horses)for(const p of h.inputSources||[]){const at=Date.parse(p.capturedAt);if(Number.isFinite(at))previousTimes.set(p.kind,Math.max(previousTimes.get(p.kind)||0,at));}
 if(Object.entries(d.sources).some(([kind,p]:any)=>Date.parse(p.capturedAt)<(previousTimes.get(kind)||0)))return stop('保存予想より古い取得データには戻しません');
 const key=sourceFingerprint(d);
 if(old.sourceFingerprint===key)return stop('同じ入力で保存済みです');
 if(!old.sourceFingerprint){
  const times=old.horses.flatMap(h=>(h.inputSources||[]).map(p=>Date.parse(p.capturedAt))).filter(Number.isFinite);
  const latest=Math.max(0,...times),newest=Math.max(...Object.values(d.sources).map((p:any)=>Date.parse(p.capturedAt)));
  if(newest<=latest&&Object.keys(d.sources).every(k=>oldKinds.has(k)))return stop('保存予想より新しい入力はありません');
 }
 return {record,canUpdate:true,reason:'新しい入力で再予想できます。変更前の固定予想も履歴に残します'};
}
export function inputWarnings(horses:any[],track:string){
 const active=horses.filter(h=>!nonStarter(h)),warnings:string[]=[];
 if(supplemental.includes(track)){
  const t=active.filter(h=>finite(h.trainingScore)!==null).length,c=active.filter(h=>String(h.comment||'').trim()).length;
  if(t<active.length)warnings.push(`調教入力 ${t}/${active.length}頭`);
  if(c<active.length)warnings.push(`厩舎コメント入力 ${c}/${active.length}頭`);
 }
 const undated=active.filter(h=>(h.recentRuns||[]).some(r=>finite(r.index)!==null&&!r.date&&!r.raceDate)).length;
 if(undated)warnings.push(`近走指数の日付未確認 ${undated}/${active.length}頭（日数による減衰は未適用）`);
 const bestUndated=active.filter(h=>finite(h.best)!==null&&!h.bestDate).length;
 if(bestUndated)warnings.push(`最高指数の日付未確認 ${bestUndated}/${active.length}頭`);
 if(active.some(h=>finite(h._base)===null))warnings.push('指数不足の馬が含まれます');
 return warnings;
}
