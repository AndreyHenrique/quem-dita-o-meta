// Rede de sinergia: grafo de força com ícones dos campeões.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { C, winColor, showTip, moveTip, hideTip, widthOf } from "../ui.js";
import { fmtPct } from "../data.js";

export function network(el, { champions, onSelect }) {
  const H = 640;
  const svg = d3.select(el).append("svg").attr("height", H);
  const defs = svg.append("defs");
  defs.append("clipPath").attr("id", "clip-circle").attr("clipPathUnits", "objectBoundingBox")
    .append("circle").attr("cx", .5).attr("cy", .5).attr("r", .5);
  const gLinks = svg.append("g");
  const gNodes = svg.append("g");
  const empty = svg.append("text").attr("class", "label muted").attr("text-anchor", "middle");
  const pos = new Map(); // posições anteriores para estabilidade entre filtros
  let sim, selected = null, nodeSel, linkSel, W;

  function render({ stats, pairs, selected: sel }) {
    selected = sel;
    W = widthOf(el, 300);
    svg.attr("width", W).attr("viewBox", [0, 0, W, H]);
    const N = W < 520 ? 32 : 46;
    const nodes = stats.list.filter(s => s.picks >= 3).sort((a, b) => b.presence - a.presence).slice(0, N)
      .map(s => ({ ...s, ...(pos.get(s.c) || {}) }));
    const ids = new Set(nodes.map(n => n.c));
    // Arestas: duplas entre os nós; mantemos as mais frequentes (no máx. ~3 por nó).
    let links = pairs.filter(p => ids.has(p.a) && ids.has(p.b)).sort((a, b) => b.n - a.n);
    links = links.slice(0, Math.round(N * 2.2)).filter(l => l.n >= 3).map(l => ({ ...l, source: l.a, target: l.b }));

    empty.attr("x", W / 2).attr("y", H / 2).text(nodes.length ? "" : "Poucas partidas no recorte. Amplie os patches ou troque o time.");

    const r = d3.scaleSqrt().domain([0, d3.max(nodes, d => d.presence) || 1]).range([7, W < 520 ? 18 : 24]);
    const wScale = d3.scaleLinear().domain([3, d3.max(links, d => d.n) || 3]).range([1, 6]);
    nodes.forEach(n => (n.r = r(n.presence)));

    linkSel = gLinks.selectAll("line").data(links, d => d.a * 1000 + d.b).join("line")
      .attr("stroke", "#5a6d80").attr("stroke-linecap", "round")
      .attr("stroke-width", d => wScale(d.n));

    nodeSel = gNodes.selectAll("g.node").data(nodes, d => d.c).join(enter => {
      const g = enter.append("g").attr("class", "node").style("cursor", "pointer");
      g.append("circle").attr("class", "halo");
      g.append("circle").attr("class", "ring");
      g.append("image").attr("preserveAspectRatio", "xMidYMid slice").attr("clip-path", "url(#clip-circle)")
        .attr("href", d => champions[d.c].icon);
      g.append("rect").attr("class", "hit").attr("fill", "transparent");
      return g;
    });
    nodeSel.select("circle.halo").attr("r", d => d.r + 5).attr("fill", C.surface);
    nodeSel.select("circle.ring").attr("r", d => d.r + 2.5).attr("fill", "none")
      .attr("stroke", d => d.winRate == null ? C.divMid : winColor(d.winRate)).attr("stroke-width", 3);
    nodeSel.select("image").attr("x", d => -d.r).attr("y", d => -d.r).attr("width", d => 2 * d.r).attr("height", d => 2 * d.r);
    nodeSel.select("rect.hit").attr("x", d => -Math.max(12, d.r + 4)).attr("y", d => -Math.max(12, d.r + 4))
      .attr("width", d => 2 * Math.max(12, d.r + 4)).attr("height", d => 2 * Math.max(12, d.r + 4));

    nodeSel
      .on("click", (ev, d) => { ev.stopPropagation(); onSelect(selected === d.c ? null : d.c); })
      .on("pointerenter", (ev, d) => {
        const ch = champions[d.c];
        const partners = links.filter(l => l.a === d.c || l.b === d.c).length;
        showTip(ev, { title: ch.n, icon: ch.icon, rows: [
          { label: "Presença", value: fmtPct(d.presence) },
          { label: "Picks · bans", value: `${d.picks} · ${d.bans}` },
          { label: "Vitória", value: fmtPct(d.winRate) },
          { label: "Duplas na rede", value: String(partners) }],
          foot: ch.tags.join(" · ") });
        highlight(d.c, true);
      })
      .on("pointermove", moveTip)
      .on("pointerleave", () => { hideTip(); highlight(selected); })
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    svg.on("click", () => onSelect(null));

    if (sim) sim.stop();
    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.c).distance(l => 110 - Math.min(40, l.n)).strength(l => Math.min(0.9, 0.1 + l.n / 80)))
      .force("charge", d3.forceManyBody().strength(-320).distanceMax(380))
      .force("collide", d3.forceCollide(d => d.r + 10))
      .force("x", d3.forceX(W / 2).strength(0.06))
      .force("y", d3.forceY(H / 2).strength(0.08))
      .alpha(pos.size ? 0.6 : 1)
      .on("tick", () => {
        for (const n of nodes) {
          n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
          n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y));
          pos.set(n.c, { x: n.x, y: n.y });
        }
        linkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
      });
    highlight(selected);
  }

  function highlight(c, hover = false) {
    if (!nodeSel) return;
    if (c == null) {
      linkSel.attr("stroke", "#5a6d80").attr("stroke-opacity", 0.55);
      nodeSel.attr("opacity", 1);
      nodeSel.select("circle.halo").attr("stroke", null);
      return;
    }
    const nb = new Set([c]);
    linkSel.each(l => { if (l.source.c === c) nb.add(l.target.c); if (l.target.c === c) nb.add(l.source.c); });
    linkSel.attr("stroke", l => (l.source.c === c || l.target.c === c) ? C.gold : "#5a6d80")
      .attr("stroke-opacity", l => (l.source.c === c || l.target.c === c) ? 0.95 : 0.08);
    nodeSel.attr("opacity", d => nb.has(d.c) ? 1 : 0.25);
    nodeSel.select("circle.halo").attr("stroke", d => d.c === c ? C.text : null).attr("stroke-width", 2);
    if (!hover) nodeSel.filter(d => d.c === c).raise();
  }

  function select(c) { selected = c; highlight(c); }
  return { render, select };
}
