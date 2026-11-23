// Carregamento e agregações feitas no navegador a partir dos JSONs pré-processados.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

export async function loadData() {
  const [meta, games, players, insights] = await Promise.all([
    d3.json("data/meta.json"),
    d3.json("data/games.json"),
    d3.json("data/players.json"),
    d3.json("data/insights.json"),
  ]);
  const rows = games.rows.map(r => Object.fromEntries(games.cols.map((c, i) => [c, r[i]])));
  rows.forEach(r => { r.picks = [r.top, r.jng, r.mid, r.bot, r.sup]; r.bans = [r.b1, r.b2, r.b3, r.b4, r.b5]; });
  const prow = players.rows.map(r => Object.fromEntries(players.cols.map((c, i) => [c, r[i]])));
  meta.groupIndex = Object.fromEntries(meta.groups.map((g, i) => [g.id, i]));
  meta.champByName = new Map(meta.champions.map((c, i) => [c.n, i]));
  meta.patchYear = meta.patches.map(p => (+p.split(".")[0] >= 16 ? 2026 : 2025));
  return { meta, rows, players: prow, insights };
}

/** Linhas de time que passam pelos filtros. `league` é o índice do grupo. */
export function filterRows(rows, { league, side, patchRange, team }) {
  const [p0, p1] = patchRange;
  return rows.filter(r =>
    r.L === league &&
    r.P >= p0 && r.P <= p1 &&
    (side === "all" || r.S === +side) &&
    (team == null || team === "" || r.T === +team));
}

/** Picks, bans, vitórias e presença por campeão. */
export function champStats(rows) {
  const games = new Set(rows.map(r => r.gid)).size;
  const m = new Map();
  const get = c => { let s = m.get(c); if (!s) { s = { c, picks: 0, wins: 0, bans: 0 }; m.set(c, s); } return s; };
  for (const r of rows) {
    for (const c of r.picks) if (c >= 0) { const s = get(c); s.picks++; s.wins += r.W; }
    for (const c of r.bans) if (c >= 0) get(c).bans++;
  }
  const list = [...m.values()];
  for (const s of list) {
    s.pickRate = s.picks / games;
    s.banRate = s.bans / games;
    s.presence = (s.picks + s.bans) / games;
    s.winRate = s.picks ? s.wins / s.picks : null;
  }
  return { games, list, byChamp: m };
}

/** Duplas no mesmo time: contagem e vitórias. */
export function pairStats(rows) {
  const m = new Map();
  for (const r of rows) {
    const p = r.picks.filter(c => c >= 0);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      const a = Math.min(p[i], p[j]), b = Math.max(p[i], p[j]);
      const k = a * 1000 + b;
      let s = m.get(k);
      if (!s) { s = { a, b, n: 0, w: 0 }; m.set(k, s); }
      s.n++; s.w += r.W;
    }
  }
  return [...m.values()];
}

/** Presença de um campeão por patch numa liga (ignora o filtro de patch para mostrar a linha inteira). */
export function presenceByPatch(rows, league, champ, { side, team }, nPatches, minGames = 6) {
  const games = new Array(nPatches).fill(null).map(() => new Set());
  const hit = new Array(nPatches).fill(null).map(() => new Set());
  for (const r of rows) {
    if (r.L !== league) continue;
    if (side !== "all" && r.S !== +side) continue;
    if (team != null && team !== "" && r.T !== +team) continue;
    games[r.P].add(r.gid);
    if (r.picks.includes(champ) || r.bans.includes(champ)) hit[r.P].add(r.gid);
  }
  // Média móvel de 3 patches (somando jogos), porque cada liga tem poucas partidas por patch.
  return games.map((g, i) => {
    const w = [i - 1, i, i + 1].filter(j => j >= 0 && j < nPatches && games[j].size > 0);
    const n = w.reduce((s, j) => s + games[j].size, 0), k = w.reduce((s, j) => s + hit[j].size, 0);
    return { p: i, games: g.size, v: g.size > 0 && n >= minGames ? k / n : null };
  });
}

export function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [c - h, c + h];
}

/** Regressão logística simples por Newton-Raphson. x em milhares de ouro. */
export function logistic(xs, ys) {
  let a = 0, b = 0;
  for (let it = 0; it < 40; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < xs.length; i++) {
      const p = 1 / (1 + Math.exp(-(a + b * xs[i])));
      const e = ys[i] - p, w = p * (1 - p);
      g0 += e; g1 += e * xs[i];
      h00 += w; h01 += w * xs[i]; h11 += w * xs[i] * xs[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!det) break;
    const da = (h11 * g0 - h01 * g1) / det, db = (h00 * g1 - h01 * g0) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  return { a, b, f: x => 1 / (1 + Math.exp(-(a + b * x))) };
}

/** Curva vitória × ouro aos 15 para um conjunto de linhas. */
export function goldCurve(rows, binSize = 1000, lim = 6000) {
  const v = rows.filter(r => r.gd15 != null);
  const bins = d3.rollups(v.filter(r => Math.abs(r.gd15) <= lim + binSize / 2),
    g => ({ n: g.length, w: d3.sum(g, r => r.W) }),
    r => Math.round(r.gd15 / binSize) * binSize)
    .map(([x, s]) => ({ x, n: s.n, wr: s.w / s.n }))
    .filter(d => d.n >= 5)
    .sort((a, b) => a.x - b.x);
  const fit = v.length > 30 ? logistic(v.map(r => r.gd15 / 1000), v.map(r => r.W)) : null;
  const behind = v.filter(r => r.gd15 <= -1500);
  return { bins, fit, n: v.length, comeback: { k: d3.sum(behind, r => r.W), n: behind.length } };
}

export const fmtPct = (x, d = 0) => (x == null || isNaN(x) ? "–" : (x * 100).toFixed(d).replace(".", ",") + "%");
export const fmtInt = x => d3.format(",")(x).replace(/,/g, ".");
export const fmtNum = (x, d = 1) => (x == null || isNaN(x) ? "–" : x.toFixed(d).replace(".", ","));
export const fmtSigned = (x, d = 0) => (x == null || isNaN(x) ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + fmtInt(Math.abs(+x.toFixed(d))));
