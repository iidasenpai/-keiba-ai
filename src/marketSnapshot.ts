// 市場情報(単勝オッズ・人気)の固定保存。採点への使用設定(marketOn / oddsOn)とは独立。
// - lockedAt(予想を固定した時刻)と capturedAt(オッズを取得した時刻)は別々に保存する。
// - 時刻の根拠がなければ capturedAt は null、basis は 'unknown'。推測で補わない。
// - 全頭分の取得状況・欠損理由を残す。欠けていれば市場候補は「生成不可」と記録する。
// - 空データで既存の市場情報を上書きしない(mergeMarketSnapshots)。
export const MARKET_SNAPSHOT_VERSION = 'market-snapshot-v1';
export const MARKET_ISSUE_LIMIT = 30;
export const MARKET_ATTEMPT_LIMIT = 20;

const NON_STARTER = ['取消', '除外', 'DNS'];
const isNonStarter = (status: any) => NON_STARTER.includes(String(status ?? ''));

// 旧形式(文字列)・新形式(数値/null/未指定)を同じ文字列表現にそろえる。値の解釈はしない。
export function marketText(v: any, max = 100): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'string') return v.length > max ? '' : v;
  return '';
}

export function validOdds(v: any): number | null {
  const text = marketText(v).replace(/,/g, '').trim();
  if (!/^\d{1,4}(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 1 && n < 10000 ? n : null;
}

export function validPopularity(v: any): number | null {
  const text = marketText(v).trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 20 ? n : null;
}

export function isoOrNull(v: any): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export type MarketRowStatus = 'ok' | 'missing' | 'invalid' | 'scratched';

export interface MarketRow {
  umaban: string;
  name: string;
  odds: string;
  ninki: string;
  raceStatus: string;
  captureStatus: MarketRowStatus;
  missingReason: string | null;
}

export interface MarketSnapshot {
  version: string;
  status: 'complete' | 'partial' | 'missing';
  source: { name: string | null; url: string | null };
  capturedAt: string | null;
  capturedAtBasis: 'declared' | 'page' | 'unknown';
  siteUpdatedAt: string | null;
  siteUpdatedAtBasis: 'declared' | 'unknown';
  rows: MarketRow[];
  counts: { total: number; starters: number; scratched: number; withOdds: number; withPopularity: number; missing: number; invalid: number };
  issues: string[];
  missingReason: string | null;
  attempts?: any[];
}

export interface BuildMarketInput {
  rows: any[];
  capturedAt?: any;          // 取得時刻の根拠(market.capturedAt)。無ければ pageCapturedAt を弱い根拠として使う。
  pageCapturedAt?: any;      // 出馬表ページ全体の取得時刻(旧形式)。同じページのオッズ取得時刻とみなす。
  siteUpdatedAt?: any;
  sourceName?: any;
  sourceUrl?: any;
  missingReason?: any;
}

// 出走馬全頭分の取得状況を作る。値が無い/不正でも例外にしない(理由を残して続行)。
export function buildMarketSnapshot(input: BuildMarketInput): MarketSnapshot {
  const reason = typeof input.missingReason === 'string' && input.missingReason.trim() ? input.missingReason.trim().slice(0, 200) : null;
  const rows: MarketRow[] = (input.rows || []).map((r: any) => {
    const odds = marketText(r?.odds), ninki = marketText(r?.ninki), raceStatus = marketText(r?.raceStatus);
    const rowReason = typeof r?.oddsMissingReason === 'string' && r.oddsMissingReason.trim() ? r.oddsMissingReason.trim().slice(0, 200) : null;
    let captureStatus: MarketRowStatus;
    if (isNonStarter(raceStatus)) captureStatus = 'scratched';
    else if (odds.trim() === '') captureStatus = 'missing';
    else if (validOdds(odds) === null) captureStatus = 'invalid';
    else captureStatus = 'ok';
    return {
      umaban: marketText(r?.umaban), name: marketText(r?.name), odds, ninki, raceStatus, captureStatus,
      missingReason: captureStatus === 'ok' || captureStatus === 'scratched' ? null : rowReason || reason || '理由未記載'
    };
  });
  const starters = rows.filter(r => r.captureStatus !== 'scratched');
  const withOdds = starters.filter(r => r.captureStatus === 'ok').length;
  const withPopularity = starters.filter(r => r.captureStatus === 'ok' && validPopularity(r.ninki) !== null).length;
  const missing = starters.filter(r => r.captureStatus === 'missing').length;
  const invalid = starters.filter(r => r.captureStatus === 'invalid').length;
  const counts = { total: rows.length, starters: starters.length, scratched: rows.length - starters.length, withOdds, withPopularity, missing, invalid };
  const issues: string[] = [];
  if (starters.length === 0) issues.push('出走馬がありません');
  if (missing) issues.push(`オッズ未取得 ${missing}/${starters.length}頭`);
  if (invalid) issues.push(`オッズ不正 ${invalid}/${starters.length}頭`);
  if (withOdds > withPopularity) issues.push(`人気未取得または不正 ${withOdds - withPopularity}/${withOdds}頭`);
  const status: MarketSnapshot['status'] = withOdds === 0 ? 'missing' : withOdds === starters.length && withPopularity === starters.length ? 'complete' : 'partial';
  const declared = isoOrNull(input.capturedAt), page = isoOrNull(input.pageCapturedAt);
  // オッズが1頭も無いとき、取得時刻はオッズ取得の証拠にならないので持たせない。
  const capturedAt = withOdds === 0 ? null : declared || (input.capturedAt === undefined ? page : null);
  const siteUpdatedAt = isoOrNull(input.siteUpdatedAt);
  return {
    version: MARKET_SNAPSHOT_VERSION,
    status,
    source: { name: typeof input.sourceName === 'string' ? input.sourceName.slice(0, 100) : null, url: typeof input.sourceUrl === 'string' ? input.sourceUrl.slice(0, 500) : null },
    capturedAt,
    capturedAtBasis: capturedAt === null ? 'unknown' : declared ? 'declared' : 'page',
    siteUpdatedAt,
    siteUpdatedAtBasis: siteUpdatedAt === null ? 'unknown' : 'declared',
    rows, counts,
    issues: issues.slice(0, MARKET_ISSUE_LIMIT),
    missingReason: reason
  };
}

export type MarketTiming = 'pre-start-verified' | 'capture-time-unknown' | 'captured-after-lock' | 'captured-after-start' | 'start-time-unknown' | 'locked-after-start';

// capturedAt <= lockedAt < 発走時刻 を確認する。満たさない/確認できない場合は理由を返す。
export function marketTiming(snapshot: MarketSnapshot | null | undefined, lockedAt: any, scheduledStart: any): MarketTiming {
  const captured = Date.parse(String(snapshot?.capturedAt ?? '')), locked = Date.parse(String(lockedAt ?? '')), start = Date.parse(String(scheduledStart ?? ''));
  if (!Number.isFinite(captured)) return 'capture-time-unknown';
  if (!Number.isFinite(locked)) return 'capture-time-unknown';
  if (!Number.isFinite(start)) return 'start-time-unknown';
  if (captured >= start) return 'captured-after-start';
  if (captured > locked) return 'captured-after-lock';
  if (locked >= start) return 'locked-after-start';
  return 'pre-start-verified';
}

const TIMING_REASON: Record<MarketTiming, string> = {
  'pre-start-verified': '',
  'capture-time-unknown': 'オッズ取得時刻が不明です',
  'captured-after-lock': 'オッズ取得が予想固定より後です',
  'captured-after-start': 'オッズ取得が発走後です',
  'start-time-unknown': '発走時刻が不明で、取得が発走前か確認できません',
  'locked-after-start': '予想固定が発走後です'
};

export interface MarketCandidateStatus { usable: boolean; reason: string | null; timing: MarketTiming }

// 市場を使う候補(市場のみ・市場+モデル)を作れるか。欠けていれば「生成不可」と理由を返す。
export function marketCandidateStatus(snapshot: MarketSnapshot | null | undefined, timing: MarketTiming): MarketCandidateStatus {
  if (!snapshot) return { usable: false, reason: '生成不可: 市場情報が保存されていません', timing };
  if (snapshot.status !== 'complete') return { usable: false, reason: `生成不可: 全頭のオッズ・人気がそろっていません(${snapshot.issues.join('、') || snapshot.missingReason || '理由未記載'})`, timing };
  if (timing !== 'pre-start-verified') return { usable: false, reason: `生成不可: ${TIMING_REASON[timing]}`, timing };
  return { usable: true, reason: null, timing };
}

// 市場情報の優劣。取得時刻の新旧より先に「全頭そろっているか」を見る。
const rank = (s: MarketSnapshot | null | undefined) => (!s ? -1 : s.status === 'complete' ? 2 : s.status === 'partial' ? 1 : 0);

export interface MergeResult { snapshot: MarketSnapshot | null; adopted: 'incoming' | 'existing' | 'none'; reason: string }

// 取得失敗・欠損の再取得で、既存の市場情報を空データや劣るデータで上書きしない。
// 採用条件: 取得できた頭数が既存以上、かつ(取得時刻が既存以後 または 既存の時刻が不明)。
export function mergeMarketSnapshots(existing: MarketSnapshot | null | undefined, incoming: MarketSnapshot | null | undefined, now: string = new Date().toISOString()): MergeResult {
  const note = (snap: MarketSnapshot, outcome: string, reason: string) => ({
    ...snap,
    attempts: [...(existing?.attempts || []), { at: now, incomingStatus: incoming?.status ?? 'none', incomingCapturedAt: incoming?.capturedAt ?? null, withOdds: incoming?.counts.withOdds ?? 0, outcome, reason }].slice(-MARKET_ATTEMPT_LIMIT)
  });
  if (!incoming && !existing) return { snapshot: null, adopted: 'none', reason: '市場情報なし' };
  if (!incoming) return { snapshot: existing!, adopted: 'existing', reason: '新しい取得なし。既存を保持' };
  if (!existing || existing.counts.withOdds === 0) {
    return { snapshot: note(incoming, 'adopted', existing ? '既存はオッズなし' : '初回取得'), adopted: 'incoming', reason: existing ? '既存はオッズなし' : '初回取得' };
  }
  if (marketIdentity(existing.rows) !== marketIdentity(incoming.rows)) return {snapshot: note(incoming, 'adopted', '出走馬が変わったため今回の取得を採用'), adopted: 'incoming', reason: '出走馬が変わったため今回の取得を採用'};
  if (incoming.counts.withOdds === 0) {
    return { snapshot: note(existing, 'kept-existing', '新しい取得にオッズがないため既存を保持'), adopted: 'existing', reason: '新しい取得にオッズがないため既存を保持' };
  }
  if (rank(incoming) < rank(existing) || incoming.counts.withOdds < existing.counts.withOdds) {
    return { snapshot: note(existing, 'kept-existing', '新しい取得の方が欠けているため既存を保持'), adopted: 'existing', reason: '新しい取得の方が欠けているため既存を保持' };
  }
  if (existing.capturedAt && !incoming.capturedAt) return {snapshot: note(existing, 'kept-existing', '取得時刻不明のデータには置き換えない'), adopted: 'existing', reason: '取得時刻不明のデータには置き換えない'};
  const a = Date.parse(String(incoming.capturedAt ?? '')), b = Date.parse(String(existing.capturedAt ?? ''));
  if (Number.isFinite(a) && Number.isFinite(b) && a < b) {
    return { snapshot: note(existing, 'kept-existing', '新しい取得の方が古い取得時刻のため既存を保持'), adopted: 'existing', reason: '新しい取得の方が古い取得時刻のため既存を保持' };
  }
  return { snapshot: note(incoming, 'adopted', '同等以上の内容で新しい取得'), adopted: 'incoming', reason: '同等以上の内容で新しい取得' };
}

// 取り込み時に、既存の下書き馬データの市場項目(odds/ninki)を保持する。馬番+馬名が一致する馬だけ。
export function keepExistingMarketOnHorses(incomingHorses: any[], existingHorses: any[]): any[] {
  const key = (h: any) => `${h?.umaban}|${String(h?.name ?? '').normalize('NFKC').replace(/[\s・･]/g, '')}`;
  const old = new Map((existingHorses || []).map(h => [key(h), h]));
  return incomingHorses.map(h => {
    const o = old.get(key(h));
    return o ? { ...h, odds: marketText(o.odds), ninki: marketText(o.ninki) } : h;
  });
}

const marketIdentity = (rows:any[]) => JSON.stringify(rows.map(h=>[String(h.umaban),String(h.name).normalize('NFKC').replace(/[\s・･]/g,'')]).sort((a,b)=>Number(a[0])-Number(b[0])));
const marketValues = (rows:any[]) => JSON.stringify(rows.map(h=>[String(h.umaban),String(h.name),marketText(h.odds),marketText(h.ninki),marketText(h.raceStatus)]).sort((a,b)=>Number(a[0])-Number(b[0])));

// 馬データの inputSources に入れる市場の取得情報(kind='market')。
export function marketSourceEntry(snapshot: MarketSnapshot | null | undefined): any | null {
  if (!snapshot) return null;
  return {
    valuesSignature: marketValues(snapshot.rows),
    kind: 'market', url: snapshot.source.url, source: snapshot.source.name, capturedAt: snapshot.capturedAt, capturedAtBasis: snapshot.capturedAtBasis,
    siteUpdatedAt: snapshot.siteUpdatedAt, status: snapshot.status, missingReason: snapshot.missingReason,
    ...(snapshot.attempts ? { attempts: snapshot.attempts } : {})
  };
}

// 保存する馬データ(oddsが入っている)から、固定用のスナップショットを作る。
// 全頭の取得証拠と市場値が一致する場合だけ取得時刻を使用する。ページ時刻だけの過去データは不明。
export function snapshotFromHorses(horses: any[], sourceName?: string | null): MarketSnapshot {
  const entries = (horses || []).flatMap(h => h?.inputSources || []);
  const markets = (horses || []).map(h => (h.inputSources || []).find((p:any) => p?.kind === 'market'));
  const market = markets[0];
  const matches = !!market && markets.every(m => m && JSON.stringify(m) === JSON.stringify(market)) && market.valuesSignature === marketValues(horses);
  const snap = buildMarketSnapshot({
    rows: horses || [],
    capturedAt: matches ? market.capturedAt : null,
    pageCapturedAt: null,
    siteUpdatedAt: matches ? market.siteUpdatedAt : null,
    sourceName: market?.source ?? sourceName ?? null,
    sourceUrl: market?.url ?? null,
    missingReason: market?.missingReason
  });
  return market?.attempts ? { ...snap, attempts: market.attempts } : snap;
}

// 予想固定(lock)に入れる最終形。lockedAt と capturedAt は別項目で、発走前の順序と候補の生成可否も一緒に残す。
export function lockMarketSnapshot(snapshot: MarketSnapshot, lockedAt: string, scheduledStart: any) {
  const timing = marketTiming(snapshot, lockedAt, scheduledStart);
  return { ...snapshot, lockedAt, scheduledStart: scheduledStart || null, timing, candidate: marketCandidateStatus(snapshot, timing) };
}
