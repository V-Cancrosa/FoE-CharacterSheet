/**
 * Efekty cech, wad i perków.
 *
 * Każdy przedmiot typu „feature” ma listę efektów { type, target, value, when }:
 *   - when puste  → efekt stały, doliczany automatycznie na karcie i w rzutach,
 *   - when z tekstem → efekt sytuacyjny; w oknie rzutu pojawia się pole do zaznaczenia z tym opisem.
 * target: „all”, klucz atrybutu/umiejętności/lokacji albo lista po przecinku;
 *         dla ataków także „ranged” (broń dystansowa), „melee” (wręcz) i „attack” (każdy atak).
 */

export const FX_TYPES = {
  attr:        { label: "Atrybut na stałe", targets: "attr" },
  skillRank:   { label: "Ranga umiejętności", targets: "skill" },
  skillRoll:   { label: "Rzuty umiejętności", targets: "skill" },
  attrRoll:    { label: "Rzuty samego atrybutu", targets: "attr" },
  basedRoll:   { label: "Rzuty atrybutu i jego umiejętności", targets: "attr" },
  skillsOf:    { label: "Rzuty umiejętności danego atrybutu", targets: "attr" },
  tempAttr:    { label: "Tymczasowa zmiana atrybutu", targets: "attr" },
  accuracy:    { label: "Celność ataków", targets: "attack" },
  mfdStep:     { label: "Kroki MFD (+ łatwiej, − trudniej)", targets: "any" },
  damage:      { label: "Obrażenia broni", targets: "none" },
  critSuccess: { label: "Zakres krytycznego sukcesu", targets: "any" },
  critFail:    { label: "Zakres krytycznej porażki", targets: "any" },
  initiative:  { label: "Inicjatywa (+ szybciej)", targets: "none" },
  luckCards:   { label: "Karty szczęścia na sesję", targets: "none" },
  wound:       { label: "Obrażenia na ranę", targets: "none" },
  carry:       { label: "Udźwig", targets: "none" },
  speed:       { label: "Ruch (ft na akcję)", targets: "none" },
  speedPct:    { label: "Ruch (%)", targets: "move" },
  sats:        { label: "Maks. SATS", targets: "none" },
  dt:          { label: "DT", targets: "location" },
  radResist:   { label: "Odporność na promieniowanie (%)", targets: "none" },
  strain:      { label: "Maks. strain", targets: "none" },
  dodge:       { label: "Uniki", targets: "none" }
};

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

/** Wszystkie efekty z aktywnych cech aktora (z nazwą źródła). */
export function actorEffects(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== "feature" || item.system?.active === false) continue;
    (item.system?.effects ?? []).forEach((e, i) => {
      if (e?.type && !CREATION_ONLY.has(e.type)) out.push({ ...e, source: item.name, id: `${item.id}.${i}` });
    });
  }
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
      if (isAttr && hits(e.target, ctx.attr)) out.mod = 10 * v;
      else if (sk && hits(e.target, ctx.skillAttr)) out.mod = 5 * v;
      break;
    case "accuracy": if (ctx.kind === "attack" && hitsAttack(e.target, sk)) out.mod = v; break;
    case "mfdStep":
    case "critSuccess":
    case "critFail": {
      const l = targets(e.target);
      const ok = ctx.kind === "attack" ? hitsAttack(e.target, sk)
        : sk ? (l.includes("all") || l.includes(sk) || l.includes(ctx.skillAttr))
        : (l.includes("all") || l.includes(ctx.attr));
      if (ok) out[e.type === "mfdStep" ? "steps" : e.type] = v;
      break;
    }
  }
  return out;
}

/**
 * Modyfikatory rzutu z cech aktora: stałe (już wliczone) i sytuacyjne (do zaznaczenia w oknie rzutu).
 * manualMod / manualLabel — modyfikator wpisany ręcznie na karcie.
 */
export function rollContext(actor, ctx, { manualMod = 0, manualLabel = "Modyfikator na karcie" } = {}) {
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
    if (dodge) groups.set("dodge", { id: "dodge", label: "Rzut na unik", source: sourcesFx(fx, "dodge").join(", "), mod: dodge, steps: 0 });
  }

  const situational = [...groups.values()].filter(g => g.mod || g.steps);
  return {
    mods, steps, crit, situational,
    fixedMod: mods.reduce((t, m) => t + m.value, 0),
    fixedSteps: steps.reduce((t, m) => t + m.value, 0)
  };
}

/** Krótki opis efektu po polsku, np. „Speechcraft: rzuty −10 (gdy: Fobia aktywna)”. */
export function describeFx(e, labels = {}) {
  const t = FX_TYPES[e.type];
  const v = n(e.value);
  const tgt = targets(e.target).map(k => (k === "all" ? "wszystkie" : labels[k] ?? k)).join(", ");
  const unit = e.type === "speedPct" || e.type === "radResist" ? "%" : e.type === "mfdStep" ? (Math.abs(v) === 1 ? " krok" : " kroki") : "";
  const what = t ? t.label : e.type;
  const showTarget = t && t.targets !== "none" && tgt;
  return `${what}${showTarget ? ` (${tgt})` : ""}: ${signed(v)}${unit}${e.when ? ` — gdy: ${e.when}` : ""}`;
}
