/**
 * Efekty cech, wad i perków.
 *
 * Każda cecha („feature”) i każdy pancerz ma listę efektów { type, target, value, when }
 * (pancerz działa tylko założony, cecha tylko aktywna):
 *   - when puste  → efekt stały, doliczany automatycznie na karcie i w rzutach,
 *   - when z tekstem → efekt sytuacyjny; w oknie rzutu pojawia się pole do zaznaczenia z tym opisem.
 * target: „all”, klucz atrybutu/umiejętności/lokacji albo lista po przecinku;
 *         dla ataków także „ranged” (broń dystansowa), „melee” (wręcz) i „attack” (każdy atak).
 */

import { weatherSituational } from "./weather.mjs";
import { bodyEffects } from "./body.mjs";
import { powerArmorFilter, hasPowerArmorTraining, untrainedAgiPenalty } from "./saddle.mjs";
import { cyberFilter } from "./cyber-data.mjs";
import { changelingEffects } from "./shadow-data.mjs";
import { t, tn, N_, tfields } from "./i18n.mjs";

export const FX_TYPES = tfields({
  attr:        { label: N_("Attribute (permanent)"), targets: "attr" },
  skillRank:   { label: N_("Skill rank"), targets: "skill" },
  skillRoll:   { label: N_("Skill rolls"), targets: "skill" },
  attrRoll:    { label: N_("Attribute-only rolls"), targets: "attr" },
  basedRoll:   { label: N_("Rolls of the attribute and its skills"), targets: "attr" },
  skillsOf:    { label: N_("Skill rolls of the attribute"), targets: "attr" },
  tempAttr:    { label: N_("Temporary attribute change"), targets: "attr" },
  accuracy:    { label: N_("Attack accuracy"), targets: "attack" },
  mfdStep:     { label: N_("MFD steps (+ easier, − harder)"), targets: "any" },
  basedStep:   { label: N_("MFD steps of the attribute and its skills"), targets: "attr" },
  damage:      { label: N_("Weapon damage"), targets: "attack" },
  critSuccess: { label: N_("Critical success range"), targets: "any" },
  critFail:    { label: N_("Critical failure range"), targets: "any" },
  initiative:  { label: N_("Initiative (+ faster)"), targets: "none" },
  luckCards:   { label: N_("Luck cards per session"), targets: "none" },
  wound:       { label: N_("Damage per wound"), targets: "none" },
  carry:       { label: N_("Carry weight"), targets: "none" },
  speed:       { label: N_("Movement (ft per action)"), targets: "none" },
  speedPct:    { label: N_("Movement (%)"), targets: "move" },
  sats:        { label: N_("Max SATS"), targets: "none" },
  dt:          { label: "DT", targets: "location" },
  radResist:   { label: N_("Radiation resistance (%)"), targets: "none" },
  strain:      { label: N_("Max strain"), targets: "none" },
  dodge:       { label: N_("Dodge"), targets: "none" },
  skillPoints: { label: N_("Skill points per level"), targets: "none" },
  satsRegen:   { label: N_("AP regained per round"), targets: "none" },
  xpPct:       { label: N_("Experience (%)"), targets: "none" },
  fireDt:      { label: N_("DT against fire"), targets: "location" },
  limbWounds:  { label: N_("Limb wounds to cripple and maim (+)"), targets: "location" },
  limbMult:    { label: N_("Limb wound multiplier (×)"), targets: "none" }
}, ["label"]);

// Efekty liczone tylko w kreatorze (jednorazowo przy tworzeniu postaci)
export const CREATION_ONLY = new Set(["tags", "creationPoints", "caps", "karma"]);

const RANGED = ["smallGuns", "energy", "bigGuns", "explosives"];
const MELEE = ["melee", "unarmed"];

export const targets = t => String(t ?? "all").split(",").map(s => s.trim()).filter(Boolean);
export const hits = (target, key) => { const l = targets(target); return l.includes("all") || l.includes(key); };
export const hitsAttack = (target, skill) => {
  const l = targets(target);
  return l.includes("all") || l.includes("attack") || l.includes(skill)
    || (l.includes("ranged") && RANGED.includes(skill)) || (l.includes("melee") && MELEE.includes(skill));
};
const n = v => Number(v) || 0;

/**
 * Wszystkie efekty aktora (z nazwą źródła): aktywne cechy, założone pancerze
 * i — gdy state — efekty stanu postaci liczone na karcie (okaleczenia, obciążenie; data.mjs → stateFx).
 */
export function actorEffects(actor, { state = true } = {}) {
  const out = [];
  const trained = hasPowerArmorTraining(actor);
  // cybernetyka: bez zasilania nie działa; Nemean i Basilisk się nie sumują (cyber-data.mjs)
  const cyberOk = cyberFilter(actor);
  for (const item of actor?.items ?? []) {
    const on = item.type === "feature" ? item.system?.active !== false
      : item.type === "armor" ? !!item.system?.equipped : false;
    if (!on) continue;
    (item.system?.effects ?? []).forEach((e, i) => {
      // pancerz wspomagany: bez szkolenia bez premii, ze szkoleniem bez kar AGI (Power Armor Training)
      if (e?.type && !CREATION_ONLY.has(e.type) && powerArmorFilter(item, e, trained) && cyberOk(item, e)) out.push({ ...e, source: item.name, id: `${item.id}.${i}` });
    });
    if (item.type === "armor" && item.system?.powered && !trained) {
      const pen = untrainedAgiPenalty();
      if (pen) out.push({ type: "tempAttr", target: "agi", value: -pen, when: "", source: t("{name} (no training)", { name: item.name }), id: `${item.id}.untrained` });
    }
  }
  // chemikalia, odstawienie, choroba popromienna (body.mjs) — działają jak cechy
  for (const e of bodyEffects(actor)) if (!CREATION_ONLY.has(e.type)) out.push(e);
  for (const e of changelingEffects(actor)) out.push(e);
  if (state) for (const e of actor?.system?.stateFx ?? []) out.push(e);
  return out;
}

/** Suma stałych efektów danego typu spełniających warunek. */
export function sumFx(fx, type, pred = () => true) {
  return fx.filter(e => e.type === type && !e.when && pred(e)).reduce((t, e) => t + n(e.value), 0);
}

/** Lista „źródło ±wartość” dla stałych efektów (do podpowiedzi na karcie). */
export function sourcesFx(fx, type, pred = () => true) {
  return fx.filter(e => e.type === type && !e.when && pred(e) && n(e.value)).map(e => `${e.source} ${signed(n(e.value))}`);
}

export const signed = v => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

/**
 * Wpływ jednego efektu na rzut.
 * ctx: { kind: "attr" | "skill" | "attack", attr?, skill?, skillAttr? }
 * Zwraca { mod, steps, critSuccess, critFail } (zera, gdy efekt nie dotyczy rzutu).
 */
export function effectOnRoll(e, ctx) {
  const v = n(e.value);
  const out = { mod: 0, steps: 0, critSuccess: 0, critFail: 0 };
  const isAttr = ctx.kind === "attr";
  const sk = ctx.skill;
  switch (e.type) {
    case "skillRoll": if (sk && hits(e.target, sk)) out.mod = v; break;
    case "attrRoll": if (isAttr && hits(e.target, ctx.attr)) out.mod = v; break;
    case "basedRoll":
      if ((isAttr && hits(e.target, ctx.attr)) || (sk && hits(e.target, ctx.skillAttr))) out.mod = v; break;
    case "skillsOf": if (sk && hits(e.target, ctx.skillAttr)) out.mod = v; break;
    case "tempAttr":
      // stałe zmiany są już w wartości atrybutu na karcie (próg ×10, umiejętności ±5 za punkt)
      if (!e.when) break;
      if (isAttr && hits(e.target, ctx.attr)) out.mod = 10 * v;
      else if (sk && hits(e.target, ctx.skillAttr)) out.mod = 5 * v;
      break;
    case "accuracy": if (ctx.kind === "attack" && hitsAttack(e.target, sk)) out.mod = v; break;
    case "basedStep":
      if ((isAttr && hits(e.target, ctx.attr)) || (sk && hits(e.target, ctx.skillAttr))) out.steps = v;
      break;
    case "mfdStep": {
      // atrybut jako cel = tylko rzut samego atrybutu (dla umiejętności: basedStep)
      const l = targets(e.target);
      const ok = ctx.kind === "attack" ? hitsAttack(e.target, sk)
        : sk ? (l.includes("all") || l.includes(sk))
        : (l.includes("all") || l.includes(ctx.attr));
      if (ok) out.steps = v;
      break;
    }
    case "critSuccess":
    case "critFail": {
      const l = targets(e.target);
      const ok = ctx.kind === "attack" ? hitsAttack(e.target, sk)
        : sk ? (l.includes("all") || l.includes(sk) || l.includes(ctx.skillAttr))
        : (l.includes("all") || l.includes(ctx.attr));
      if (ok) out[e.type] = v;
      break;
    }
  }
  return out;
}

/**
 * Modyfikatory rzutu z cech aktora: stałe (już wliczone) i sytuacyjne (do zaznaczenia w oknie rzutu).
 * manualMod / manualLabel — modyfikator wpisany ręcznie na karcie.
 */
export function rollContext(actor, ctx, { manualMod = 0, manualLabel = t("Sheet modifier") } = {}) {
  const fx = actorEffects(actor);
  const mods = [], steps = [];
  const crit = { success: 0, fail: 0 };
  const groups = new Map();
  if (manualMod) mods.push({ label: manualLabel, value: manualMod });

  for (const e of fx) {
    const r = effectOnRoll(e, ctx);
    if (!r.mod && !r.steps && !r.critSuccess && !r.critFail) continue;
    if (e.when) {
      const key = `${e.source}|${e.when}`;
      const g = groups.get(key) ?? { id: `s${groups.size}`, label: e.when, source: e.source, mod: 0, steps: 0 };
      g.mod += r.mod; g.steps += r.steps;
      groups.set(key, g);
      continue;
    }
    if (r.mod) mods.push({ label: e.source, value: r.mod });
    if (r.steps) steps.push({ label: e.source, value: r.steps });
    crit.success += r.critSuccess;
    crit.fail += r.critFail;
  }

  // Premie do uników (Pipsqueak, Large, Contortionist…) — przy rzucie na Agility jako opcja
  if (ctx.kind === "attr" && ctx.attr === "agi") {
    const dodge = sumFx(fx, "dodge");
    if (dodge) groups.set("dodge", { id: "dodge", label: t("Dodge roll"), source: sourcesFx(fx, "dodge").join(", "), mod: dodge, steps: 0 });
  }

  const weather = weatherSituational(ctx);
  if (weather) groups.set("weather", weather);

  const situational = [...groups.values()].filter(g => g.mod || g.steps);
  return {
    mods, steps, crit, situational,
    fixedMod: mods.reduce((t, m) => t + m.value, 0),
    fixedSteps: steps.reduce((t, m) => t + m.value, 0)
  };
}

/** Krótki opis efektu, np. „Speechcraft: rzuty −10 (gdy: Fobia aktywna)”. */
export function describeFx(e, labels = {}) {
  const ft = FX_TYPES[e.type];
  const v = n(e.value);
  const tgt = targets(e.target).map(k => (k === "all" ? t("all") : labels[k] ?? k)).join(", ");
  const steps = ["mfdStep", "basedStep"].includes(e.type);
  const value = steps ? tn(v, "{s} step", "{s} steps", { s: signed(v) }) : `${signed(v)}${["speedPct", "radResist", "xpPct"].includes(e.type) ? "%" : ""}`;
  const what = ft ? ft.label : e.type;
  const showTarget = ft && ft.targets !== "none" && tgt;
  return `${what}${showTarget ? ` (${tgt})` : ""}: ${value}${e.when ? ` ${t("— when: {w}", { w: e.when })}` : ""}`;
}

/** Zwięzły opis efektu do tabel, np. „+1 CHA”, „Sneak: −2 kroki MFD”, „+15% odp. na prom.”. */
export function shortFx(e, labels = {}) {
  const v = n(e.value);
  const tgt = targets(e.target).map(k => labels[k] ?? k).join("/");
  const steps = tn(v, "{s} MFD step", "{s} MFD steps", { s: signed(v) });
  const d = { v: signed(v), tgt, steps };
  const txt = {
    attr: `${signed(v)} ${tgt}`, tempAttr: `${signed(v)} ${tgt}`,
    skillRank: t("{v} {tgt} (rank)", d), skillRoll: `${signed(v)} ${tgt}`, attrRoll: t("{v} {tgt} rolls", d),
    basedRoll: t("{v} {tgt} and skills", d), skillsOf: t("{v} {tgt} skills", d),
    mfdStep: `${tgt}: ${steps}`, basedStep: t("{tgt} and skills: {steps}", d), accuracy: t("{v} accuracy ({tgt})", d),
    damage: t("{v} damage ({tgt})", d), critSuccess: t("crit. success {v}", d), critFail: t("crit. failure {v}", d),
    radResist: t("{v}% rad. resistance", d), sats: `${signed(v)} SATS`, dt: `${signed(v)} DT (${tgt})`,
    speed: t("{v} ft movement", d), carry: t("{v} lb carry weight", d), initiative: t("{v} initiative", d),
    wound: t("{v} dmg per wound", d), strain: `${signed(v)} strain`, dodge: t("{v} dodge", d), luckCards: t("{v} Luck cards", d),
    skillPoints: t("{v} skill points/level", d), satsRegen: t("{v} AP/round", d), xpPct: t("{v}% XP", d),
    fireDt: t("{v} DT vs. fire ({tgt})", d), limbWounds: t("{v} wounds to cripple/maim ({tgt})", d), limbMult: t("×{n} limb wounds", { n: v })
  }[e.type] ?? describeFx(e, labels);
  return e.when ? `${txt} ${t("(when: {w})", { w: e.when })}` : txt;
}
