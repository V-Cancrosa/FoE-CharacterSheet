/**
 * Grafiki i teksty motywu PipBucka (bez Foundry): godło Stajni na ekran pauzy (zębate wrota z numerem
 * na wyświetlaczu siedmiosegmentowym — nie zależy od czcionek) i linie ekranu powitalnego.
 * Wszystko rysowane od zera; żadnych logo z gier ani z Foundry.
 */

/** Segmenty cyfr: a (góra), b (prawa górna), c (prawa dolna), d (dół), e (lewa dolna), f (lewa górna), g (środek). */
const SEGMENTS = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abfgcd" };

/** Numer stajni: tylko cyfry, najwyżej 3 (domyślnie 97). */
export const stableDigits = n => String(n ?? "").replace(/\D/g, "").slice(0, 3) || "97";

/** Prostokąty jednej cyfry siedmiosegmentowej (x, y — lewy górny róg; w×h — rozmiar; t — grubość). */
function digitRects(d, x, y, w = 24, h = 46, t = 6) {
  const half = h / 2, out = [];
  const hor = yy => ({ x: x + t * 0.7, y: yy - t / 2, w: w - t * 1.4, h: t });
  const ver = (xx, yy) => ({ x: xx - t / 2, y: yy + t * 0.7, w: t, h: half - t * 1.4 });
  const seg = { a: hor(y), g: hor(y + half), d: hor(y + h), f: ver(x, y), b: ver(x + w, y), e: ver(x, y + half), c: ver(x + w, y + half) };
  for (const s of SEGMENTS[d] ?? "") out.push(seg[s]);
  return out;
}

/** Kolor z przezroczystością dla SVG: „#4dff8a” + 0.15 → „rgba(77,255,138,0.15)”. */
function rgba(hex, a) {
  const m = String(hex).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

/**
 * Godło: zębate wrota Stajni (zęby powoli się obracają), pierścień z nitami i numer na środku.
 * Zwraca kod SVG (viewBox 200×200) w jednym kolorze fosforu.
 */
export function stableDoorSvg(num = "97", color = "#4dff8a") {
  const digits = stableDigits(num);
  const c = String(color);
  // zęby wrót: 16 trapezów na obwodzie
  const teeth = 16, rIn = 80, rOut = 94, pts = [];
  for (let i = 0; i < teeth; i++) {
    const base = (i * 360) / teeth;
    for (const [da, r] of [[0, rIn], [3.5, rOut], [12.5, rOut], [16, rIn]]) {
      const a = ((base + da) * Math.PI) / 180;
      pts.push(`${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`);
    }
  }
  // nity na pierścieniu
  const bolts = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    return `<circle cx="${(100 + 67 * Math.cos(a)).toFixed(1)}" cy="${(100 + 67 * Math.sin(a)).toFixed(1)}" r="2.6"/>`;
  }).join("");
  // numer
  const w = 24, gap = 10, h = 46;
  const total = digits.length * w + (digits.length - 1) * gap;
  const x0 = 100 - total / 2, y0 = 100 - h / 2;
  const rects = [...digits].flatMap((d, i) => digitRects(Number(d), x0 + i * (w + gap), y0, w, h))
    .map(r => `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" rx="2"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
<defs><filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g filter="url(#g)" stroke="${c}" fill="none" stroke-linejoin="round">
<g><polygon points="${pts.join(" ")}" fill="${rgba(c, 0.07)}" stroke-width="2.5"/><animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="60s" repeatCount="indefinite"/></g>
<circle cx="100" cy="100" r="76" fill="#020403" stroke-width="2"/>
<circle cx="100" cy="100" r="58" fill="${rgba(c, 0.06)}" stroke-width="2.5"/>
<circle cx="100" cy="100" r="71" stroke-width="1" stroke-dasharray="3 5" opacity=".6"/>
<g fill="${c}" stroke="none">${bolts}</g>
<g fill="${c}" stroke="none">${rects}</g>
</g></svg>`;
}

/** Godło jako adres obrazka (do <img src>). */
export const stableDoorUrl = (num, color) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stableDoorSvg(num, color))}`;

/**
 * Linie ekranu powitalnego PipBucka. who — { user, actor?, gm, stable, caps?, sats?, rads? }.
 * MG widzi „terminal nadzorcy”, gracz — swój PipBuck i stan postaci.
 */
export function welcomeLines({ user = "", actor = "", gm = false, stable = "97", caps = null, sats = null, rads = null } = {}) {
  const n = stableDigits(stable);
  if (gm) return [`STABLE-TEC // TERMINAL NADZORCY — STAJNIA ${n}`, `> NADZORCA: ${String(user).toUpperCase()}`, "> SYSTEMY STAJNI ........ OK", "> MIESZKAŃCY ............ POD OBSERWACJĄ", "> WITAJ, NADZORCO."];
  const lines = [`STABLE-TEC PIPBUCK 3000 — STAJNIA ${n}`, `> UŻYTKOWNIK: ${String(user).toUpperCase()}`];
  if (actor) lines.push(`> NOSICIEL: ${String(actor).toUpperCase()}`);
  const stat = [caps !== null ? `KAPSLE ${caps}` : "", sats ? `SATS ${sats}` : "", rads !== null ? `PROM. ${rads} RAD` : ""].filter(Boolean).join(" · ");
  if (stat) lines.push(`> ${stat}`);
  lines.push("> WITAJ PONOWNIE.");
  return lines;
}
