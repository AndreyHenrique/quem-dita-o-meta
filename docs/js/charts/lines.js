// Gráficos de linha com crosshair: presença por patch, vitória × ouro, lado azul por patch.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { C, showTip, moveTip, hideTip, widthOf } from "../ui.js";
import { fmtPct, fmtSigned } from "../data.js";

/**
 * Linha por categoria (patches). series: [{name, color, dash, values:[{p, v}]}]
 * band: [i0, i1] faixa destacada ; yFmt ; ref (linha de referência em y)
 */
export function patchLines(el, { patches, H = 260, yLabel = "", yDomain = null, ref = null }) {
  const m = { t: 12, r: 16, b: 30, l: 44 };
  const svg = d3.select(el).append("svg").attr("height", H);
  const band = svg.append("rect").attr("fill", C.gold).attr("fill-opacity", 0.07);
  const gGrid = svg.append("g").attr("class", "grid-lines");
  const gx = svg.append("g").attr("class", "axis"), gy = svg.append("g").attr("class", "axis");
  const refLine = svg.append("line").attr("class", "ref-line");
  const gS = svg.append("g");
  const cross = svg.append("line").attr("stroke", C.text3).attr("stroke-width", 1).attr("opacity", 0);
  const yt = svg.append("text").attr("class", "axis-title").text(yLabel);
  const empty = svg.append("text").attr("class", "label muted").attr("text-anchor", "middle");
  const overlay = svg.append("rect").attr("fill", "transparent");

  function render({ series, range, emptyText = "" }) {
    const W = widthOf(el);
    svg.attr("width", W);
    const x = d3.scalePoint().domain(d3.range(patches.length)).range([m.l, W - m.r]);
    const all = series.flatMap(s => s.values.filter(d => d.v != null).map(d => d.v));
    const y = d3.scaleLinear().domain(yDomain || [0, Math.max(0.1, d3.max(all) || 0.1)]).nice().range([H - m.b, m.t]);
    const has = all.length > 0;
    empty.attr("x", W / 2).attr("y", H / 2).text(has ? "" : emptyText);

    band.attr("x", x(range[0]) - x.step() / 2).attr("width", x(range[1]) - x(range[0]) + x.step())
      .attr("y", m.t).attr("height", H - m.b - m.t);
    gGrid.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    const ticks = d3.range(patches.length).filter(i => i % (W < 600 ? 8 : 4) === 0 || i === patches.length - 1);
    gx.attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(ticks).tickFormat(i => patches[i]));
    gy.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
    yt.attr("x", m.l + 6).attr("y", m.t).attr("dy", "0.7em");
    if (ref != null) refLine.attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(ref)).attr("y2", y(ref)); else refLine.attr("x1", 0).attr("x2", 0);

    const line = d3.line().defined(d => d.v != null).x(d => x(d.p)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    const g = gS.selectAll("g.s").data(series, d => d.name).join(e => { const g = e.append("g").attr("class", "s"); g.append("path"); g.append("circle"); return g; });
    g.select("path").attr("fill", "none").attr("stroke", d => d.color).attr("stroke-width", 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
      .attr("stroke-dasharray", d => d.dash ? "5 4" : null).attr("d", d => line(d.values.filter(v => v.v != null)));
    g.select("circle").each(function (d) {
      const last = [...d.values].reverse().find(v => v.v != null);
      d3.select(this).attr("r", last ? 4 : 0).attr("fill", d.color).attr("stroke", C.surface).attr("stroke-width", 2)
        .attr("cx", last ? x(last.p) : 0).attr("cy", last ? y(last.v) : 0);
    });

    overlay.attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.b - m.t)
      .on("pointermove", ev => {
        const [mx] = d3.pointer(ev);
        const i = Math.max(0, Math.min(patches.length - 1, Math.round((mx - m.l) / x.step())));
        cross.attr("x1", x(i)).attr("x2", x(i)).attr("y1", m.t).attr("y2", H - m.b).attr("opacity", 1);
        showTip(ev, { title: `Patch ${patches[i]}`, rows: series.map(s => {
          const d = s.values[i];
          return { label: s.name, color: s.color, dash: s.dash, value: d && d.v != null ? fmtPct(d.v) + (d.games != null ? ` (${d.games} jogos)` : "") : "sem dados" };
        }) });
      })
      .on("pointerleave", () => { cross.attr("opacity", 0); hideTip(); });
  }
  return { render };
}

/** Vitória × diferença de ouro aos 15 min: pontos por faixa + curva logística, uma por liga. */
export function goldChart(el) {
  const H = 300, m = { t: 12, r: 16, b: 36, l: 44 };
  const svg = d3.select(el).append("svg").attr("height", H);
  const gGrid = svg.append("g").attr("class", "grid-lines");
  const gx = svg.append("g").attr("class", "axis"), gy = svg.append("g").attr("class", "axis");
  const zero = svg.append("line").attr("class", "ref-line"), half = svg.append("line").attr("class", "ref-line");
  const gS = svg.append("g");
  const cross = svg.append("line").attr("stroke", C.text3).attr("opacity", 0);
  const xt = svg.append("text").attr("class", "axis-title").attr("text-anchor", "middle").text("Δ ouro aos 15 min (time)");
  const overlay = svg.append("rect").attr("fill", "transparent");
  const LIM = 6000;

  function render({ series }) {
    const W = widthOf(el);
    svg.attr("width", W);
    const x = d3.scaleLinear().domain([-LIM, LIM]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    gGrid.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
    gx.attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 500 ? 4 : 6).tickFormat(d => d === 0 ? "0" : fmtSigned(d / 1000) + "k"));
    gy.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")));
    xt.attr("x", (m.l + W - m.r) / 2).attr("y", H - 4);
    zero.attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b);
    half.attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(.5)).attr("y2", y(.5));

    const xs = d3.range(-LIM, LIM + 1, 100);
    const line = d3.line().x(d => x(d[0])).y(d => y(d[1]));
    const g = gS.selectAll("g.s").data(series, d => d.name).join(e => { const g = e.append("g").attr("class", "s"); g.append("path"); g.append("g").attr("class", "pts"); return g; });
    g.select("path").attr("fill", "none").attr("stroke", d => d.color).attr("stroke-width", 2).attr("stroke-dasharray", d => d.dash ? "5 4" : null)
      .attr("d", d => d.curve.fit ? line(xs.map(v => [v, d.curve.fit.f(v / 1000)])) : null);
    g.select("g.pts").selectAll("circle").data(d => d.curve.bins.map(b => ({ ...b, color: d.color }))).join("circle")
      .attr("cx", b => x(b.x)).attr("cy", b => y(b.wr)).attr("r", 4).attr("fill", b => b.color).attr("fill-opacity", 0.55)
      .attr("stroke", C.surface).attr("stroke-width", 2);

    overlay.attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.b - m.t)
      .on("pointermove", ev => {
        const [mx] = d3.pointer(ev);
        const v = Math.round(x.invert(mx) / 250) * 250;
        cross.attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.t).attr("y2", H - m.b).attr("opacity", 1);
        showTip(ev, { title: `${fmtSigned(v)} de ouro aos 15 min`, rows: series.map(s => ({
          label: s.name, color: s.color, dash: s.dash, value: s.curve.fit ? fmtPct(s.curve.fit.f(v / 1000)) + " de vitória" : "–" })),
          foot: "Probabilidade estimada pela regressão logística." });
      })
      .on("pointerleave", () => { cross.attr("opacity", 0); hideTip(); });
  }
  return { render };
}
