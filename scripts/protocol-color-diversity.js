const fs = require("fs");
const path = require("path");

const root = process.cwd();
const cardDefsPath = path.join(root, "client", "src", "data", "cardDefs.ts");
const mainUnit2Path = path.join(root, "client", "src", "data", "mainUnit2Generated.ts");
const pairingsReportPath = path.join(root, "docs", "protocol-diversity-pairings.md");
const heatmapSvgPath = path.join(root, "docs", "protocol-diversity-heatmap.svg");

function parseColorMap(fileText, exportName) {
  const reMapBlock = new RegExp(`export const ${exportName}[^=]*=\\s*new Map(?:<[^>]+>)?\\(\\[(.*?)\\]\\);`, "s");
  const reArrayBlock = new RegExp(`export const ${exportName}[^=]*=\\s*\\[(.*?)\\];`, "s");
  const blockMatch = fileText.match(reMapBlock) || fileText.match(reArrayBlock);
  if (!blockMatch) return new Map();
  const block = blockMatch[1];
  const reEntry = /\["(proto_[a-z0-9]+)",\s*0x([0-9a-fA-F]{6})\]/g;
  const out = new Map();
  let m;
  while ((m = reEntry.exec(block)) !== null) {
    out.set(m[1], parseInt(m[2], 16));
  }
  return out;
}

function parseNameMap(fileText, exportName) {
  const reMapBlock = new RegExp(`export const ${exportName}[^=]*=\\s*new Map(?:<[^>]+>)?\\(\\[(.*?)\\]\\);`, "s");
  const reArrayBlock = new RegExp(`export const ${exportName}[^=]*=\\s*\\[(.*?)\\];`, "s");
  const blockMatch = fileText.match(reMapBlock) || fileText.match(reArrayBlock);
  if (!blockMatch) return new Map();
  const block = blockMatch[1];
  const reEntry = /\["(proto_[a-z0-9]+)",\s*"([^"]+)"\]/g;
  const out = new Map();
  let m;
  while ((m = reEntry.exec(block)) !== null) {
    out.set(m[1], m[2]);
  }
  return out;
}

function mergeMaps(base, extra) {
  const out = new Map(base);
  for (const [k, v] of extra) out.set(k, v);
  return out;
}

function rgbFromInt(c) {
  return {
    r: (c >> 16) & 0xff,
    g: (c >> 8) & 0xff,
    b: c & 0xff,
  };
}

function intFromRgb(r, g, b) {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function rgbToHsv(cInt) {
  const { r, g, b } = rgbFromInt(cInt);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToInt(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rn = 0, gn = 0, bn = 0;
  if (hh < 60) [rn, gn, bn] = [c, x, 0];
  else if (hh < 120) [rn, gn, bn] = [x, c, 0];
  else if (hh < 180) [rn, gn, bn] = [0, c, x];
  else if (hh < 240) [rn, gn, bn] = [0, x, c];
  else if (hh < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return intFromRgb(
    Math.round((rn + m) * 255),
    Math.round((gn + m) * 255),
    Math.round((bn + m) * 255),
  );
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function scoreSummary(primary, accent, originalPrimary, originalAccent) {
  const scores = buildScores(primary, accent);
  const min = scores.length ? scores[0].score : 0;
  const avg = scores.length ? scores.reduce((s, p) => s + p.score, 0) / scores.length : 0;

  let shiftSum = 0;
  let shiftCount = 0;
  for (const [id, c] of primary) {
    const orig = originalPrimary.get(id);
    if (orig != null) {
      shiftSum += deltaE76(c, orig);
      shiftCount++;
    }
  }
  for (const [id, c] of accent) {
    const orig = originalAccent.get(id);
    if (orig != null) {
      shiftSum += deltaE76(c, orig);
      shiftCount++;
    }
  }
  const avgShift = shiftCount ? shiftSum / shiftCount : 0;
  return { min, avg, avgShift };
}

function optimizePalette(ids, primary, accent, mode, iterations, penalty) {
  const originalPrimary = new Map(primary);
  const originalAccent = new Map(accent);
  const rand = mulberry32(1337);
  const allowed = mode === "accent" ? ["accent"] : ["primary", "accent"];

  const curPrimary = new Map(primary);
  const curAccent = new Map(accent);
  let cur = scoreSummary(curPrimary, curAccent, originalPrimary, originalAccent);
  let curObjective = cur.min - penalty * cur.avgShift;

  let bestPrimary = new Map(curPrimary);
  let bestAccent = new Map(curAccent);
  let best = { ...cur };
  let bestObjective = curObjective;

  for (let step = 0; step < iterations; step++) {
    const pid = ids[Math.floor(rand() * ids.length)];
    const which = allowed[Math.floor(rand() * allowed.length)];
    const targetMap = which === "primary" ? curPrimary : curAccent;
    const oldColor = targetMap.get(pid);
    if (oldColor == null) continue;

    const hsv = rgbToHsv(oldColor);
    const t = step / Math.max(1, iterations - 1);
    const ampH = 30 * (1 - t) + 8;
    const ampS = 0.25 * (1 - t) + 0.06;
    const ampV = 0.22 * (1 - t) + 0.06;
    const newH = hsv.h + (rand() * 2 - 1) * ampH;
    const newS = Math.max(0.2, Math.min(1, hsv.s + (rand() * 2 - 1) * ampS));
    const newV = Math.max(0.25, Math.min(1, hsv.v + (rand() * 2 - 1) * ampV));
    const newColor = hsvToInt(newH, newS, newV);

    targetMap.set(pid, newColor);
    const next = scoreSummary(curPrimary, curAccent, originalPrimary, originalAccent);
    const nextObjective = next.min - penalty * next.avgShift;

    const temp = 0.35 * (1 - t) + 0.02;
    const accept = nextObjective >= curObjective || rand() < Math.exp((nextObjective - curObjective) / temp);
    if (accept) {
      cur = next;
      curObjective = nextObjective;
      if (nextObjective > bestObjective) {
        bestObjective = nextObjective;
        best = { ...next };
        bestPrimary = new Map(curPrimary);
        bestAccent = new Map(curAccent);
      }
    } else {
      targetMap.set(pid, oldColor);
    }
  }

  return { bestPrimary, bestAccent, best };
}

function srgbToLinear(v) {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function rgbToLab(cInt) {
  const { r, g, b } = rgbFromInt(cInt);
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  // D65
  const X = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const Y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const Z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;

  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;

  function f(t) {
    const d = 6 / 29;
    return t > d ** 3 ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
  }

  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function deltaE76(c1, c2) {
  const a = rgbToLab(c1);
  const b = rgbToLab(c2);
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function pairScore(protoA, protoB, primaryMap, accentMap) {
  const pA = primaryMap.get(protoA);
  const pB = primaryMap.get(protoB);
  const aA = accentMap.get(protoA);
  const aB = accentMap.get(protoB);
  if ([pA, pB, aA, aB].some((v) => v == null)) return null;
  return deltaE76(pA, pB) + deltaE76(aA, aB);
}

function normalize01(value, min, max) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function grayHex01(v) {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 255);
  const h = n.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

function formatHex(cInt) {
  return `#${cInt.toString(16).padStart(6, "0")}`;
}

function parseHexColor(text) {
  const cleaned = text.replace(/^#/, "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

function applyOverrides(primary, accent) {
  const args = process.argv.slice(2);
  const setArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--set" && args[i + 1]) {
      setArgs.push(args[i + 1]);
      i++;
    }
  }
  if (setArgs.length === 0) return;

  for (const spec of setArgs) {
    // Format: proto_tim=#112233,#aabbcc
    const [proto, colorPart] = spec.split("=");
    if (!proto || !colorPart) continue;
    const [primaryHex, accentHex] = colorPart.split(",");
    const p = primaryHex ? parseHexColor(primaryHex) : null;
    const a = accentHex ? parseHexColor(accentHex) : null;
    if (p != null) primary.set(proto, p);
    if (a != null) accent.set(proto, a);
  }
}

function getArgValue(flag, fallback) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  if (idx === -1 || !args[idx + 1]) return fallback;
  return args[idx + 1];
}

function buildScores(primaryMap, accentMap) {
  const ids = [...primaryMap.keys()].filter((k) => accentMap.has(k)).sort();
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const score = pairScore(a, b, primaryMap, accentMap);
      if (score != null) out.push({ a, b, score });
    }
  }
  out.sort((x, y) => x.score - y.score);
  return out;
}

function buildMatrix(ids, primaryMap, accentMap) {
  const scoreByPair = new Map();
  const allScores = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const s = pairScore(a, b, primaryMap, accentMap);
      if (s == null) continue;
      scoreByPair.set(`${a}|${b}`, s);
      scoreByPair.set(`${b}|${a}`, s);
      allScores.push(s);
    }
  }
  const maxScore = allScores.length ? Math.max(...allScores) : 1;
  const minScore = 0; // equal colors should map to black

  const rows = ids.map((a) => {
    return ids.map((b) => {
      if (a === b) return 0;
      return scoreByPair.get(`${a}|${b}`) ?? 0;
    });
  });

  return { rows, minScore, maxScore };
}

function writePairingsReport(ids, names, primary, accent) {
  const scores = buildScores(primary, accent);
  const maxScore = scores.length ? scores[scores.length - 1].score : 1;
  const lines = [];
  lines.push("# Protocol Diversity Pairings");
  lines.push("");
  lines.push("Metric: `diversity(A,B) = deltaE76(primaryA, primaryB) + deltaE76(accentA, accentB)`.");
  lines.push("");
  lines.push("Grayscale encoding:");
  lines.push("- Black (`#000000`) means equal colors (score 0).");
  lines.push("- White (`#ffffff`) means maximum observed diversity pairing in current palette.");
  lines.push("- Only unique pairs are listed (A,B); mirrored duplicates (B,A) and self-pairs are omitted.");
  lines.push("");
  lines.push("| Protocol A | Protocol B | Score | Normalized | Grayscale |");
  lines.push("|---|---|---:|---:|---|");

  for (const row of scores) {
    const n = normalize01(row.score, 0, maxScore);
    const gray = grayHex01(n);
    const aName = names.get(row.a) ?? row.a;
    const bName = names.get(row.b) ?? row.b;
    lines.push(`| ${aName} | ${bName} | ${row.score.toFixed(2)} | ${n.toFixed(3)} | <span style=\"display:inline-block;width:72px;height:12px;background:${gray};border:1px solid #666\"></span> ${gray} |`);
  }

  fs.writeFileSync(pairingsReportPath, `${lines.join("\n")}\n`, "utf8");
}

function writeHeatmapSvg(ids, names, primary, accent) {
  const { rows, maxScore } = buildMatrix(ids, primary, accent);
  const n = ids.length;
  const cell = 16;
  const left = 220;
  const top = 180;
  const width = left + n * cell + 40;
  const height = top + n * cell + 90;

  const parts = [];
  parts.push(`<?xml version=\"1.0\" encoding=\"UTF-8\"?>`);
  parts.push(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${width}\" height=\"${height}\" viewBox=\"0 0 ${width} ${height}\">`);
  parts.push(`<rect x=\"0\" y=\"0\" width=\"${width}\" height=\"${height}\" fill=\"#101010\"/>`);
  parts.push(`<text x=\"20\" y=\"36\" fill=\"#f0f0f0\" font-size=\"20\" font-family=\"monospace\" font-weight=\"bold\">Protocol Pair Diversity Heatmap (Grayscale)</text>`);
  parts.push(`<text x=\"20\" y=\"58\" fill=\"#d0d0d0\" font-size=\"13\" font-family=\"monospace\">Black = equal colors (0). White = maximum observed pairing (${maxScore.toFixed(2)}). Upper triangle only.</text>`);

  // Legend gradient
  const legendX = 20;
  const legendY = 80;
  const legendW = 220;
  const legendH = 18;
  parts.push(`<defs><linearGradient id=\"g\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"0%\"><stop offset=\"0%\" stop-color=\"#000\"/><stop offset=\"100%\" stop-color=\"#fff\"/></linearGradient></defs>`);
  parts.push(`<rect x=\"${legendX}\" y=\"${legendY}\" width=\"${legendW}\" height=\"${legendH}\" fill=\"url(#g)\" stroke=\"#666\"/>`);
  parts.push(`<text x=\"${legendX}\" y=\"${legendY + 34}\" fill=\"#ccc\" font-size=\"12\" font-family=\"monospace\">0</text>`);
  parts.push(`<text x=\"${legendX + legendW - 36}\" y=\"${legendY + 34}\" fill=\"#ccc\" font-size=\"12\" font-family=\"monospace\">${maxScore.toFixed(2)}</text>`);

  // Axis labels
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    const name = names.get(id) ?? id;
    const y = top + i * cell + cell * 0.75;
    parts.push(`<text x=\"${left - 8}\" y=\"${y}\" fill=\"#dddddd\" font-size=\"10\" text-anchor=\"end\" font-family=\"monospace\">${name}</text>`);

    const x = left + i * cell + cell * 0.5;
    parts.push(`<g transform=\"translate(${x},${top - 8}) rotate(-65)\"><text fill=\"#dddddd\" font-size=\"10\" text-anchor=\"end\" font-family=\"monospace\">${name}</text></g>`);
  }

  // Cells
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = left + c * cell;
      const y = top + r * cell;
      if (c <= r) {
        // Mask diagonal and lower triangle (self + mirrored duplicates).
        parts.push(`<rect x=\"${x}\" y=\"${y}\" width=\"${cell}\" height=\"${cell}\" fill=\"#101010\" stroke=\"#232323\"/>`);
        continue;
      }
      const score = rows[r][c];
      const gray = grayHex01(normalize01(score, 0, maxScore));
      parts.push(`<rect x=\"${x}\" y=\"${y}\" width=\"${cell}\" height=\"${cell}\" fill=\"${gray}\" stroke=\"#232323\"/>`);
    }
  }

  parts.push(`</svg>`);
  fs.writeFileSync(heatmapSvgPath, parts.join("\n"), "utf8");
}

function loadMaps() {
  const cardDefsText = fs.readFileSync(cardDefsPath, "utf8");
  const mainUnit2Text = fs.readFileSync(mainUnit2Path, "utf8");

  const basePrimary = parseColorMap(cardDefsText, "PROTOCOL_COLORS");
  const baseAccent = parseColorMap(cardDefsText, "PROTOCOL_ACCENT_COLORS");
  const baseNames = parseNameMap(cardDefsText, "PROTOCOL_NAMES_CLIENT");
  const m2Primary = parseColorMap(mainUnit2Text, "GENERATED_MAIN_UNIT_2_PROTOCOL_COLORS");
  const m2Accent = parseColorMap(mainUnit2Text, "GENERATED_MAIN_UNIT_2_PROTOCOL_ACCENT_COLORS");
  const m2Names = parseNameMap(mainUnit2Text, "GENERATED_MAIN_UNIT_2_PROTOCOL_NAMES");

  if (m2Primary.size === 0 || m2Accent.size === 0) {
    console.warn("Warning: generated protocol maps parsed as empty; check regex patterns.");
  }

  return {
    debug: {
      basePrimary: basePrimary.size,
      baseAccent: baseAccent.size,
      m2Primary: m2Primary.size,
      m2Accent: m2Accent.size,
    },
    primary: mergeMaps(basePrimary, m2Primary),
    accent: mergeMaps(baseAccent, m2Accent),
    names: mergeMaps(baseNames, m2Names),
  };
}

function main() {
  const loaded = loadMaps();
  const { debug, primary, accent, names } = loaded;
  const originalPrimary = new Map(primary);
  const originalAccent = new Map(accent);
  applyOverrides(primary, accent);

  const optimizeMode = getArgValue("--optimize", "");
  if (optimizeMode === "accent" || optimizeMode === "both") {
    const ids = [...primary.keys()].filter((k) => accent.has(k));
    const iterations = Number(getArgValue("--iterations", "120000"));
    const penalty = Number(getArgValue("--penalty", "0.22"));
    const opt = optimizePalette(
      ids,
      primary,
      accent,
      optimizeMode,
      Number.isFinite(iterations) ? iterations : 120000,
      Number.isFinite(penalty) ? penalty : 0.22,
    );
    primary.clear();
    accent.clear();
    for (const [k, v] of opt.bestPrimary) primary.set(k, v);
    for (const [k, v] of opt.bestAccent) accent.set(k, v);
    console.log(
      `Optimization mode: ${optimizeMode} | penalty=${Number.isFinite(penalty) ? penalty : 0.22} | bestMin=${opt.best.min.toFixed(2)} avgShift=${opt.best.avgShift.toFixed(2)}`,
    );
  }
  console.log(`Parsed maps — base(primary/accent): ${debug.basePrimary}/${debug.baseAccent}, m2(primary/accent): ${debug.m2Primary}/${debug.m2Accent}`);
  const scores = buildScores(primary, accent);
  if (scores.length === 0) {
    console.log("No protocol pairs found.");
    process.exit(1);
  }

  const min = scores[0].score;
  const max = scores[scores.length - 1].score;
  const avg = scores.reduce((s, p) => s + p.score, 0) / scores.length;

  console.log(`Protocols analyzed: ${primary.size}`);
  console.log(`Pairs analyzed: ${scores.length}`);
  console.log(`Min diversity: ${min.toFixed(2)}`);
  console.log(`Avg diversity: ${avg.toFixed(2)}`);
  console.log(`Max diversity: ${max.toFixed(2)}`);
  const lowestCount = Number(getArgValue("--lowest", "10"));
  const showCount = Number.isFinite(lowestCount) && lowestCount > 0 ? Math.floor(lowestCount) : 10;
  console.log(`\nLowest ${showCount} pairs:`);
  scores.slice(0, showCount).forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.a} vs ${p.b} => ${p.score.toFixed(2)}`);
  });

  const tim = "proto_tim";
  const spr = "proto_spr";
  if (primary.has(tim) && primary.has(spr) && accent.has(tim) && accent.has(spr)) {
    const timSpr = pairScore(tim, spr, primary, accent);
    console.log(`\nTime vs Spirit diversity: ${timSpr.toFixed(2)}`);
    console.log(`Time primary/accent: ${formatHex(primary.get(tim))} / ${formatHex(accent.get(tim))}`);
    console.log(`Spirit primary/accent: ${formatHex(primary.get(spr))} / ${formatHex(accent.get(spr))}`);
  }

  const ids = [...primary.keys()].filter((k) => accent.has(k)).sort((a, b) => {
    const an = names.get(a) ?? a;
    const bn = names.get(b) ?? b;
    return an.localeCompare(bn);
  });
  writePairingsReport(ids, names, primary, accent);
  writeHeatmapSvg(ids, names, primary, accent);
  console.log(`\nWrote pairings table: ${path.relative(root, pairingsReportPath)}`);
  console.log(`Wrote heatmap SVG: ${path.relative(root, heatmapSvgPath)}`);

  if (getArgValue("--print-sets", "") === "1") {
    const changed = ids.filter((id) => originalPrimary.get(id) !== primary.get(id) || originalAccent.get(id) !== accent.get(id));
    console.log("\nSuggested overrides:");
    for (const id of changed) {
      console.log(`--set \"${id}=${formatHex(primary.get(id)).slice(1)},${formatHex(accent.get(id)).slice(1)}\"`);
    }
  }

  if (getArgValue("--print-palette", "") === "1") {
    console.log("\nOptimized palette:");
    for (const id of ids) {
      console.log(`${id}: ${formatHex(primary.get(id))} / ${formatHex(accent.get(id))}`);
    }
  }
}

main();
