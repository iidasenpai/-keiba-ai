import {finite,nonStarter} from './modelSafety';
export const OI_PEAK_VERSION='oi-peak3-tail-v1';
export const OI_PEAK_RULE='大井1200/1600m限定。現行◎○固定。保存近5走から、同じ芝ダ・地方・日付確認済み・発走前の実績を保存順に最大3走選び、2走以上なら(最高指数−現行近走指数)×0.25を3番手以下の現行点に加算。人気・オッズ・馬体重不使用。未知馬に点を作らない。未採用の比較候補。';
// Pure prospective candidate: do not mutate the current model or reconstruct old locks.
export function oiPeakCandidate(horses:any[],meta:any):any[]|null {
 if(meta.track!=='大井'||![1200,1600].includes(Number(meta.distance)))return null;
 const at=Date.parse(String(meta.scheduledStart||''));
 const ranked=horses.filter(h=>!nonStarter(h)&&finite(h._rank)!==null&&finite(h._finalScore)!==null).slice().sort((a,b)=>Number(a._rank)-Number(b._rank));
 const heads=ranked.slice(0,2),headIds=new Set(heads.map(h=>String(h.id)));
 const evidence=new Map<string,any>();
 const scores=new Map<string,number>();
 for(const h of ranked){
  const base=Number(h._finalScore),recent=finite(h._recentIndex),head=headIds.has(String(h.id));
  const runs=(Array.isArray(h.recentRuns)?h.recentRuns:[]).slice(0,5).filter(r=>{
   const date=String(r.date||'');const time=Date.parse(date+'T00:00:00+09:00');
   return finite(r.index)!==null&&r.surface===meta.surface&&r.source!=='JRA'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(time)&&Number.isFinite(at)&&time<at;
  }).slice(0,3);
  const peak=runs.length>=2?Math.max(...runs.map(r=>Number(r.index))):null;
  const adj=!head&&recent!==null&&peak!==null ? .25*(peak-recent) : 0;
  scores.set(String(h.id),base+adj);
  evidence.set(String(h.id),{version:OI_PEAK_VERSION,headFixed:head,base,recent,peak,adjustment:adj,eligibleCount:runs.length,runs:runs.map(r=>({date:r.date,index:Number(r.index),track:r.track,distance:r.distance,source:r.source,surface:r.surface}))});
 }
 const tail=ranked.slice(2).sort((a,b)=>scores.get(String(b.id))!-scores.get(String(a.id))!||Number(a.umaban)-Number(b.umaban));
 const ranks=new Map([...heads,...tail].map((h,i)=>[String(h.id),i+1]));
 return horses.map(h=>{
  const rank=ranks.get(String(h.id))??null,score=rank===null?null:scores.get(String(h.id))!;
  return {...h,_rank:rank,_finalScore:score,predictedScore:score,_autoMark:rank&&rank<=6?['◎','○','▲','△','△','☆'][rank-1]:'',oiPeakEvidence:evidence.get(String(h.id))||{version:OI_PEAK_VERSION,adjustment:0,reason:'現行で採点なし・取消除外'}};
 });
}
