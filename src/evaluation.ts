// 保存済みの事前予想（predictionLock）を使い、重み・オッズ併用を「未来のレース」で検証する純関数群。
// 結果を見て選んだ設定を同じレースで評価すると必ず良く見えるため、ウォークフォワード
// （そのレースより前のレースだけで設定を選び、そのレースで採点）で評価する。
import { finite, nonStarter, scoreParts, instant } from './modelSafety';

export type Weights = { best: number; avg5: number; dist: number; course: number };
export const DEFAULT_WEIGHTS: Weights = { best: 15, avg5: 50, dist: 15, course: 20 };
export const BLEND_STEPS = [0, 2, 4, 6, 8]; // オッズ併用の強さ（指数ポイント / ln単位）
export const TEMP = 12; // fieldProbabilitiesと同じ温度
const HALF_LIFE_WEEKS = 16; // 画面既定(decayScale 8 × 2)

export const WEIGHT_GRID: Weights[] = (() => {
  const out: Weights[] = [];
  for (const best of [0, 15, 30]) for (const avg5 of [40, 50, 70, 85])
    for (const dist of [0, 15]) for (const course of [0, 10, 20]) out.push({ best, avg5, dist, course });
  return out;
})();
export const DEFAULT_GRID_INDEX = WEIGHT_GRID.findIndex(w =>
  w.best === DEFAULT_WEIGHTS.best && w.avg5 === DEFAULT_WEIGHTS.avg5 && w.dist === DEFAULT_WEIGHTS.dist && w.course === DEFAULT_WEIGHTS.course);

export type Prepared = {
  id: string; at: number; n: number; winner: number; top3: number[];
  bases: (number | null)[][]; // [グリッド][馬]
  lnOddsZ: number[] | null;   // 平均を引いた -ln(オッズ)。全馬のオッズが揃うレースのみ
};
export type Outcome = { ll: number; hit: number; place: number; rank: number };

const raceTime = (r: any) => instant(r.firstCompletedAt || r.completedAt) ?? instant(r.scheduledStart)
  ?? (r.raceDate ? instant(r.raceDate + 'T00:00:00+09:00') : null) ?? 0;

export function prepareRace(race: any, grid: Weights[] = WEIGHT_GRID): Prepared | null {
  const horses = (race.horses || []).filter((h: any) => !nonStarter(h))
    .sort((a: any, b: any) => Number(a.umaban) - Number(b.umaban));
  if (horses.length < 4) return null;
  const finishes = horses.map((h: any) => finite(h.finish));
  const winner = finishes.findIndex((f: number | null) => f === 1);
  const top3 = finishes.map((f: number | null, i: number) => (f !== null && f >= 1 && f <= 3 ? i : -1)).filter((i: number) => i >= 0);
  if (winner < 0 || top3.length !== 3) return null;
  const asOf = instant(race.scheduledStart) ?? instant((race.raceDate || '') + 'T00:00:00+09:00') ?? Date.now();
  const bases = grid.map(w => horses.map((h: any) => {
    const best = '_best' in h ? finite(h._best) : finite(h.best);
    const avg5 = '_avg5' in h ? finite(h._avg5) : finite(h.avg5);
    return scoreParts({ ...h, best, avg5 }, finite(h._recentIndex), w, { surface: race.surface, asOf, halfLifeWeeks: HALF_LIFE_WEEKS }).base;
  }));
  if (bases.every((b: (number | null)[]) => b.filter((x: number | null) => x !== null).length < 3)) return null;
  const odds = horses.map((h: any) => finite(h.odds));
  let lnOddsZ: number[] | null = null;
  if (odds.every((o: number | null) => o !== null && o > 0)) {
    const ln = odds.map((o: number) => -Math.log(o));
    const mean = ln.reduce((a: number, b: number) => a + b, 0) / ln.length;
    lnOddsZ = ln.map((x: number) => x - mean);
  }
  return { id: String(race.id), at: raceTime(race), n: horses.length, winner, top3, bases, lnOddsZ };
}

// スコア配列→結果。同点は馬番の小さい方を上位（画面の並びと同じ）。
export function outcomeOf(scores: number[], p: Prepared): Outcome {
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp(Math.max(-8, Math.min(8, (s - max) / TEMP))));
  const total = exps.reduce((a, b) => a + b, 0);
  const pw = exps[p.winner] / total;
  let top = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[top]) top = i;
  let rank = 1;
  for (let i = 0; i < scores.length; i++) if (scores[i] > scores[p.winner] || (scores[i] === scores[p.winner] && i < p.winner)) rank++;
  return { ll: -Math.log(Math.max(pw, 1e-12)), hit: Number(top === p.winner), place: Number(p.top3.includes(top)), rank };
}

// 指数不明の馬は「最下位扱い」（画面で順位なしになるのと同じ考え方）
export function configScores(p: Prepared, g: number, m: number): number[] | null {
  const base = p.bases[g], known = base.filter((x): x is number => x !== null);
  if (known.length < 3) return null;
  const floor = Math.min(...known);
  return base.map((x, j) => (x ?? floor) + (m > 0 && p.lnOddsZ ? m * p.lnOddsZ[j] : 0));
}

export type Agg = { n: number; hit: number; place: number; ll: number; rank: number };
const agg = (xs: Outcome[]): Agg => ({
  n: xs.length, hit: xs.reduce((a, x) => a + x.hit, 0), place: xs.reduce((a, x) => a + x.place, 0),
  ll: xs.length ? xs.reduce((a, x) => a + x.ll, 0) / xs.length : NaN,
  rank: xs.length ? xs.reduce((a, x) => a + x.rank, 0) / xs.length : NaN,
});

export type Config = { g: number; m: number };
export type LabResult = {
  usable: number; oosN: number; minTrain: number; switches: number;
  fixed: Agg; chosen: Agg; odds: Agg | null; randomHit: number;
  best: { weights: Weights; blend: number; trainLl: number; defaultLl: number; gain: number } | null;
  verdict: 'adopt' | 'keep' | 'insufficient';
};

export function walkForward(preps: Prepared[], blendSteps: number[], opts: { minTrain?: number; minGain?: number } = {}): LabResult {
  const minTrain = opts.minTrain ?? 30, minGain = opts.minGain ?? 0.005;
  const rows = [...preps].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const configs: Config[] = [];
  WEIGHT_GRID.forEach((_, g) => blendSteps.forEach(m => configs.push({ g, m })));
  const defaultC = configs.findIndex(c => c.g === DEFAULT_GRID_INDEX && c.m === 0);
  const empty: LabResult = { usable: rows.length, oosN: 0, minTrain, switches: 0, fixed: agg([]), chosen: agg([]), odds: null, randomHit: NaN, best: null, verdict: 'insufficient' };
  if (rows.length <= minTrain || defaultC < 0) return empty;

  const res: (Outcome | null)[][] = configs.map(c => rows.map(p => {
    const s = configScores(p, c.g, c.m); return s ? outcomeOf(s, p) : null;
  }));
  const sum = configs.map(() => 0), cnt = configs.map(() => 0);
  const chosenOut: Outcome[] = [], fixedOut: Outcome[] = [], oddsOut: Outcome[] = [];
  let randomHit = 0, switches = 0, prev = defaultC;
  rows.forEach((p, i) => {
    if (i >= minTrain) {
      const mean = (c: number) => (cnt[c] ? sum[c] / cnt[c] : Infinity);
      let best = defaultC;
      configs.forEach((_, c) => { if (mean(c) < mean(best)) best = c; });
      if (mean(best) > mean(defaultC) - minGain) best = defaultC;
      const a = res[best][i], b = res[defaultC][i];
      if (a && b) {
        chosenOut.push(a); fixedOut.push(b); randomHit += 1 / p.n; if (best !== prev) switches++;
        if (p.lnOddsZ) oddsOut.push(outcomeOf(p.lnOddsZ, p));
      }
      prev = best;
    }
    configs.forEach((_, c) => { const o = res[c][i]; if (o) { sum[c] += o.ll; cnt[c]++; } });
  });
  const fixed = agg(fixedOut), chosen = agg(chosenOut);
  // 全期間で見た最良設定（参考。選んだレースを含むので過大評価になる）
  const mean = (c: number) => (cnt[c] ? sum[c] / cnt[c] : Infinity);
  let bestC = defaultC;
  configs.forEach((_, c) => { if (mean(c) < mean(bestC)) bestC = c; });
  const oosGain = fixed.ll - chosen.ll;
  const verdict: LabResult['verdict'] = chosen.n < 50 ? 'insufficient' : oosGain >= minGain ? 'adopt' : 'keep';
  return {
    usable: rows.length, oosN: chosen.n, minTrain, switches, fixed, chosen,
    odds: oddsOut.length ? agg(oddsOut) : null, randomHit,
    best: { weights: WEIGHT_GRID[configs[bestC].g], blend: configs[bestC].m, trainLl: mean(bestC), defaultLl: mean(defaultC), gain: mean(defaultC) - mean(bestC) },
    verdict,
  };
}

// 画面用: 保存レースから2つの検証（重みのみ／オッズ併用）を行う
export function runLab(records: any[]) {
  const preps = records.map(r => prepareRace(r)).filter((p): p is Prepared => !!p);
  const withOdds = preps.filter(p => p.lnOddsZ);
  return {
    total: records.length, usable: preps.length, withOdds: withOdds.length,
    weightsOnly: walkForward(preps, [0]),
    withMarket: withOdds.length > 40 ? walkForward(withOdds, BLEND_STEPS) : null,
  };
}
