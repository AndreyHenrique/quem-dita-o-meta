// Linha do tempo de patches com brush: colunas = partidas por patch (liga em foco e comparada).
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { C, showTip, hideTip, widthOf, vbarPath } from "../ui.js";

export function timeline(el, { patches, onBrush }) {
  const H = 44, m = { l: 2, r: 2, t: 2, b: 14 };
  const svg = d3.select(el).append("svg").attr("height", H);
  const gBars = svg.append("g");
  const gAxis = svg.append("g").attr("class", "axis");
  const gBrush = svg.append("g");
  let x, W, data = [], silent = false, current = [0, patches.length - 1];

  const brush = d3.brushX().on("brush end", ev => {
    if (silent) return;
    if (!ev.selection) { set([0, patches.length - 1]); onBrush(current); return; }
    const [a, b] = ev.selection;
    const i0 = Math.max(0, Math.round((a - m.l) / x.step()));
    const i1 = Math.min(patches.length - 1, Math.round((b - m.l) / x.step()) - 1);
    if (i1 < i0) return;
    current = [i0, i1];
    if (ev.type === "end") { snap(); onBrush(current); }
    else onBrush(current, true);
  });

  function snap() {
    silent = true;
    gBrush.call(brush.move, [x(patches[current[0]]), x(patches[current[1]]) + x.bandwidth()]);
    silent = false;
  }
  function set(range) { current = range; if (x) snap(); }

  function render(counts) {
    data = counts;
    W = widthOf(el, 240);
    svg.attr("width", W);
    x = d3.scaleBand().domain(patches).range([m.l, W - m.r]).paddingInner(0.12);
    const maxN = d3.max(data, d => d.a + d.b) || 1;
    const y = d3.scaleLinear().domain([0, maxN]).range([H - m.b, m.t]);
    const bw = x.bandwidth();
    gBars.selectAll("g.col").data(data, d => d.p).join("g").attr("class", "col")
      .each(function (d) {
        const g = d3.select(this);
        const xa = x(patches[d.p]);
        g.selectAll("path.a").data([d]).join("path").attr("class", "a").attr("fill", C.focus)
          .attr("d", vbarPath(xa, H - m.b, y(d.a), bw, 1.5));
        g.selectAll("path.b").data([d]).join("path").attr("class", "b").attr("fill", C.compare)
          .attr("d", d.b ? vbarPath(xa, y(d.a) - 1, y(d.a + d.b) - 1, bw, 1.5) : "");
        g.selectAll("rect.hit").data([d]).join("rect").attr("class", "hit").attr("fill", "transparent")
          .attr("x", xa).attr("width", bw).attr("y", m.t).attr("height", H - m.b - m.t);
      });
    // Rótulos: primeiro patch de cada ano e o último.
    const ticks = patches.filter((p, i) => i === 0 || p.endsWith(".01") || i === patches.length - 1);
    gAxis.attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(0).tickPadding(3))
      .call(g => g.select(".domain").remove());
    brush.extent([[m.l, m.t], [W - m.r, H - m.b]]);
    gBrush.call(brush);
    gBrush.selectAll(".selection").attr("fill", C.gold).attr("fill-opacity", 0.14).attr("stroke", C.gold).attr("stroke-opacity", .7);
    gBrush.selectAll(".overlay").on("pointermove.tip", ev => {
      const [mx] = d3.pointer(ev);
      const i = Math.floor((mx - m.l) / x.step());
      const d = data[i];
      if (!d) return;
      showTip(ev, { title: `Patch ${patches[i]}`, rows: [
        { label: "Liga em foco", value: `${d.a} partidas`, color: C.focus },
        { label: "Comparada", value: `${d.b} partidas`, color: C.compare }] });
    }).on("pointerleave.tip", hideTip);
    snap();
  }
  return { render, set, get: () => current };
}
