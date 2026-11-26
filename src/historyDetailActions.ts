import {compactDetailRecord,detailDigest,detailEligible,restoreDetailRecord,detailCutoff} from './historyDetails';
import {openDetailZip} from './detailZip';
import {shareArchiveEvidence} from './archiveMemory';
export async function applyDetailZip(records:any[],zip:Awaited<ReturnType<typeof openDetailZip>>,restore=false){
 const ids=new Map(records.map(r=>[r.id,r]));if(ids.size!==records.length)throw Error('保存IDが重複しています');
 const changes=new Map<string,any>();
 // Complete every verification before returning a replacement. A bad final
 // entry cannot leave the first entries partially compacted in storage.
 for(const item of zip.manifest.files){
  const original=await zip.readRace(item),current=ids.get(item.id);
  if(!current){if(restore)continue;throw Error('ZIPにあるレースが現在の保存データにありません');}
  if(restore){if(current.detailArchive?.archiveId===zip.manifest.archiveId)changes.set(current.id,shareArchiveEvidence(restoreDetailRecord(current,original,zip.manifest.archiveId)));}
  else{
   if(!detailEligible(current,zip.manifest.cutoff)||!detailEligible(current,detailCutoff())||await detailDigest(current)!==item.digest)throw Error('ZIP保存後にレースが更新されたか、退避対象日が一致しません。ZIPを作り直してください');
   const next=compactDetailRecord(current,zip.manifest.archiveId,zip.manifest.cutoff);if(next!==current)changes.set(current.id,shareArchiveEvidence(next));
  }
 }
 return {records:records.map(r=>changes.get(r.id)||r),count:changes.size};
}
