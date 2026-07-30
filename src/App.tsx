import { useState, useEffect, useMemo, type CSSProperties } from "react";

const AXIS = [
  { key: "saikou", label: "最高値" },
  { key: "kinsou", label: "近走平均" },
  { key: "kyori", label: "当該距離" },
  { key: "course", label: "当該コース" },
];

const ASHIMUKI = ["逃げ", "先行", "差し", "追込"];

const BABA_WEIGHTS = {
  良: { saikou: 0.30, kinsou: 0.25, kyori: 0.25, course: 0.20 },
  稍重: { saikou: 0.28, kinsou: 0.27, kyori: 0.25, course: 0.20 },
  重: { saikou: 0.20, kinsou: 0.32, kyori: 0.30, course: 0.18 },
  不良: { saikou: 0.18, kinsou: 0.33, kyori: 0.32, course: 0.17 },
};

const MARKS = ["◎", "○", "▲", "△", "☆"];
const LOCAL_TRACKS = [
  "門別", "帯広", "盛岡", "水沢", "浦和", "船橋", "大井", "川崎",
  "金沢", "笠松", "名古屋", "園田", "姫路", "高知", "佐賀",
];

const TRACK_BIAS: Record<string, { course: number; kyori: number; kinsou: number; saikou: number; front: number; closing: number }> = {
  門別: { course: 0.03, kyori: 0.02, kinsou: 0.00, saikou: -0.05, front: 2, closing: 0 },
  帯広: { course: 0.08, kyori: 0.03, kinsou: 0.02, saikou: -0.13, front: 0, closing: 0 },
  盛岡: { course: 0.01, kyori: 0.02, kinsou: 0.02, saikou: -0.05, front: 0, closing: 2 },
  水沢: { course: 0.04, kyori: 0.01, kinsou: 0.02, saikou: -0.07, front: 3, closing: -1 },
  浦和: { course: 0.05, kyori: 0.01, kinsou: 0.01, saikou: -0.07, front: 4, closing: -2 },
  船橋: { course: 0.03, kyori: 0.02, kinsou: 0.01, saikou: -0.06, front: 2, closing: 0 },
  大井: { course: 0.02, kyori: 0.03, kinsou: 0.01, saikou: -0.06, front: 0, closing: 2 },
  川崎: { course: 0.05, kyori: 0.01, kinsou: 0.01, saikou: -0.07, front: 4, closing: -2 },
  金沢: { course: 0.04, kyori: 0.02, kinsou: 0.01, saikou: -0.07, front: 3, closing: -1 },
  笠松: { course: 0.05, kyori: 0.02, kinsou: 0.01, saikou: -0.08, front: 4, closing: -2 },
  名古屋: { course: 0.04, kyori: 0.03, kinsou: 0.01, saikou: -0.08, front: 3, closing: -1 },
  園田: { course: 0.06, kyori: 0.03, kinsou: 0.01, saikou: -0.10, front: 3, closing: -1 },
  姫路: { course: 0.05, kyori: 0.03, kinsou: 0.01, saikou: -0.09, front: 2, closing: 0 },
  高知: { course: 0.04, kyori: 0.02, kinsou: 0.02, saikou: -0.08, front: 2, closing: 0 },
  佐賀: { course: 0.04, kyori: 0.02, kinsou: 0.02, saikou: -0.08, front: 3, closing: -1 },
};


const DISTANCE_PROFILES: Record<string, { kyori: number; course: number; kinsou: number; saikou: number; front: number; closing: number; note: string }> = {
  "園田:820": { kyori: 0.08, course: 0.03, kinsou: -0.01, saikou: -0.10, front: 7, closing: -4, note: "スタート・先行力を最重視" },
  "園田:1230": { kyori: 0.06, course: 0.04, kinsou: 0.00, saikou: -0.10, front: 4, closing: -2, note: "短距離適性と園田実績を重視" },
  "園田:1400": { kyori: 0.04, course: 0.06, kinsou: 0.02, saikou: -0.12, front: 3, closing: -1, note: "地元1400実績と近走安定度を重視" },
  "園田:1700": { kyori: 0.08, course: 0.05, kinsou: 0.01, saikou: -0.14, front: 1, closing: 1, note: "中距離適性と持続力を重視" },
  "園田:1870": { kyori: 0.09, course: 0.05, kinsou: 0.01, saikou: -0.15, front: 0, closing: 2, note: "スタミナと中距離実績を重視" },
  "川崎:900": { kyori: 0.08, course: 0.05, kinsou: -0.02, saikou: -0.11, front: 8, closing: -5, note: "テンの速さと川崎900実績を最重視" },
  "大井:1200": { kyori: 0.07, course: 0.03, kinsou: 0.01, saikou: -0.11, front: 3, closing: 1, note: "1200適性と末脚の両方を評価" },
  "大井:2000": { kyori: 0.10, course: 0.04, kinsou: 0.02, saikou: -0.16, front: -1, closing: 3, note: "距離適性・持続力・差し脚を重視" },
  "名古屋:1500": { kyori: 0.05, course: 0.06, kinsou: 0.02, saikou: -0.13, front: 5, closing: -2, note: "先行位置と名古屋1500実績を重視" },
  "浦和:1400": { kyori: 0.04, course: 0.07, kinsou: 0.01, saikou: -0.12, front: 6, closing: -4, note: "小回り先行力と浦和実績を重視" },
  "船橋:1200": { kyori: 0.06, course: 0.04, kinsou: 0.01, saikou: -0.11, front: 4, closing: 0, note: "スピード持続力を重視" },
  "高知:1300": { kyori: 0.06, course: 0.05, kinsou: 0.02, saikou: -0.13, front: 4, closing: -1, note: "高知短距離実績と先行力を重視" },
};

type ReviewRecord = {
  id: string; raceName: string; track: string; distance: string; raceClass: string; baba: string;
  result: string; reviewNote: string; createdAt: string; ranked: any[]; horses: any[];
};

function profileFor(track: string, distance: string) {
  const exact = DISTANCE_PROFILES[`${track}:${distance}`];
  if (exact) return exact;
  const d = Number(distance);
  if (!Number.isFinite(d)) return null;
  // 全15場の未登録距離も、距離帯に応じた共通プロファイルで自動対応する。
  if (d <= 1000) return { kyori: 0.07, course: 0.03, kinsou: -0.01, saikou: -0.09, front: 6, closing: -4, note: "超短距離：スタートと先行力を重視" };
  if (d <= 1300) return { kyori: 0.05, course: 0.03, kinsou: 0.01, saikou: -0.09, front: 4, closing: -1, note: "短距離：スピード持続力を重視" };
  if (d <= 1600) return { kyori: 0.04, course: 0.04, kinsou: 0.02, saikou: -0.10, front: 3, closing: 0, note: "マイル前後：コース適性と安定度を重視" };
  if (d <= 1900) return { kyori: 0.07, course: 0.04, kinsou: 0.02, saikou: -0.13, front: 1, closing: 1, note: "中距離：距離適性と持続力を重視" };
  return { kyori: 0.09, course: 0.03, kinsou: 0.02, saikou: -0.14, front: -1, closing: 3, note: "長距離：スタミナと差し脚を重視" };
}

function parseResultNumbers(result: string) {
  return (result.match(/\d{1,2}/g) ?? []).slice(0, 3);
}

function learnedAxisAdjustments(reviews: ReviewRecord[], track: string, distance: string) {
  const matching = reviews.filter((r) => r.track === track && r.distance === distance && parseResultNumbers(r.result).length);
  if (matching.length < 3) return { saikou: 0, kinsou: 0, kyori: 0, course: 0, count: matching.length };
  const sums = { saikou: 0, kinsou: 0, kyori: 0, course: 0 };
  let usable = 0;
  for (const r of matching) {
    const winnerNo = parseResultNumbers(r.result)[0];
    const winner = r.horses?.find((h) => String(h.waku) === String(winnerNo));
    const field = (r.horses ?? []).filter((h) => h.name);
    if (!winner || field.length < 2) continue;
    for (const key of Object.keys(sums)) {
      const w = Number(winner[key]);
      const vals = field.map((h) => Number(h[key])).filter(Number.isFinite);
      if (!Number.isFinite(w) || !vals.length) continue;
      const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
      sums[key] += (w-avg)/100;
    }
    usable++;
  }
  const cap=(v)=>Math.max(-0.04,Math.min(0.04,v));
  if (!usable) return { saikou:0, kinsou:0, kyori:0, course:0, count:matching.length };
  return { saikou:cap(sums.saikou/usable), kinsou:cap(sums.kinsou/usable), kyori:cap(sums.kyori/usable), course:cap(sums.course/usable), count:matching.length };
}

function normalizeWeights(raw: any) {
  const keys=["saikou","kinsou","kyori","course"];
  const clipped:any={};
  for (const k of keys) clipped[k]=Math.max(0.05, raw[k]);
  const total=keys.reduce((a,k)=>a+clipped[k],0);
  for (const k of keys) clipped[k]/=total;
  return clipped;
}

function trackAdjustedWeights(track: string, baba: string, distance = "", learned: any = null) {
  const base = BABA_WEIGHTS[baba];
  const bias = TRACK_BIAS[track] ?? { course: 0, kyori: 0, kinsou: 0, saikou: 0, front: 0, closing: 0 };
  const dp = profileFor(track, distance);
  return normalizeWeights({
    saikou: base.saikou + bias.saikou + (dp?.saikou ?? 0) + (learned?.saikou ?? 0),
    kinsou: base.kinsou + bias.kinsou + (dp?.kinsou ?? 0) + (learned?.kinsou ?? 0),
    kyori: base.kyori + bias.kyori + (dp?.kyori ?? 0) + (learned?.kyori ?? 0),
    course: base.course + bias.course + (dp?.course ?? 0) + (learned?.course ?? 0),
  });
}



const emptyHorse = () => ({
  id: crypto.randomUUID(),
  name: "",
  waku: "",
  ashimuki: "差し",
  saikou: "",
  kinsou: "",
  kyori: "",
  course: "",
  odds: "",
  ninki: "",
});

function sanitizeKey(raceName) {
  return raceName
    .trim()
    .replace(/[\s\/\\'"]+/g, "_")
    .slice(0, 150);
}

function oddsCorrection(h, correctionStrength, decayScale) {
  if (!correctionStrength) return 0;
  const odds = h.odds === "" || isNaN(h.odds) ? null : Number(h.odds);
  const ninki = h.ninki === "" || isNaN(h.ninki) ? null : Number(h.ninki);
  // しきい値でスパッと0/満額を切り替えると「3.09倍はOK、3.1倍はダメ」のような不自然な崖ができる。
  // 代わりに decayScale/(decayScale+odds) というなだらかな減衰カーブを使う。
  // odds=0で最大、odds=decayScaleで半分、そこから先も緩やかに効果が残る。
  if (odds !== null && odds > 0) {
    const factor = decayScale / (decayScale + odds);
    return Math.round(correctionStrength * factor * 10) / 10;
  }
  // 人気順位だけでは補正しない。実オッズが取得できた場合だけ馬券評価用の参考値を出す。
  return 0;
}

function scoreHorse(h, weights, oikomiBoost, correctionStrength, decayScale, track = "園田") {
  const v = (x) => {
    if (x === "" || x === null || isNaN(x)) return 0;
    // 四軸は0〜100の指数値である前提。範囲外の値（コピペミスや列ズレでマイナスや異常値が
    // 紛れ込んだ場合）はスコアが破綻しないよう0〜100にクランプする。
    return Math.max(0, Math.min(100, Number(x)));
  };
  const base =
    v(h.saikou) * weights.saikou +
    v(h.kinsou) * weights.kinsou +
    v(h.kyori) * weights.kyori +
    v(h.course) * weights.course;
  const bias = TRACK_BIAS[track] ?? { front: 0, closing: 0 };
  const dp = profileFor(track, String((weights as any).__distance ?? ""));
  const frontBias = bias.front + (dp?.front ?? 0);
  const closingBias = bias.closing + (dp?.closing ?? 0);
  const styleBias = h.ashimuki === "逃げ" || h.ashimuki === "先行" ? frontBias : closingBias;
  const boost = (h.ashimuki === "差し" || h.ashimuki === "追込" ? oikomiBoost : 0) + styleBias;
  const correction = oddsCorrection(h, correctionStrength, decayScale);
  return Math.round((base + boost + correction) * 10) / 10;
}


function axisValues(h) {
  return AXIS.map(({ key }) => {
    const value = Number(h[key]);
    return h[key] === "" || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
  }).filter((value) => value !== null);
}

function stabilityScore(h) {
  const values = axisValues(h);
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return Math.max(0, Math.min(100, Math.round((100 - sd * 5) * 10) / 10));
}

function scoreBreakdown(h, weights, oikomiBoost, track, distance) {
  const val = (x) => x === "" || !Number.isFinite(Number(x)) ? 0 : Math.max(0, Math.min(100, Number(x)));
  const bias = TRACK_BIAS[track] ?? { front: 0, closing: 0 };
  const dp = profileFor(track, distance);
  const style = h.ashimuki === "逃げ" || h.ashimuki === "先行"
    ? bias.front + (dp?.front ?? 0)
    : bias.closing + (dp?.closing ?? 0) + ((h.ashimuki === "差し" || h.ashimuki === "追込") ? oikomiBoost : 0);
  return {
    ability: Math.round(val(h.saikou) * 10) / 10,
    recent: Math.round(val(h.kinsou) * 10) / 10,
    distance: Math.round(val(h.kyori) * 10) / 10,
    course: Math.round(val(h.course) * 10) / 10,
    pace: Math.round(Math.max(0, Math.min(100, 50 + style * 5)) * 10) / 10,
    total: scoreHorse(h, { ...weights, __distance: distance }, oikomiBoost, 0, 4, track),
  };
}

function horseAiComment(h, track, distance, weights, oikomiBoost) {
  const b = scoreBreakdown(h, weights, oikomiBoost, track, distance);
  const axes = [
    ["最高値", b.ability], ["近走", b.recent], ["距離", b.distance], ["コース", b.course], ["展開", b.pace],
  ].sort((a:any,b:any)=>b[1]-a[1]);
  const strengths = axes.filter((x:any)=>x[1] >= 60).slice(0,2).map((x:any)=>x[0]);
  const weakness = axes.find((x:any)=>x[1] > 0 && x[1] < 35);
  const styleText = h.ashimuki === "逃げ" || h.ashimuki === "先行" ? "前で運べる点" : "差し脚";
  let text = strengths.length ? `${strengths.join("・")}が強み。${styleText}も評価。` : `${styleText}を軸に相手関係で評価。`;
  if (weakness) text += `${weakness[0]}は弱めで過信禁物。`;
  if (h.valueGrade && h.valueGrade !== "-") text += `オッズ面は期待値${h.valueGrade}。`;
  if (h.danger) text += "人気先行の可能性があり注意。";
  return text;
}

function automaticReviewText(result, ranked) {
  const nums = parseResultNumbers(result);
  if (nums.length < 3 || !ranked.length) return "結果を1-2-3形式で入力すると自動回顧を表示します。";
  const pred = ranked.map((h)=>String(h.waku));
  const marks = new Map(pred.slice(0,5).map((n,i)=>[n, MARKS[i]]));
  const placed = nums.map((n)=>ranked.find((h)=>String(h.waku)===n)).filter(Boolean);
  const hitTop = nums.filter((n)=>pred.slice(0,5).includes(n)).length;
  const winnerRank = pred.indexOf(nums[0]) + 1;
  const finishMarks = nums.map((n)=>`${n}${marks.get(n) ? `(${marks.get(n)})` : "(無印)"}`).join("→");
  const missed = placed.filter((h)=>!pred.slice(0,5).includes(String(h.waku)));
  let text = `結果 ${nums.join("-")}［${finishMarks}］。印内は${hitTop}/3頭、勝ち馬は能力${winnerRank || "圏外"}位。`;
  if (winnerRank === 1) text += "本命の軸評価は正解。";
  else if (winnerRank > 0 && winnerRank <= 3) text += "勝ち馬は上位評価できており、印の順位付けが課題。";
  else if (winnerRank > 0 && winnerRank <= 5) text += "相手には残せたが、勝ち切る材料を軽視した可能性。";
  else text += "勝ち馬を拾えず、評価軸の見直しが必要。";

  if (missed.length) {
    const details = missed.slice(0,2).map((h:any) => {
      const vals: [string, number][] = [["最高値",Number(h.saikou)||0],["近走",Number(h.kinsou)||0],["距離",Number(h.kyori)||0],["コース",Number(h.course)||0]];
      vals.sort((a,b)=>b[1]-a[1]);
      return `${h.waku}${h.name}（${vals[0][0]}${vals[0][1]}・${h.ashimuki}）`;
    });
    text += ` 見逃しは${details.join("、")}。高い指数項目と脚質を次回は相手候補へ反映。`;
  }

  const winner:any = placed[0];
  if (winner) {
    const axis: [string, number][] = [["最高値",Number(winner.saikou)||0],["近走",Number(winner.kinsou)||0],["距離",Number(winner.kyori)||0],["コース",Number(winner.course)||0]];
    axis.sort((a,b)=>b[1]-a[1]);
    if (winnerRank !== 1) text += ` 勝ち馬の強みは${axis[0][0]}${axis[0][1]}。この項目を少し重くする余地あり。`;
  }

  const dangerIn = ranked.filter((h)=>h.danger && nums.includes(String(h.waku)));
  const dangerOut = ranked.filter((h)=>h.danger && !nums.includes(String(h.waku)));
  if (dangerIn.length) text += ` 危険人気判定の${dangerIn.map(h=>h.waku).join("・")}が馬券内で、消し条件はやや厳しすぎた。`;
  else if (dangerOut.length) text += ` 危険人気${dangerOut.map(h=>h.waku).join("・")}は馬券外で判定成功。`;

  const topTwo = pred.slice(0,2);
  if (nums.slice(0,2).every((n)=>topTwo.includes(n))) text += " 上位2頭で1・2着を押さえており、軸・相手選定は良好。";
  else if (hitTop === 3) text += " 3頭とも印内で、買い目構成の改善が中心。";
  return text;
}

function csvEscape(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function reviewsToCsv(reviews: ReviewRecord[]) {
  const headers = ["id","raceName","track","distance","raceClass","baba","result","reviewNote","createdAt","rankedJson","horsesJson"];
  const rows = reviews.map((r) => [r.id,r.raceName,r.track,r.distance,r.raceClass,r.baba,r.result,r.reviewNote,r.createdAt,JSON.stringify(r.ranked ?? []),JSON.stringify(r.horses ?? [])]);
  return [headers.map(csvEscape).join(","), ...rows.map((row)=>row.map(csvEscape).join(","))].join("\r\n");
}

function parseCsv(text: string) {
  const rows:string[][]=[]; let row:string[]=[]; let field=""; let quoted=false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (quoted) {
      if (ch==='"' && text[i+1]==='"') { field+='"'; i++; }
      else if (ch==='"') quoted=false;
      else field+=ch;
    } else {
      if (ch==='"') quoted=true;
      else if (ch===',') { row.push(field); field=""; }
      else if (ch==='\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row=[]; field=""; }
      else field+=ch;
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function csvToReviews(text: string): ReviewRecord[] {
  const rows=parseCsv(text).filter((r)=>r.some((v)=>v.trim()!==""));
  if (rows.length<2) return [];
  const headers=rows[0]; const idx=(name:string)=>headers.indexOf(name);
  return rows.slice(1).map((row)=>{
    const parseJson=(name:string)=>{ try { return JSON.parse(row[idx(name)] || "[]"); } catch { return []; } };
    return {
      id: row[idx("id")] || crypto.randomUUID(), raceName: row[idx("raceName")] || "",
      track: row[idx("track")] || "", distance: row[idx("distance")] || "",
      raceClass: row[idx("raceClass")] || "", baba: row[idx("baba")] || "良",
      result: row[idx("result")] || "", reviewNote: row[idx("reviewNote")] || "",
      createdAt: row[idx("createdAt")] || new Date().toISOString(),
      ranked: parseJson("rankedJson"), horses: parseJson("horsesJson"),
    };
  }).filter((r)=>r.track || r.raceName || r.result);
}

function softmaxProbabilities(items, temperature = 5.5) {
  if (!items.length) return [];
  const max = Math.max(...items.map((item) => item.abilityScore));
  const exp = items.map((item) => Math.exp((item.abilityScore - max) / temperature));
  const total = exp.reduce((sum, value) => sum + value, 0) || 1;
  return exp.map((value) => value / total);
}

function marketProbabilities(items) {
  const raw = items.map((item) => {
    const odds = Number(item.odds);
    return Number.isFinite(odds) && odds > 1 ? 1 / odds : null;
  });
  const knownTotal = raw.reduce((sum, value) => sum + (value ?? 0), 0);
  return raw.map((value, index) => {
    if (value !== null && knownTotal > 0) return value / knownTotal;
    const ninki = Number(items[index].ninki);
    if (Number.isFinite(ninki) && ninki > 0) return 1 / (ninki * (ninki + 1));
    return null;
  });
}

function buildBetSuggestions(ranked, raceProfile) {
  if (ranked.length < 2) return [];
  const no = (horse) => horse.waku || horse.name;
  const [a, b, c, d] = ranked;
  const bets = [];
  const valueHorse = ranked.find((horse, index) => index < 6 && horse.valueGrade === "A");

  if (a) bets.push({ type: "単勝", tickets: [no(valueHorse || a)] });
  if (a && b) bets.push({ type: "馬連", tickets: [`${no(a)}-${no(b)}`] });
  if (a && b && c) {
    bets.push({
      type: "ワイド",
      tickets: raceProfile.level >= 4
        ? [`${no(a)}-${no(b)}`, `${no(a)}-${no(c)}`, `${no(b)}-${no(c)}`]
        : [`${no(a)}-${no(b)}`, `${no(a)}-${no(c)}`],
    });
    bets.push({
      type: "三連複",
      tickets: d
        ? [`${no(a)}-${no(b)}-${no(c)}`, `${no(a)}-${no(b)}-${no(d)}`, `${no(a)}-${no(c)}-${no(d)}`]
        : [`${no(a)}-${no(b)}-${no(c)}`],
    });
  }
  if (a && b && c && raceProfile.level <= 3) {
    bets.push({ type: "三連単", tickets: [`${no(a)}→${no(b)}→${no(c)}`, `${no(a)}→${no(c)}→${no(b)}`] });
  }
  return bets;
}


function splitLoose(line) {
  return line.trim().split(/\t|,|\s{2,}/).map((v) => v.trim()).filter(Boolean);
}

function parseRaceCardText(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = new Map();
  const blocks = [];
  let current = null;

  const pushCurrent = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const line of lines) {
    const standaloneNo = line.match(/^(\d{1,2})$/);
    const inlineStart = line.match(/^(\d{1,2})[\t ,　]+(.+)$/);
    if (standaloneNo) {
      pushCurrent();
      current = { no: standaloneNo[1], lines: [] };
      continue;
    }
    if (inlineStart && !/[ダ芝]\d{3,4}/.test(line)) {
      pushCurrent();
      current = { no: inlineStart[1], lines: [inlineStart[2]] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  pushCurrent();

  for (const block of blocks) {
    const joined = block.lines.join(' ');
    const nameLine = block.lines.find((line) => {
      if (/^(牡|牝|セ)\d+/.test(line)) return false;
      if (/^(?:[-+]?\d+(?:\.\d+)?|\d+人気|\([+-]?\d+\))$/.test(line)) return false;
      if (/^(逃げ|先行|差し|追込|馬番|枠|馬名)/.test(line)) return false;
      return /[ぁ-んァ-ヶ一-龠A-Za-z]/.test(line);
    });
    const name = nameLine ? splitLoose(nameLine)[0] : '';

    let popularity = '';
    let odds = '';
    const popMatch = joined.match(/(\d{1,2})\s*人気/);
    if (popMatch) {
      popularity = popMatch[1];
      const before = joined.slice(0, popMatch.index);
      const nums = [...before.matchAll(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)].map((m) => m[0]);
      const plausible = nums.filter((v) => Number(v) >= 1 && Number(v) < 1000);
      if (plausible.length) odds = plausible[plausible.length - 1];
    }

    if (!odds) {
      for (const line of block.lines) {
        const m = line.match(/(?:単勝|オッズ)?\s*(\d+(?:\.\d+)?)\s*(?:倍)?\s+(\d{1,2})\s*人気/);
        if (m) {
          odds = m[1];
          popularity = popularity || m[2];
          break;
        }
      }
    }

    if (name) result.set(block.no, { waku: block.no, name, odds, ninki: popularity });
  }

  // 1頭1行の表形式にも対応
  for (const line of lines) {
    const cols = splitLoose(line.replace(/　/g, '  '));
    if (cols.length < 2 || !/^\d{1,2}$/.test(cols[0])) continue;
    const no = cols[0];
    const name = cols[1];
    if (!name || /^[+\-]?\d/.test(name)) continue;
    const popToken = cols.find((v) => /^\d{1,2}人気$/.test(v));
    const popularity = popToken ? popToken.replace('人気', '') : '';
    let odds = '';
    if (popToken) {
      const popIndex = cols.indexOf(popToken);
      for (let i = popIndex - 1; i >= 2; i -= 1) {
        if (/^\d+(?:\.\d+)?(?:倍)?$/.test(cols[i])) {
          odds = cols[i].replace('倍', '');
          break;
        }
      }
    }
    const old = result.get(no) ?? {};
    result.set(no, {
      waku: no,
      name: old.name || name,
      odds: old.odds || odds,
      ninki: old.ninki || popularity,
    });
  }
  return result;
}

function parseStandardIndexText(text) {
  const result = new Map();
  for (const line of text.split(/\r?\n/)) {
    const cols = splitLoose(line);
    if (cols.length < 3 || !/^\d{1,2}$/.test(cols[0])) continue;
    const no = cols[0];
    const name = cols[1];
    const values = cols.slice(2).filter((v) => /^(?:未|[-ー－]|[-+]?\d+(?:\.\d+)?\*?)$/.test(v)).slice(0, 4);
    const clean = (v) => v && /^[-+]?\d/.test(v) ? v.replace(/\*/g, "") : "";
    result.set(no, {
      waku: no,
      name,
      saikou: clean(values[0]),
      kinsou: clean(values[1]),
      kyori: clean(values[2]),
      course: clean(values[3]),
    });
  }
  return result;
}

function parseRecentIndexText(text, selectedTrack, selectedDistance) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = new Map();
  let currentNo = "";
  let currentName = "";
  const races = [];
  const flush = () => {
    if (!currentNo) return;
    const recent = races.slice(0, 5);
    const nums = recent.map((r) => r.value).filter(Number.isFinite);
    const distanceNums = recent.filter((r) => r.distance === Number(selectedDistance)).map((r) => r.value);
    const courseNums = recent.filter((r) => r.track === selectedTrack).map((r) => r.value);
    const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : "";
    result.set(currentNo, {
      waku: currentNo,
      name: currentName,
      recentMax: nums.length ? Math.max(...nums) : "",
      kinsou: avg(nums),
      kyoriRecent: avg(distanceNums),
      courseRecent: avg(courseNums),
    });
  };
  for (const line of lines) {
    const header = line.match(/^(\d{1,2})\s+([^\s]+)/);
    if (header && !/[ダ芝]\d{3,4}/.test(line)) {
      flush();
      currentNo = header[1];
      currentName = header[2];
      races.length = 0;
      continue;
    }
    if (!currentNo) continue;
    const race = line.match(/([^\s]+)[ダ芝](\d{3,4}).*?\b[HMS]\s+([-+]?\d+(?:\.\d+)?)/);
    if (race) races.push({ track: race[1], distance: Number(race[2]), value: Number(race[3]) });
  }
  flush();
  return result;
}

function parsePaceText(text) {
  const result = new Map();
  let style = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const styleMatch = line.match(/^(逃げ|先行|差し|追込)\s*(.*)$/);
    if (styleMatch) {
      style = styleMatch[1];
      const rest = styleMatch[2];
      for (const m of rest.matchAll(/(?:^|\s)(\d{1,2})(?=\s|$)/g)) result.set(m[1], style);
      continue;
    }
    if (style) for (const m of line.matchAll(/(?:^|\s)(\d{1,2})(?=\s|$)/g)) result.set(m[1], style);
  }
  return result;
}

function mergeFourSources(raceCardText, standardText, recentText, paceText, track, distance) {
  const card = parseRaceCardText(raceCardText);
  const standard = parseStandardIndexText(standardText);
  const recent = parseRecentIndexText(recentText, track, distance);
  const pace = parsePaceText(paceText);
  const numbers = [...new Set([...card.keys(), ...standard.keys(), ...recent.keys(), ...pace.keys()])]
    .sort((a, b) => Number(a) - Number(b));
  return numbers.map((no) => {
    const h = emptyHorse();
    const c = card.get(no) ?? {};
    const s = standard.get(no) ?? {};
    const r = recent.get(no) ?? {};
    h.waku = no;
    h.name = c.name || s.name || r.name || `馬番${no}`;
    h.odds = c.odds || "";
    h.ninki = c.ninki || "";
    h.ashimuki = pace.get(no) || "差し";
    const standardMax = Number(s.saikou);
    const recentMax = Number(r.recentMax);
    h.saikou = Number.isFinite(standardMax) && Number.isFinite(recentMax)
      ? String(Math.max(standardMax, recentMax))
      : (s.saikou || (r.recentMax !== "" ? String(r.recentMax) : ""));
    h.kinsou = r.kinsou !== "" ? String(r.kinsou) : (s.kinsou || "");
    h.kyori = s.kyori || (r.kyoriRecent !== "" ? String(r.kyoriRecent) : "");
    h.course = s.course || (r.courseRecent !== "" ? String(r.courseRecent) : "");
    return h;
  });
}

function parseBulkText(text) {
  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // 「馬番だけの行」→「--（区切り）」→「馬名＋データの行」という3行1組で貼り付けられる形式にも対応する。
  // 馬番だけの行が来たら pendingWaku に溜めておき、次のデータ行の先頭にくっつけてから通常処理に渡す。
  const lines = [];
  let pendingWaku = null;
  for (const raw of rawLines) {
    if (/^\d{1,2}$/.test(raw)) {
      pendingWaku = raw;
      continue;
    }
    if (/^[-‐―ー]{1,3}$/.test(raw)) {
      continue; // 区切り行はスキップ
    }
    if (pendingWaku !== null) {
      lines.push(`${pendingWaku}\t${raw}`);
      pendingWaku = null;
    } else {
      lines.push(raw);
    }
  }
  const parsed = [];
  const toScoreVal = (v) => {
    if (v === undefined) return "";
    let s = String(v).trim().replace(/[*＊]/g, ""); // 推定値等の「*」マーカーは除去して数値部分だけ使う
    // 「未」「-」「ー」「－」など数値でないものは未計測として空欄扱い（列はズラさない）
    if (s === "" || Number.isNaN(Number(s))) return "";
    return s;
  };
  for (const line of lines) {
    // タブ、カンマ、または連続スペースのいずれかで区切りとみなす
    const cols = line.split(/\t|,|\s{2,}/).map((c) => c.trim()).filter((c) => c !== "");
    if (cols.length < 2) continue;
    if (cols[0] === "馬番" || cols[0] === "枠") continue; // ヘッダー行はスキップ
    const h = emptyHorse();
    // 想定順: 枠, 馬名, 脚質, 最高値, 近走平均, 当該距離, 当該コース（脚質は無くてもOK）
    // 枠が数値でなければ先頭は馬名とみなす
    let idx = 0;
    if (/^\d+$/.test(cols[0])) {
      h.waku = cols[0];
      idx = 1;
    }
    h.name = cols[idx] ?? "";
    idx += 1;
    if (ASHIMUKI.includes(cols[idx])) {
      h.ashimuki = cols[idx];
      idx += 1;
    }
    // ここから先は「最高値, 近走平均, 当該距離, 当該コース」の4つが並んでいる前提で位置固定で取得。
    // 「未」のような非数値が混ざっていても、その項目だけ空欄にして後続の列はズレさせない。
    const slice = cols.slice(idx, idx + 4);
    ["saikou", "kinsou", "kyori", "course"].forEach((key, i) => {
      h[key] = toScoreVal(slice[i]);
    });
    // 4軸より後ろに列が残っていれば、末尾側から「人気」「単勝オッズ」を推測して拾う
    // （netkeibaの表などをそのまま貼った場合、末尾が...単勝オッズ, 人気 の並びになりやすい）
    const tail = cols.slice(idx + 4);
    if (tail.length >= 1) {
      const last = tail[tail.length - 1];
      if (/^\d{1,2}$/.test(last)) h.ninki = last;
    }
    if (tail.length >= 2) {
      const secondLast = tail[tail.length - 2];
      if (/^\d+(\.\d+)?$/.test(secondLast) && Number(secondLast) >= 1) h.odds = secondLast;
    }
    if (h.name) parsed.push(h);
  }
  return parsed;
}

export default function KeibaYosouTool() {
  const [raceName, setRaceName] = useState("");
  const [track, setTrack] = useState("園田");
  const [distance, setDistance] = useState("1400");
  const [raceClass, setRaceClass] = useState("");
  const [result, setResult] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [baba, setBaba] = useState("良");
  const [oikomiBoost, setOikomiBoost] = useState(4);
  const [correctionEnabled, setCorrectionEnabled] = useState(false);
  const [correctionStrength, setCorrectionStrength] = useState(4);
  const [oddsCap, setOddsCap] = useState(4); // 減衰スケール：この倍率で補正が半分になる
  const [horses, setHorses] = useState([emptyHorse(), emptyHorse(), emptyHorse()]);
  const [status, setStatus] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [raceCardText, setRaceCardText] = useState("");
  const [standardIndexText, setStandardIndexText] = useState("");
  const [recentIndexText, setRecentIndexText] = useState("");
  const [paceText, setPaceText] = useState("");
  const [showBulk, setShowBulk] = useState(true);
  const [exportText, setExportText] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [reviews, setReviews] = useState<ReviewRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem("keiba:reviews") || "[]"); } catch { return []; }
  });
  const [autoLearning, setAutoLearning] = useState(true);
  const [showStats, setShowStats] = useState(true);

  const learned = useMemo(() => autoLearning ? learnedAxisAdjustments(reviews, track, distance) : { saikou:0, kinsou:0, kyori:0, course:0, count:0 }, [reviews, track, distance, autoLearning]);
  const weights = useMemo(() => ({ ...trackAdjustedWeights(track, baba, distance, learned), __distance: distance }), [track, baba, distance, learned]);
  const effStrength = correctionEnabled ? correctionStrength : 0;

  const ranked = useMemo(() => {
    const baseItems = horses
      .filter((h) => h.name.trim() !== "")
      .map((h) => ({
        ...h,
        abilityScore: scoreHorse(h, weights, oikomiBoost, 0, oddsCap, track),
        score: scoreHorse(h, weights, oikomiBoost, effStrength, oddsCap, track),
        stability: stabilityScore(h),
      }));

    const abilityOrder = [...baseItems].sort((a, b) => b.abilityScore - a.abilityScore);
    const abilityRank = new Map(abilityOrder.map((horse, index) => [horse.id, index + 1]));
    const fair = softmaxProbabilities(baseItems);
    const market = marketProbabilities(baseItems);

    return baseItems
      .map((horse, index) => {
        const statedPopularity = Number(horse.ninki);
        const marketRank = Number.isFinite(statedPopularity) && statedPopularity > 0
          ? statedPopularity
          : [...baseItems]
              .filter((item) => Number(item.odds) > 0)
              .sort((a, b) => Number(a.odds) - Number(b.odds))
              .findIndex((item) => item.id === horse.id) + 1 || null;
        const fairProb = fair[index];
        const marketProb = market[index];
        const valueEdge = marketProb === null ? null : (fairProb - marketProb) * 100;
        const rankGap = marketRank ? marketRank - abilityRank.get(horse.id) : null;
        const valueGrade = valueEdge !== null && valueEdge >= 5 ? "A" : valueEdge !== null && valueEdge >= 2 ? "B" : rankGap !== null && rankGap >= 3 ? "B" : "-";
        const danger = valueEdge !== null && valueEdge <= -5 && marketRank !== null && marketRank <= 3;
        const breakdown = scoreBreakdown(horse, weights, oikomiBoost, track, distance);
        const enriched = { ...horse, abilityRank: abilityRank.get(horse.id), marketRank, fairProb, marketProb, valueEdge, rankGap, valueGrade, danger, breakdown };
        return { ...enriched, aiComment: horseAiComment(enriched, track, distance, weights, oikomiBoost) };
      })
      .sort((a, b) => b.abilityScore - a.abilityScore);
  }, [horses, weights, oikomiBoost, effStrength, oddsCap, track, distance]);

  const raceProfile = useMemo(() => {
    if (ranked.length < 2) return { level: 1, label: "判定待ち", gap: 0, topGap:0, reason:"データ不足" };
    const scores = ranked.map((horse) => horse.abilityScore).sort((a, b) => b - a).slice(0, Math.min(5, ranked.length));
    const gap = Math.max(...scores) - Math.min(...scores);
    const topGap = scores[0] - scores[1];
    const dangerCount = ranked.filter((h)=>h.danger).length;
    const valueCount = ranked.filter((h)=>h.valueGrade!=="-").length;
    let level=3, label="標準", reason="上位勢の差は平均的";
    if (topGap >= 7 && dangerCount === 0) { level=1; label="本命戦"; reason="1位の指数が大きく抜けている"; }
    else if (topGap >= 4) { level=2; label="やや本命"; reason="上位馬が比較的明確"; }
    else if (gap <= 4 || dangerCount >= 2) { level=5; label="波乱濃厚"; reason="上位差が小さく危険人気も多い"; }
    else if (gap <= 7 || valueCount >= 3) { level=4; label="穴狙い・混戦"; reason="能力差が小さく期待値候補が複数"; }
    return { level, label, gap: Math.round(gap * 10) / 10, topGap:Math.round(topGap*10)/10, reason };
  }, [ranked]);

  const betSuggestions = useMemo(() => buildBetSuggestions(ranked, raceProfile), [ranked, raceProfile]);
  const top3 = ranked.slice(0, 3);
  const autoReview = useMemo(() => automaticReviewText(result, ranked), [result, ranked]);
  const trackDistanceStats = useMemo(() => {
    const groups:Record<string,{count:number,win:number,trio:number}> = {};
    for (const r of reviews.filter((x)=>parseResultNumbers(x.result).length)) {
      const key=`${r.track}${r.distance}m`; const res=parseResultNumbers(r.result); const pred=(r.ranked??[]).map((h)=>String(h.waku));
      groups[key] ??= {count:0,win:0,trio:0}; groups[key].count++;
      if (pred[0]===res[0]) groups[key].win++;
      if (res.length>=3 && res.every((n)=>pred.slice(0,5).includes(n))) groups[key].trio++;
    }
    return Object.entries(groups).sort((a,b)=>b[1].count-a[1].count).slice(0,12);
  }, [reviews]);
  const stats = useMemo(() => {
    const completed = reviews.filter((r)=>parseResultNumbers(r.result).length);
    const subset = completed.filter((r)=>r.track===track && r.distance===distance);
    const calc=(rows:ReviewRecord[])=>{
      let win=0, exacta=0, trio=0, dangerHit=0, dangerTotal=0;
      for (const r of rows) {
        const res=parseResultNumbers(r.result); const pred=(r.ranked??[]).map((h)=>String(h.waku));
        if (res[0] && pred[0]===res[0]) win++;
        if (res.length>=2 && pred.slice(0,2).includes(res[0]) && pred.slice(0,2).includes(res[1])) exacta++;
        if (res.length>=3 && res.every((n)=>pred.slice(0,5).includes(n))) trio++;
        for (const h of (r.ranked??[]).filter((h)=>h.danger)) { dangerTotal++; if (!res.slice(0,3).includes(String(h.waku))) dangerHit++; }
      }
      return { count:rows.length, win, exacta, trio, dangerHit, dangerTotal };
    };
    return { all:calc(completed), current:calc(subset) };
  }, [reviews, track, distance]);

  const saveReview = () => {
    if (!result.trim()) { flash("結果（例：1-4-7）を入力してください"); return; }
    const rec:ReviewRecord={ id:crypto.randomUUID(), raceName:raceName||`${track}${distance}m`, track, distance, raceClass, baba, result, reviewNote: reviewNote.trim() || autoReview, createdAt:new Date().toISOString(), ranked:ranked.map((h)=>({...h})), horses:horses.map((h)=>({...h})) };
    const next=[rec,...reviews].slice(0,500);
    setReviews(next); localStorage.setItem("keiba:reviews",JSON.stringify(next));
    flash("回顧データベースに登録しました");
  };

  const clearReviews = () => {
    if (!confirm("回顧データベースを全削除しますか？")) return;
    setReviews([]); localStorage.removeItem("keiba:reviews"); flash("回顧データを削除しました");
  };


  const downloadReviews = (format: "json" | "csv") => {
    if (!reviews.length) { flash("書き出す回顧データがありません"); return; }
    const content = format === "json" ? JSON.stringify({ version:1, exportedAt:new Date().toISOString(), reviews }, null, 2) : reviewsToCsv(reviews);
    const blob = new Blob([format === "csv" ? "\uFEFF" + content : content], { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `keiba-review-backup-${new Date().toISOString().slice(0,10)}.${format}`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    flash(`${format.toUpperCase()}を書き出しました`);
  };

  const importReviewsFile = (format: "json" | "csv") => {
    const input=document.createElement("input"); input.type="file"; input.accept=format === "json" ? ".json,application/json" : ".csv,text/csv";
    input.onchange=async()=>{
      const file=input.files?.[0]; if (!file) return;
      try {
        const text=await file.text(); let imported:ReviewRecord[]=[];
        if (format === "json") {
          const parsed=JSON.parse(text); imported=Array.isArray(parsed) ? parsed : Array.isArray(parsed?.reviews) ? parsed.reviews : [];
        } else imported=csvToReviews(text.replace(/^\uFEFF/, ""));
        imported=imported.filter((r)=>r && typeof r === "object").map((r:any)=>({
          id:r.id || crypto.randomUUID(), raceName:String(r.raceName || ""), track:String(r.track || ""), distance:String(r.distance || ""),
          raceClass:String(r.raceClass || ""), baba:String(r.baba || "良"), result:String(r.result || ""), reviewNote:String(r.reviewNote || ""),
          createdAt:r.createdAt || new Date().toISOString(), ranked:Array.isArray(r.ranked)?r.ranked:[], horses:Array.isArray(r.horses)?r.horses:[],
        }));
        if (!imported.length) { flash("読み込める回顧データがありませんでした"); return; }
        const replace=confirm(`${imported.length}件を読み取りました。\nOK：現在のDBを置き換え\nキャンセル：現在のDBへ追加`);
        const base=replace ? [] : reviews;
        const byId=new Map([...imported,...base].map((r)=>[r.id,r]));
        const next=Array.from(byId.values()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,500);
        setReviews(next); localStorage.setItem("keiba:reviews",JSON.stringify(next));
        flash(`${imported.length}件を復元しました`);
      } catch (e) { console.error(e); flash("ファイルの読み込みに失敗しました"); }
    };
    input.click();
  };

  const updateHorse = (id, field, value) => {
    setHorses((hs) => hs.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  };

  const addHorse = () => setHorses((hs) => [...hs, emptyHorse()]);
  const removeHorse = (id) => setHorses((hs) => hs.filter((h) => h.id !== id));

  const applyBulk = (mode) => {
    const parsed = parseBulkText(bulkText);
    if (parsed.length === 0) {
      flash("読み取れる行がありませんでした");
      return;
    }
    if (mode === "replace") setHorses(parsed);
    else setHorses((hs) => [...hs.filter((h) => h.name.trim() !== ""), ...parsed]);
    setBulkText("");
    flash(`${parsed.length}頭を取り込みました`);
  };

  const applyFourSources = () => {
    const parsed = mergeFourSources(raceCardText, standardIndexText, recentIndexText, paceText, track, distance);
    if (parsed.length === 0) {
      flash("4つの欄から馬番を読み取れませんでした");
      return;
    }
    setHorses(parsed);
    const oddsCount = parsed.filter((h) => h.odds !== "").length;
    const popularityCount = parsed.filter((h) => h.ninki !== "").length;
    flash(`${parsed.length}頭を統合（オッズ${oddsCount}頭・人気${popularityCount}頭）`);
  };

  const flash = (msg) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2200);
  };

  const save = () => {
    if (!raceName.trim()) {
      flash("レース名を入力してから保存してください");
      return;
    }
    const payload = JSON.stringify({ raceName, track, distance, raceClass, baba, oikomiBoost, correctionEnabled, correctionStrength, oddsCap, autoLearning, horses, result, reviewNote });
    try {
      const key = `race:${sanitizeKey(raceName)}`;
      localStorage.setItem(key, payload);
      flash("この端末に保存しました");
    } catch (e) {
      setExportText(payload);
      setShowExport(true);
      flash("自動保存に失敗したため、バックアップ用テキストを表示しました");
    }
  };

  const doExport = () => {
    const payload = JSON.stringify({ raceName, track, distance, raceClass, baba, oikomiBoost, correctionEnabled, correctionStrength, oddsCap, autoLearning, horses, result, reviewNote });
    setExportText(payload);
    setShowExport(true);
  };

  const doImport = () => {
    if (!importText.trim()) {
      flash("貼り付けるテキストがありません");
      return;
    }
    try {
      const data = JSON.parse(importText.trim());
      setRaceName(data.raceName ?? "");
      setTrack(data.track ?? "園田");
      setDistance(data.distance ?? "1400");
      setRaceClass(data.raceClass ?? "");
      setResult(data.result ?? "");
      setReviewNote(data.reviewNote ?? "");
      setBaba(data.baba ?? "良");
      setOikomiBoost(data.oikomiBoost ?? 4);
      setCorrectionEnabled(data.correctionEnabled ?? false);
      setCorrectionStrength(data.correctionStrength ?? 4);
      setOddsCap(data.oddsCap ?? 4);
      setAutoLearning(data.autoLearning ?? true);
      setHorses(data.horses?.length ? data.horses : [emptyHorse()]);
      setImportText("");
      setShowImport(false);
      flash("読み込みました");
    } catch (e) {
      flash("形式が正しくありません（書き出したテキストをそのまま貼り付けてください）");
    }
  };

  const load = () => {
    if (!raceName.trim()) {
      flash("レース名を入力してください");
      return;
    }
    try {
      const key = `race:${sanitizeKey(raceName)}`;
      const value = localStorage.getItem(key);
      if (!value) {
        flash("この端末に保存データがありません");
        return;
      }
      const data = JSON.parse(value);
      setTrack(data.track ?? "園田");
      setDistance(data.distance ?? "1400");
      setRaceClass(data.raceClass ?? "");
      setResult(data.result ?? "");
      setReviewNote(data.reviewNote ?? "");
      setBaba(data.baba ?? "良");
      setOikomiBoost(data.oikomiBoost ?? 4);
      setCorrectionEnabled(data.correctionEnabled ?? false);
      setCorrectionStrength(data.correctionStrength ?? 4);
      setOddsCap(data.oddsCap ?? 4);
      setAutoLearning(data.autoLearning ?? true);
      setHorses(data.horses?.length ? data.horses : [emptyHorse()]);
      flash("この端末のデータを読み込みました");
    } catch (e) {
      flash("保存データを読み込めませんでした");
    }
  };

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
        .kbt-row:hover { background: rgba(179,39,31,0.05); }
        .kbt-input:focus, .kbt-select:focus { outline: 2px solid #B3271F; outline-offset: 1px; }
        ::selection { background: #B3271F; color: #EFE9DA; }
      `}</style>

      <div style={styles.shell}>
        {/* Masthead */}
        <div style={styles.masthead}>
          <div style={styles.vertStrip}>四軸指数・馬柱予想帳</div>
          <div style={styles.mastheadMain}>
            <h1 style={styles.title}>予想帳 <span style={styles.versionTag}>Ver7.0 AI分析</span></h1>
            <p style={styles.subtitle}>地方競馬15場対応 ／ 距離別ロジック ／ 回顧DB・自動学習</p>
            <div style={styles.mastheadControls}>
              <input
                className="kbt-input"
                style={styles.raceNameInput}
                placeholder="レース名（例：園田8R C3一）"
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
              />
              <select className="kbt-select" style={styles.babaSelect} value={track} onChange={(e) => setTrack(e.target.value)}>
                {LOCAL_TRACKS.map((t) => <option key={t} value={t}>競馬場：{t}</option>)}
              </select>
              <input className="kbt-input" type="number" style={{ ...styles.babaSelect, width: 110 }} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="距離m" />
              <input className="kbt-input" style={{ ...styles.babaSelect, width: 130 }} value={raceClass} onChange={(e) => setRaceClass(e.target.value)} placeholder="クラス・条件" />
              <select
                className="kbt-select"
                style={styles.babaSelect}
                value={baba}
                onChange={(e) => setBaba(e.target.value)}
              >
                {Object.keys(BABA_WEIGHTS).map((b) => (
                  <option key={b} value={b}>
                    馬場：{b}
                  </option>
                ))}
              </select>
              <button style={styles.ghostBtn} onClick={save}>保存</button>
              <button style={styles.ghostBtn} onClick={load}>読込</button>
              <button style={styles.ghostBtn} onClick={doExport}>書き出し</button>
              <button style={styles.ghostBtn} onClick={() => setShowImport((v) => !v)}>貼り付け読込</button>
            </div>
          </div>
        </div>

        {status && <div style={styles.toast}>{status}</div>}

        {showExport && (
          <div style={styles.bulkBox}>
            <div style={styles.bulkHeader}>
              <span style={styles.bulkTitle}>書き出し（バックアップ用テキスト）</span>
              <button style={styles.linkBtn} onClick={() => setShowExport(false)}>閉じる</button>
            </div>
            <p style={styles.bulkHint}>
              下のテキストを全選択してコピーし、メモ帳などに保管してください。次回「貼り付け読込」に貼れば復元できます。
            </p>
            <textarea
              className="kbt-input"
              style={styles.bulkTextarea}
              value={exportText}
              readOnly
              rows={4}
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}

        {showImport && (
          <div style={styles.bulkBox}>
            <div style={styles.bulkHeader}>
              <span style={styles.bulkTitle}>貼り付け読込</span>
              <button style={styles.linkBtn} onClick={() => setShowImport(false)}>閉じる</button>
            </div>
            <p style={styles.bulkHint}>書き出したバックアップテキストをここに貼り付けてください。</p>
            <textarea
              className="kbt-input"
              style={styles.bulkTextarea}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              placeholder='{"raceName":"...", "horses":[...] }'
            />
            <button style={styles.ghostBtn} onClick={doImport}>この内容を読み込む</button>
          </div>
        )}


        <div style={styles.trackProfile}>
          <strong>{track} {distance ? `${distance}m` : ""}</strong>
          <span>コース重視 ×{weights.course.toFixed(2)}／距離重視 ×{weights.kyori.toFixed(2)}</span>
          <span>脚質補正：前 {(TRACK_BIAS[track]?.front ?? 0) + (profileFor(track, distance)?.front ?? 0)}・後 {(TRACK_BIAS[track]?.closing ?? 0) + (profileFor(track, distance)?.closing ?? 0)}</span>
          <span>{profileFor(track, distance)?.note ?? "会場別の基本補正"}</span>
        </div>

        {/* Weight readout */}
        <div style={styles.weightBar}>
          {AXIS.map((a) => (
            <div key={a.key} style={styles.weightChip}>
              <span style={styles.weightLabel}>{a.label}</span>
              <span style={styles.weightVal}>×{weights[a.key].toFixed(2)}</span>
            </div>
          ))}
          <div style={styles.boostControl}>
            <label style={styles.weightLabel}>差し・追込ボーナス</label>
            <input
              type="range"
              min="0"
              max="15"
              value={oikomiBoost}
              onChange={(e) => setOikomiBoost(Number(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.weightVal}>+{oikomiBoost}</span>
          </div>
        </div>

        <div style={styles.learningBar}>
          <label style={styles.correctionToggle}>
            <input type="checkbox" checked={autoLearning} onChange={(e)=>setAutoLearning(e.target.checked)} />
            回顧から自動学習
          </label>
          <span>同条件 {learned.count}戦</span>
          {learned.count >= 3 ? <span>学習補正：最高{learned.saikou>=0?"+":""}{learned.saikou.toFixed(3)}／近走{learned.kinsou>=0?"+":""}{learned.kinsou.toFixed(3)}／距離{learned.kyori>=0?"+":""}{learned.kyori.toFixed(3)}／コース{learned.course>=0?"+":""}{learned.course.toFixed(3)}</span> : <span>3戦以上で自動補正を開始</span>}
        </div>

        {/* Odds correction */}
        <div style={styles.correctionBar}>
          <label style={styles.correctionToggle}>
            <input
              type="checkbox"
              checked={correctionEnabled}
              onChange={(e) => setCorrectionEnabled(e.target.checked)}
            />
            馬券評価用の人気・オッズ補正
          </label>
          <div style={styles.controlItem}>
            <span style={styles.controlLabel}>補正の強さ</span>
            <input
              type="range"
              min="0"
              max="8"
              value={correctionStrength}
              disabled={!correctionEnabled}
              onChange={(e) => setCorrectionStrength(Number(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.controlVal}>+{correctionStrength}</span>
          </div>
          <div style={styles.controlItem}>
            <span style={styles.controlLabel}>減衰スケール（半減オッズ）</span>
            <input
              type="range"
              min="1.5"
              max="10"
              step="0.5"
              value={oddsCap}
              disabled={!correctionEnabled}
              onChange={(e) => setOddsCap(Number(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.controlVal}>{oddsCap}倍で半分</span>
          </div>
        </div>
        <p style={styles.controlHint}>
          初期設定はOFFです。能力順位と勝率目安は人気・オッズを使わず計算し、ON時の補正値は馬券判断の参考表示だけに使います。オッズ未取得時は補正されません。
        </p>

        {/* Four-source paste */}
        <div style={styles.bulkBox}>
          <div style={styles.bulkHeader}>
            <span style={styles.bulkTitle}>4種類のデータを一括読込</span>
            <button style={styles.linkBtn} onClick={() => setShowBulk((v) => !v)}>
              {showBulk ? "閉じる" : "開く"}
            </button>
          </div>
          {showBulk && (
            <>
              <p style={styles.bulkHint}>
                元サイトから「出走表」「タイム指数（標準）」「タイム指数（近5走）」「展開予測」を、それぞれ加工せず貼り付けてください。馬番をキーに統合します。
              </p>
              <label style={styles.pasteLabel}>① 出走表</label>
              <textarea className="kbt-input" style={styles.bulkTextarea} value={raceCardText} onChange={(e) => setRaceCardText(e.target.value)} placeholder="馬番・馬名・騎手・斤量・オッズ・人気などを含む出走表を貼り付け" rows={5} />
              <label style={styles.pasteLabel}>② タイム指数（標準）</label>
              <textarea className="kbt-input" style={styles.bulkTextarea} value={standardIndexText} onChange={(e) => setStandardIndexText(e.target.value)} placeholder="標準タイム指数の表を貼り付け" rows={5} />
              <label style={styles.pasteLabel}>③ タイム指数（近5走）</label>
              <textarea className="kbt-input" style={styles.bulkTextarea} value={recentIndexText} onChange={(e) => setRecentIndexText(e.target.value)} placeholder="各馬の近5走タイム指数を貼り付け" rows={7} />
              <label style={styles.pasteLabel}>④ 展開予測</label>
              <textarea className="kbt-input" style={styles.bulkTextarea} value={paceText} onChange={(e) => setPaceText(e.target.value)} placeholder={"逃げ 1 ...\n先行 4 ...\n差し 2 3 ...\n追込 5 ..."} rows={4} />
              <button style={styles.primaryBtn} onClick={applyFourSources}>4種類を統合して置き換え</button>
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>旧形式の1行1頭入力を使う</summary>
                <textarea className="kbt-input" style={{ ...styles.bulkTextarea, marginTop: 8 }} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="1  馬名  先行  85  80  78  75  5.5  3" rows={4} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.ghostBtn} onClick={() => applyBulk("append")}>追加</button>
                  <button style={styles.ghostBtn} onClick={() => applyBulk("replace")}>置き換え</button>
                </div>
              </details>
            </>
          )}
        </div>

        {/* Input table */}
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>枠</th>
                <th style={{ ...styles.th, textAlign: "left", minWidth: 120 }}>馬名</th>
                <th style={styles.th}>脚質</th>
                {AXIS.map((a) => (
                  <th key={a.key} style={styles.th}>{a.label}</th>
                ))}
                <th style={styles.th}>オッズ</th>
                <th style={styles.th}>人気</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {horses.map((h) => (
                <tr key={h.id} className="kbt-row">
                  <td style={styles.td}>
                    <input
                      className="kbt-input"
                      style={styles.numInputSm}
                      value={h.waku}
                      onChange={(e) => updateHorse(h.id, "waku", e.target.value)}
                    />
                  </td>
                  <td style={{ ...styles.td, textAlign: "left" }}>
                    <input
                      className="kbt-input"
                      style={styles.nameInput}
                      value={h.name}
                      onChange={(e) => updateHorse(h.id, "name", e.target.value)}
                      placeholder="馬名"
                    />
                  </td>
                  <td style={styles.td}>
                    <select
                      className="kbt-select"
                      style={styles.ashimukiSelect}
                      value={h.ashimuki}
                      onChange={(e) => updateHorse(h.id, "ashimuki", e.target.value)}
                    >
                      {ASHIMUKI.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </td>
                  {AXIS.map((a) => {
                    const val = h[a.key];
                    const outOfRange = val !== "" && !isNaN(val) && (Number(val) < 0 || Number(val) > 100);
                    return (
                      <td key={a.key} style={styles.td}>
                        <input
                          className="kbt-input"
                          type="number"
                          style={outOfRange ? { ...styles.numInput, ...styles.numInputWarn } : styles.numInput}
                          value={val}
                          onChange={(e) => updateHorse(h.id, a.key, e.target.value)}
                          placeholder="0-100"
                          title={outOfRange ? "0〜100の範囲外です。列がズレていないか確認してください" : undefined}
                        />
                      </td>
                    );
                  })}
                  <td style={styles.td}>
                    <input
                      className="kbt-input"
                      type="number"
                      style={styles.numInput}
                      value={h.odds}
                      onChange={(e) => updateHorse(h.id, "odds", e.target.value)}
                      placeholder="倍"
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      className="kbt-input"
                      type="number"
                      style={styles.numInputSm}
                      value={h.ninki}
                      onChange={(e) => updateHorse(h.id, "ninki", e.target.value)}
                      placeholder="人気"
                    />
                  </td>
                  <td style={styles.td}>
                    <button style={styles.removeBtn} onClick={() => removeHorse(h.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button style={styles.addBtn} onClick={addHorse}>＋ 馬を追加</button>
        </div>

        {/* Decision support */}
        {ranked.length > 0 && (
          <div style={styles.dashboardGrid}>
            <div style={styles.analysisCard}>
              <div style={styles.cardEyebrow}>レース診断</div>
              <div style={styles.chaosStars}>{"★".repeat(raceProfile.level)}{"☆".repeat(5 - raceProfile.level)}</div>
              <div style={styles.cardHeadline}>{raceProfile.label}</div>
              <div style={styles.cardMeta}>上位指数レンジ {raceProfile.gap}点／1・2位差 {raceProfile.topGap}点</div>
              <div style={styles.cardMeta}>{raceProfile.reason}</div>
            </div>
            <div style={styles.analysisCard}>
              <div style={styles.cardEyebrow}>期待値候補</div>
              {ranked.filter((h) => h.valueGrade !== "-").slice(0, 3).length ? (
                ranked.filter((h) => h.valueGrade !== "-").slice(0, 3).map((h) => (
                  <div key={h.id} style={styles.signalRow}>
                    <span>🔥 {h.waku || "-"} {h.name}</span>
                    <strong>期待値{h.valueGrade}{h.valueEdge !== null ? ` ${h.valueEdge > 0 ? "+" : ""}${h.valueEdge.toFixed(1)}pt` : ""}</strong>
                  </div>
                ))
              ) : <div style={styles.emptySignal}>オッズ・人気を入れると判定します</div>}
            </div>
            <div style={styles.analysisCard}>
              <div style={styles.cardEyebrow}>危険人気</div>
              {ranked.filter((h) => h.danger).slice(0, 3).length ? (
                ranked.filter((h) => h.danger).slice(0, 3).map((h) => (
                  <div key={h.id} style={styles.signalRow}>
                    <span>⚠ {h.waku || "-"} {h.name}</span>
                    <strong>{h.marketRank}人気／能力{h.abilityRank}位</strong>
                  </div>
                ))
              ) : <div style={styles.emptySignal}>強い危険シグナルなし</div>}
            </div>
          </div>
        )}

        {/* Ranking output */}
        {ranked.length > 0 && (
          <div style={styles.rankSection}>
            <h2 style={styles.rankTitle}>能力指数ランキング</h2>
            <div style={styles.rankList}>
              {ranked.map((h, i) => {
                const corr = oddsCorrection(h, effStrength, oddsCap);
                return (
                  <div key={h.id} style={styles.rankRow}>
                    <div style={{ ...styles.stamp, transform: `rotate(${i % 2 === 0 ? -4 : 3}deg)` }}>
                      {MARKS[i] ?? "－"}
                    </div>
                    <div style={styles.rankName}>
                      {h.waku && <span style={styles.wakuBadge}>{h.waku}</span>}
                      {h.name}
                      <span style={styles.rankAshimuki}>（{h.ashimuki}）</span>
                      {(h.odds !== "" || h.ninki !== "") && (
                        <span style={styles.rankOdds}>
                          {h.odds !== "" ? `${h.odds}倍` : ""}
                          {h.ninki !== "" ? ` ${h.ninki}人気` : ""}
                          {corr > 0 ? ` 補正+${corr}` : ""}
                        </span>
                      )}
                      {h.valueGrade !== "-" && <span style={styles.valueBadge}>期待値{h.valueGrade}</span>}
                      {h.danger && <span style={styles.dangerBadge}>危険人気</span>}
                      {h.stability !== null && <span style={styles.stabilityText}>安定 {h.stability}</span>}
                    </div>
                    <div style={styles.rankMetrics}>
                      <span style={styles.probability}>{(h.fairProb * 100).toFixed(1)}%</span>
                      <span style={styles.metricSub}>勝率目安</span>
                      <span style={styles.rankScore}>{h.abilityScore}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {ranked.length > 0 && (
          <div style={styles.aiPanel}>
            <div style={styles.betTitle}>AIスコア・自動コメント</div>
            {ranked.slice(0,5).map((h, i) => (
              <div key={h.id} style={styles.aiHorseCard}>
                <div style={styles.aiHorseHead}><strong>{MARKS[i] ?? "－"} {h.waku} {h.name}</strong><span>総合 {h.breakdown.total}</span></div>
                <div style={styles.scoreGrid}>
                  <span>能力 {h.breakdown.ability}</span><span>近走 {h.breakdown.recent}</span><span>距離 {h.breakdown.distance}</span><span>コース {h.breakdown.course}</span><span>展開 {h.breakdown.pace}</span>
                </div>
                <div style={styles.aiComment}>{h.aiComment}</div>
              </div>
            ))}
          </div>
        )}

        {betSuggestions.length > 0 && (
          <div style={styles.betBox}>
            <div style={styles.betTitle}>推奨買い目（点数を絞るためのたたき台）</div>
            <div style={styles.betGrid}>
              {betSuggestions.map((bet) => (
                <div key={bet.type} style={styles.betGroup}>
                  <div style={styles.betType}>{bet.type}</div>
                  {bet.tickets.map((ticket) => <div key={ticket} style={styles.betTicket}>{ticket}</div>)}
                </div>
              ))}
            </div>
            <div style={styles.betNote}>勝率は入力指数からの相対推定です。実際の的中率や利益を保証するものではありません。</div>
          </div>
        )}

        <div style={styles.reviewBox}>
          <div style={styles.betTitle}>結果・回顧</div>
          <div style={styles.reviewGrid}>
            <input className="kbt-input" style={styles.raceNameInput} value={result} onChange={(e) => setResult(e.target.value)} placeholder="結果（例：1-4-7）" />
            <textarea className="kbt-input" style={styles.reviewTextarea} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="展開、見落とし、次回の修正点を記録" rows={3} />
          </div>
          <div style={styles.autoReviewBox}><strong>AI自動回顧</strong><br/>{autoReview}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
            <button style={styles.ghostBtn} onClick={saveReview}>結果を回顧DBへ登録</button>
            <button style={styles.ghostBtn} onClick={()=>setShowStats((v)=>!v)}>{showStats?"統計を閉じる":"統計を見る"}</button>
          </div>
          <div style={styles.betNote}>登録すると会場・距離別成績と自動学習へ反映されます。</div>
        </div>

        {showStats && (
          <div style={styles.statsBox}>
            <div style={styles.betTitle}>地方競馬 回顧データベース</div>
            <div style={styles.statsGrid}>
              <div><strong>{track}{distance}m</strong><br/>登録 {stats.current.count}戦<br/>◎勝率 {stats.current.count?Math.round(stats.current.win/stats.current.count*100):0}%<br/>上位2頭内で1・2着 {stats.current.count?Math.round(stats.current.exacta/stats.current.count*100):0}%<br/>印5頭内三着内網羅 {stats.current.count?Math.round(stats.current.trio/stats.current.count*100):0}%</div>
              <div><strong>全会場</strong><br/>登録 {stats.all.count}戦<br/>◎勝率 {stats.all.count?Math.round(stats.all.win/stats.all.count*100):0}%<br/>危険人気消し成功 {stats.all.dangerTotal?Math.round(stats.all.dangerHit/stats.all.dangerTotal*100):0}%<br/>保存上限 500戦</div>
            </div>
            {trackDistanceStats.length > 0 && <div style={styles.trackStatsTable}>
              <strong>会場・距離別</strong>
              {trackDistanceStats.map(([key,v])=><div key={key} style={styles.historyRow}><span>{key}　{v.count}戦</span><strong>◎{Math.round(v.win/v.count*100)}% ／ 印内{Math.round(v.trio/v.count*100)}%</strong></div>)}
            </div>}
            {reviews.slice(0,5).map((r)=><div key={r.id} style={styles.historyRow}><span>{new Date(r.createdAt).toLocaleDateString("ja-JP")} {r.track}{r.distance}m {r.raceName}</span><strong>{r.result}</strong></div>)}
            <div style={styles.backupBox}>
              <strong>バックアップ・復元</strong>
              <div style={styles.backupButtons}>
                <button style={styles.ghostBtn} onClick={()=>downloadReviews("json")}>JSON書き出し</button>
                <button style={styles.ghostBtn} onClick={()=>downloadReviews("csv")}>CSV書き出し</button>
                <button style={styles.ghostBtn} onClick={()=>importReviewsFile("json")}>JSON読み込み</button>
                <button style={styles.ghostBtn} onClick={()=>importReviewsFile("csv")}>CSV読み込み</button>
              </div>
              <div style={styles.betNote}>読み込み時は「置き換え」か「追加」を選べます。端末変更前はJSON保存がおすすめです。</div>
            </div>
            <button style={{...styles.linkBtn,marginTop:8}} onClick={clearReviews}>回顧DBを全削除</button>
          </div>
        )}

        {/* 3頭選ぶなら */}
        {top3.length === 3 && (
          <div style={styles.distillBox}>
            <div style={styles.distillLabel}>3頭選ぶなら</div>
            <div style={styles.distillHorses}>
              {top3.map((h, i) => (
                <span key={h.id} style={styles.distillHorse}>
                  {MARKS[i]}{h.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#EFE9DA",
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(0,0,0,0.015) 0px, rgba(0,0,0,0.015) 1px, transparent 1px, transparent 3px)",
    fontFamily: "'Noto Sans JP', sans-serif",
    color: "#1C1A17",
    padding: "24px 12px 60px",
  },
  shell: { maxWidth: 900, margin: "0 auto" },
  masthead: {
    display: "flex",
    borderBottom: "3px solid #1C1A17",
    marginBottom: 16,
  },
  vertStrip: {
    writingMode: "vertical-rl",
    letterSpacing: "0.3em",
    fontFamily: "'Noto Serif JP', serif",
    fontWeight: 700,
    fontSize: 13,
    color: "#EFE9DA",
    background: "#B3271F",
    padding: "14px 8px",
    marginRight: 14,
  },
  mastheadMain: { flex: 1, paddingBottom: 10 },
  title: {
    fontFamily: "'Noto Serif JP', serif",
    fontWeight: 900,
    fontSize: 40,
    margin: "0 0 2px",
    letterSpacing: "0.05em",
  },
  versionTag: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#B3271F", verticalAlign: "middle" },
  subtitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "#6b6455",
    margin: "0 0 12px",
    letterSpacing: "0.05em",
  },
  mastheadControls: { display: "flex", gap: 8, flexWrap: "wrap" },
  raceNameInput: {
    flex: "1 1 220px",
    padding: "8px 10px",
    border: "1px solid #1C1A17",
    background: "#fff",
    fontSize: 14,
    fontFamily: "'Noto Sans JP', sans-serif",
  },
  babaSelect: {
    padding: "8px 10px",
    border: "1px solid #1C1A17",
    background: "#fff",
    fontSize: 13,
  },
  ghostBtn: {
    padding: "8px 14px",
    border: "1px solid #1C1A17",
    background: "transparent",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  toast: {
    background: "#1C1A17",
    color: "#EFE9DA",
    fontSize: 12,
    padding: "6px 12px",
    display: "inline-block",
    marginBottom: 12,
  },
  trackProfile: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", background: "#1C1A17", color: "#EFE9DA", marginBottom: 10, fontSize: 12 },
  reviewBox: { border: "2px solid #1C1A17", background: "#fff", padding: 14, marginTop: 18, marginBottom: 16 },
  reviewGrid: { display: "grid", gridTemplateColumns: "minmax(180px, 0.4fr) minmax(260px, 1fr)", gap: 10, marginTop: 10 },
  reviewTextarea: { width: "100%", padding: 10, border: "1px solid #1C1A17", resize: "vertical", fontFamily: "inherit" },
  weightBar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    padding: "10px 12px",
    border: "1px dashed #B3271F",
    marginBottom: 16,
    fontFamily: "'JetBrains Mono', monospace",
  },
  weightChip: { display: "flex", gap: 4, fontSize: 12 },
  weightLabel: { color: "#6b6455" },
  weightVal: { fontWeight: 700, color: "#B3271F" },
  boostControl: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" },
  slider: { width: 100 },
  correctionBar: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
    alignItems: "center",
    padding: "10px 12px",
    border: "1px dashed #B8860B",
    marginBottom: 6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  correctionToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'Noto Serif JP', serif",
    fontWeight: 700,
    fontSize: 13,
    color: "#B8860B",
  },
  controlItem: { display: "flex", alignItems: "center", gap: 8 },
  controlLabel: { fontSize: 12, color: "#6b6455" },
  controlVal: { fontSize: 12, fontWeight: 700, color: "#B8860B", minWidth: 60 },
  controlHint: { fontSize: 12, color: "#6b6455", marginBottom: 16, lineHeight: 1.6 },
  bulkBox: {
    border: "1px solid #1C1A17",
    background: "#fff",
    padding: "10px 14px",
    marginBottom: 16,
  },
  bulkHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  bulkTitle: { fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 14 },
  linkBtn: {
    border: "none",
    background: "none",
    color: "#B3271F",
    fontSize: 12,
    textDecoration: "underline",
    cursor: "pointer",
  },
  pasteLabel: { display: "block", margin: "12px 0 5px", fontWeight: 700, fontSize: 13 },
  bulkHint: {
    fontSize: 12,
    color: "#6b6455",
    lineHeight: 1.6,
    margin: "8px 0",
  },
  code: {
    fontFamily: "'JetBrains Mono', monospace",
    background: "#EFE9DA",
    padding: "1px 4px",
  },
  bulkTextarea: {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #C9C0AC",
    background: "#fff",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    marginBottom: 8,
    resize: "vertical",
  },
  tableWrap: { marginBottom: 24, overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    borderBottom: "2px solid #1C1A17",
    padding: "6px 4px",
    fontFamily: "'Noto Serif JP', serif",
    fontWeight: 700,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  td: { borderBottom: "1px solid #C9C0AC", padding: "5px 4px", textAlign: "center" },
  nameInput: {
    width: "100%",
    minWidth: 110,
    padding: "5px 6px",
    border: "1px solid #C9C0AC",
    background: "#fff",
    fontSize: 13,
  },
  numInput: {
    width: 60,
    padding: "5px 4px",
    border: "1px solid #C9C0AC",
    background: "#fff",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: "center",
  },
  numInputWarn: {
    border: "1.5px solid #B3271F",
    background: "#FBEAE8",
  },
  numInputSm: {
    width: 34,
    padding: "5px 2px",
    border: "1px solid #C9C0AC",
    background: "#fff",
    fontSize: 13,
    textAlign: "center",
  },
  ashimukiSelect: {
    padding: "5px 4px",
    border: "1px solid #C9C0AC",
    background: "#fff",
    fontSize: 12,
  },
  removeBtn: {
    border: "none",
    background: "transparent",
    color: "#B3271F",
    cursor: "pointer",
    fontSize: 14,
  },
  addBtn: {
    marginTop: 8,
    padding: "7px 16px",
    border: "1px solid #1C1A17",
    background: "transparent",
    fontSize: 13,
    cursor: "pointer",
  },
  rankSection: { marginBottom: 20 },
  rankTitle: {
    fontFamily: "'Noto Serif JP', serif",
    fontWeight: 700,
    fontSize: 18,
    borderBottom: "2px solid #1C1A17",
    paddingBottom: 4,
    marginBottom: 10,
  },
  rankList: { display: "flex", flexDirection: "column" },
  rankRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 4px",
    borderBottom: "1px solid #C9C0AC",
  },
  stamp: {
    width: 34,
    height: 34,
    minWidth: 34,
    borderRadius: "50%",
    border: "2.5px solid #B3271F",
    color: "#B3271F",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Noto Serif JP', serif",
    fontWeight: 900,
    fontSize: 16,
  },
  rankName: { flex: 1, fontSize: 15, fontWeight: 500 },
  wakuBadge: {
    display: "inline-block",
    minWidth: 18,
    padding: "0 4px",
    marginRight: 6,
    border: "1px solid #1C1A17",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
  },
  rankAshimuki: { color: "#6b6455", fontSize: 12, marginLeft: 4 },
  rankOdds: {
    color: "#B8860B",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    marginLeft: 8,
  },
  rankScore: { fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16 },
  distillBox: {
    border: "2px solid #1C1A17",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    background: "#fff",
  },
  distillLabel: {
    fontFamily: "'Noto Serif JP', serif",
    fontWeight: 700,
    fontSize: 14,
    color: "#B3271F",
    whiteSpace: "nowrap",
  },
  distillHorses: { display: "flex", gap: 16, flexWrap: "wrap" },
  distillHorse: { fontSize: 15, fontWeight: 700, fontFamily: "'Noto Serif JP', serif" },

  dashboardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 20 },
  analysisCard: { border: "1px solid #1C1A17", background: "#fff", padding: "12px 14px", minHeight: 116 },
  cardEyebrow: { fontSize: 11, color: "#6b6455", letterSpacing: "0.12em", marginBottom: 6 },
  chaosStars: { color: "#B3271F", letterSpacing: "0.08em", fontSize: 18 },
  cardHeadline: { fontFamily: "'Noto Serif JP', serif", fontWeight: 900, fontSize: 20, marginTop: 3 },
  cardMeta: { fontSize: 11, color: "#6b6455", marginTop: 6 },
  signalRow: { display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #E5DECF", padding: "5px 0", fontSize: 12 },
  emptySignal: { color: "#8a8170", fontSize: 12, paddingTop: 10 },
  valueBadge: { display: "inline-block", marginLeft: 8, padding: "1px 5px", background: "#F5E7B8", color: "#7A5700", fontSize: 10, fontWeight: 700 },
  dangerBadge: { display: "inline-block", marginLeft: 6, padding: "1px 5px", background: "#FBEAE8", color: "#B3271F", fontSize: 10, fontWeight: 700 },
  stabilityText: { marginLeft: 7, color: "#6b6455", fontSize: 10 },
  rankMetrics: { minWidth: 74, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 5, alignItems: "center", textAlign: "right" },
  probability: { fontFamily: "'JetBrains Mono', monospace", color: "#B3271F", fontWeight: 700, fontSize: 14 },
  metricSub: { gridColumn: "1", fontSize: 9, color: "#8a8170" },
  betBox: { border: "2px solid #B3271F", background: "#fff", padding: "14px 16px", marginBottom: 18 },
  betTitle: { fontFamily: "'Noto Serif JP', serif", fontWeight: 900, color: "#B3271F", marginBottom: 10 },
  betGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 },
  betGroup: { borderLeft: "3px solid #1C1A17", paddingLeft: 9 },
  betType: { fontSize: 11, color: "#6b6455", marginBottom: 3 },
  betTicket: { fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, lineHeight: 1.7 },
  betNote: { marginTop: 10, fontSize: 10, color: "#8a8170" },
  learningBar: { display:"flex", gap:12, flexWrap:"wrap", alignItems:"center", padding:"9px 12px", border:"1px dashed #356B4A", marginBottom:12, fontSize:11, color:"#356B4A" },
  statsBox: { border:"2px solid #1C1A17", background:"#fff", padding:14, marginBottom:18 },
  statsGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:10, lineHeight:1.8, fontSize:12 },
  historyRow: { display:"flex", justifyContent:"space-between", gap:10, borderTop:"1px solid #E5DECF", padding:"6px 0", fontSize:11 },
  aiPanel: { border:"2px solid #1C1A17", background:"#fff", padding:14, marginBottom:18 },
  aiHorseCard: { borderTop:"1px solid #E5DECF", padding:"9px 0" },
  aiHorseHead: { display:"flex", justifyContent:"space-between", gap:8, fontSize:13 },
  scoreGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(82px,1fr))", gap:5, marginTop:6, fontSize:10, color:"#6b6455", fontFamily:"'JetBrains Mono', monospace" },
  aiComment: { marginTop:6, fontSize:11, lineHeight:1.6 },
  backupBox: { marginTop:14, padding:"12px", border:"1px dashed #9B7B2F", background:"#FFFDF6" },
  backupButtons: { display:"flex", gap:8, flexWrap:"wrap", marginTop:9 },
  autoReviewBox: { marginTop:10, padding:"10px 12px", border:"1px dashed #356B4A", background:"#F5FAF6", fontSize:11, lineHeight:1.7 },
  trackStatsTable: { marginTop:10, marginBottom:10, paddingTop:8, borderTop:"2px solid #1C1A17" },
};
