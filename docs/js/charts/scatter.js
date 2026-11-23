// Dispersão: taxa de pick × taxa de vitória (liga em foco).
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { C, showTip, moveTip, hideTip, widthOf } from "../ui.js";
import { fmtPct } from "../data.js";

export function scatter(el, { champions, onSelect }) {
  const H = 300, m = { t: 10, r: 14, b: 36, l: 44 };
  const svg = d3.select(el).append("svg").attr("height", H);
  const gGrid = svg.append("g").attr("class", "grid-lines");
  const gx = svg.append("g").attr("class", "axis"), gy = svg.append("g").attr("class", "axis");
  const ref = svg.append("line").attr("class", "ref-line").attr("stroke-dasharray", null);
  const refLabel = svg.append("text").attr("class", "label muted").attr("text-anchor", "end");
  const gDots = svg.append("g"), gLabels = svg.append("g"), gVor = svg.append("g");
  const xt = svg.append("text").attr("class", "axis-title").attr("text-anchor", "end").text("taxa de pick →");
  const yt = svg.append("text").attr("class", "axis-title").text("↑ vitória");

  function render({ stats, selected, partners }) {
    const minPicks = Math.max(8, Math.round(stats.games * 0.03));
    const W = widthOf(el);
    svg.attr("width", W);
    const data = stats.list.filter(s => s.picks >= minPicks || s.c === selected);
    render.minPicks = minPicks;
    const x = d3.scaleLinear().domain([0, (d3.max(data, d => d.pickRate) || 0.1) * 1.05]).nice().range([m.l, W - m.r]);
    const ext = d3.extent(data, d => d.winRate);
    const y = d3.scaleLinear().domain([Math.min(0.3, ext[0] ?? .3), Math.max(0.7, ext[1] ?? .7)]).nice().range([H - m.b, m.t]);

    gGrid.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    gx.attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
    gy.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
    xt.attr("x", W - m.r).attr("y", H - 4);
    yt.attr("x", 4).attr("y", m.t + 2).attr("dy", "0.7em").attr("x", m.l + 6);
    ref.attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0.5)).attr("y2", y(0.5));
    refLabel.attr("x", W - m.r).attr("y", y(0.5) - 4).text("50%");

    const partnerSet = new Set(partners || []);
    const sorted = [...data].sort((a, b) => (a.c === selected) - (b.c === selected) || partnerSet.has(a.c) - partnerSet.has(b.c));
    gDots.selectAll("circle").data(sorted, d => d.c).join("circle")
      .attr("cx", d => x(d.pickRate)).attr("cy", d => y(d.winRate))
      .attr("r", d => d.c === selected ? 7 : 4.5)
      .attr("fill", d => d.c === selected ? C.text : partnerSet.has(d.c) ? C.gold : C.focus)
      .attr("fill-opacity", d => selected == null || d.c === selected || partnerSet.has(d.c) ? 1 : 0.35)
      .attr("stroke", C.surface).attr("stroke-width", 2)
      .order();

    // Rótulos seletivos: selecionado, parceiros e os 4 mais escolhidos.
    const top = [...data].sort((a, b) => b.pickRate - a.pickRate).slice(0, 4).map(d => d.c);
    const cand = data.filter(d => d.c === selected || partnerSet.has(d.c) || (selected == null && top.includes(d.c)))
      .sort((a, b) => (b.c === selected) - (a.c === selected) || b.pickRate - a.pickRate);
    // Evita colisão: descarta rótulos a menos de 13px de outro já colocado.
    const placed = [];
    const lab = cand.filter(d => {
      const px = x(d.pickRate), py = y(d.winRate);
      if (placed.some(([qx, qy]) => Math.abs(qx - px) < 70 && Math.abs(qy - py) < 13)) return false;
      placed.push([px, py]); return true;
    });
    gLabels.selectAll("text").data(lab, d => d.c).join("text")
      .attr("class", d => "label" + (d.c === selected ? " strong" : ""))
      .attr("x", d => x(d.pickRate) + 9).attr("y", d => y(d.winRate) + 4)
      .attr("text-anchor", d => x(d.pickRate) > W - 90 ? "end" : "start")
      .attr("dx", d => x(d.pickRate) > W - 90 ? -18 : 0)
      .text(d => champions[d.c].n);

    // Camada de Voronoi: o ponteiro só precisa estar mais perto do ponto.
    const delaunay = d3.Delaunay.from(data, d => x(d.pickRate), d => y(d.winRate));
    const vor = delaunay.voronoi([m.l, m.t, W - m.r, H - m.b]);
    gVor.selectAll("path").data(data, d => d.c).join("path")
      .attr("d", (d, i) => vor.renderCell(i)).attr("fill", "transparent").style("cursor", "pointer")
      .on("pointerenter", (ev, d) => {
        const ch = champions[d.c];
        showTip(ev, { title: ch.n, icon: ch.icon, rows: [
          { label: "Pick", value: `${fmtPct(d.pickRate, 1)} (${d.picks})` },
          { label: "Vitória", value: fmtPct(d.winRate, 1) },
          { label: "Ban", value: fmtPct(d.banRate, 1) }] });
      })
      .on("pointermove", moveTip).on("pointerleave", hideTip)
      .on("click", (ev, d) => onSelect(selected === d.c ? null : d.c));
  }
  return { render };
}
