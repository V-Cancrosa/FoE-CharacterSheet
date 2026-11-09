/**
 * Osłona i balistyka z barier modułu Threshold (obliczenia: cover-data.mjs). Działa tylko z włączonym Threshold.
 *   - coverInfo: bariery na linii strzału od strzelca do każdego celu — zasłonięcie do okna ataku, DT osłony do okna
 *     obrażeń, bariera zatrzymująca pocisk (trafienie ląduje na niej),
 *   - hitBarrier / blastBarriers: obrażenia przeszkód (aktywny MG; gracz wysyła prośbę) — przez Threshold, minus DT
 *     materiału z tabeli FoE (hak threshold.preDamage); karta „PRZESZKODA” na czacie,
 *   - MG z zaznaczonymi ścianami (bez celów) nanosi kartą obrażeń obrażenia na te przeszkody — strzał w drzwi.
 */
import { t } from "./i18n.mjs";
import { thrApi } from "./doors-data.mjs";
import { lineOfFire, inBlast, barrierDt, barrierDamage } from "./cover-data.mjs";

const F = "foe-rpg";
const SOCKET = `system.${F}`;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

const label = (kind, id) => {
  const key = `THRESHOLD.${kind}.${id}`;
  const l = game.i18n?.localize?.(key);
  return l && l !== key ? l : id;
};
/** Nazwa bariery: profil Threshold (po polsku z jego tłumaczeń), inaczej materiał. */
export const barrierName = b => (b?.profile ? label("Profile", b.profile) : label("Material", b?.material?.id ?? "generic"));

/** Ściany sceny z włączoną barierą Threshold, z kanałami w bieżącym stanie. */
export function barrierWalls(scene) {
  const api = thrApi();
  if (!api || !scene) return [];
  const out = [];
  for (const w of scene.walls ?? []) {
    const b = w.flags?.threshold?.barrier;
    if (!b || b.enabled === false) continue;
    let channels = b.channels ?? {};
    try { channels = api.properties?.effectiveChannels?.(b) ?? channels; } catch { /* zostają bazowe */ }
    out.push({
      uuid: w.uuid, c: w.c ?? w._source?.c, channels, material: b.material ?? {}, type: b.type, profile: b.profile,
      name: barrierName(b), destructible: !!b.interaction?.destructible && Number(b.material?.durability) > 0, state: b.state
    });
  }
  return out;
}

const centerOf = td => {
  const size = td.parent?.grid?.size ?? 100;
  return { x: td.x + ((td.width ?? 1) * size) / 2, y: td.y + ((td.height ?? 1) * size) / 2 };
};

/**
 * Osłona dla ataku z tokenu strzelca do celów (TokenDocument). null — bez Threshold albo bez barier po drodze.
 * { targets: { uuid: { pct, dt, blocked, names } }, first } — first: wynik dla pierwszego celu (do okna ataku).
 */
export function coverInfo(shooter, targets = []) {
  const scene = shooter?.parent;
  const walls = barrierWalls(scene);
  if (!walls.length || !targets.length) return null;
  const from = centerOf(shooter);
  const map = {};
  let any = false;
  for (const td of targets) {
    if (td.parent !== scene) continue;
    const lof = lineOfFire(from, centerOf(td), walls);
    if (!lof.barriers.length) continue;
    any = true;
    map[td.uuid] = { pct: lof.pct, dt: lof.dt, blocked: lof.blocked, names: lof.barriers.map(b => b.name) , barriers: lof.barriers };
  }
  if (!any) return null;
  const first = map[targets[0]?.uuid] ?? null;
  return { targets: map, first };
}

// ---------- obrażenia przeszkód ----------
/** Obrażenia jednej przeszkody (aktywny MG). Zwraca linię do karty. */
async function damageWall(api, wall, amount, cause) {
  const b = wall.flags?.threshold?.barrier;
  if (!b) return null;
  const name = barrierName(b);
  const dt = barrierDt(b);
  const after = barrierDamage(amount, b);
  const max = Number(b.material?.durability) || 0;
  if (!b.interaction?.destructible || !max) return t("{name}: {a} − DT {dt} — holds (indestructible).", { name, a: amount, dt });
  const before = Number.isFinite(Number(b.integrity?.current)) ? Number(b.integrity.current) : max;
  let next = b;
  try {
    next = await api.barriers.damage(wall, amount, { source: { foe: true, cause } });
  } catch (err) {
    console.warn(`${F} | barrier damage`, err);
    return t("{name}: {a} − DT {dt} — holds.", { name, a: amount, dt });
  }
  const now = Number.isFinite(Number(next?.integrity?.current)) ? Number(next.integrity.current) : before;
  const broken = next?.state === "damaged" && b.state !== "damaged";
  return t("{name}: {a} − DT {dt} = {d} → durability {now}/{max}{x}", { name, a: amount, dt, d: after, now, max, x: broken ? ` — ${t("BROKEN")}` : "" });
}

async function postCard(title, lines) {
  if (!lines.length) return null;
  return ChatMessage.create({
    content: `<div class="foe-card wounds"><div class="fc-tag"><span>PIPBUCK // ${t("BARRIER")}</span><span>${esc(title)}</span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}</div>`
  });
}

/** Wykonanie u aktywnego MG: { walls: [uuid], amount, cause }. */
async function applyOp({ walls = [], amount = 0, cause = "" }) {
  const api = thrApi();
  if (!api) return null;
  const lines = [];
  for (const u of walls) {
    const wall = await fromUuid(u).catch(() => null);
    if (wall?.documentName !== "Wall") continue;
    const l = await damageWall(api, wall, Math.max(0, Math.floor(Number(amount) || 0)), cause);
    if (l) lines.push(l);
  }
  return postCard(cause, lines);
}

/** Trafienie w przeszkody: MG od razu, gracz — prośba do aktywnego MG. */
export async function hitBarriers(walls, amount, cause) {
  if (!walls?.length || !thrApi()) return null;
  const op = { kind: "barrier-hit", walls, amount, cause, user: game.user.id };
  if (game.user.isGM) return applyOp(op);
  if (!game.users.activeGM) return ui.notifications.warn(t("Barrier damage needs the GM logged in."));
  game.socket.emit(SOCKET, op);
  return null;
}

/** Przeszkody (zniszczalne) w promieniu wybuchu wokół punktu na scenie. */
export function blastWalls(scene, center, radius) {
  return inBlast(center, radius, barrierWalls(scene), { size: scene?.grid?.size, distance: scene?.grid?.distance }).map(w => w.uuid);
}

/** Zaznaczone ściany z barierą (MG, warstwa ścian) — cel „strzału w drzwi”. */
export const selectedBarriers = () => (game.user?.isGM ? (canvas?.walls?.controlled ?? []).map(w => w.document).filter(d => d?.flags?.threshold?.barrier) : []);

export function registerCoverHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, p => {
      if (p?.kind !== "barrier-hit" || !game.users.activeGM?.isSelf) return;
      applyOp(p).catch(err => console.error(`${F} | barrier hit`, err));
    });
  });
  // obrażenia od FoE: DT materiału z tabeli osłon FoE (Threshold sam niczego nie odejmuje)
  Hooks.on("threshold.preDamage", ctx => {
    if (!ctx?.source?.foe) return;
    ctx.amount = barrierDamage(ctx.amount, ctx.barrier);
  });
}
