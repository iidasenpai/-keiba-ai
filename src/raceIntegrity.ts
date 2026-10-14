// Storage and historical predictions are kept separate from live recalculation.
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const number = (v: any) => v === '' || v == null ? null : Number(v);
export function resultIssues(r: any): string[] {
  const hs = r.horses || [], issues: string[] = [];
  for (const key of ['id', 'umaban']) {
    const values = hs.map((h: any) => String(h[key] ?? ''));
    if (values.some((v: string) => !v) || new Set(values).size !== values.length) issues.push(`出走馬${key}不整合`);
  }
  const actual = hs.filter((h: any) => [1,2,3].includes(number(h.finish))).sort((a: any,b: any) => Number(a.finish)-Number(b.finish));
  if (actual.map((h: any) => Number(h.finish)).join('-') !== '1-2-3') issues.push('1〜3着が揃っていません');
  if (String(r.resultOrder || '') !== actual.map((h: any) => h.umaban).join('-')) issues.push('結果順と着順が不一致');
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
  const identity = (r: any) => (r.horses || []).map((h: any) => `${h.id}|${h.umaban}|${h.name}`).sort().join('\n');
  return identity(a) === identity(b);
}
export function predictionView(r: any): any {
  if (!r.predictionLock) return r;
  const finishes = new Map((r.horses || []).map((h: any) => [String(h.id), h.finish]));
  return { ...r, horses: r.predictionLock.horses.map((h: any) => ({ ...h, finish: finishes.get(String(h.id)) || '' })) };
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
export function makeLock(current: any[], modelA: any[], metadata: any, now: string): any {
  if (current.some(h => number(h.finish) !== null)) throw new Error('着順入力済みの予測は事前固定できません');
  const ordered = orderedPrediction(modelA.map(h => ({ ...h, predictedScore: h._finalScore })));
  const modelB = clone(ordered);
  const swapped = modelB.length >= 5 && modelB[3]._finalScore - modelB[4]._finalScore < 0.6;
  if (swapped) [modelB[3],modelB[4]] = [modelB[4],modelB[3]];
  const rows = (hs: any[]) => hs.map((h,i) => ({ id: h.id, umaban: h.umaban, rank: i+1, score: h._finalScore }));
  return { schemaVersion: 1, lockedAt: now, modelVersion: 'nar-safe-v11.0', ...clone(metadata), horses: clone(current), models: {
    current: rows(orderedPrediction(current)),
    A: { version: 'prospective-A-v1', weights: [15,85,0,0], rule: '現行計算・順位補正を共有し基礎重みだけ変更。過去180件の再計算とは別版。', predictions: rows(ordered) },
    B: { version: 'prospective-B-v1', threshold: 0.6, swapped, predictions: rows(modelB) }
  } };
}
export function applyResult(record: any, inputField: any, order: string[], now: string): any {
  if (!sameField(record, inputField)) throw new Error('読込時と出走馬・レースが異なります。新規レースとして保存してください');
  if (order.length !== 3 || new Set(order).size !== 3 || order.some(u => !(record.horses || []).some((h: any) => String(h.umaban) === u))) throw new Error('保存済み出走馬に対応する3頭を入力してください');
  // Never recalculate or sanitize a saved prediction while entering results.
  const base = predictionView(record), horses = base.horses.map((h: any) => ({ ...h, finish: order.includes(String(h.umaban)) ? String(order.indexOf(String(h.umaban))+1) : '' }));
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
export function abSummary(races: any[]) {
  const eligible = races.filter(r => r.status === 'completed' && !resultIssues(r).length && r.predictionLock?.models?.A && r.predictionLock?.models?.B);
  const hit = (r: any, key: string) => {
    const top = new Set(r.predictionLock.models[key].predictions.slice(0,4).map((h: any) => String(h.id)));
    return r.horses.filter((h: any) => [1,2,3].includes(number(h.finish))).every((h: any) => top.has(String(h.id)));
  };
  return { count: eligible.length, a: eligible.filter(r => hit(r,'A')).length, b: eligible.filter(r => hit(r,'B')).length };
}
