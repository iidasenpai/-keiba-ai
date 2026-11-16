// Read-only summaries. Never used by the prediction engine or persisted as factors.
export type HorseStart={key:string;date:string;track:string;surface:string;distance:number;finish:number|null;status:string;horse:any;stage:number|null};
const nameKey=(v:any)=>String(v||'').normalize('NFKC').replace(/[\s　]/g,'');
const value=(v:any)=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const day=(v:any)=>{const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))?s:'';};
const days=(a:string,b:string)=>(Date.parse(a)-Date.parse(b))/86400000;
export const REFERENCE_MIN=10;
function previousDate(h:any,date:string){return (h.pastRunEvidence||[]).map((r:any)=>day(r.date)).filter((d:string)=>d&&d<date).sort().at(-1)||'';}
function rest(h:any,date:string):boolean|null {const w=value(h.layoffWeeks);if(w!==null&&w>=0)return w>=12;const p=previousDate(h,date);return p?days(date,p)>=84:null;}
export function historyIndex(races:any[]){
 const versions=new Map<string,any>();
 for(const r of races){const d=day(r.raceDate);if(!d||r.status!=='completed')continue;const key=[d,r.track,Number(r.raceNo),r.surface||'ダート'].join('|');if(!r.track||!Number(r.raceNo))continue;
  const old=versions.get(key);if(!old||String(r.updatedAt||r.savedAt||'')>String(old.updatedAt||old.savedAt||''))versions.set(key,r);
 }
 const map=new Map<string,HorseStart[]>();
 for(const [key,r] of versions){for(const h of r.horses||[]){const name=nameKey(h.name);if(!name||['取消','除外','DNS'].includes(h.raceStatus))continue;
  const f=value(h.actualFinish)??value(h.finish);const valid=f!==null&&Number.isInteger(f)&&f>=1&&f<=24;
  // A missing finish is not a loss. Only an explicitly recorded DNF/disqualification is a failure.
  if(!valid&&!['中止','失格'].includes(h.raceStatus))continue;
  const start:HorseStart={key,date:r.raceDate,track:r.track,surface:r.surface||'ダート',distance:Number(r.distance),finish:valid?f:null,status:h.raceStatus||'',horse:h,stage:null};
  const a=map.get(name)||[];if(!a.some(x=>x.key===key))a.push(start);map.set(name,a);
 }}
 for(const a of map.values()){a.sort((x,y)=>x.date.localeCompare(y.date)||x.key.localeCompare(y.key));for(let i=0;i<a.length;i++){const c=a[i],p=a[i-1],r=rest(c.horse,c.date);if(r===true)c.stage=1;else if(r===false&&p&&previousDate(c.horse,c.date)===p.date&&p.stage!==null&&p.stage<3)c.stage=p.stage+1;}}
 return map;
}
export function recordStats(rows:HorseStart[]){const n=rows.length,w=rows.filter(r=>r.finish===1).length,second=rows.filter(r=>r.finish===2).length,third=rows.filter(r=>r.finish===3).length;return {n,w,second,third,other:n-w-second-third,top3:w+second+third,rate:n?(w+second+third)/n:null,reference:n<REFERENCE_MIN};}
export function horseInsights(index:Map<string,HorseStart[]>,horse:any,meta:any){
 const date=day(meta.raceDate),all=index.get(nameKey(horse.name))||[];
 // Date cutoff also excludes today's other starts and the currently viewed saved result.
 const rows=all.filter(r=>date&&r.date<date&&r.surface===(meta.surface||'ダート'));
 const venue=rows.filter(r=>r.track===meta.track),same=venue.filter(r=>r.distance===Number(meta.distance));
 const r=date?rest(horse,date):null,prev=rows.at(-1);let stage:number|null=r===true?1:null;
 if(r===false&&prev&&previousDate(horse,date)===prev.date&&prev.stage!==null&&prev.stage<3)stage=prev.stage+1;
 return {all:recordStats(rows),venue:recordStats(venue),same:recordStats(same),rest:recordStats(rows.filter(r=>r.stage===1)),second:recordStats(rows.filter(r=>r.stage===2)),third:recordStats(rows.filter(r=>r.stage===3)),stage,unclassified:rows.filter(r=>r.stage===null).length};
}
