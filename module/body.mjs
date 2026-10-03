/**
 * Stan organizmu jako efekty (bez zależności od Foundry — liczone przy każdym przygotowaniu danych postaci):
 *   - aktywne chemikalia i alkohole (flaga foe-rpg.chems: { name, until, fx }),
 *   - odstawienie przy uzależnieniu (flaga foe-rpg.addictions), gdy nie działa nic z tej grupy ani Fixer,
 *   - choroba popromienna według pochłoniętych radów (kary do END, AGI, STR — progi jak na karcie postaci).
 * Czas: game.time.worldTime (w walce rośnie z każdą rundą).
 */
const F = "foe-rpg";

/** Progi choroby popromiennej: kary tymczasowe do atrybutów (s. 16, 483). */
export const RAD_LEVELS = [
  { min: 1000, label: "śmiertelna dawka", fx: { end: -3, agi: -2, str: -2 } },
  { min: 800, label: "śmiertelna choroba popromienna", fx: { end: -3, agi: -2, str: -2 } },
  { min: 600, label: "krytyczna choroba popromienna", fx: { end: -3, agi: -2, str: -1 } },
  { min: 400, label: "zaawansowana choroba popromienna", fx: { end: -2, agi: -1 } },
  { min: 200, label: "lekka choroba popromienna", fx: { end: -1 } }
];

export const worldTime = () => globalThis.game?.time?.worldTime ?? 0;

export function radLevel(rads) {
  return RAD_LEVELS.find(l => rads >= l.min) ?? null;
}

const flagsOf = actor => actor?.flags?.[F] ?? {};
export const activeChems = (actor, now = worldTime()) => (flagsOf(actor).chems ?? []).filter(c => !c.until || c.until > now);
export const addictionsOf = actor => flagsOf(actor).addictions ?? [];

/** Czy odstawienie danej grupy właśnie działa (nic z grupy nie działa i nie ma Fixera). */
export function withdrawalActive(actor, a, now = worldTime()) {
  const act = activeChems(actor, now);
  if (act.some(c => c.fixer)) return false;
  return !act.some(c => (c.groups ?? []).includes(a.group));
}

function hasFeature(actor, re) {
  return (actor?.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));
}

/** Wszystkie efekty organizmu jako lista { type, target, value, when, source, id }. */
export function bodyEffects(actor) {
  if (!actor?.system) return [];
  const now = worldTime();
  const out = [];
  for (const [i, c] of activeChems(actor, now).entries()) {
    for (const [j, e] of (c.fx ?? []).entries()) out.push({ ...e, source: c.name, id: `chem.${i}.${j}` });
  }
  for (const [i, a] of addictionsOf(actor).entries()) {
    if (!withdrawalActive(actor, a, now)) continue;
    const extra = a.level || 0;   // Mint-als: kary rosną o 1 po każdym użyciu w uzależnieniu
    for (const [j, e] of (a.wfx ?? []).entries()) {
      const v = e.type === "tempAttr" && extra ? e.value - extra : e.value;
      out.push({ ...e, value: v, source: `Odstawienie: ${a.group}`, id: `wd.${i}.${j}` });
    }
  }
  const rads = actor.system.resources?.rads?.value ?? 0;
  const lvl = radLevel(rads);
  const ghoul = /ghul|ghoul/i.test(actor.system.race ?? "");
  let radsOn = true;
  try { radsOn = globalThis.game?.settings?.get?.(F, "radiationPenalties") !== false; } catch { radsOn = true; }
  if (lvl && !ghoul && radsOn && !(lvl.min < 400 && hasFeature(actor, /rad tolerance/i))) {
    for (const [k, v] of Object.entries(lvl.fx)) out.push({ type: "tempAttr", target: k, value: v, when: "", source: `${lvl.label} (${rads} radów)`, id: `rad.${k}` });
  }
  return out;
}
