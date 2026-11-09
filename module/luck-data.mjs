/**
 * Karty szczęścia (zasada „Live by Luck”, s. 53–57) — część bez Foundry (testowalna w Node).
 *   - przed rzutem: +10 do progu za kartę, najwyżej 5; krytyczny sukces zwraca wydane karty,
 *   - ratowanie krytycznej porażki: karta + rzut Luck × 10 (MFD 1),
 *   - uniknięcie trafienia: karta + Luck MFD 1, po ogłoszeniu trafienia, przed obrażeniami,
 *   - zmniejszenie ran: karta zdejmuje 1 ranę, potem najniższy atrybut na MFD 1 — każdy krok trudniej niż 1 to kolejna
 *     rana mniej, krytyk zdejmuje wszystkie; tylko w chwili otrzymania ran,
 *   - oddanie karty innemu graczowi za dwie swoje; wyczyn (1–3 karty) i zmiana fabuły (1 karta) — decyduje MG.
 */
export const MAX_BEFORE = 5;
export const GIVE_COST = 2;

// Kroki MFD jak MFD_STEPS w data.mjs (od najłatwiejszego)
const KEYS = ["2", "1.5", "1", "3/4", "1/2", "1/4", "1/10"];
const F = { "2": 2, "1.5": 1.5, "1": 1, "3/4": 0.75, "1/2": 0.5, "1/4": 0.25, "1/10": 0.1 };
const thr = (tn, key, mod = 0) => Math.floor((Number(tn) || 0) * F[key]) + (Number(mod) || 0);

/** Ile kart przed rzutem: 0–5 i nie więcej, niż postać ma. */
export const beforeCards = (n, have) => Math.max(0, Math.min(MAX_BEFORE, Math.trunc(Number(have) || 0), Math.trunc(Number(n) || 0)));

/** Wynik zwykłego rzutu d100 (krytyki 1–5 i 96–100) na MFD 1. */
export function plainResult(total, tn, mod = 0) {
  const r = Number(total);
  if (r <= 5) return "crit-success";
  if (r >= 96) return "crit-fail";
  return r <= thr(tn, "1", mod) ? "success" : "fail";
}

/**
 * Ratowanie krytycznej porażki — co znaczy wynik rzutu Luck × 10:
 * "fail" (zwykła porażka bez skutków ubocznych), "success" (sukces), "retry" (karta przepada, można dać następną),
 * "stop" (koniec prób przy tym rzucie).
 */
export const saveOutcome = cls => ({ success: "fail", "crit-success": "success", fail: "retry", "crit-fail": "stop" })[cls] ?? "retry";

/** Najtrudniejszy krok MFD, który rzut zalicza (indeks w KEYS) albo -1. */
export function achievedIndex(total, tn, mod = 0) {
  let best = -1;
  KEYS.forEach((k, i) => { if (Number(total) <= thr(tn, k, mod)) best = i; });
  return best;
}

/**
 * Zmniejszenie ran po pierwszej (zdjętej od razu kartą): ile jeszcze ran zdjąć z rzutu najniższym atrybutem na MFD 1.
 * Każdy osiągnięty krok trudniej niż 1 — jedna rana; krytyczny sukces — wszystkie (Infinity); porażka — nic.
 */
export function reduceExtra({ total, cls, tn, mod = 0 }) {
  if (cls === "crit-success") return Infinity;
  if (cls === "crit-fail" || cls === "fail") return 0;
  return Math.max(0, achievedIndex(total, tn, mod) - KEYS.indexOf("1"));
}

/**
 * Które rany zdjąć: locs — rany z trafienia [{ loc, n }] (w kolejności z karty), taken — już zdjęte { loc: n },
 * count — ile teraz. Zdejmuje od ostatniej lokacji. Zwraca { loc: n } (tylko niezerowe).
 */
export function woundsToRemove(locs = [], taken = {}, count = 1) {
  const out = {};
  let left = count;
  for (const { loc, n } of [...locs].reverse()) {
    if (left <= 0) break;
    const free = Math.max(0, (Number(n) || 0) - (Number(taken[loc]) || 0));
    const k = Math.min(free, left);
    if (k > 0) { out[loc] = k; left -= k; }
  }
  return out;
}

/** Najniższy atrybut S.P.E.C.I.A.L. (klucz) z attributes { str: { total }, … }. */
export function lowestAttribute(attributes = {}) {
  let best = null;
  for (const k of ["str", "per", "end", "cha", "int", "agi", "luck"]) {
    const v = Number(attributes[k]?.total);
    if (!Number.isFinite(v)) continue;
    if (best === null || v < Number(attributes[best].total)) best = k;
  }
  return best ?? "end";
}
