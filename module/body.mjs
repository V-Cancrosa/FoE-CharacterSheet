/**
 * Stan organizmu jako efekty (bez zależności od Foundry — liczone przy każdym przygotowaniu danych postaci):
 *   - aktywne chemikalia i alkohole (flaga foe-rpg.chems: { name, until, fx }),
 *   - odstawienie przy uzależnieniu (flaga foe-rpg.addictions), gdy nie działa nic z tej grupy ani Fixer,
 *   - choroba popromienna według pochłoniętych radów (kary do END, AGI, STR — progi jak na karcie postaci),
 *     przy chorobie popromiennej z silnego napromieniowania — jak przy 800 radach (s. 483),
 *   - odwodnienie (tabela XXXIII, flaga foe-rpg.thirst), 8 h bez kar głodu po jedzeniu niesycącym i +15 do rzutów END
 *     po czterech posiłkach (s. 477; flaga foe-rpg.survival).
 * Czas: game.time.worldTime (w walce rośnie z każdą rundą).
 */
import { t, tfields } from "./i18n.mjs";
import { thirstLevel, thirstEffects, thirstSats, dayOf } from "./survival-data.mjs";
const F = "foe-rpg";
const setting = (key, fallback = true) => { try { return globalThis.game?.settings?.get?.(F, key) ?? fallback; } catch { return fallback; } };

/** Progi choroby popromiennej: kary tymczasowe do atrybutów (s. 16, 483). */
export const RAD_LEVELS = tfields([
  { min: 1000, label: "fatal dose", fx: { end: -3, agi: -2, str: -2 } },
  { min: 800, label: "fatal radiation sickness", fx: { end: -3, agi: -2, str: -2 } },
  { min: 600, label: "critical radiation sickness", fx: { end: -3, agi: -2, str: -1 } },
  { min: 400, label: "advanced radiation sickness", fx: { end: -2, agi: -1 } },
  { min: 200, label: "minor radiation sickness", fx: { end: -1 } }
], ["label"]);

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
      out.push({ ...e, value: v, source: t("Withdrawal: {w}", { w: a.group }), id: `wd.${i}.${j}` });
    }
  }
  const rads = actor.system.resources?.rads?.value ?? 0;
  let lvl = radLevel(rads);
  const ghoul = isGhoul(actor);
  // choroba popromienna po silnym napromieniowaniu: kary jak przy 800 radach, dopóki rady nie spadną
  const poisoned = !!flagsOf(actor).radlog?.poison;
  if (poisoned && (!lvl || lvl.min < 800)) lvl = RAD_LEVELS.find(l => l.min === 800);
  if (lvl && !ghoul && setting("radiationPenalties") !== false && !(lvl.min < 400 && !poisoned && hasFeature(actor, /rad tolerance/i))) {
    const src = poisoned && lvl.min === 800 && rads < 800 ? t("Radiation poisoning (as at 800 rads)") : t("{label} ({n} rads)", { label: lvl.label, n: rads });
    for (const [k, v] of Object.entries(lvl.fx)) out.push({ type: "tempAttr", target: k, value: v, when: "", source: src, id: `rad.${k}` });
  }
  out.push(...survivalEffects(actor, now));
  return out;
}

/** Ghul: rasa albo cecha „Ghoul” / „Canterlot Ghoul” (nie np. perk „Ghoulfriend”). */
export const isGhoul = actor => /ghul|ghoul/i.test(actor?.system?.race ?? "") || hasFeature(actor, /^((canterlot )?ghoul|ghul( z canterlotu)?)$/i);
export const isAlicorn = actor => /alicorn|alikorn/i.test(actor?.system?.race ?? "");

/** Etap odwodnienia, którego kary działają (0 — brak; ghule nie piją). */
export function dehydrationLevel(actor, now = worldTime()) {
  if (actor?.type !== "character" || isGhoul(actor) || setting("survivalDehydration") === false) return 0;
  return thirstLevel(flagsOf(actor).thirst, now);
}

/** Odwodnienie, przerwa w karach głodu, dobrze najedzony. */
export function survivalEffects(actor, now = worldTime()) {
  const out = [];
  const lvl = dehydrationLevel(actor, now);
  if (lvl) {
    const src = t("Dehydration, stage {n}", { n: lvl });
    thirstEffects(lvl, { optional: setting("dehydrationOptional") !== false }).forEach((e, i) => out.push({ ...e, when: "", source: src, id: `thirst.${i}` }));
  }
  const st = flagsOf(actor).survival;
  if (st?.ignoreUntil > now) {
    const feat = (actor.items ?? []).find(i => i.type === "feature" && i.flags?.[F]?.starvation && i.system?.active !== false);
    for (const [i, e] of (feat?.system?.effects ?? []).entries()) {
      if (e.type === "tempAttr" && Number(e.value)) out.push({ type: "tempAttr", target: e.target, value: -Number(e.value), when: "", source: t("Ignoring starvation (non-nourishing food)"), id: `fed.${i}` });
    }
  }
  if (st?.wellFed != null && st.wellFed === dayOf(now)) out.push({ type: "attrRoll", target: "end", value: 15, when: "", source: t("Well fed (4 meals today)"), id: "wellfed" });
  return out;
}
export { thirstSats };
