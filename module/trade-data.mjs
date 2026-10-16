/**
 * Wymiana, rzut przedmiotem i sprzedaż — czyste zasady (bez Foundry).
 *   - odległość między tokenami: od pola do pola, jak w walce (sąsiednie pola = 1 pole), z regułą przekątnych sceny,
 *   - „obok siebie” = tokeny stykają się bokiem albo rogiem (i są na podobnej wysokości),
 *   - rzut przedmiotem (Explosives, s. 58 i 187): rzecz lżejsza niż ½ STR (w dół) — przedział zasięgu (STR/4)×5 ft,
 *     lżejsza niż ¼ STR — (STR/2)×5 ft (min. 5 ft); telekineza (s. 252–253): udźwig 2×INT, rzecz lżejsza niż ¼ udźwigu —
 *     (INT/4)×5 ft (bez minimum), lżejsza niż ⅛ — podwójnie; Heave, Ho! +5 ft (s. 128), Oops! −5 ft (s. 71);
 *     największy zasięg to 4 przedziały, każdy przedział po pierwszym — 1 krok MFD trudniej (s. 128, 187),
 *   - chybiony rzut: każdy brakujący krok MFD to 5 ft dalej od celu (jak przy granatach, s. 58),
 *   - ceny (Tabela XXXI, s. 471–472): co 5 rang skutecznego Mercantile — 5% lepiej; sprzedaż kupcowi za
 *     (ranga/5, w dół)×5 % wartości, kupno od kupca za 200% minus tyle samo.
 */
import { t, isPL, tmap } from "./i18n.mjs";

/** Odstęp na jednej osi w polach: 0 — rzuty się nakładają, 1 — stykają się (sąsiednie pola), 2 — jedno pole przerwy… */
function axisCells(a0, a1, b0, b1, size) {
  const gap = Math.max(b0 - a1, a0 - b1);
  if (gap < 0) return 0;
  return Math.round((gap / size + 1) * 100) / 100;
}

/**
 * Odstęp między prostokątami tokenów { x, y, w, h } (px) w polach siatki: { dx, dy }.
 * Dwa tokeny 1×1 obok siebie: { dx: 1, dy: 0 }; po skosie: { dx: 1, dy: 1 }; z jednym polem przerwy: 2.
 */
export function cellGap(a, b, size) {
  const s = Number(size) || 100;
  return { dx: axisCells(a.x, a.x + a.w, b.x, b.x + b.w, s), dy: axisCells(a.y, a.y + a.h, b.y, b.y + b.h, s) };
}

/** Reguły przekątnych Foundry (CONST.GRID_DIAGONALS): 0 równe, 1 dokładne, 2 przybliżone, 3 prostokątne, 4 5/10/5, 5 10/5/10, 6 bez przekątnych. */
export function squares(dx, dy, diagonals = 0, gridless = false) {
  const hi = Math.max(dx, dy), lo = Math.min(dx, dy);
  if (gridless || diagonals === 1) return Math.hypot(dx, dy);
  if (diagonals === 2) return hi + lo / 2;
  if (diagonals === 3 || diagonals === 6) return dx + dy;
  if (diagonals === 4) return hi + Math.floor(lo / 2);
  if (diagonals === 5) return hi + Math.ceil(lo / 2);
  return hi;
}

/**
 * Odległość między tokenami w stopach (jednostkach sceny).
 * grid: { size (px), distance (ft na pole), diagonals, gridless }; elevation — wysokości tokenów (ft).
 */
export function tokenDistance(a, b, grid, elevation = [0, 0]) {
  const { dx, dy } = cellGap(a, b, grid.size);
  const flat = squares(dx, dy, grid.diagonals ?? 0, !!grid.gridless) * (Number(grid.distance) || 5);
  const dz = Math.abs((Number(elevation[0]) || 0) - (Number(elevation[1]) || 0));
  return Math.round(Math.max(flat, dz) * 10) / 10;
}

/** Czy tokeny są obok siebie: stykają się (bokiem albo rogiem) i różnica wysokości to najwyżej jedno pole. */
export function isAdjacent(a, b, grid, elevation = [0, 0]) {
  const { dx, dy } = cellGap(a, b, grid.size);
  const dz = Math.abs((Number(elevation[0]) || 0) - (Number(elevation[1]) || 0));
  return dx <= 1.5 && dy <= 1.5 && dz <= (Number(grid.distance) || 5);
}

/**
 * Rzut przedmiotem: { ok, inc, max, limit, light, reason }.
 *   str / int — atrybuty rzucającego, weight — waga rzucanej rzeczy (razem z ilością),
 *   heave — Heave, Ho! (+5 ft), oops — Oops! (−5 ft), tk — rzut telekinezą (jednorożec).
 */
export function throwProfile({ str = 0, int = 0, weight = 0, heave = false, oops = false, tk = false } = {}) {
  const w = Math.max(0, Number(weight) || 0);
  let inc, limit, light;
  if (tk) {
    const lift = 2 * (Number(int) || 0);
    limit = lift / 4;
    light = w < lift / 8;
    inc = Math.floor((Number(int) || 0) / 4) * 5 * (light ? 2 : 1);
    if (!inc) return { ok: false, inc: 0, max: 0, limit, light, reason: t("telekinesis too weak (INT below 4) — you can't throw anything with it") };
  } else {
    const s = Number(str) || 0;
    limit = Math.floor(s / 2);
    light = w < s / 4;
    inc = Math.max(5, Math.floor(s / (light ? 2 : 4)) * 5);
  }
  if (!(w < limit)) {
    return { ok: false, inc: 0, max: 0, limit, light, reason: tk ? t("too heavy: with telekinesis you can throw something lighter than {limit} lb (this weighs {w} lb)", { limit: fmt(limit), w: fmt(w) }) : t("too heavy: with a hoof you can throw something lighter than {limit} lb (this weighs {w} lb)", { limit: fmt(limit), w: fmt(w) }) };
  }
  if (heave) inc += 5;
  if (oops) inc = Math.max(5, inc - 5);
  return { ok: true, inc, max: 4 * inc, limit, light, reason: "" };
}

const fmt = n => (isPL() ? String(Math.round(n * 100) / 100).replace(".", ",") : String(Math.round(n * 100) / 100));

/** Kara za odległość: ile przedziałów po pierwszym (każdy = 1 krok MFD trudniej); null — poza zasięgiem. */
export function throwSteps(dist, inc) {
  const d = Math.max(0, Number(dist) || 0);
  if (!(inc > 0) || d > 4 * inc) return null;
  return d <= inc ? 0 : Math.ceil(d / inc) - 1;
}

/** O ile kroków MFD chybiono: cel (indeks kroku) minus najtrudniejszy zaliczony; nic nie zaliczone — cel + 1. */
export function missedSteps(targetIdx, achievedIdx) {
  const t = Math.max(0, Number(targetIdx) || 0);
  const a = achievedIdx === null || achievedIdx === undefined || achievedIdx < 0 ? -1 : Number(achievedIdx);
  return Math.max(1, Math.min(6, t - a));
}

/** Kierunki k8 (1 = północ, dalej zgodnie z ruchem wskazówek zegara). */
const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export const DIR_NAMES = tmap({ 0: "to the north", 1: "to the northeast", 2: "to the east", 3: "to the southeast", 4: "to the south", 5: "to the southwest", 6: "to the west", 7: "to the northwest" });

/**
 * Gdzie upada chybiony przedmiot: pole (px, lewy górny róg) `cells` pól od krawędzi tokenu w kierunku k8 (1–8),
 * przycięte do prostokąta sceny { x, y, width, height } (px).
 */
export function landingCell(token, size, cells, d8, rect = null) {
  const s = Number(size) || 100;
  const [ux, uy] = DIRS[(Math.max(1, Math.min(8, Number(d8) || 1)) - 1)];
  const c0 = Math.floor(token.x / s), r0 = Math.floor(token.y / s);
  const c1 = c0 + Math.max(1, Math.round(token.w / s)), r1 = r0 + Math.max(1, Math.round(token.h / s));
  const n = Math.max(1, Math.round(Number(cells) || 1));
  let col = ux > 0 ? c1 - 1 + n : ux < 0 ? c0 - n : Math.floor((c0 + c1 - 1) / 2);
  let row = uy > 0 ? r1 - 1 + n : uy < 0 ? r0 - n : Math.floor((r0 + r1 - 1) / 2);
  if (rect) {
    col = Math.min(Math.max(col, Math.ceil(rect.x / s)), Math.floor((rect.x + rect.width) / s) - 1);
    row = Math.min(Math.max(row, Math.ceil(rect.y / s)), Math.floor((rect.y + rect.height) / s) - 1);
  }
  return { x: col * s, y: row * s };
}

/** Kierunek z prostokąta a do b jako indeks DIR_NAMES (0 = północ, zgodnie z ruchem wskazówek zegara). */
export function direction(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return Math.round(deg / 45) % 8;
}

/** Skuteczny Mercantile → procent wartości przy sprzedaży kupcowi (co 5 rang, w dół; od 0). */
export const sellPct = eff => Math.max(0, Math.floor((Number(eff) || 0) / 5) * 5);
/** …i przy kupnie od kupca (200% przy randze 0, 100% przy 100; nie mniej niż 10%). */
export const buyPct = eff => Math.max(10, 200 - sellPct(eff));

/**
 * Proponowana cena: gracz sprzedaje NPC — wg Mercantile sprzedającego; NPC sprzedaje graczowi — wg Mercantile kupującego;
 * między graczami (albo między NPC) — wartość z podręcznika (cenę i tak można zmienić).
 * Zwraca { price, pct, rule }.
 */
export function suggestPrice({ value = 0, qty = 1, sellerPC = true, buyerPC = false, sellerEff = 0, buyerEff = 0 } = {}) {
  const base = Math.max(0, Number(value) || 0) * Math.max(1, Number(qty) || 1);
  let pct = 100, rule = t("rulebook value");
  if (sellerPC && !buyerPC) { pct = sellPct(sellerEff); rule = t("Mercantile {n} → {p}% of the value", { n: Math.floor(Number(sellerEff) || 0), p: pct }); }
  else if (!sellerPC && buyerPC) { pct = buyPct(buyerEff); rule = t("buyer's Mercantile {n} → {p}% of the value", { n: Math.floor(Number(buyerEff) || 0), p: pct }); }
  return { price: Math.floor(base * pct / 100), pct, rule };
}
