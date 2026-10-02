import { actorEffects, sumFx, sourcesFx, hits } from "./effects.mjs";

const F = foundry.data.fields;

export const ATTRS = {
  str: "Strength", per: "Perception", end: "Endurance", cha: "Charisma",
  int: "Intelligence", agi: "Agility", luck: "Luck"
};

// Umiejętności z Core Rulebook v1.22 (w kolejności S.P.E.C.I.A.L.)
export const SKILLS = {
  dig:        { label: "Dig",            attr: "str", racial: true },
  melee:      { label: "Melee",          attr: "str" },
  energy:     { label: "Energy Weapons", attr: "per" },
  explosives: { label: "Explosives",     attr: "per" },
  lockpick:   { label: "Lockpicking",    attr: "per" },
  bigGuns:    { label: "Battle Saddles / Big Guns", attr: "end" },
  survival:   { label: "Survival",       attr: "end" },
  unarmed:    { label: "Unarmed",        attr: "end" },
  mercantile: { label: "Mercantile",     attr: "cha" },
  speech:     { label: "Speechcraft",    attr: "cha" },
  magic:      { label: "Magic",          attr: "int", racial: true, choice: ["cha", "int"] },
  medicine:   { label: "Medicine",       attr: "int" },
  repair:     { label: "Repair",         attr: "int" },
  science:    { label: "Science",        attr: "int" },
  flight:     { label: "Flight",         attr: "agi", racial: true },
  smallGuns:  { label: "Firearms / Small Guns", attr: "agi" },
  sneak:      { label: "Sneak",          attr: "agi" }
};

// Kroki MFD od najłatwiejszego do najtrudniejszego
export const MFD_STEPS = [
  { key: "2",    name: "2",    desc: "bardzo łatwe",        f: 2 },
  { key: "1.5",  name: "1,5",   desc: "łatwe",               f: 1.5 },
  { key: "1",    name: "1",    desc: "normalne",            f: 1 },
  { key: "3/4",  name: "3/4",    desc: "trudne",              f: 0.75 },
  { key: "1/2",  name: "1/2",    desc: "bardzo trudne",       f: 0.5 },
  { key: "1/4",  name: "1/4",    desc: "frustrująco trudne",  f: 0.25 },
  { key: "1/10", name: "1/10", desc: "ekstremalne",         f: 0.1 }
];

export const LOCATIONS = {
  head: "Głowa", torso: "Tułów", flLeg: "Przednia lewa", frLeg: "Przednia prawa",
  rlLeg: "Tylna lewa", rrLeg: "Tylna prawa", wings: "Skrzydła", horn: "Róg"
};

const num = (initial = 0, opts = {}) =>
  new F.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });

function attrSchema() {
  const o = {};
  for (const k of Object.keys(ATTRS)) o[k] = new F.SchemaField({
    value: num(k === "luck" ? 5 : 5, { min: 0, max: 12 }),
    mod: num(0)
  });
  return new F.SchemaField(o);
}

function skillSchema() {
  const o = {};
  for (const [k, s] of Object.entries(SKILLS)) o[k] = new F.SchemaField({
    tag: new F.BooleanField({ initial: false }),
    points: num(0),          // punkty z awansów
    bonus: num(0),           // rasa/cechy/perki
    mod: num(0),             // stały modyfikator do rzutu (+ ułatwia)
    attr: new F.StringField({ initial: s.attr }),
    known: new F.BooleanField({ initial: true })   // umiejętność rasowa dostępna dla tej rasy
  });
  return new F.SchemaField(o);
}

function locationSchema() {
  const o = {};
  for (const k of Object.keys(LOCATIONS)) o[k] = new F.SchemaField({
    wounds: num(0, { min: 0 }),
    dt: num(0),
    crippled: new F.BooleanField({ initial: false })
  });
  return new F.SchemaField(o);
}

class BaseActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attributes: attrSchema(),
      skills: skillSchema(),
      locations: locationSchema(),
      level: num(1, { min: 1 }),
      woundBonus: num(0),
      carryBonus: num(0),      // np. Strong Back, Large, Young
      speedBonus: num(0),      // np. High Ho Silver, Away!
      resources: new F.SchemaField({
        sats: new F.SchemaField({ value: num(65), max: num(65) }),
        luck: new F.SchemaField({ value: num(5), max: num(5) }),
        strain: new F.SchemaField({ value: num(0), max: num(0) }),
        rads: new F.SchemaField({ value: num(0, { min: 0 }), max: num(1000) })
      }),
      radResist: num(0),
      karma: num(0),
      caps: num(0),
      race: new F.StringField({ initial: "" }),
      notes: new F.HTMLField({ initial: "" })
    };
  }

  prepareDerivedData() {
    // Stałe efekty z aktywnych cech, wad i perków (szczegóły: effects.mjs)
    const fx = actorEffects(this.parent).filter(e => !e.when);
    const sum = (type, pred) => sumFx(fx, type, pred);
    const src = (type, pred) => sourcesFx(fx, type, pred);

    const a = this.attributes;
    for (const [k, att] of Object.entries(a)) {
      att.fx = sum("attr", e => hits(e.target, k));
      att.fxSources = src("attr", e => hits(e.target, k));
      att.total = Math.max(0, att.value + att.mod + att.fx);
      att.tn = att.total * 10;
      att.fxRoll = sum("attrRoll", e => hits(e.target, k)) + sum("basedRoll", e => hits(e.target, k));
      att.fxRollSources = [...src("attrRoll", e => hits(e.target, k)), ...src("basedRoll", e => hits(e.target, k))];
    }
    const luck = a.luck.total;
    for (const [k, sk] of Object.entries(this.skills)) {
      const attrKey = a[sk.attr] ? sk.attr : SKILLS[k].attr;
      const att = a[attrKey];
      const onSkill = e => hits(e.target, k);
      const onAttr = e => hits(e.target, attrKey);
      sk.base = Math.max(5, 2 * att.total + Math.floor(luck / 2) + 2);
      sk.fxRank = sum("skillRank", onSkill);
      sk.fxRankSources = src("skillRank", onSkill);
      // Premie rasy/cech nie zbijają rangi poniżej 5; potem tag i punkty z awansów; maks. 100 (s. 63)
      sk.rank = Math.min(100, Math.max(5, sk.base + sk.bonus + sk.fxRank) + (sk.tag ? 15 : 0) + sk.points);
      sk.tn = sk.rank + Math.floor(att.tn / 2);   // MFD 1 = ranga + ½ MFD atrybutu
      sk.fxRoll = sum("skillRoll", onSkill) + sum("basedRoll", onAttr) + sum("skillsOf", onAttr);
      sk.fxRollSources = [...src("skillRoll", onSkill), ...src("basedRoll", onAttr), ...src("skillsOf", onAttr)];
      sk.rollMod = sk.mod + sk.fxRoll;
    }

    const agi = a.agi.total;
    const pct = where => sum("speedPct", e => hits(e.target, where));
    this.fx = {
      initiative: sum("initiative"), luckCards: sum("luckCards"), wound: sum("wound"), carry: sum("carry"),
      speed: sum("speed"), sats: sum("sats"), radResist: sum("radResist"), strain: sum("strain"),
      dodge: sum("dodge"), damage: sum("damage"),
      critSuccess: sum("critSuccess", e => hits(e.target, "all")), critFail: sum("critFail", e => hits(e.target, "all")),
      dtAll: sum("dt", e => hits(e.target, "all")),
      dodgeSources: src("dodge")
    };
    this.resources.sats.max = 40 + agi * 5 + this.fx.sats;
    this.resources.luck.max = Math.max(0, Math.max(3, Math.ceil(luck / 2) + 2) + this.fx.luckCards);
    this.strainBonus = this.fx.strain;
    this.carry = 100 + 10 * a.str.total + (this.carryBonus ?? 0) + this.fx.carry;
    this.speed = Math.floor((2.5 * agi * (100 + pct("ground")) / 100) / 5) * 5 + (this.speedBonus ?? 0) + this.fx.speed;
    this.flySpeed = Math.floor((5 * agi * (100 + pct("fly")) / 100) / 5) * 5;
    this.dmgPerWound = Math.min(20, 10 + Math.floor(this.level / 3)) + this.woundBonus + this.fx.wound;
    this.initMod = Math.floor(a.agi.tn / 4) + this.fx.initiative;
    this.radResistTotal = this.radResist + this.fx.radResist;
    this.critRange = { success: 5 + this.fx.critSuccess, fail: 5 + this.fx.critFail };
    const endT = a.end.total;
    for (const [k, loc] of Object.entries(this.locations)) {
      loc.lethal = loc.wounds >= endT;
      loc.dtFx = sum("dt", e => !hits(e.target, "all") && hits(e.target, k)) + this.fx.dtAll;
      loc.dtTotal = loc.dt + loc.dtFx;
    }
  }
}

export class CharacterData extends BaseActorData {}
export class NpcData extends BaseActorData {}

// ---------- Itemy ----------
const desc = () => new F.HTMLField({ initial: "" });

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      skill: new F.StringField({ initial: "smallGuns" }),
      damage: new F.StringField({ initial: "1d10" }),
      satsCost: num(20),
      ammo: new F.SchemaField({ value: num(0), max: num(0) }),
      range: new F.StringField({ initial: "" }),
      crit: new F.StringField({ initial: "" }),
      weight: new F.NumberField({ initial: 0 }),
      description: desc()
    };
  }
}
export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      dt: num(0), category: new F.StringField({ initial: "light" }),
      equipped: new F.BooleanField({ initial: false }),
      weight: new F.NumberField({ initial: 0 }), description: desc()
    };
  }
}
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { qty: num(1), weight: new F.NumberField({ initial: 0 }), description: desc() };
  }
}
export class FeatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new F.StringField({ initial: "trait" }),
      active: new F.BooleanField({ initial: true }),
      // efekty mechaniczne — patrz effects.mjs
      effects: new F.ArrayField(new F.SchemaField({
        type: new F.StringField({ initial: "skillRoll" }),
        target: new F.StringField({ initial: "all" }),
        value: new F.NumberField({ required: true, nullable: false, initial: 0 }),
        when: new F.StringField({ initial: "" })
      })),
      description: desc()
    };
  }
}
