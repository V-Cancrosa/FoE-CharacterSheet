/**
 * Broń i pancerz nazwany (podręcznik s. 204–206) — czyste zasady.
 *   - punkty: 1 + 1d4 (cecha „Named Weapon/Armor” — 5 bez rzutu); do 3 punktów więcej za pogorszenie parametrów,
 *   - wręcz: +1 kość (maks. +2), −5 AP SATS (min. 60% pierwotnego), −1 waga, +0,5 mnożnika krytyka,
 *     efekt specjalny za 2 pkt (gdy broń żadnego nie ma), większa kość za 2 pkt na stopień (nie przy d12),
 *   - dystans (bez obszarowych): to samo + magazynek o jeden strzał, zasięg +5 ft (raz),
 *   - obszarowa: +1 kość (bezpośrednio i w 5 ft; maks. +2), magazynek, zasięg +5 ft (raz), −5 AP, −1 waga, efekt specjalny,
 *   - pancerz: +1d6 DT, −1 waga, +1 tymczasowy atrybut (maks. dwa różne), +5 do rzutów umiejętności (raz na umiejętność),
 *     +2 do dwóch umiejętności, +5 maks. AP (do +25), efekt specjalny (wyposażenie zintegrowane).
 * Według podręcznika tak tworzy się je przy tworzeniu postaci; później MG traktuje to jako wskazówki.
 */
import { isClose, isAoe } from "./combat.mjs";
import { shiftDice } from "./ammo-data.mjs";
import { t, tmap } from "./i18n.mjs";

export const DIE_STEPS = [4, 6, 8, 10, 12];
/** Niedozwolone jako dodany efekt specjalny (s. 205). */
export const NAMED_SPECIALS = tmap({ fire: "Fire", electric: "Electricity", rads: "Radiation", shock: "Non-lethal (shock)", knockdown: "Knockdown", poison: "Poison" });

export const weaponClass = w => (isAoe(w) ? "aoe" : isClose(w) ? "close" : "ranged");
const hasSpecial = w => Object.entries(w.specials ?? {}).some(([k, v]) => !!v && !["concealable", "scoped", "silenced", "timed", "placed"].includes(k));
const dieOfFormula = f => Number(String(f).match(/d(\d+)/)?.[1]) || 0;

/** Opcje dla broni: { key, label, cost, max, drawback? }. */
export function weaponOptions(w) {
  const cls = weaponClass(w);
  const die = dieOfFormula(w.damage);
  const sats0 = Number(w.satsCost) || 0;
  const satsSteps = Math.max(0, Math.floor((sats0 - Math.ceil(sats0 * 0.6)) / 5));
  const o = [{ key: "dice", label: cls === "aoe" ? t("+1 damage die (direct and within 5 ft)") : t("+1 damage die"), cost: 1, max: 2 }];
  if (cls !== "close" && w.ammo?.max > 0) o.push({ key: "mag", label: t("Magazine +{n} (one shot)", { n: Math.max(1, w.shots || 1) }), cost: 1, max: 10 });
  if (cls !== "close" && (w.rangeInc || 0) > 0) o.push({ key: "range", label: t("Range increment +5 ft"), cost: 1, max: 1 });
  if (satsSteps) o.push({ key: "sats", label: "SATS −5 AP", cost: 1, max: satsSteps });
  if ((Number(w.weight) || 0) >= 1) o.push({ key: "weight", label: t("Weight −1"), cost: 1, max: Math.floor(Number(w.weight) || 0) });
  if (cls !== "aoe") o.push({ key: "crit", label: t("Critical multiplier +0.5"), cost: 1, max: 4 });
  if (cls !== "aoe" && die && die < 12) o.push({ key: "die", label: t("Bigger damage die (one step)"), cost: 2, max: DIE_STEPS.length - 1 - DIE_STEPS.indexOf(die) });
  if (!hasSpecial(w)) o.push({ key: "special", label: t("Special effect"), cost: 2, max: 1, special: true });
  // pogorszenia: do 3 punktów więcej (s. 205)
  o.push({ key: "-dice", label: t("−1 damage die"), cost: -1, max: 1, drawback: true });
  if (w.ammo?.max > (w.shots || 1)) o.push({ key: "-mag", label: t("Magazine −{n}", { n: Math.max(1, w.shots || 1) }), cost: -1, max: 3, drawback: true });
  o.push({ key: "-sats", label: "SATS +5 AP", cost: -1, max: 3, drawback: true });
  o.push({ key: "-weight", label: t("Weight +1"), cost: -1, max: 3, drawback: true });
  return o;
}

export function armorOptions(a) {
  return [
    { key: "dt", label: "DT +1d6", cost: 1, max: 5 },
    ...((Number(a.weight) || 0) >= 1 ? [{ key: "weight", label: t("Weight −1"), cost: 1, max: Math.floor(Number(a.weight) || 0) }] : []),
    { key: "attr", label: t("+1 temporary to an attribute (max. two different)"), cost: 1, max: 2, pick: "attr" },
    { key: "skill5", label: t("+5 to skill rolls"), cost: 1, max: 3, pick: "skill" },
    { key: "skill2", label: t("+2 to rolls of two skills"), cost: 1, max: 2, pick: "skill2" },
    { key: "ap", label: t("+5 max. AP (up to +25)"), cost: 1, max: 5 },
    { key: "special", label: t("Integrated equipment (night vision, radio, filter, SATS interface…)"), cost: 1, max: 2, text: true },
    { key: "-weight", label: t("Weight +1"), cost: -1, max: 3, drawback: true },
    { key: "-dt", label: "DT −1d6", cost: -1, max: 3, drawback: true }
  ];
}

/** Bilans punktów: { spent, bonus (z pogorszeń, maks. 3), left, errors }. */
export function pointsBalance(opts, counts, points) {
  let spent = 0, bonus = 0;
  const errors = [];
  for (const o of opts) {
    const n = Math.max(0, Math.floor(Number(counts[o.key]) || 0));
    if (n > o.max) errors.push(t("{label}: at most {n}", { label: o.label, n: o.max }));
    if (o.drawback) bonus += n * -o.cost; else spent += n * o.cost;
  }
  if (bonus > 3) errors.push(t("Drawbacks give at most 3 points"));
  const left = points + Math.min(3, bonus) - spent;
  if (left < 0) errors.push(t("{n} points too many spent", { n: -left }));
  return { spent, bonus, left, errors };
}

const fmtCrit = v => `x${String(Math.round(v * 10) / 10).replace(/\.0$/, "")}`;
const critNum = c => Number(String(c ?? "x1").match(/[\d.]+/)?.[0]) || 1;
function stepDie(formula, steps) {
  if (!steps) return formula;
  return String(formula).replace(/(\d*)d(\d+)/, (m, c, d) => {
    const i = DIE_STEPS.indexOf(Number(d));
    return i < 0 ? m : `${c}d${DIE_STEPS[Math.min(DIE_STEPS.length - 1, i + steps)]}`;
  });
}

/** Zmiany systemu broni po wydaniu punktów (special: { key, poison }). */
export function applyWeaponNaming(w, counts, { special = null } = {}) {
  const n = k => Math.max(0, Math.floor(Number(counts[k]) || 0));
  const shots = Math.max(1, w.shots || 1);
  const sats0 = Number(w.satsCost) || 0;
  const dice = n("dice") - n("-dice");
  const upd = {
    damage: stepDie(shiftDice(w.damage, dice), n("die")),
    satsCost: Math.max(Math.ceil(sats0 * 0.6), sats0 - 5 * n("sats")) + 5 * n("-sats"),
    weight: Math.max(0, (Number(w.weight) || 0) - n("weight") + n("-weight")),
    crit: fmtCrit(critNum(w.crit) + 0.5 * n("crit"))
  };
  if (w.ammo?.max > 0) {
    const mag = Math.max(shots, w.ammo.max + shots * (n("mag") - n("-mag")));
    upd["ammo.max"] = mag;
    upd["ammo.value"] = Math.min(mag, w.ammo.value);
  }
  if (n("range")) { upd.rangeInc = (w.rangeInc || 0) + 5; upd.range = `${(w.rangeInc || 0) + 5} ft`; }
  if (w.aoe?.enabled && dice && w.aoe.splash) upd["aoe.splash"] = shiftDice(w.aoe.splash, dice);
  if (special?.key && n("special")) {
    if (special.key === "fire") upd["specials.fire"] = "hit";
    else if (special.key === "poison") upd["specials.poison"] = special.poison || "radscorpion";
    else upd[`specials.${special.key}`] = true;
  }
  return upd;
}

/** Zmiany pancerza: dtRolls — wyniki k6 (dodatnie i ujemne), picks — { attr: [..], skill5: [..], skill2: [[a,b],..] }, specials — teksty. */
export function applyArmorNaming(a, counts, { dtRolls = [], picks = {}, specials = [] } = {}) {
  const n = k => Math.max(0, Math.floor(Number(counts[k]) || 0));
  const dt = Math.max(0, (Number(a.dt) || 0) + dtRolls.reduce((sum, v) => sum + v, 0));
  const fx = [...(a.effects ?? [])];
  for (const k of (picks.attr ?? []).slice(0, Math.min(2, n("attr")))) fx.push({ type: "tempAttr", target: k, value: 1, when: "" });
  for (const k of (picks.skill5 ?? []).slice(0, n("skill5"))) fx.push({ type: "skillRoll", target: k, value: 5, when: "" });
  for (const pair of (picks.skill2 ?? []).slice(0, n("skill2"))) fx.push({ type: "skillRoll", target: pair.join(","), value: 2, when: "" });
  if (n("ap")) fx.push({ type: "sats", target: "all", value: Math.min(25, 5 * n("ap")), when: "" });
  return {
    dt, weight: Math.max(0, (Number(a.weight) || 0) - n("weight") + n("-weight")), effects: fx,
    specialNote: specials.filter(Boolean).slice(0, n("special"))
  };
}
