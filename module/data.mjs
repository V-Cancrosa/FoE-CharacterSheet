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
  { key: "2",   label: "2 (bardzo łatwe)",    f: 2 },
  { key: "1.5", label: "1½ (łatwe)",          f: 1.5 },
  { key: "1",   label: "1 (normalne)",        f: 1 },
  { key: "3/4", label: "¾ (trudne)",          f: 0.75 },
  { key: "1/2", label: "½ (bardzo trudne)",   f: 0.5 },
  { key: "1/4", label: "¼ (frustrująco trudne)", f: 0.25 },
  { key: "1/10", label: "1/10 (ekstremalne)", f: 0.1 }
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
    attr: new F.StringField({ initial: s.attr })
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
    const a = this.attributes;
    for (const att of Object.values(a)) {
      att.total = Math.max(0, att.value + att.mod);
      att.tn = att.total * 10;
    }
    const luck = a.luck.total;
    for (const [k, sk] of Object.entries(this.skills)) {
      const att = a[sk.attr] ?? a[SKILLS[k].attr];
      sk.base = Math.max(5, 2 * att.total + Math.floor(luck / 2) + 2);
      sk.rank = sk.base + (sk.tag ? 15 : 0) + sk.points + sk.bonus;
      sk.tn = sk.rank + Math.floor(att.tn / 2);   // MFD 1 = ranga + ½ MFD atrybutu
    }
    const agi = a.agi.total;
    this.resources.sats.max = 40 + agi * 5;
    this.resources.luck.max = Math.max(3, Math.ceil(luck / 2) + 2);
    this.carry = 100 + 10 * a.str.total;
    this.speed = Math.floor((2.5 * agi) / 5) * 5;
    this.flySpeed = 5 * agi;
    this.dmgPerWound = Math.min(20, 10 + Math.floor(this.level / 3)) + this.woundBonus;
    this.initMod = Math.floor(a.agi.tn / 4);
    const endT = a.end.total;
    for (const loc of Object.values(this.locations)) loc.lethal = loc.wounds >= endT;
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
    return { kind: new F.StringField({ initial: "trait" }), description: desc() };
  }
}
