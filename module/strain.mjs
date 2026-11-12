/**
 * Pula strain jednorożców i alikornów (s. 242): zaklęcia z niej pobierają, odnawia się sama z upływem czasu świata.
 *   - Pełna na start: postać, której pula nigdy nie była ustawiona (nowa, z kreatora, sprzed tej wersji z pulą 0),
 *     dostaje pełną pulę raz (flaga foe-rpg.strainInit); częściowo wydanej puli nie rusza.
 *   - Odnawianie: 1 punkt na godzinę; Channeler „co 45 min” / „co 30 min” — szybciej. Ułamki czasu się sumują
 *     (flaga foe-rpg.strainCarry). Działa też w przeskoku czasu.
 */
const F = "foe-rpg";
const H = 3600;

/** Minuty na punkt: 60, a z Channelerem (wariant regeneracji) 45 albo 30. */
export function regenMinutes(actor) {
  let best = 60;
  for (const i of actor?.items ?? []) {
    if (i.type !== "feature" || i.system?.active === false) continue;
    if (!/channeler/i.test(i.name) && !String(i.flags?.[F]?.source ?? "").startsWith("trait:channeler")) continue;
    const text = `${i.name} ${i.system?.description ?? ""}`;
    if (/\b30\s*min/i.test(text)) best = Math.min(best, 30);
    else if (/\b45\s*min/i.test(text)) best = Math.min(best, 45);
  }
  return best;
}

/** Ile punktów odnawia się w dt sekund (z resztą z poprzednio): { points, carry }. Pełna pula — reszta przepada. */
export function regen({ value, max, carry = 0, dt, minutes = 60 }) {
  if (!(max > 0) || value >= max) return { points: 0, carry: 0 };
  const step = minutes * 60;
  const total = Math.max(0, Number(carry) || 0) + Math.max(0, Number(dt) || 0);
  const points = Math.min(max - value, Math.floor(total / step));
  const full = value + points >= max;
  return { points, carry: full ? 0 : total - points * step };
}

const usesStrain = actor => ["character", "npc"].includes(actor?.type) && actor.system?.caster && (Number(actor.system.strainMax) || 0) > 0;

/** Pełna pula, jeśli nigdy nie była ustawiona (0); pula już częściowo wydana zostaje, jak jest. */
export async function ensureStrain(actor) {
  if (!usesStrain(actor) || actor.flags?.[F]?.strainInit) return false;
  const empty = !(Number(actor.system.resources?.strain?.value) > 0);
  await actor.update({ ...(empty ? { "system.resources.strain.value": actor.system.strainMax } : {}), [`flags.${F}.strainInit`]: true });
  return empty;
}

/** Upływ czasu (aktywny MG). */
export async function strainTick(actor, dt) {
  if (!usesStrain(actor) || !(dt > 0)) return;
  const value = Number(actor.system.resources?.strain?.value) || 0, max = Number(actor.system.strainMax) || 0;
  const r = regen({ value, max, carry: actor.flags?.[F]?.strainCarry, dt, minutes: regenMinutes(actor) });
  const upd = {};
  if (r.points) upd["system.resources.strain.value"] = value + r.points;
  if ((Number(actor.flags?.[F]?.strainCarry) || 0) !== r.carry) upd[`flags.${F}.strainCarry`] = r.carry;
  if (Object.keys(upd).length) await actor.update(upd);
}

export function registerStrain() {
  const gm = () => game.users?.activeGM?.isSelf;
  Hooks.on("createActor", actor => { if (gm()) ensureStrain(actor).catch(() => {}); });
  // kreator i zmiany atrybutów: pula pojawia się dopiero, gdy postać zostaje jednorożcem z END i INT
  Hooks.on("updateActor", actor => {
    if (!gm()) return;
    // kreator: pełna pula według nowych END i INT
    if (actor.flags?.[F]?.strainFill) {
      const upd = { [`flags.${F}.strainFill`]: false, [`flags.${F}.strainInit`]: true };
      if (usesStrain(actor)) upd["system.resources.strain.value"] = actor.system.strainMax;
      actor.update(upd).catch(() => {});
    } else if (!actor.flags?.[F]?.strainInit) ensureStrain(actor).catch(() => {});
  });
  Hooks.once("ready", async () => {
    if (!gm()) return;
    for (const a of game.actors ?? []) { try { await ensureStrain(a); } catch (err) { console.warn(`${F} | strain`, err); } }
  });
}
