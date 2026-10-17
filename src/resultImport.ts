import {finite,raceInstant} from './modelSafety';
import {applyResult,resultIssues} from './raceIntegrity';
const tracks=['帯広','門別','盛岡','水沢','浦和','船橋','大井','川崎','金沢','笠松','名古屋','園田','姫路','高知','佐賀'];
const name=(v:any)=>String(v||'').normalize('NFKC').replace(/[\s・･]/g,'');
export const resultSignature=(rows:any[])=>JSON.stringify([...rows].sort((a,b)=>Number(a.umaban)-Number(b.umaban)).map(r=>[String(r.umaban),name(r.name),finite(r.finish),String(r.raceStatus||'')]));
export function prepareResultBatch(raw:any,now=Date.now()){
 if(raw?.format!=='nar-result-batch'||raw.version!==1||!Array.isArray(raw.races)||raw.races.length>100||!Array.isArray(raw.errors)||raw.errors.length>100)throw Error('結果ファイルの形式が違います');
 if(typeof raw.raceDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.raceDate)||new Date(raw.raceDate+'T00:00:00Z').toISOString().slice(0,10)!==raw.raceDate)throw Error('開催日が不正です');
 if(!Number.isInteger(raw.expectedTotal)||raw.expectedTotal<1||raw.expectedTotal>100||raw.expectedTotal!==raw.races.length+raw.errors.length)throw Error('対象数と確定・未確定件数が一致しません');
 if(typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt))||Date.parse(raw.createdAt)>now+300000)throw Error('取得日時が不正です');
 const keys=new Set();
 const identify=(r:any)=>{if(!tracks.includes(r?.track)||typeof r.raceNo!=='string'||!/^([1-9]|1[0-2])$/.test(r.raceNo))throw Error('会場・Rが不正です');const key=raw.raceDate+'|'+r.track+'|'+r.raceNo;if(keys.has(key))throw Error('同じレースが重複しています');keys.add(key);return key;};
 const races=raw.races.map(r=>{
  const key=identify(r);if(r.status!=='confirmed'||r.raceDate!==raw.raceDate||!/^\d{3,4}$/.test(r.distance)||!/^\d{12}$/.test(r.sourceRaceId))throw Error('確定結果の開催情報が不正です');
  const day=raw.raceDate.replaceAll('-','');if(r.sourceRaceId.slice(0,4)!==day.slice(0,4)||r.sourceRaceId.slice(6,10)!==day.slice(4)||Number(r.sourceRaceId.slice(-2))!==Number(r.raceNo))throw Error('開催日・Rと元レースIDが不一致です');
  const u=new URL(r.url);if(u.protocol!=='https:'||u.hostname!=='nar.sp.netkeiba.com'||u.pathname!=='/race/race_result.html'||u.searchParams.get('race_id')!==r.sourceRaceId||u.username||u.password||u.port||u.hash)throw Error('結果の参照URLが不正です');
  if(typeof r.fetchedAt!=='string'||!Number.isFinite(Date.parse(r.fetchedAt))||Date.parse(r.fetchedAt)>now+300000)throw Error('結果の取得日時が不正です');
  const start=raceInstant(r.raceDate,r.startTime);if(!start||Date.parse(start)>now||Date.parse(r.fetchedAt)<Date.parse(start))throw Error('発走前または発走時刻不明の結果は取り込めません');
  if(!Array.isArray(r.rows)||r.rows.length<3||r.rows.length>18)throw Error('全頭の結果が必要です');
  const rows=r.rows.map(h=>{if(typeof h.umaban!=='string'||!/^(?:[1-9]|1[0-8])$/.test(h.umaban)||typeof h.name!=='string'||!h.name.trim()||h.name.length>40)throw Error('馬番・馬名が不正です');const f=finite(h.finish);if(f===null&&!['取消','除外','中止','失格'].includes(h.raceStatus))throw Error('未確定・未入力の着順は取り込めません');return {umaban:h.umaban,name:h.name,finish:f,raceStatus:h.raceStatus||''};});
  const nums=new Set(),top=new Set();
  for(const h of rows){if(nums.has(h.umaban))throw Error('馬番が重複しています');nums.add(h.umaban);if(h.finish!==null){if(!Number.isInteger(h.finish)||h.finish<1||h.finish>rows.length||h.raceStatus)throw Error('着順・出走状態が不正です');if(h.finish<=3){if(top.has(h.finish))throw Error('1〜3着の同着は手動照合が必要です');top.add(h.finish);}}}
  if(top.size!==3)throw Error('1〜3着を揃えてください');
  return {key,raceDate:r.raceDate,track:r.track,raceNo:r.raceNo,distance:r.distance,startTime:r.startTime,sourceRaceId:r.sourceRaceId,url:r.url,fetchedAt:r.fetchedAt,rows,signature:resultSignature(rows)};
 });
 const errors=raw.errors.map(r=>{const key=identify(r);if(typeof r.message!=='string'||!r.message.trim()||r.message.length>500)throw Error('未確定レースの説明が不正です');return {key,track:r.track,raceNo:r.raceNo,message:r.message};});
 return {raceDate:raw.raceDate,expectedTotal:raw.expectedTotal,races,errors};
}
export function planResultImport(records:any[],batch:any,now=new Date().toISOString()){
 const actions:any[]=[],skipped:any[]=[];
 for(const result of batch.races){
  const label=`${result.track}${result.raceNo}R`;
  const candidates=records.filter(r=>r.raceDate===result.raceDate&&r.track===result.track&&String(r.raceNo)===result.raceNo);
  if(!candidates.length){skipped.push({label,reason:'保存済み予想なし（結果から予想は作成しません）'});continue;}
  for(const record of candidates){try{
   if(!record.predictionLock)throw Error('固定済み予想がありません。自動反映の対象外です');
   if(String(record.distance)!==result.distance||(record.sourceRaceId&&record.sourceRaceId!==result.sourceRaceId))throw Error('距離・元レースIDが一致しません');
   if(record.status==='completed'&&resultIssues(record).length)throw Error('既存結果に不整合があります。手動照合が必要です');
   if(record.horses.length!==result.rows.length||record.horses.some(h=>!result.rows.some(x=>x.umaban===String(h.umaban)&&name(x.name)===name(h.name))))throw Error('全馬の馬番・馬名が一致しません');
   const order=result.rows.filter(h=>h.finish>=1&&h.finish<=3).sort((a,b)=>a.finish-b.finish).map(h=>h.umaban);
   if(record.status==='completed'){
    if(record.resultOrder!==order.join('-'))throw Error('保存済み結果と異なります。自動で修正しません');
    if(record.horses.some(h=>finite(h.finish)!==null&&finite(h.finish)!==result.rows.find(x=>x.umaban===String(h.umaban)).finish))throw Error('既存の着順と異なります。手動照合が必要です');
    if(record.resultImport?.signature===result.signature){skipped.push({label,id:record.id,reason:'反映済み（変更なし）'});continue;}
   }
   const updated=applyResult(record,record,order,now);
   updated.horses=updated.horses.map(h=>{const actual=result.rows.find(x=>x.umaban===String(h.umaban));return {...h,finish:actual.finish===null?'':String(actual.finish),actualFinish:actual.finish,raceStatus:actual.raceStatus};});
   updated.review=null;
   updated.resultImport={signature:result.signature,url:result.url,fetchedAt:result.fetchedAt,importedAt:now};
   updated.resultVerification={at:now,evidence:result.url,identityVerified:true};
   if(resultIssues(updated).length)throw Error(resultIssues(updated).join(' / '));
   actions.push({label,id:record.id,updated});
  }catch(e){skipped.push({label,id:record.id,reason:e.message});}}
 }
 return {actions,skipped};
}
