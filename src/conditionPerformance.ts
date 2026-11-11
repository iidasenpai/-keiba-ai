import {eventKey,finite,nonStarter,verifiedBeforeStart} from './modelSafety';
import {orderedPrediction,predictionView,resultIssues} from './raceIntegrity';
export type PerformanceRow={key:string;track:string;distance:string;surface:string;n:number;wins:number;places:number;top5:number;top5N:number};
export const performanceVersion=(r:any)=>`${r.predictionLock?.modelVersion||'不明'}|${r.predictionLock?.build||'版情報なし'}`;
export const ratio=(n:number,d:number)=>d?n/d:null;
export function wilson(h:number,n:number):[number,number]|null{
 if(!n)return null;const z=1.96,p=h/n,a=1+z*z/n,b=p+z*z/(2*n),c=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return [(b-c)/a,(b+c)/a];
}
export function performanceRecords(records:any[]){
 const excluded={pending:0,unverified:0,invalid:0,duplicate:0,conflict:0};const groups=new Map<string,any[]>();
 for(const r of records){
  if(r.status!=='completed'){excluded.pending++;continue;}
  if(!verifiedBeforeStart(r)){excluded.unverified++;continue;}
  if(!eventKey(r)||!r.track||!/^\d{3,4}$/.test(String(r.distance))||resultIssues(r).length){excluded.invalid++;continue;}
  const k=performanceVersion(r)+'|'+eventKey(r);groups.set(k,[...(groups.get(k)||[]),r]);
 }
 const rows:any[]=[];
 for(const group of groups.values()){
  if(new Set(group.map(r=>r.resultOrder)).size>1||new Set(group.map(r=>`${r.surface||'ダート'}|${r.distance}`)).size>1){excluded.conflict+=group.length;continue;}
  const sorted=group.slice().sort((a,b)=>a.predictionLock.lockedAt.localeCompare(b.predictionLock.lockedAt)||String(a.id).localeCompare(String(b.id)));
  rows.push(sorted[0]);excluded.duplicate+=group.length-1;
 }
 return {rows,excluded};
}
export function aggregatePerformance(records:any[]){
 const map=new Map<string,PerformanceRow>();const total:PerformanceRow={key:'全体',track:'全体',distance:'',surface:'',n:0,wins:0,places:0,top5:0,top5N:0};
 for(const r of records){
  const p=predictionView(r),actual=r.horses.filter(h=>[1,2,3].includes(Number(h.finish))),ranked=orderedPrediction(p.horses).filter(h=>!nonStarter(h));
  const first=actual.find(h=>String(h.umaban)===String(ranked[0]?.umaban)),set=new Set(ranked.slice(0,5).map(h=>String(h.umaban)));
  const surface=r.surface||'ダート',key=`${r.track}|${surface}|${r.distance}`;
  const row=map.get(key)||{key,track:r.track,distance:String(r.distance),surface,n:0,wins:0,places:0,top5:0,top5N:0};
  const eligible=r.horses.filter(h=>!nonStarter(h)).length>5;
  for(const a of [row,total]){a.n++;a.wins+=Number(Number(first?.finish)===1);a.places+=Number(!!first);if(eligible){a.top5N++;a.top5+=Number(actual.every(h=>set.has(String(h.umaban))));}}
  map.set(key,row);
 }
 return {total,conditions:[...map.values()]};
}
export function conditionLabel(r:PerformanceRow,total:PerformanceRow){
 if(r.top5N<30)return '参考・少数';
 const rate=ratio(r.top5,r.top5N),base=ratio(total.top5,total.top5N);
 if(rate===null||base===null)return '比較なし';
 return rate>=base+.05?'全体より高め':rate<=base-.05?'全体より低め':'全体と同程度';
}
