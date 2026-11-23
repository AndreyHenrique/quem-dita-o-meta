// Barras por liga: taxa com intervalo de confiança; barra 100% empilhada (adoção); barras divergentes (H3).
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { C, showTip, moveTip, hideTip, widthOf, hbarPath } from "../ui.js";
import { fmtPct, fmtSigned } from "../data.js";

/** data: [{label, value, lo, hi, n, color}] ; ref: valor de referência (ex.: 0.5) */
export function ciBars(el, { ref = null, valueLabel = "", domain = null, dot = false }) {
  const row = 30, bh = 14, m = { t: 6, r: 56, b: 24, l: 150 };
  const svg = d3.select(el).append("svg");
  function render({ data }) {
    const W = widthOf(el);
    const H = m.t + m.b + data.length * row;
    svg.attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain(domain || [0, d3.max(data, d => d.hi) * 1.1]).nice().range([m.l, W - m.r]);
    svg.selectAll("g.ax").data([0]).join("g").attr("class", "ax axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
    svg.selectAll("line.ref").data(ref == null ? [] : [ref]).join("line").attr("class", "ref ref-line")
      .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", m.t - 4).attr("y2", H - m.b);
    const g = svg.selectAll("g.row").data(data, d => d.label).join(e => {
      const r = e.append("g").attr("class", "row");
      r.append("text").attr("class", "label name"); r.append("path").attr("class", "bar");
      r.append("line").attr("class", "ci"); r.append("circle").attr("class", "pt"); r.append("text").attr("class", "label val"); r.append("rect").attr("class", "hit");
      return r;
    }).attr("transform", (d, i) => `translate(0,${m.t + i * row})`);
    const y0 = (row - bh) / 2;
    g.select("text.name").attr("x", m.l - 10).attr("y", row / 2).attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .attr("class", d => "label name" + (d.strong ? " strong" : "")).text(d => d.label);
    // Barras só quando a escala começa em zero; com eixo truncado usamos ponto + intervalo.
    g.select("path.bar").attr("fill", d => d.color).attr("d", d => dot ? "" : hbarPath(x(x.domain()[0]), x(d.value), y0, bh));
    g.select("circle.pt").attr("r", dot ? 6 : 0).attr("cx", d => x(d.value)).attr("cy", row / 2)
      .attr("fill", d => d.color).attr("stroke", C.surface).attr("stroke-width", 2);
    g.select("line.ci").attr("stroke", C.text2).attr("stroke-width", 1.5)
      .attr("x1", d => x(d.lo)).attr("x2", d => x(d.hi)).attr("y1", row / 2).attr("y2", row / 2);
    g.select("text.val").attr("x", d => Math.max(x(d.value), x(d.hi)) + 6).attr("y", row / 2).attr("dominant-baseline", "middle")
      .text(d => fmtPct(d.value));
    g.select("rect.hit").attr("width", W).attr("height", row).attr("fill", "transparent")
      .on("pointerenter", (ev, d) => showTip(ev, { title: d.label, rows: [
        { label: valueLabel, value: fmtPct(d.value, 1) },
        { label: "IC 95%", value: `${fmtPct(d.lo, 1)} – ${fmtPct(d.hi, 1)}` },
        { label: "Amostra", value: `${d.n} partidas` }] }))
      .on("pointermove", moveTip).on("pointerleave", hideTip);
  }
  return { render };
}

/** Barra 100% empilhada divergente: antes (azul) | mesmo patch (cinza) | depois (vermelho). */
export function adoptionBars(el) {
  const row = 32, bh = 16, m = { t: 6, r: 12, b: 22, l: 64 };
  const svg = d3.select(el).append("svg");
  const keys = [
    { k: "share_cblol_earlier", label: "CBLOL antes", color: C.divPos },
    { k: "share_same_patch", label: "Mesmo patch", color: "#5b5b57" },
    { k: "share_cblol_later", label: "CBLOL depois", color: C.divNeg },
  ];
  function render({ data }) {
    const W = widthOf(el);
    const H = m.t + m.b + data.length * row;
    svg.attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
    svg.selectAll("g.ax").data([0]).join("g").attr("class", "ax axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
    const g = svg.selectAll("g.row").data(data, d => d.league).join("g").attr("class", "row")
      .attr("transform", (d, i) => `translate(0,${m.t + i * row})`);
    g.selectAll("text.name").data(d => [d]).join("text").attr("class", d => "label name" + (d.strong ? " strong" : ""))
      .attr("x", m.l - 10).attr("y", row / 2).attr("text-anchor", "end").attr("dominant-baseline", "middle").text(d => d.league);
    g.selectAll("rect.seg").data(d => {
      let acc = 0;
      return keys.map(k => { const v = d[k.k] || 0; const s = { ...k, v, x0: acc, x1: acc + v, d }; acc += v; return s; });
    }).join("rect").attr("class", "seg")
      .attr("x", s => x(s.x0) + (s.x0 > 0 ? 1 : 0)).attr("width", s => Math.max(0, x(s.x1) - x(s.x0) - (s.x0 > 0 ? 1 : 0) - (s.x1 < 0.999 ? 1 : 0)))
      .attr("y", (row - bh) / 2).attr("height", bh).attr("rx", 3).attr("fill", s => s.color)
      .on("pointerenter", (ev, s) => showTip(ev, { title: `CBLOL × ${s.d.league}`, rows: [
        ...keys.map(k => ({ label: k.label, value: fmtPct(s.d[k.k]), color: k.color })),
        { label: "Campeões comparados", value: String(s.d.champions) },
        { label: "Atraso mediano", value: `${s.d.median_lag} patch(es)` }] }))
      .on("pointermove", moveTip).on("pointerleave", hideTip);
    g.selectAll("text.in").data(d => {
      let acc = 0;
      return keys.map(k => { const v = d[k.k] || 0; const s = { v, mid: acc + v / 2 }; acc += v; return s; });
    }).join("text").attr("class", "in").attr("x", s => x(s.mid)).attr("y", row / 2).attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle").attr("fill", "#fff").attr("font-size", 11).attr("pointer-events", "none")
      .text(s => (x(s.v) - x(0)) > 34 ? fmtPct(s.v) : "");
  }
  return { render, keys };
}

/** Barras divergentes agrupadas por posição (valores negativos = atrás do oponente). */
export function divergingBars(el) {
  const grp = 46, bh = 12, m = { t: 6, r: 20, b: 26, l: 70 };
  const svg = d3.select(el).append("svg");
  function render({ groups, series }) {
    const W = widthOf(el);
    const H = m.t + m.b + groups.length * grp;
    svg.attr("width", W).attr("height", H);
    const all = series.flatMap(s => groups.map(g => s.values[g.key])).filter(v => v != null);
    const lim = Math.max(200, d3.max(all, v => Math.abs(v)) * 1.1);
    const x = d3.scaleLinear().domain([-lim, Math.max(100, lim * 0.25)]).nice().range([m.l, W - m.r]);
    svg.selectAll("g.grid").data([0]).join("g").attr("class", "grid grid-lines").attr("transform", `translate(0,${m.t})`)
      .call(d3.axisTop(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(""));
    svg.selectAll("g.ax").data([0]).join("g").attr("class", "ax axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => fmtSigned(d)));
    svg.selectAll("line.zero").data([0]).join("line").attr("class", "zero").attr("stroke", C.text2)
      .attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b);
    const g = svg.selectAll("g.row").data(groups, d => d.key).join("g").attr("class", "row")
      .attr("transform", (d, i) => `translate(0,${m.t + i * grp})`);
    g.selectAll("text.name").data(d => [d]).join("text").attr("class", "label name").attr("x", m.l - 10).attr("y", grp / 2)
      .attr("text-anchor", "end").attr("dominant-baseline", "middle").text(d => d.label);
    g.selectAll("path.bar").data(d => series.map((s, j) => ({ s, j, v: s.values[d.key], g: d }))).join("path").attr("class", "bar")
      .attr("fill", b => b.s.color)
      .attr("d", b => b.v == null ? "" : hbarPath(x(0), x(b.v), (grp - series.length * (bh + 2)) / 2 + b.j * (bh + 2), bh))
      .on("pointerenter", (ev, b) => showTip(ev, { title: `${b.g.label} · ${b.s.name}`, rows: [
        { label: "Δ ouro aos 15", value: fmtSigned(b.v) },
        { label: "Partidas", value: String(b.s.n) }] }))
      .on("pointermove", moveTip).on("pointerleave", hideTip);
  }
  return { render };
}
