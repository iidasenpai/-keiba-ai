import {NAGOYA_MIX_VERSION,SONODA_AUX_VERSION} from './venueEvaluation';
import {venueCandidate} from './venueCandidate';
import {OI_MODEL_BUILD,OI_MODEL_VERSION} from './oiModel';
import {TRAINING_CANDIDATE_VERSION} from './structuredTraining';
// Storage and historical predictions are kept separate from live recalculation.
import { finite, MODEL_VERSION, MODEL_BUILD, modelRows, instant, nonStarter, validateFullResults } from './modelSafety';
import {CONDITION_VERSION} from './conditionCandidate';
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const number = finite;
export function resultIssues(r: any): string[] {
  const hs = r.horses || [], issues: string[] = [];
  if(r.evaluationExcluded) issues.push('結果照合済み・過去予想の対象未確認（成績対象外）');
  for (const key of ['id', 'umaban']) {
    const values = hs.map((h: any) => String(h[key] ?? ''));
    if (values.some((v: string) => !v) || new Set(values).size !== values.length) issues.push(`出走馬${key}不整合`);
  }
  const actual = hs.filter((h: any) => [1,2,3].includes(number(h.finish))).sort((a: any,b: any) => Number(a.finish)-Number(b.finish));
  if (actual.map((h: any) => Number(h.finish)).join('-') !== '1-2-3') issues.push('1〜3着が揃っていません');
  if (String(r.resultOrder || '') !== actual.map((h: any) => h.umaban).join('-')) issues.push('結果順と着順が不一致');
  if(actual.some((h:any)=>nonStarter(h)||['中止','失格'].includes(h.raceStatus)))issues.push('着順と出走状態が不一致');
  if (r.review?.actual) {
    const old = [...r.review.actual].sort((a: any,b: any) => Number(a.finish)-Number(b.finish));
    if (old.length !== 3 || old.some((h: any,i: number) => !actual[i] || h.id !== actual[i].id || h.name !== actual[i].name || String(h.umaban) !== String(actual[i].umaban))) issues.push('保存回顧と出走馬が不一致');
  }
  if (r.predictionLock) {
    if (!sameField(r, { ...r, horses: r.predictionLock.horses })) issues.push('固定予測と出走馬が不一致');
    if (!(r.predictionLock.lockedAt <= (r.firstCompletedAt || r.completedAt || ''))) issues.push('予測固定日時が結果確定後');
  }
  return issues;
}
export function sameField(a: any, b: any): boolean {
  if (['track','distance','raceNo'].some(k => String(a[k] ?? '') !== String(b[k] ?? ''))) return false;
  if(a.raceDate&&b.raceDate&&a.raceDate!==b.raceDate)return false;
  if(a.sourceRaceId&&b.sourceRaceId&&a.sourceRaceId!==b.sourceRaceId)return false;
  const identity = (r: any) => (r.horses || []).map((h: any) => `${h.id}|${h.umaban}|${h.name}`).sort().join('\n');
  return identity(a) === identity(b);
}
export function predictionView(r: any): any {
  if (!r.predictionLock) return r;
  const actual = new Map<string,any>((r.horses || []).map((h: any) => [String(h.id), h]));
  return { ...r, horses: r.predictionLock.horses.map((h: any) => ({ ...h, finish: actual.get(String(h.id))?.finish || '', actualFinish:actual.get(String(h.id))?.actualFinish??null, raceStatus:actual.get(String(h.id))?.raceStatus??h.raceStatus??'' })) };
}
export function orderedPrediction(horses: any[]): any[] {
  return [...horses].filter(h => number(h.predictedScore) !== null || number(h._rank) !== null).sort((a,b) => {
    const ar = number(a._rank), br = number(b._rank);
    if (ar !== null && br !== null) return ar-br;
    if (ar !== null) return -1;
    if (br !== null) return 1;
    return Number(b.predictedScore)-Number(a.predictedScore) || String(a.id).localeCompare(String(b.id));
  });
}
export function chronological(races: any[]): any[] {
  return [...races].sort((a,b) => String(a.firstCompletedAt || a.completedAt || a.savedAt || '').localeCompare(String(b.firstCompletedAt || b.completedAt || b.savedAt || '')) || String(a.id).localeCompare(String(b.id)));
}
export function makeLock(current: any[], modelA: any[], metadata: any, now: string, candidates: any = {}): any {
  if (current.some(h => number(h.finish) !== null || number(h.actualFinish)!==null)) throw new Error('着順入力済みの予測は事前固定できません');
  if(current.some(h=>!String(h.name||'').trim()))throw new Error('馬名が未照合です。出馬表を確認してください');
  if(current.some(h=>!h.id||!Number.isInteger(number(h.umaban))||Number(h.umaban)<1)||new Set(current.map(h=>String(h.id))).size!==current.length||new Set(current.map(h=>String(h.umaban))).size!==current.length)throw new Error('出走馬ID・馬番が重複または不正です');
  if (!metadata.track && ['UrawaCondition','UrawaConditionAux'].some(k=>Array.isArray(candidates[k])&&candidates[k].length)) throw new Error('比較候補の保存に競馬場情報が必要です');
  const start=instant(metadata.scheduledStart);
  if(start!==null&&(instant(now) as number)>=start)throw new Error('発走後の予測は事前固定できません');
  const ordered = orderedPrediction(modelA.map(h => ({ ...h, predictedScore: h._finalScore })));
  const rows = (hs: any[]) => hs.map((h,i) => ({ id: h.id, umaban: h.umaban, rank: i+1, score: h._finalScore }));
  return { ...clone(metadata), schemaVersion: 2, lockedAt: now, modelVersion: MODEL_VERSION, build:metadata.track==='大井'&&[1200,1600].includes(Number(metadata.distance))?OI_MODEL_BUILD:MODEL_BUILD, horses: clone(current), models: {
    current: rows(orderedPrediction(current)),
    ...(metadata.track==='大井'&&[1200,1600].includes(Number(metadata.distance))?{OiModel:{version:OI_MODEL_VERSION,predictions:rows(orderedPrediction(current)),diagnostics:current.map(h=>({umaban:h.umaban,...h.oiEvidence}))}}:{}),
    ...(metadata.track==='大井'&&Array.isArray(candidates.OiBaseline)?{OiBaseline:{version:'oi-baseline-v1',rule:'同時保存した共通入力の従来計算。専用版と同じ学習履歴の範囲を参照。',predictions:rows(orderedPrediction(candidates.OiBaseline))}}:{}),
    ...(metadata.track==='名古屋'&&Array.isArray(candidates.NagoyaHeadRecent)?{NagoyaHeadRecent:{version:NAGOYA_MIX_VERSION,rule:'現行◎を固定し、残りを近走指数順で選ぶ。未採用の比較候補。',predictions:rows(orderedPrediction(candidates.NagoyaHeadRecent))}}:{}),
    ...(metadata.track==='園田'&&Array.isArray(candidates.SonodaAux)?{SonodaAux:{version:SONODA_AUX_VERSION,rule:'園田の今回分の取得証拠がある調教±1・コメント±0.5。未採用。',predictions:rows(orderedPrediction(candidates.SonodaAux)),diagnostics:candidates.SonodaAux.map(h=>({umaban:h.umaban,...h.sonodaAuxEvidence}))}}:{}),
    A: { version: 'prospective-A-v12', weights: [15,85,0,0], rule: 'v12修正済み補正を共有し基礎重みだけ変更。旧Aとは別集計。', predictions: rows(ordered), diagnostics:modelA.map(h=>({id:h.id,base:h._base,coreWeights:h._coreWeights,context:h._contextComponents,contextScale:h._contextScale,rawScore:h._rawScore,winScore:h._winScore,placeScore:h._placeScore,headAdj:h._headAdj,marketAdj:h._marketAnchorAdj,winAdj:h._winAdj,placeAdj:h._placeAdj,himoAdj:h._himoAdj})) },
    ...(venueCandidate(metadata.track)==='Recent'?{VenueCandidate:{version:'venue-candidate-v1',rule:'会場別の近走指数のみ・検証候補',predictions:modelRows(current)}}:venueCandidate(metadata.track)==='Balanced'&&Array.isArray(candidates.Balanced)?{VenueCandidate:{version:'venue-candidate-v1',rule:'会場別の近走70候補・検証用',predictions:rows(orderedPrediction(candidates.Balanced))}}:{}),
    Recent: {version:'recent-only-v12',rule:'保存近走指数のみ・補正なし',predictions:modelRows(current)},
    Place: {version:'place-v12',rule:'保存PLACEスコア順・参考候補',predictions:modelRows(current,'_placeScore')},
    ...Object.fromEntries(['Simple85','Simple85Core'].filter(k=>Array.isArray(candidates[k])).map(k=>[k,{version:k==='Simple85'?'simple85-v12.7':'simple85-v12.7-core',weights:[15,85,0,0],rule:k==='Simple85'?'近走85・最高15、調教±1・コメント±0.5・展開±1、合計±2。人気・体重・順位学習補正なし。':'同じ基礎点のみ、補助点なし。',predictions:rows(orderedPrediction(candidates[k])),diagnostics:candidates[k].map(h=>({umaban:h.umaban,...h.candidateEvidence}))}])),
    ...Object.fromEntries(['UrawaCondition','UrawaConditionAux'].filter(k=>metadata.track==='浦和'&&Array.isArray(candidates[k])).map(k=>[k,{version:CONDITION_VERSION+(k.endsWith('Aux')?'-aux':''),rule:'同馬場・同距離帯・距離±200mの地方近走のみ。近走85・条件内最高15を証拠量で出走馬の中央値へ縮小。補助候補のみ調教±1・コメント±0.5。',predictions:rows(orderedPrediction(candidates[k]).filter(h=>finite(h._finalScore)!==null)),diagnostics:candidates[k].map(h=>({umaban:h.umaban,...h.candidateEvidence}))}])),
    ...(Array.isArray(candidates.Training)?{Training:{version:TRAINING_CANDIDATE_VERSION,rule:'現行の基礎・既存補正を維持し、構造化調教の候補補正のみ追加。今回の時計に紐づく短評分類±0.35、条件一致の時計比較は4頭以上で±0.25以内、合計±0.6。未取得・時計なし・前走以前・区間不明は時計補正0。未採用。',predictions:rows(orderedPrediction(candidates.Training)),diagnostics:candidates.Training.map(h=>({umaban:h.umaban,...h.trainingCandidateEvidence}))}}:{}),
    ...(Array.isArray(candidates.Balanced)?{Balanced:{version:'balanced-v12.6',weights:[15,70,7.5,7.5],rule:'近走70・最高15・距離7.5・コース7.5。現モデルとは別の検証候補。',predictions:rows(orderedPrediction(candidates.Balanced)),diagnostics:candidates.Balanced.map(h=>({umaban:h.umaban,base:h._base,coreWeights:h._coreWeights,score:h._finalScore}))}}:{})
  } };
}
export function applyResult(record: any, inputField: any, order: string[], now: string): any {
  if(instant(record.scheduledStart)!==null&&(instant(now) as number)<(instant(record.scheduledStart) as number))throw new Error('予定発走前の結果は保存できません');
  if (!sameField(record, inputField)) throw new Error('読込時と出走馬・レースが異なります。新規レースとして保存してください');
  if (order.length !== 3 || new Set(order).size !== 3 || order.some(u => !(record.horses || []).some((h: any) => String(h.umaban) === u))) throw new Error('保存済み出走馬に対応する3頭を入力してください');
  // Never recalculate or sanitize a saved prediction while entering results.
  const base = predictionView(record), horses = base.horses.map((h: any) => ({ ...h, finish: order.includes(String(h.umaban)) ? String(order.indexOf(String(h.umaban))+1) : record.resultOrder===order.join('-')?h.finish||'':'' }));
  const corrected = record.status === 'completed' && record.resultOrder !== order.join('-');
  const history = [...(record.resultHistory || [])];
  if (corrected) history.push({ revisedAt: now, resultOrder: record.resultOrder, horses: clone(record.horses), review: clone(record.review || null), learningChanges: clone(record.learningChanges || {}) });
  return { ...record, horses, resultOrder: order.join('-'), status: 'completed', firstCompletedAt: record.firstCompletedAt || record.completedAt || now, completedAt: record.completedAt || now, resultUpdatedAt: now, updatedAt: now, resultRevision: Number(record.resultRevision || 0) + (corrected ? 1 : 0), resultHistory: history };
}
export function mergeImport(existing: any[], incoming: any[]): any[] {
  const seen = new Set(existing.map(r => r.id));
  const merged = [...existing];
  for (const r of incoming) {
    if (!r.id || !Array.isArray(r.horses)) throw new Error('バックアップ内のレース形式が不正です');
    if (!seen.has(r.id)) { merged.push(clone(r)); seen.add(r.id); }
  }
  return merged;
}
// Explicitly verified manual repair. The original prediction and result remain in history.
// A repaired legacy result cannot establish which race an old prediction belonged to.
export function repairLegacyResult(record:any, rows:any[],metadata:any,now:string):any {
  if(!metadata.identityVerified||!String(metadata.evidence||'').trim())throw new Error('元出馬表の照合と参照元が必要です');
  validateFullResults(record.horses,rows);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(metadata.raceDate||''))throw new Error('開催日を確認してください');
  if(record.predictionLock?.raceDate&&metadata.raceDate!==record.predictionLock.raceDate)throw new Error('固定予想の開催日は変更できません。対象レースを確認してください');
  const mapped=record.horses.map((h:any)=>{const row=rows.find((x:any)=>String(x.umaban)===String(h.umaban));return {...h,name:row.name||h.name,finish:String(row.finish||''),actualFinish:finite(row.finish),raceStatus:row.raceStatus||''};});
  const order=mapped.filter((h:any)=>[1,2,3].includes(Number(h.finish))).sort((a:any,b:any)=>Number(a.finish)-Number(b.finish)).map((h:any)=>String(h.umaban));
  if(order.length!==3||new Set(order).size!==3)throw new Error('1〜3着を確認してください');
  return {...record,raceDate:metadata.raceDate||record.raceDate,sourceName:metadata.sourceName||record.sourceName,
    horses:mapped,resultOrder:order.join('-'),status:'completed',completedAt:record.completedAt||now,
    firstCompletedAt:record.firstCompletedAt||record.completedAt||now,resultUpdatedAt:now,updatedAt:now,
    review:null,resultRevision:Number(record.resultRevision||0)+1,
    resultHistory:[...(record.resultHistory||[]),{revisedAt:now,reason:'verified-result-repair',evidence:metadata.evidence,original:clone({...record,resultHistory:undefined})}],
    evaluationExcluded:record.evaluationExcluded||(!record.predictionLock&&(resultIssues(record).length||rows.some(x=>x.name!==record.horses.find(h=>String(h.umaban)===String(x.umaban))?.name))?'過去予想と出馬表の対応未確認':undefined),
    resultVerification:{at:now,evidence:metadata.evidence,identityVerified:true}};
}
export function abSummary(races: any[]) {
  const eligible = races.filter(r => r.status === 'completed' && !resultIssues(r).length && r.predictionLock?.models?.A && r.predictionLock?.models?.B);
  const hit = (r: any, key: string) => {
    const top = new Set(r.predictionLock.models[key].predictions.slice(0,4).map((h: any) => String(h.id)));
    return r.horses.filter((h: any) => [1,2,3].includes(number(h.finish))).every((h: any) => top.has(String(h.id)));
  };
  return { count: eligible.length, a: eligible.filter(r => hit(r,'A')).length, b: eligible.filter(r => hit(r,'B')).length };
}
