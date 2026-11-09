/**
 * Osłona i balistyka z barier Threshold — część bez Foundry (testowalna w Node). Zasady FoE (s. 452–455):
 * osłona daje procent zasłonięcia (kara do rzutu strzelającego; SATS ją znosi) i DT, gdy pocisk przechodzi przez
 * cienką osłonę. Threshold ma na każdej barierze kanały:
 *   - cover: full / partial / none → zasłonięcie (domyślnie pełna 75%, częściowa 25%; gracz zmienia w oknie ataku),
 *   - ballistic: blocked — pocisk się zatrzymuje (trafienie ląduje na barierze), conditional — przechodzi, ale traci DT
 *     osłony (tabela FoE według materiału; kraty, furtki i strzelnice — bez DT, pocisk leci przez szczelinę),
 *     passable — nic nie zmienia.
 */
export const COVER_PCT = Object.freeze({ full: 75, partial: 25, none: 0 });
export const PCT_CHOICES = [0, 25, 50, 75, 100];
/** DT osłony na jednostkę grubości z tabeli podręcznika (s. 454–455) według materiału Threshold. */
export const MATERIAL_DT = Object.freeze({
  wood: 6, glass: 2, "reinforced-glass": 20, iron: 20, steel: 30, stone: 50, polymer: 10, cloth: 0, generic: 0, energy: 0
});

/** Przecięcie odcinków p→q i a→b: { x, y, t } (t — część drogi p→q) albo null. */
export function intersect(p, q, a, b) {
  const rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p.x + t * rx, y: p.y + t * ry, t };
}

/** Bez DT: przez kraty, furtki i strzelnice pocisk leci szczeliną. */
const gappy = b => b.type === "bars" || b.type === "opening" || /^(gate|bars|viewing-slot)$/.test(b.profile ?? "");

/** DT osłony bariery (tylko gdy pocisk przez nią przechodzi — ballistic „conditional”). */
export function barrierDt(b) {
  if (gappy(b)) return 0;
  const id = b.material?.id;
  if (id && Object.hasOwn(MATERIAL_DT, id)) return MATERIAL_DT[id];
  return Math.max(0, Number(b.material?.hardness) || 0);
}

/**
 * Bariery na linii strzału from→to. walls — [{ uuid, c: [x0, y0, x1, y1], channels: { cover, ballistic }, material, type,
 * profile, name, destructible }]. Zwraca { barriers: [{ …, at, dt, pct }], pct (największe zasłonięcie), dt (suma DT
 * barier przed zatrzymaniem), blocked (pierwsza bariera, która zatrzymuje pocisk, z punktem trafienia) }.
 * Przecięcia na samych końcach (środki tokenów) się nie liczą.
 */
export function lineOfFire(from, to, walls = []) {
  const hits = [];
  for (const w of walls) {
    const [x0, y0, x1, y1] = (w.c ?? []).map(Number);
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    const at = intersect(from, to, { x: x0, y: y0 }, { x: x1, y: y1 });
    if (!at || at.t < 1e-3 || at.t > 1 - 1e-3) continue;
    hits.push({ ...w, at: { x: Math.round(at.x), y: Math.round(at.y) }, t: at.t });
  }
  hits.sort((a, b) => a.t - b.t);
  const out = { barriers: [], pct: 0, dt: 0, blocked: null };
  for (const h of hits) {
    const cover = h.channels?.cover ?? "none", ballistic = h.channels?.ballistic ?? "passable";
    const pct = COVER_PCT[cover] ?? 0;
    const dt = ballistic === "conditional" ? barrierDt(h) : 0;
    out.barriers.push({ uuid: h.uuid, name: h.name, cover, ballistic, pct, dt, at: h.at, destructible: !!h.destructible });
    out.pct = Math.max(out.pct, pct);
    if (ballistic === "blocked") {
      out.blocked = { wall: h.uuid, name: h.name, at: h.at, destructible: !!h.destructible };
      break;   // dalej pocisk nie leci
    }
    out.dt += dt;
  }
  return out;
}

/** Najbliższy krok z PCT_CHOICES (domyślny wybór w oknie ataku). */
export const nearestPct = p => PCT_CHOICES.reduce((best, c) => (Math.abs(c - p) < Math.abs(best - p) ? c : best), 0);

/** Odległość punktu od odcinka (px). */
export function pointSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}

/** Bariery w promieniu wybuchu: center (px), radiusFt, grid { size, distance }. Tylko zniszczalne. */
export function inBlast(center, radiusFt, walls = [], grid = {}) {
  const size = Number(grid.size) || 100, per = Number(grid.distance) || 5;
  const r = (Math.max(0, Number(radiusFt) || 0) / per) * size;
  if (!r) return [];
  return walls.filter(w => w.destructible && pointSegment(center, { x: w.c[0], y: w.c[1] }, { x: w.c[2], y: w.c[3] }) <= r);
}

/** Promień wybuchu z pola broni („10’”, „15 ft”) w stopach. */
export const radiusFt = s => { const m = String(s ?? "").match(/(\d+(?:[.,]\d+)?)/); return m ? Number(m[1].replace(",", ".")) : 0; };

/** Obrażenia przeszkody: przed DT, minus DT materiału (jak w FoE). */
export const barrierDamage = (amount, b) => Math.max(0, Math.floor(Number(amount) || 0) - barrierDt(b));
