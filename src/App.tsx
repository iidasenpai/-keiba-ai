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

function trackAdjustedWeights(track: string, baba: string) {
  const base = BABA_WEIGHTS[baba];
  const bias = TRACK_BIAS[track] ?? { course: 0, kyori: 0, kinsou: 0, saikou: 0, front: 0, closing: 0 };
  const raw = {
    saikou: Math.max(0.05, base.saikou + bias.saikou),
    kinsou: Math.max(0.05, base.kinsou + bias.kinsou),
    kyori: Math.max(0.05, base.kyori + bias.kyori),
    course: Math.max(0.05, base.course + bias.course),
  };
  const total = raw.saikou + raw.kinsou + raw.kyori + raw.course;
  return {
    saikou: raw.saikou / total,
    kinsou: raw.kinsou / total,
    kyori: raw.kyori / total,
    course: raw.course / total,
  };
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
  const styleBias = h.ashimuki === "逃げ" || h.ashimuki === "先行" ? bias.front : bias.closing;
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

  const weights = trackAdjustedWeights(track, baba);
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
        return { ...horse, abilityRank: abilityRank.get(horse.id), marketRank, fairProb, marketProb, valueEdge, rankGap, valueGrade, danger };
      })
      .sort((a, b) => b.abilityScore - a.abilityScore);
  }, [horses, weights, oikomiBoost, effStrength, oddsCap, track]);

  const raceProfile = useMemo(() => {
    if (ranked.length < 2) return { level: 1, label: "判定待ち", gap: 0 };
    const scores = ranked.map((horse) => horse.abilityScore).sort((a, b) => b - a).slice(0, Math.min(5, ranked.length));
    const gap = Math.max(...scores) - Math.min(...scores);
    const topGap = scores[0] - scores[1];
    const level = gap <= 3 ? 5 : gap <= 5 ? 4 : gap <= 8 ? 3 : topGap <= 2 ? 2 : 1;
    const labels = { 1: "本命戦", 2: "やや本命", 3: "標準", 4: "混戦", 5: "超混戦" };
    return { level, label: labels[level], gap: Math.round(gap * 10) / 10 };
  }, [ranked]);

  const betSuggestions = useMemo(() => buildBetSuggestions(ranked, raceProfile), [ranked, raceProfile]);
  const top3 = ranked.slice(0, 3);

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
    const payload = JSON.stringify({ raceName, track, distance, raceClass, baba, oikomiBoost, correctionEnabled, correctionStrength, oddsCap, horses, result, reviewNote });
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
    const payload = JSON.stringify({ raceName, track, distance, raceClass, baba, oikomiBoost, correctionEnabled, correctionStrength, oddsCap, horses, result, reviewNote });
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
            <h1 style={styles.title}>予想帳 <span style={styles.versionTag}>Ver3.0 地方全場</span></h1>
            <p style={styles.subtitle}>地方競馬15場対応 ／ 会場別バイアス ／ 予想・結果・回顧</p>
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
          <span>脚質補正：前 {TRACK_BIAS[track]?.front ?? 0}・後 {TRACK_BIAS[track]?.closing ?? 0}</span>
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
              <div style={styles.cardMeta}>上位指数レンジ {raceProfile.gap}点</div>
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
          <div style={styles.betNote}>保存すると予想データと結果・回顧を同じレース名で端末に残せます。</div>
        </div>

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
};
