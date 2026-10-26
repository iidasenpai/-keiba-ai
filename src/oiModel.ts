import {finite,nonStarter,fieldProbabilities} from './modelSafety';
export const OI_MODEL_VERSION='oi-specialist-v1';
export const OI_MODEL_BUILD='oi-specialist-v1-sha256-aa276553a2352e09ae6b320a06d32dd2c7665716d9d375c09516a9b46f346fc0';
export const oiMode=(distance:any)=>[1200,1600].includes(Number(distance))?'大井専用・近走中心':Number(distance)===1400?'1400m・従来計算を継続':'専用検証不足・従来計算を継続';
const median=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
export function oiModel(horses:any[],meta:any){
 if(meta.track!=='大井')return null;
 const d=Number(meta.distance),direct=[1200,1600].includes(d);
 if(!direct)return horses.map(h=>({...h,oiModelVersion:OI_MODEL_VERSION,oiEvidence:{mode:oiMode(d),recent:finite(h._recentIndex),base:finite(h._base),weights:h._coreWeights||{},usableCount:h._recentMeta?.usableCount??null,risks:['この距離の専用配分は未採用・従来計算を使用']}}));
 const at=Date.parse(meta.scheduledStart||meta.referenceAt||''),activeN=horses.filter(h=>!nonStarter(h)).length;
 const rows=horses.map(h=>{
  const recent=finite(h._recentIndex),runs=(Array.isArray(h.recentRuns)?h.recentRuns:[]).slice(0,5).filter(r=>finite(r.index)!==null&&r.surface===meta.surface&&(!(r.date||r.raceDate)||Number.isFinite(at)&&Date.parse((r.date||r.raceDate)+'T00:00:00+09:00')<at));
  const base=nonStarter(h)||recent===null?null:recent;
  const place=base===null?null:activeN>=13&&runs.length>=3?base+.15*(median(runs.map(r=>Number(r.index)))-base):base;
  const risks:string[]=[];
  if(recent===null)risks.push('比較可能な近走指数なし・判断困難');else if(runs.length<3)risks.push('近走3走未満');
  if(runs.some(r=>!r.date&&!r.raceDate))risks.push('近走の日付未確認');
  const parts={recentAdj:0,transferAdj:0,paceAdj:0,jockeyAdj:0,styleCourseAdj:0,trainingAdj:0,commentAdj:0,layoffAdj:0,bodyAdj:0,formAdj:0,reliabilityAdj:0,funabashiAdj:0,suitabilityAdj:0};
  return {...h,_base:base,_coreWeights:{best:0,avg5:base===null?0:1,dist:0,course:0},_contextAdj:0,_contextComponents:parts,_contextScale:1,_contextShrink:1,_rawContextAdj:0,_recentAdj:0,_transferAdj:0,_paceAdj:0,_jockeyLearnAdj:0,_styleCourseAdj:0,_trainingAdj:0,_commentAdj:0,_bodyAdj:0,_formAdj:0,_reliabilityAdj:0,_funabashiAdj:0,_layoffAdj:0,_suitabilityAdj:0,_rawScore:base,_abilityScore:base,_headAdj:0,_marketAnchorAdj:0,_winAdj:0,_placeAdj:0,_himoAdj:place===null||base===null?0:place-base,_winScore:base,_selectionScore:base,_placeScore:place,_finalScore:base,_rank:null,_unknownAbility:base===null&&!nonStarter(h),oiModelVersion:OI_MODEL_VERSION,oiEvidence:{mode:oiMode(d),recent,base,placeScore:place,usableCount:runs.length,weights:{best:0,avg5:1,dist:0,course:0},risks},uncertainty:risks};
 });
 // Ties use horse number only; legacy learning or market support cannot leak into the new ranking.
 const headOrder=rows.filter(h=>h._winScore!==null).sort((a,b)=>b._winScore-a._winScore||Number(a.umaban)-Number(b.umaban));
 const heads=headOrder.slice(0,2),ids=new Set(heads.map(h=>h.id));
 const tail=headOrder.filter(h=>!ids.has(h.id)).sort((a,b)=>b._placeScore-a._placeScore||Number(a.umaban)-Number(b.umaban));
 const ranks=new Map([...heads,...tail].map((h,i)=>[h.id,i+1]));const refs=fieldProbabilities(rows);
 return rows.map(h=>{const rank=ranks.get(h.id)??null,ref=refs.get(String(h.id||h.umaban));return {...h,_rank:rank,_preHimoRank:headOrder.findIndex(x=>x.id===h.id)+1||null,_autoMark:rank&&rank<=6?['◎','○','▲','△','△','☆'][rank-1]:'',_finalScore:rank&&rank<=2?h._winScore:h._placeScore,predictedScore:rank&&rank<=2?h._winScore:h._placeScore,_rankWinRate:null,_rankPlaceRate:null,_winRate:ref?.win??0,_placeRate:ref?.place??0,_probabilityLabel:'未校正のモデル参考率'};});
}
