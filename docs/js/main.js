// Orquestra o estado global e as visões coordenadas.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { loadData, filterRows, champStats, pairStats, presenceByPatch, goldCurve, wilson, fmtPct, fmtInt, fmtNum, fmtSigned } from "./data.js";
import { C, legend, winColor } from "./ui.js";
import { timeline } from "./charts/timeline.js";
import { network } from "./charts/network.js";
import { scatter } from "./charts/scatter.js";
import { bars } from "./charts/bars.js";
import { patchLines, goldChart } from "./charts/lines.js";
import { ciBars, adoptionBars, divergingBars } from "./charts/leaguebars.js";
import { parcoords, playerKey, AXES } from "./charts/parcoords.js";

const $ = id => document.getElementById(id);
const POS_LABEL = ["Topo", "Selva", "Meio", "Atirador", "Suporte"];
const POS_PLURAL = ["topos", "caçadores (selva)", "meios", "atiradores", "suportes"];

const { meta, rows, players, insights } = await loadData();
const G = meta.groups, NP = meta.patches.length, CH = meta.champions;
const gi = id => meta.groupIndex[id];

const state = {
  league: gi("CBLOL"), compare: gi("LCK"), team: "", side: "all", range: [0, NP - 1], champ: null,
  pos: 3, year: 2026, player: null,
};

// ------------------------------------------------------------------ cabeçalho
const nGames = new Set(rows.map(r => r.gid)).size;
const tiles = [
  ["Partidas profissionais", fmtInt(nGames)],
  ["Campeões diferentes", String(CH.length)],
  ["Ligas + internacionais", "6 + 4"],
  ["Patches", String(NP)],
];
$("tiles").replaceChildren(...tiles.map(([l, v]) => {
  const d = document.createElement("div"); d.className = "tile";
  const a = document.createElement("div"); a.className = "label"; a.textContent = l;
  const b = document.createElement("div"); b.className = "value"; b.textContent = v;
  d.append(a, b); return d;
}));
$("data-range").textContent = `janeiro de 2025 a ${new Date(meta.updated + "T12:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} (${fmtInt(nGames)} partidas)`;

// ------------------------------------------------------------------ filtros
function fillSelect(sel, opts, value) {
  sel.replaceChildren(...opts.map(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; return o; }));
  sel.value = String(value);
}
fillSelect($("f-league"), G.map((g, i) => [i, g.label]), state.league);
function refreshCompare() {
  fillSelect($("f-compare"), G.map((g, i) => [i, g.label]).filter(([i]) => i !== state.league), state.compare);
}
function refreshTeams() {
  const teams = [...new Set(rows.filter(r => r.L === state.league).map(r => r.T))].map(t => [t, meta.teams[t]]).sort((a, b) => a[1].localeCompare(b[1]));
  fillSelect($("f-team"), [["", "Todos"], ...teams], state.team);
}
refreshCompare(); refreshTeams();

$("f-league").addEventListener("change", e => {
  state.league = +e.target.value;
  if (state.compare === state.league) state.compare = state.league === gi("LCK") ? gi("CBLOL") : gi("LCK");
  state.team = ""; refreshCompare(); refreshTeams(); updateAll();
});
$("f-compare").addEventListener("change", e => { state.compare = +e.target.value; updateAll(); });
$("f-team").addEventListener("change", e => { state.team = e.target.value; updateAll(); });
function segment(id, onChange) {
  const el = $(id);
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    el.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
    onChange(b.dataset.v);
  });
  return v => el.querySelectorAll("button").forEach(x => { const on = x.dataset.v === String(v); x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
}
segment("f-side", v => { state.side = v; updateAll(); });
const setPreset = segment("f-preset", v => {
  const idx = d3.range(NP).filter(i => v === "all" || meta.patchYear[i] === +v);
  state.range = [idx[0], idx[idx.length - 1]];
  tl.set(state.range); updateAll();
});

// ------------------------------------------------------------------ visões
const selectChamp = c => { state.champ = c; $("champ-search").value = c == null ? "" : CH[c].n; updateChamp(); };
const tl = timeline($("timeline"), {
  patches: meta.patches,
  onBrush: (range, live) => {
    state.range = range;
    $("patch-label").textContent = `${meta.patches[range[0]]} – ${meta.patches[range[1]]}`;
    if (!live) { setPreset(null); updateAll(); }
  },
});
const net = network($("network"), { champions: CH, onSelect: selectChamp });
const sc = scatter($("scatter"), { champions: CH, onSelect: selectChamp });
const br = bars($("bars"), { champions: CH, onSelect: selectChamp });
const pres = patchLines($("presence"), { patches: meta.patches, yLabel: "presença no draft", H: 260 });
const adop = adoptionBars($("adoption"));
const gold = goldChart($("goldcurve"));
const comeback = ciBars($("comeback"), { valueLabel: "Viradas" });
const blue = ciBars($("blueside"), { ref: 0.5, valueLabel: "Vitórias do azul", domain: [0.4, 0.65], dot: true });
const bluePatch = patchLines($("bluepatch"), { patches: meta.patches, yLabel: "vitórias do lado azul", yDomain: [0.3, 0.75], ref: 0.5, H: 240 });
const pc = parcoords($("parcoords"), {
  groups: G,
  onSelect: k => { state.player = k; renderPlayers(false); },
  onFilter: list => renderTable(list),
});
const h3 = divergingBars($("h3"));

// Busca de campeão
$("champ-list").replaceChildren(...CH.map(c => { const o = document.createElement("option"); o.value = c.n; return o; }));
$("champ-search").addEventListener("change", e => {
  const i = meta.champByName.get(e.target.value.trim());
  if (i != null) selectChamp(i);
});
$("champ-clear").addEventListener("click", () => selectChamp(null));

let cache = {};
const leagueShort = i => G[i].id;
const sideFilter = () => ({ side: state.side, patchRange: state.range });

function updateAll() {
  const focusRows = filterRows(rows, { league: state.league, ...sideFilter(), team: state.team });
  const compareRows = filterRows(rows, { league: state.compare, ...sideFilter() });
  const stats = champStats(focusRows);
  const pairs = pairStats(focusRows);
  cache = { focusRows, compareRows, stats, pairs };
  $("patch-label").textContent = `${meta.patches[state.range[0]]} – ${meta.patches[state.range[1]]}`;

  // Linha do tempo: partidas por patch (liga em foco + comparada)
  const cnt = d3.range(NP).map(p => ({ p, a: 0, b: 0 }));
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.gid + "-" + r.L)) continue;
    if (r.L === state.league) { cnt[r.P].a++; seen.add(r.gid + "-" + r.L); }
    else if (r.L === state.compare) { cnt[r.P].b++; seen.add(r.gid + "-" + r.L); }
  }
  tl.render(cnt);

  net.render({ stats, pairs, selected: state.champ });
  legend($("network-legend"), [
    { type: "ramp", gradient: `linear-gradient(90deg, ${winColor(0.4)}, ${winColor(0.5)}, ${winColor(0.6)})`, label: "anel: vitória de ≤40% a ≥60%" },
    { type: "ln", color: C.gold, label: "duplas do campeão selecionado" },
  ]);
  const teamTxt = state.team !== "" ? ` · ${meta.teams[+state.team]}` : "";
  $("scatter-sub").textContent = `${leagueShort(state.league)}${teamTxt} · ${fmtInt(stats.games)} partidas no recorte · campeões com ${Math.max(8, Math.round(stats.games * 0.03))} picks ou mais.`;
  renderMatch();
  updateChamp();
}

function updateChamp() {
  const { stats, pairs } = cache;
  const c = state.champ;
  const partners = c == null ? [] : pairs.filter(p => p.a === c || p.b === c).sort((a, b) => b.n - a.n).slice(0, 5).map(p => (p.a === c ? p.b : p.a));
  net.select(c);
  sc.render({ stats, selected: c, partners });
  const mode = br.render({ stats, pairs, selected: c });
  if (mode === "pairs") {
    $("bars-title").textContent = `Duplas mais frequentes com ${CH[c].n}`;
    $("bars-sub").textContent = "Jogos juntos no mesmo time · taxa de vitória da dupla (▲ acima / ▼ abaixo da média do campeão).";
    legend($("bars-legend"), [{ type: "sw", color: C.gold, label: "jogos juntos" }]);
  } else {
    $("bars-title").textContent = "Campeões mais presentes";
    $("bars-sub").textContent = "Presença = picks + bans, em % das partidas do recorte.";
    legend($("bars-legend"), [{ type: "sw", color: C.focus, label: "pick" }, { type: "sw", color: C.neutral, label: "ban" }]);
  }
  // Presença por patch: campeão escolhido ou o mais presente do recorte.
  const pc0 = c ?? ([...stats.list].sort((a, b) => b.presence - a.presence)[0] || {}).c;
  if (pc0 != null) {
    const f = presenceByPatch(rows, state.league, pc0, { side: state.side, team: state.team }, NP, state.team !== "" ? 4 : 10);
    const k = presenceByPatch(rows, state.compare, pc0, { side: state.side }, NP, 10);
    $("presence-title").textContent = `Presença de ${CH[pc0].n} no draft por patch` + (c == null ? " (campeão mais presente; clique em outro)" : "");
    pres.render({
      series: [
        { name: leagueShort(state.league), color: C.focus, values: f.map(d => ({ ...d })) },
        { name: leagueShort(state.compare), color: C.compare, dash: true, values: k.map(d => ({ ...d })) },
      ], range: state.range, emptyText: "Sem partidas suficientes",
    });
    legend($("presence-legend"), [
      { type: "ln", color: C.focus, label: G[state.league].label },
      { type: "dash", color: C.compare, label: G[state.compare].label },
    ]);
  }
}

function renderMatch() {
  const { focusRows, compareRows } = cache;
  const cf = goldCurve(focusRows), cc = goldCurve(compareRows);
  gold.render({ series: [
    { name: leagueShort(state.league), color: C.focus, curve: cf },
    { name: leagueShort(state.compare), color: C.compare, dash: true, curve: cc },
  ] });
  legend($("goldcurve-legend"), [
    { type: "ln", color: C.focus, label: `${G[state.league].label}${cf.n ? "" : " (sem dados de ouro)"}` },
    { type: "dash", color: C.compare, label: `${G[state.compare].label}${cc.n ? "" : " (sem dados de ouro)"}` },
    { type: "dot", color: C.text3, label: "taxa observada por faixa" },
  ]);

  // Viradas por liga (todas as ligas, mesmo recorte de patch/lado)
  const colorOf = i => (i === state.league ? C.focus : i === state.compare ? C.compare : C.neutral);
  const cb = G.map((g, i) => {
    const gc = goldCurve(filterRows(rows, { league: i, ...sideFilter() }));
    const [lo, hi] = wilson(gc.comeback.k, gc.comeback.n);
    return { i, label: g.id === "INT" ? "Internacionais" : g.id, value: gc.comeback.n ? gc.comeback.k / gc.comeback.n : 0, lo, hi, n: gc.comeback.n, color: colorOf(i), strong: i === state.league };
  }).filter(d => d.n >= 20).sort((a, b) => b.value - a.value);
  comeback.render({ data: cb });
  const f = cb.find(d => d.i === state.league), k = cb.find(d => d.i === state.compare);
  const p2 = insights.h2.cblol_vs_top3.p_value;
  $("h2-finding").replaceChildren();
  if (f && k) {
    const s = document.createElement("strong");
    s.textContent = `${leagueShort(state.league)}: ${fmtPct(f.value)} de viradas; ${leagueShort(state.compare)}: ${fmtPct(k.value)}.`;
    $("h2-finding").append(s, document.createTextNode(
      ` Os intervalos de confiança se sobrepõem. No período todo, o CBLOL não tem mais viradas que LCK, LPL e LEC juntas (teste qui-quadrado, p = ${fmtNum(p2, 2)}). Quem mais vira jogo é a LEC.`));
  }

  // Lado azul por liga (ignora o filtro de lado)
  const bl = G.map((g, i) => {
    const rs = filterRows(rows, { league: i, side: "0", patchRange: state.range });
    const k2 = d3.sum(rs, r => r.W), n = rs.length;
    const [lo, hi] = wilson(k2, n);
    return { i, label: g.id === "INT" ? "Internacionais" : g.id, value: n ? k2 / n : 0, lo, hi, n, color: colorOf(i), strong: i === state.league };
  }).filter(d => d.n >= 20).sort((a, b) => b.value - a.value);
  blue.render({ data: bl });
  const allBlue = rows.filter(r => r.S === 0 && r.P >= state.range[0] && r.P <= state.range[1]);
  const bwr = d3.mean(allBlue, r => r.W);
  $("blue-finding").replaceChildren();
  const s2 = document.createElement("strong"); s2.textContent = `O lado azul venceu ${fmtPct(bwr, 1)} das ${fmtInt(allBlue.length)} partidas do recorte.`;
  $("blue-finding").append(s2, document.createTextNode(` No período inteiro (${fmtInt(insights.blue.ALL.n)} partidas) a vantagem é de ${fmtPct(insights.blue.ALL.blue_wr, 1)}, significativa (teste binomial, p < 0,001), e aparece em todas as ligas.`));

  // Lado azul por patch: média móvel de 3 patches
  const byPatch = L => {
    const cntp = d3.range(NP).map(() => ({ n: 0, w: 0 }));
    for (const r of rows) if (r.L === L && r.S === 0) { cntp[r.P].n++; cntp[r.P].w += r.W; }
    return d3.range(NP).map(p => {
      const win = [p - 1, p, p + 1].filter(i => i >= 0 && i < NP).map(i => cntp[i]);
      const n = d3.sum(win, d => d.n), w = d3.sum(win, d => d.w);
      return { p, v: n >= 12 ? w / n : null, games: n };
    });
  };
  bluePatch.render({ series: [
    { name: leagueShort(state.league), color: C.focus, values: byPatch(state.league) },
    { name: leagueShort(state.compare), color: C.compare, dash: true, values: byPatch(state.compare) },
  ], range: state.range });
  legend($("bluepatch-legend"), [
    { type: "ln", color: C.focus, label: G[state.league].label },
    { type: "dash", color: C.compare, label: G[state.compare].label },
  ]);
}

// ------------------------------------------------------------------ H1 (estático, calculado no pipeline)
function renderAdoption() {
  const ad = insights.h1.adoption;
  const data = ["LCK", "LPL", "LEC", "LCS", "LCP"].map(l => ({ league: l, ...ad[l], strong: l === "LCK" || l === "LPL" }));
  adop.render({ data });
  legend($("adoption-legend"), adop.keys.map(k => ({ type: "sw", color: k.color, label: k.label })));
  const lck = ad.LCK, lpl = ad.LPL, lagL = insights.h1.lag_similarity.LCK;
  const s = document.createElement("strong");
  s.textContent = `O CBLOL adota os campeões da moda cerca de 1 patch depois da LCK e da LPL.`;
  $("h1-finding").replaceChildren(s, document.createTextNode(
    ` ${fmtPct(lck.share_cblol_later)} dos campeões chegaram depois ao CBLOL que à LCK (p = ${fmtNum(lck.wilcoxon_p, 2)}) e ${fmtPct(lpl.share_cblol_later)} depois que à LPL (p = ${fmtNum(lpl.wilcoxon_p, 2)}). ` +
    `O meta do CBLOL no patch p se parece mais com o da LCK no patch p−1 (r = ${fmtNum(lagL.by_lag["1"].r, 3)}) do que no mesmo patch (r = ${fmtNum(lagL.by_lag["0"].r, 3)}). Em relação à LEC e à LCS não há atraso.`));
}

// ------------------------------------------------------------------ Jogadores
$("p-list").replaceChildren();
const posSeg = segment("p-pos", v => { state.pos = +v; state.player = null; pc.clear(); renderPlayers(true); });
segment("p-year", v => { state.year = +v; state.player = null; pc.clear(); renderPlayers(true); });
$("p-clear").addEventListener("click", () => { pc.clear(); renderPlayers(false); });
$("p-search").addEventListener("change", e => {
  const name = e.target.value.trim().toLowerCase();
  const p = popPlayers().filter(p => p.name.toLowerCase() === name).sort((a, b) => b.n - a.n)[0];
  if (p) { state.player = playerKey(p); renderPlayers(false); }
});
void posSeg;

function popPlayers() {
  const allowed = new Set([0, 1, 2, 3, 4, 5].map(String));
  return players.filter(p => p.Y === state.year && p.pos === state.pos && (allowed.has(String(p.L)) || p.L === state.league || p.L === state.compare));
}
function renderPlayers(resetDefault) {
  const pop = popPlayers();
  if (resetDefault || !pop.some(p => playerKey(p) === state.player)) {
    const best = pop.filter(p => p.L === state.league).sort((a, b) => b.n - a.n)[0];
    state.player = best ? playerKey(best) : null;
  }
  $("pc-title").textContent = `Perfil dos ${POS_PLURAL[state.pos]} em ${state.year}: percentil em relação à mesma posição`;
  const lst = $("p-list");
  lst.replaceChildren(...[...new Set(pop.map(p => p.name))].sort().map(n => { const o = document.createElement("option"); o.value = n; return o; }));
  const sel = pop.find(p => playerKey(p) === state.player);
  $("p-search").value = sel ? sel.name : "";
  pc.render({ players: pop, focusL: state.league, compareL: state.compare, selected: state.player });
  legend($("pc-legend"), [
    { type: "ln", color: C.text, label: sel ? `${sel.name} (${sel.team})` : "jogador escolhido" },
    { type: "ln", color: C.focus, label: G[state.league].id },
    { type: "dash", color: C.compare, label: `média ${G[state.compare].id}` },
    { type: "ln", color: C.compare, label: G[state.compare].id },
    { type: "ln", color: C.neutral, label: "outras ligas" },
  ]);
}
function renderTable(list) {
  const t = $("p-table");
  const sorted = [...list].sort((a, b) => b.n - a.n);
  $("pc-count").textContent = `(${list.length})`;
  const head = document.createElement("tr");
  ["Jogador", "Time", "Liga", "Jogos", "V%", "KDA", "Δ ouro @15"].forEach((h, i) => {
    const th = document.createElement("th"); th.textContent = h; if (i >= 3) th.className = "num"; head.append(th);
  });
  const color = L => (L === state.league ? C.focus : L === state.compare ? C.compare : C.neutral);
  const body = sorted.slice(0, 80).map(p => {
    const tr = document.createElement("tr"); tr.className = "row" + (playerKey(p) === state.player ? " sel" : "");
    const cells = [p.name, p.team, G[p.L].id, String(p.n), fmtPct(p.w / p.n), fmtNum(p.kda, 2), fmtSigned(p.gd15)];
    cells.forEach((c, i) => {
      const td = document.createElement("td");
      if (i === 2) { const dot = document.createElement("span"); dot.className = "lg-dot"; dot.style.background = color(p.L); td.append(dot); }
      td.append(document.createTextNode(c)); if (i >= 3) td.className = "num"; tr.append(td);
    });
    tr.addEventListener("click", () => { state.player = playerKey(p); renderPlayers(false); });
    return tr;
  });
  t.replaceChildren(head, ...body);
}

function renderH3() {
  const h = insights.h3;
  const toMap = arr => Object.fromEntries(arr.map(d => [d.position, d.gd15]));
  const groups = ["top", "jng", "mid", "bot", "sup"].map((k, i) => ({ key: k, label: POS_LABEL[i] }));
  h3.render({ groups, series: [
    { name: "vs. todos os adversários", color: C.focus, values: toMap(h.CBLOL_vs_all.by_position), n: h.CBLOL_vs_all.games },
    { name: "vs. LCK e LPL", color: C.compare, values: toMap(h.CBLOL_vs_LCK_LPL.by_position), n: h.CBLOL_vs_LCK_LPL.games },
  ] });
  legend($("h3-legend"), [
    { type: "sw", color: C.focus, label: `vs. todos os adversários (${h.CBLOL_vs_all.games} jogos)` },
    { type: "sw", color: C.compare, label: `vs. LCK e LPL (${h.CBLOL_vs_LCK_LPL.games} jogos)` },
  ]);
  const s = document.createElement("strong");
  s.textContent = `Times brasileiros chegam aos 15 minutos atrás em todas as posições, mais na selva, no meio e no atirador.`;
  $("h3-finding").replaceChildren(s, document.createTextNode(
    ` Contra LCK e LPL, o déficit médio é de ${fmtSigned(h.CBLOL_vs_LCK_LPL.gd15_mean_player)} de ouro por jogador e o resultado foi 0 vitória em ${h.CBLOL_vs_LCK_LPL.games} jogos. ` +
    `O dano por minuto também é menor (${fmtPct(h.dpm_ratio)} do dos adversários), mas isso é em parte consequência de estar perdendo. A amostra é pequena.`));
}

function renderVerdicts() {
  const ad = insights.h1.adoption, h2 = insights.h2.by_league, b = insights.blue, h = insights.h3;
  const items = [
    { tag: "part", t: "Parcialmente confirmada", h: "H1 · O meta chega com atraso",
      p: `O CBLOL adota os campeões ~1 patch depois da LCK (${fmtPct(ad.LCK.share_cblol_later)} dos casos) e da LPL (${fmtPct(ad.LPL.share_cblol_later)}). Em relação ao Ocidente (LEC, LCS) não há atraso: o Brasil acompanha a Ásia, mas não fica atrás do resto.` },
    { tag: "no", t: "Refutada", h: "H2 · Mais viradas no CBLOL",
      p: `Quem perde por 1.500 de ouro aos 15 vira ${fmtPct(h2.CBLOL.comeback_rate)} das vezes no CBLOL, contra ${fmtPct(h2.LCK.comeback_rate)} na LCK e ${fmtPct(h2.LPL.comeback_rate)} na LPL. A liga das viradas é a LEC (${fmtPct(h2.LEC.comeback_rate)}).` },
    { tag: "yes", t: "Confirmada", h: "Lado azul tem vantagem",
      p: `O azul vence ${fmtPct(b.ALL.blue_wr, 1)} de ${fmtInt(b.ALL.n)} partidas (p < 0,001). No CBLOL, ${fmtPct(b.CBLOL.blue_wr, 1)}. A vantagem existe em todas as ligas analisadas.` },
    { tag: "part", t: "Confirmada com ressalvas", h: "H3 · A diferença está no início do jogo",
      p: `Contra times da LCK e da LPL, os brasileiros chegam aos 15 min com ${fmtSigned(h.CBLOL_vs_LCK_LPL.gd15_mean_player)} de ouro por jogador. O dano também é menor, mas é consequência de perder. São só ${h.CBLOL_vs_LCK_LPL.games} jogos, e Δ@15 não é comparável entre ligas domésticas.` },
  ];
  $("verdicts").replaceChildren(...items.map(it => {
    const d = document.createElement("div"); d.className = "verdict";
    const tg = document.createElement("span"); tg.className = `tag ${it.tag}`; tg.textContent = (it.tag === "yes" ? "✓ " : it.tag === "no" ? "✕ " : "≈ ") + it.t;
    const h4 = document.createElement("h4"); h4.textContent = it.h;
    const p = document.createElement("p"); p.textContent = it.p;
    d.append(tg, h4, p); return d;
  }));
}

// ------------------------------------------------------------------ inicialização
updateAll();
renderAdoption();
renderPlayers(true);
renderH3();
renderVerdicts();
let rt;
window.addEventListener("resize", () => {
  clearTimeout(rt);
  rt = setTimeout(() => { updateAll(); renderAdoption(); renderPlayers(false); renderH3(); }, 200);
});
void AXES;
