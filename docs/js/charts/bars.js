// Barras horizontais: campeões mais presentes (pick + ban) ou duplas mais frequentes com o campeão escolhido.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { C, showTip, moveTip, hideTip, widthOf, hbarPath } from "../ui.js";
import { fmtPct, fmtNum } from "../data.js";

export function bars(el, { champions, onSelect }) {
  const row = 24, bh = 14, m = { t: 4, r: 118, b: 6, l: 112 };
  const svg = d3.select(el).append("svg");

  function render({ stats, pairs, selected }) {
    const W = widthOf(el);
    let data, mode;
    if (selected == null) {
      mode = "presence";
      data = [...stats.list].sort((a, b) => b.presence - a.presence).slice(0, 12)
        .map(s => ({ c: s.c, a: s.pickRate, b: s.banRate, tot: s.presence, s }));
    } else {
      mode = "pairs";
      const base = stats.byChamp.get(selected);
      const baseWr = base && base.picks ? base.wins / base.picks : null;
      data = pairs.filter(p => p.a === selected || p.b === selected)
        .map(p => ({ c: p.a === selected ? p.b : p.a, n: p.n, wr: p.w / p.n, delta: baseWr == null ? null : p.w / p.n - baseWr }))
        .sort((a, b) => b.n - a.n).slice(0, 12);
    }
    const H = m.t + m.b + Math.max(1, data.length) * row;
    svg.attr("width", W).attr("height", H);
    const max = mode === "presence" ? d3.max(data, d => d.tot) || 1 : d3.max(data, d => d.n) || 1;
    const x = d3.scaleLinear().domain([0, max]).range([m.l, W - m.r]);

    const g = svg.selectAll("g.row").data(data, d => mode + d.c).join(enter => {
      const r = enter.append("g").attr("class", "row").style("cursor", "pointer");
      r.append("image").attr("width", 18).attr("height", 18).attr("clip-path", "url(#clip-circle)");
      r.append("text").attr("class", "label name");
      r.append("path").attr("class", "a");
      r.append("path").attr("class", "b");
      r.append("text").attr("class", "label val");
      r.append("rect").attr("class", "hit").attr("fill", "transparent");
      return r;
    }).attr("transform", (d, i) => `translate(0,${m.t + i * row})`);

    g.select("image").attr("href", d => champions[d.c].icon).attr("x", m.l - 24).attr("y", (row - 18) / 2 - 2);
    g.select("text.name").attr("x", m.l - 30).attr("y", row / 2 + 2).attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .text(d => champions[d.c].n);
    const y0 = (row - bh) / 2 - 2;
    if (mode === "presence") {
      g.select("path.a").attr("fill", C.focus).attr("d", d => hbarPath(m.l, x(d.a) - (d.b > 0 ? 1 : 0), y0, bh, d.b > 0 ? 0 : 4));
      g.select("path.b").attr("fill", C.neutral).attr("d", d => d.b > 0 ? hbarPath(x(d.a) + 1, x(d.a + d.b), y0, bh) : "");
      g.select("text.val").attr("x", d => x(d.tot) + 6).attr("y", row / 2 + 2).attr("dominant-baseline", "middle").text(d => fmtPct(d.tot));
    } else {
      g.select("path.a").attr("fill", C.gold).attr("d", d => hbarPath(m.l, x(d.n), y0, bh));
      g.select("path.b").attr("d", "");
      g.select("text.val").attr("x", d => x(d.n) + 6).attr("y", row / 2 + 2).attr("dominant-baseline", "middle")
        .text(d => `${d.n} · ${fmtPct(d.wr)} ${d.delta == null ? "" : d.delta >= 0 ? "▲" : "▼"}`);
    }
    g.select("rect.hit").attr("x", 0).attr("width", W).attr("height", row);
    g.on("click", (ev, d) => onSelect(d.c))
      .on("pointerenter", (ev, d) => {
        const ch = champions[d.c];
        if (mode === "presence") showTip(ev, { title: ch.n, icon: ch.icon, rows: [
          { label: "Pick", value: fmtPct(d.a, 1), color: C.focus },
          { label: "Ban", value: fmtPct(d.b, 1), color: C.neutral },
          { label: "Vitória", value: fmtPct(d.s.winRate, 1) }] });
        else showTip(ev, { title: `${champions[selected].n} + ${ch.n}`, icon: ch.icon, rows: [
          { label: "Jogos juntos", value: String(d.n) },
          { label: "Vitória da dupla", value: fmtPct(d.wr, 1) },
          { label: `vs. ${champions[selected].n} em geral`, value: d.delta == null ? "–" : (d.delta >= 0 ? "+" : "−") + fmtNum(Math.abs(d.delta * 100), 1) + " p.p." }] });
      })
      .on("pointermove", moveTip).on("pointerleave", hideTip);
    return mode;
  }
  return { render };
}
