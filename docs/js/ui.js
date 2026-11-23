// Utilidades de interface: cores, tooltip e legendas. Textos vindos dos dados entram via textContent.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const css = getComputedStyle(document.documentElement);
const v = n => css.getPropertyValue(n).trim();
export const C = {
  focus: v("--focus"), compare: v("--compare"), neutral: v("--neutral"),
  text: v("--text"), text2: v("--text-2"), text3: v("--text-3"),
  surface: v("--surface"), line: v("--line"), lineStrong: v("--line-strong"), gold: v("--gold"),
  divPos: v("--div-pos"), divMid: v("--div-mid"), divNeg: v("--div-neg"),
};

/** Escala divergente para taxa de vitória: vermelho < 50% (cinza) < azul. */
export const winColor = d3.scaleLinear().domain([0.4, 0.5, 0.6])
  .range([C.divNeg, C.divMid, C.divPos]).interpolate(d3.interpolateLab).clamp(true);

const tip = document.getElementById("tooltip");

/** rows: [{key?, color?, dash?, label, value}] ; title: string ; icon: url */
export function showTip(event, { title, icon, rows = [], foot }) {
  tip.replaceChildren();
  if (title) {
    const t = document.createElement("div"); t.className = "tt-title";
    if (icon) { const im = document.createElement("img"); im.src = icon; im.alt = ""; t.append(im); }
    t.append(document.createTextNode(title));
    tip.append(t);
  }
  for (const r of rows) {
    const row = document.createElement("div"); row.className = "tt-row";
    const l = document.createElement("span");
    if (r.color) { const k = document.createElement("span"); k.className = "tt-key"; k.style.borderTopColor = r.color; if (r.dash) k.style.borderTopStyle = "dashed"; l.append(k); }
    l.append(document.createTextNode(r.label));
    const b = document.createElement("b"); b.textContent = r.value;
    row.append(l, b); tip.append(row);
  }
  if (foot) { const f = document.createElement("div"); f.style.marginTop = "4px"; f.style.color = C.text3; f.textContent = foot; tip.append(f); }
  tip.classList.add("show");
  moveTip(event);
}
export function moveTip(event) {
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
export function hideTip() { tip.classList.remove("show"); }

/** items: [{type:'sw'|'ln'|'dash'|'dot'|'ramp', color, label, gradient}] */
export function legend(el, items) {
  el.replaceChildren();
  for (const it of items) {
    const k = document.createElement("span"); k.className = "key";
    const s = document.createElement("span");
    if (it.type === "ln" || it.type === "dash") { s.className = "ln" + (it.type === "dash" ? " dash" : ""); s.style.borderTopColor = it.color; }
    else if (it.type === "ramp") { s.className = "ramp"; s.style.background = it.gradient; }
    else if (it.type === "dot") { s.className = "dot"; s.style.background = it.color; if (it.ring) s.style.boxShadow = `0 0 0 2px ${it.ring}`; }
    else { s.className = "sw"; s.style.background = it.color; }
    k.append(s, document.createTextNode(it.label));
    el.append(k);
  }
}

/** Mede a largura disponível de um container de gráfico. */
export function widthOf(el, min = 280) { return Math.max(min, el.getBoundingClientRect().width); }

/** Barras horizontais com ponta arredondada (4px) e base reta. */
export function hbarPath(x0, x1, y, h, r = 4) {
  const w = x1 - x0;
  if (Math.abs(w) < 0.5) return "";
  const dir = Math.sign(w), rr = Math.min(r, Math.abs(w), h / 2);
  const xe = x1 - dir * rr;
  return `M${x0},${y}H${xe}A${rr},${rr} 0 0 ${dir > 0 ? 1 : 0} ${x1},${y + rr}V${y + h - rr}A${rr},${rr} 0 0 ${dir > 0 ? 1 : 0} ${xe},${y + h}H${x0}Z`;
}
/** Colunas verticais com topo arredondado. */
export function vbarPath(x, y0, y1, w, r = 3) {
  const h = y0 - y1;
  if (h < 0.5) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y0}V${y1 + rr}A${rr},${rr} 0 0 1 ${x + rr},${y1}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y1 + rr}V${y0}Z`;
}
