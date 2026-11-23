// Coordenadas paralelas com brush: perfil dos jogadores em percentis dentro da mesma posição.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { C, showTip, moveTip, hideTip, widthOf } from "../ui.js";
import { fmtNum, fmtPct, fmtSigned } from "../data.js";

export const AXES = [
  { k: "kda", label: "KDA", fmt: v => fmtNum(v, 2) },
  { k: "kp", label: "Part. em abates", fmt: v => fmtPct(v) },
  { k: "dpm", label: "Dano/min", fmt: v => fmtNum(v, 0) },
  { k: "dmg", label: "% do dano", fmt: v => fmtPct(v, 1) },
  { k: "cspm", label: "CS/min", fmt: v => fmtNum(v, 1) },
  { k: "vspm", label: "Visão/min", fmt: v => fmtNum(v, 2) },
  { k: "gd15", label: "Δ ouro @15", fmt: v => fmtSigned(v) },
  { k: "csd15", label: "Δ CS @15", fmt: v => fmtSigned(v, 1) },
];

export const playerKey = p => `${p.name}|${p.team}|${p.L}|${p.Y}|${p.pos}`;

export function parcoords(el, { groups, onSelect, onFilter }) {
  const H = 380, m = { t: 34, r: 30, b: 26, l: 30 };
  const svg = d3.select(el).append("svg").attr("height", H);
  const gBg = svg.append("g"), gHit = svg.append("g"), gFg = svg.append("g"), gAxes = svg.append("g");
  const brushes = new Map(); // eixo -> [lo, hi] em percentil
  let pop = [], selKey = null, compare = null, focus = null, x, y, axesSel;

  function pctRank(values) {
    const sorted = values.filter(v => v != null).sort((a, b) => a - b);
    return v => {
      if (v == null || !sorted.length) return null;
      return d3.bisectLeft(sorted, v) / Math.max(1, sorted.length - 1);
    };
  }

  function render({ players, focusL, compareL, selected }) {
    focus = focusL; compare = compareL; selKey = selected;
    const W = widthOf(el, 320);
    svg.attr("width", W);
    x = d3.scalePoint().domain(AXES.map(a => a.k)).range([m.l + 20, W - m.r - 20]);
    y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    const ranks = Object.fromEntries(AXES.map(a => [a.k, pctRank(players.map(p => p[a.k]))]));
    pop = players.map(p => ({ p, key: playerKey(p), r: Object.fromEntries(AXES.map(a => [a.k, ranks[a.k](p[a.k])])) }));
    const line = d => d3.line().defined(([, v]) => v != null)(AXES.map(a => [x(a.k), d.r[a.k] == null ? null : y(d.r[a.k])]).map(([px, py]) => [px, py]));

    const color = d => d.p.L === focus ? C.focus : d.p.L === compare ? C.compare : C.neutral;
    const order = d => (d.p.L === focus ? 2 : d.p.L === compare ? 1 : 0);
    const sorted = [...pop].sort((a, b) => order(a) - order(b));

    gBg.selectAll("path").data(sorted, d => d.key).join("path")
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.1)
      .attr("d", d => line(d)).order();
    gHit.selectAll("path").data(sorted, d => d.key).join("path")
      .attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 7).style("cursor", "pointer")
      .attr("d", d => line(d))
      .on("pointerenter", (ev, d) => {
        gFg.selectAll("path.hover").data([d]).join("path").attr("class", "hover").attr("fill", "none")
          .attr("stroke", C.text2).attr("stroke-width", 2).attr("d", line(d)).attr("pointer-events", "none");
        showTip(ev, { title: `${d.p.name} (${d.p.team})`, rows: [
          { label: groups[d.p.L].id, value: `${d.p.n} jogos · ${fmtPct(d.p.w / d.p.n)} V`, color: color(d) },
          ...AXES.slice(0, 4).map(a => ({ label: a.label, value: `${a.fmt(d.p[a.k])} · p${Math.round((d.r[a.k] ?? 0) * 100)}` }))] });
      })
      .on("pointermove", moveTip)
      .on("pointerleave", () => { gFg.selectAll("path.hover").remove(); hideTip(); })
      .on("click", (ev, d) => onSelect(d.key === selKey ? null : d.key));

    // Média da liga comparada (tracejado) e jogador escolhido (branco).
    const cmp = pop.filter(d => d.p.L === compare);
    const avg = cmp.length ? { key: "avg", r: Object.fromEntries(AXES.map(a => [a.k, d3.mean(cmp, d => d.r[a.k])])) } : null;
    const sel = pop.find(d => d.key === selKey);
    const fg = [avg && { ...avg, kind: "avg" }, sel && { ...sel, kind: "sel" }].filter(Boolean);
    gFg.selectAll("path.fg").data(fg, d => d.kind).join("path").attr("class", "fg").attr("fill", "none").attr("pointer-events", "none")
      .attr("stroke", d => d.kind === "avg" ? C.compare : C.text).attr("stroke-width", d => d.kind === "avg" ? 2.5 : 3)
      .attr("stroke-dasharray", d => d.kind === "avg" ? "6 4" : null).attr("d", d => line(d));
    gFg.selectAll("circle.sel").data(sel ? AXES.filter(a => sel.r[a.k] != null) : []).join("circle").attr("class", "sel")
      .attr("cx", a => x(a.k)).attr("cy", a => y(sel.r[a.k])).attr("r", 4.5).attr("fill", C.text).attr("stroke", C.surface).attr("stroke-width", 2)
      .attr("pointer-events", "none");
    gFg.selectAll("text.selv").data(sel ? AXES.filter(a => sel.r[a.k] != null) : []).join("text").attr("class", "selv label strong")
      .attr("x", a => x(a.k) + 8).attr("y", a => y(sel.r[a.k]) - 8).attr("font-size", 11).attr("pointer-events", "none")
      .text(a => a.fmt(sel.p[a.k]));

    // Eixos + brushes
    axesSel = gAxes.selectAll("g.pax").data(AXES, a => a.k).join(e => {
      const g = e.append("g").attr("class", "pax");
      g.append("g").attr("class", "axis");
      g.append("text").attr("class", "pax-label label strong").attr("text-anchor", "middle");
      g.append("g").attr("class", "brush");
      return g;
    }).attr("transform", a => `translate(${x(a.k)},0)`);
    axesSel.select("g.axis").call(d3.axisLeft(y).tickValues([0, .25, .5, .75, 1]).tickFormat(v => "p" + Math.round(v * 100)).tickSize(3));
    axesSel.select("g.axis").selectAll("text").attr("display", (d, i, n) => (d3.select(n[i].closest(".pax")).datum().k === AXES[0].k ? null : "none"));
    axesSel.select("text.pax-label").attr("y", m.t - 14).text(a => a.label);
    axesSel.select("g.brush").each(function (a) {
      const b = d3.brushY().extent([[-12, m.t], [12, H - m.b]])
        .on("brush end", ev => {
          if (!ev.sourceEvent) return;
          if (ev.selection) brushes.set(a.k, ev.selection.map(y.invert).sort((p, q) => p - q));
          else brushes.delete(a.k);
          applyBrush();
        });
      d3.select(this).call(b);
      const cur = brushes.get(a.k);
      d3.select(this).call(b.move, cur ? [y(cur[1]), y(cur[0])] : null);
      d3.select(this).selectAll(".selection").attr("fill", C.gold).attr("fill-opacity", .2).attr("stroke", C.gold);
    });
    applyBrush();
  }

  function applyBrush() {
    const pass = d => [...brushes].every(([k, [lo, hi]]) => d.r[k] != null && d.r[k] >= lo && d.r[k] <= hi);
    gBg.selectAll("path").attr("stroke-opacity", d => brushes.size ? (pass(d) ? 0.85 : 0.06) : (d.p.L === focus || d.p.L === compare ? 0.6 : 0.22));
    gHit.selectAll("path").attr("display", d => pass(d) ? null : "none");
    onFilter(pop.filter(pass).map(d => d.p));
  }

  function clear() { brushes.clear(); } // o próximo render remove as seleções visuais
  return { render, clear };
}
