/**
 * Drzwi i zamki — część bez Foundry (testowalna w Node).
 *   - lockOf: zamek drzwi z flagi ściany (MG ustawia go w oknie ściany) albo z materiału bariery Threshold,
 *   - segRectDistance / doorReach: czy postać sięga drzwi (obok albo telekinezą 5×INT ft),
 *   - pickResult: wynik wytrycha liczony na MFD zamka (nie na MFD wybranym w oknie rzutu),
 *   - thresholdOp: komenda terminala → operacja na barierze Threshold (drzwi, pole siłowe, zasłony…).
 */
export const THR_ID = "threshold";
export const THR_FLAG = "barrier";
/** API modułu Threshold (włączonego, z barierami) albo null. Tu, a nie w doors.mjs — cover.mjs nie może importować
 *  doors.mjs (pętla importów: katalog → magia → atak → osłona → drzwi → rzucanie → przekazywanie → katalog). */
export function thrApi() {
  const mod = globalThis.game?.modules?.get?.(THR_ID);
  return mod?.active && mod.api?.barriers ? mod.api : null;
}
export const LOCK_FLAG = "lock";
/** CONST.WALL_DOOR_STATES / CONST.WALL_DOOR_TYPES */
export const DS = Object.freeze({ CLOSED: 0, OPEN: 1, LOCKED: 2 });
export const DOOR = Object.freeze({ NONE: 0, DOOR: 1, SECRET: 2 });

// Kroki MFD jak MFD_STEPS w data.mjs (od najłatwiejszego); test pilnuje zgodności
export const MFD_KEYS = ["2", "1.5", "1", "3/4", "1/2", "1/4", "1/10"];
const MFD_F = { "2": 2, "1.5": 1.5, "1": 1, "3/4": 0.75, "1/2": 0.5, "1/4": 0.25, "1/10": 0.1 };
const idx = key => Math.max(0, MFD_KEYS.indexOf(key));
const shift = (i, steps) => Math.max(0, Math.min(MFD_KEYS.length - 1, i - (Number(steps) || 0)));
const thr = (baseTn, key, mod) => Math.floor(baseTn * MFD_F[key]) + (Number(mod) || 0);

/** Zamek bez ustawienia: według materiału bariery Threshold (drewno — zwykły, stal — bardzo trudny). */
export const MATERIAL_MFD = Object.freeze({
  cloth: "1.5", wood: "1", glass: "1", generic: "1", polymer: "3/4", stone: "3/4", iron: "3/4", steel: "1/2", "reinforced-glass": "1/2"
});
/** Wybór w oknie ściany: "" — samo (z materiału albo MFD 1), "none" — nie do otwarcia wytrychem (klucz, terminal). */
export const LOCK_CHOICES = ["", ...MFD_KEYS, "none"];

/**
 * Zamek drzwi. flag — flags["foe-rpg"].lock ściany, barrier — flags.threshold.barrier (albo null).
 * Zwraca { mfd (null — nie do otwarcia wytrychem), source: "set" | "material" | "default", broken (0–2), material }.
 */
export function lockOf(flag, barrier = null) {
  const set = typeof flag?.mfd === "string" ? flag.mfd : "";
  const broken = Math.max(0, Math.min(2, Math.trunc(Number(flag?.broken) || 0)));
  const material = barrier?.material?.id ?? null;
  if (set === "none") return { mfd: null, source: "set", broken, material };
  if (MFD_KEYS.includes(set)) return { mfd: set, source: "set", broken, material };
  if (material && MATERIAL_MFD[material]) return { mfd: MATERIAL_MFD[material], source: "material", broken, material };
  return { mfd: "1", source: "default", broken, material };
}

/** Czy zamek da się jeszcze otworzyć wytrychem: zepsuty raz — tylko z perkiem Infiltrator, dwa razy — wcale. */
export function canPick(lock, infiltrator = false) {
  if (!lock?.mfd) return { ok: false, why: "unpickable" };
  if (lock.broken >= 2 || (lock.broken === 1 && !infiltrator)) return { ok: false, why: "broken" };
  return { ok: true, why: null };
}

/**
 * Wynik wytrycha z karty testu: "open" | "fail" | "broken" (krytyczna porażka psuje zamek).
 * Liczy się MFD zamka przesunięte o kroki modyfikatorów — wybór łatwiejszego MFD w oknie rzutu nic nie da.
 */
export function pickResult({ total, cls, baseTn, mod = 0, steps = 0, lockMfd }) {
  if (cls === "crit-fail") return "broken";
  if (cls === "crit-success") return "open";
  const key = MFD_KEYS[shift(idx(lockMfd), steps)];
  return Number(total) <= thr(Number(baseTn) || 0, key, mod) ? "open" : "fail";
}

/** Odległość (px) od odcinka [x0, y0, x1, y1] do prostokąta { x, y, w, h }; 0 — dotyka albo przecina. */
export function segRectDistance(c, r) {
  const [x0, y0, x1, y1] = c.map(Number);
  const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inside(x0, y0) || inside(x1, y1)) return 0;
  const edges = [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x, r.y + r.h, r.x + r.w, r.y + r.h], [r.x, r.y, r.x, r.y + r.h]];
  if (edges.some(e => segmentsCross([x0, y0, x1, y1], e))) return 0;
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
  return Math.min(
    ...pts.map(([px, py]) => pointSegment(px, py, x0, y0, x1, y1)),
    ...edges.flatMap(([ax, ay, bx, by]) => [pointSegment(x0, y0, ax, ay, bx, by), pointSegment(x1, y1, ax, ay, bx, by)])
  );
}

function pointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + k * dx), py - (ay + k * dy));
}

function segmentsCross([ax, ay, bx, by], [cx, cy, dx, dy]) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy), o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
  if (o1 !== o2 && o3 !== o4) return true;
  const on = (px, py, qx, qy, rx, ry) => Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
  return (o1 === 0 && on(ax, ay, bx, by, cx, cy)) || (o2 === 0 && on(ax, ay, bx, by, dx, dy))
    || (o3 === 0 && on(cx, cy, dx, dy, ax, ay)) || (o4 === 0 && on(cx, cy, dx, dy, bx, by));
}

/**
 * Czy postać sięga drzwi. c — odcinek ściany (px), rect — token (px), grid — { size (px), distance (ft na pole) },
 * tkFt — zasięg telekinezy w stopach (0 — brak). Obok: token dotyka drzwi albo pola, przez które przechodzą.
 * Zwraca { ok, how: "adjacent" | "tk" | null, ft }.
 */
export function doorReach(c, rect, grid, tkFt = 0) {
  const size = Number(grid?.size) || 100, per = Number(grid?.distance) || 5;
  const px = segRectDistance(c, rect);
  const ft = Math.round((px / size) * per * 10) / 10;
  if (px <= size * 0.5 + 1) return { ok: true, how: "adjacent", ft };
  if (tkFt > 0 && ft <= tkFt) return { ok: true, how: "tk", ft };
  return { ok: false, how: null, ft };
}

/** Środek odcinka ściany jako prostokąt 0×0 (do kierunku z trade-data.direction). */
export const wallPoint = c => ({ x: (Number(c[0]) + Number(c[2])) / 2, y: (Number(c[1]) + Number(c[3])) / 2, w: 0, h: 0 });

/**
 * Komenda terminala na ścianie z barierą Threshold → { state, ajar? } albo null (nic do zrobienia).
 * current — obecny stan bariery, door — czy to drzwi (uchylenie i zamek mają tylko drzwi).
 * Bez drzwi „otwórz” wyłącza barierę (pole siłowe, odsłonięte zasłony), „zamknij” ją przywraca.
 */
export function thresholdOp(action, current, door) {
  const open = current === "open" || current === "ajar";
  switch (action) {
    case "open": return { state: "open" };
    case "close": return { state: "closed" };
    case "toggle": return { state: open ? "closed" : "open" };
    case "ajar": return door ? { state: "ajar", ajar: true } : { state: "open" };
    case "lock": return door ? { state: "locked" } : { state: "closed" };
    case "unlock": return door ? (current === "locked" ? { state: "closed" } : null) : null;
    default: return null;
  }
}

/** Komenda terminala na zwykłych drzwiach Foundry → nowy ds albo null. „Uchyl” bez Threshold = otwórz. */
export function nativeDoorState(action, ds) {
  switch (action) {
    case "open": case "ajar": return DS.OPEN;
    case "close": return DS.CLOSED;
    case "lock": return DS.LOCKED;
    case "unlock": return ds === DS.LOCKED ? DS.CLOSED : null;
    case "toggle": return ds === DS.OPEN ? DS.CLOSED : DS.OPEN;
    default: return null;
  }
}
