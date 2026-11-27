import {writeDetailZip,openDetailZip,FULL_BACKUP_ZIP} from './detailZip';
export async function createFullBackup(state:any,records:any[],progress?:(stage:string,n:number,total:number)=>void){
 const out=await writeDetailZip(records,'',n=>progress?.('作成',n,records.length),{state});
 // Verify one entry at a time and discard it. Do not retain another full copy
 // of the expanded history while the live app already holds all its records.
 const zip=await openDetailZip(out.blob,FULL_BACKUP_ZIP);await zip.readState();
 for(let i=0;i<zip.manifest.files.length;i++){await zip.readRace(zip.manifest.files[i]);progress?.('検証',i+1,records.length);if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));}
 return out.blob;
}
export async function readFullBackup(file:Blob,progress?:(n:number,total:number)=>void){
 const header=new Uint8Array(await file.slice(0,4).arrayBuffer());
 if(header[0]!==0x50||header[1]!==0x4b){
  const data=JSON.parse(await file.text());
  if(data?.type!=='nar-ai-full-backup'||!data.state||!Array.isArray(data.savedRaces))throw Error('地方競馬AIの全データバックアップではありません');
  return data;
 }
 const zip=await openDetailZip(file,FULL_BACKUP_ZIP),state=await zip.readState(),savedRaces:any[]=[];
 for(let i=0;i<zip.manifest.files.length;i++){savedRaces.push(await zip.readRace(zip.manifest.files[i]));progress?.(i+1,zip.manifest.files.length);if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));}
 return {type:'nar-ai-full-backup',version:'1.0.0',exportedAt:zip.manifest.exportedAt,state,savedRaces};
}
