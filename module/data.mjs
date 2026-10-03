import { actorEffects, sumFx, sourcesFx, hits, signed } from "./effects.mjs";
import { LAYER_CATEGORIES, defaultCover, layerPenalties, overloadSpeed, sneakWeightPenalty } from "./combat.mjs";
import { iconFor } from "./catalog-data.mjs";

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
    const items = this.parent?.items ?? [];
    // Stałe efekty z aktywnych cech, wad, perków i założonych pancerzy (szczegóły: effects.mjs)
    const fx = actorEffects(this.parent, { state: false }).filter(e => !e.when);
    const sum = (type, pred) => sumFx(fx, type, pred);
    const src = (type, pred) => sourcesFx(fx, type, pred);

    // Pancerz: jedna warstwa z każdej kategorii; kolejne warstwy obniżają AGI i STR (s. 156)
    const worn = items.filter(i => i.type === "armor" && i.system?.equipped);
    const layers = worn.filter(i => LAYER_CATEGORIES.includes(i.system.category));
    const pen = layerPenalties(layers.length);
    this.armorLayers = { count: layers.length, names: layers.map(i => i.name), agi: pen.agi, str: pen.str };

    const a = this.attributes;
    for (const [k, att] of Object.entries(a)) {
      att.fx = sum("attr", e => hits(e.target, k));
      att.fxSources = src("attr", e => hits(e.target, k));
      // Zmiany tymczasowe (pancerz, warstwy): liczą się do progu atrybutu i wartości pochodnych,
      // a umiejętnościom dają ±5 za punkt — ale nie zmieniają rang (s. 17)
      const layerPen = pen[k] ?? 0;
      att.temp = sum("tempAttr", e => hits(e.target, k)) - layerPen;
      att.tempSources = [...src("tempAttr", e => hits(e.target, k)), ...(layerPen ? [`Warstwy pancerza (${layers.length}) −${layerPen}`] : [])];
      att.base = Math.max(0, att.value + att.mod + att.fx);
      att.total = Math.max(0, att.base + att.temp);
      att.tn = att.total * 10;
      att.fxRoll = sum("attrRoll", e => hits(e.target, k)) + sum("basedRoll", e => hits(e.target, k));
      att.fxRollSources = [...src("attrRoll", e => hits(e.target, k)), ...src("basedRoll", e => hits(e.target, k))];
    }
    const luck = a.luck.base;
    for (const [k, sk] of Object.entries(this.skills)) {
      const attrKey = a[sk.attr] ? sk.attr : SKILLS[k].attr;
      const att = a[attrKey];
      const onSkill = e => hits(e.target, k);
      const onAttr = e => hits(e.target, attrKey);
      sk.base = Math.max(5, 2 * att.base + Math.floor(luck / 2) + 2);
      sk.fxRank = sum("skillRank", onSkill);
      sk.fxRankSources = src("skillRank", onSkill);
      // Premie rasy/cech nie zbijają rangi poniżej 5; potem tag i punkty z awansów; maks. 100 (s. 63)
      sk.rank = Math.min(100, Math.max(5, sk.base + sk.bonus + sk.fxRank) + (sk.tag ? 15 : 0) + sk.points);
      sk.tn = sk.rank + Math.floor(att.tn / 2);   // MFD 1 = ranga + ½ MFD atrybutu (z nim zmiany tymczasowe ×5)
      sk.temp = att.temp * 5;
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
    this.resources.luck.max = Math.max(0, Math.max(3, Math.ceil(a.luck.total / 2) + 2) + this.fx.luckCards);
    this.strainBonus = this.fx.strain;
    this.dmgPerWound = Math.min(20, 10 + Math.floor(this.level / 3)) + this.woundBonus + this.fx.wound;
    this.initMod = Math.floor(a.agi.tn / 4) + this.fx.initiative;
    this.radResistTotal = this.radResist + this.fx.radResist;
    this.critRange = { success: 5 + this.fx.critSuccess, fail: 5 + this.fx.critFail };

    // Obciążenie (s. 18): amunicja i pieniądze nic nie ważą
    this.carry = 100 + 10 * a.str.total + (this.carryBonus ?? 0) + this.fx.carry;
    const carried = items.reduce((t, i) => {
      if (!["weapon", "armor", "gear"].includes(i.type)) return t;
      if (i.type === "gear" && i.system?.category === "ammo") return t;
      const qty = i.type === "gear" || (i.type === "weapon" && i.system?.consumable) ? Math.max(0, Number(i.system?.qty) || 0) : 1;
      return t + (Number(i.system?.weight) || 0) * qty;
    }, 0);
    this.weight = Math.round(carried * 10) / 10;
    this.overload = Math.max(0, Math.round((this.weight - this.carry) * 10) / 10);
    this.sneakPenalty = sneakWeightPenalty(this.weight);

    // Rany i DT na lokacjach
    const endT = a.end.total;
    const LEGS = ["flLeg", "frLeg", "rlLeg", "rrLeg"];
    let totalWounds = 0;
    for (const [k, loc] of Object.entries(this.locations)) {
      totalWounds += loc.wounds;
      // Pancerz: liczy się tylko najwyższe DT z założonych osłaniających lokację; naturalne DT (cechy) i ręczne się dodają (s. 460)
      let best = null;
      for (const i of worn) {
        if (!i.system.cover?.[k]) continue;
        const dt = Math.max(0, (i.system.dt || 0) - (i.system.wear?.[k] || 0));
        if (!best || dt > best.dt) best = { dt, name: i.name };
      }
      loc.armorDt = best?.dt ?? 0;
      loc.armorName = best?.name ?? "";
      loc.dtFx = sum("dt", e => !hits(e.target, "all") && hits(e.target, k)) + this.fx.dtAll;
      loc.naturalDt = loc.dt + loc.dtFx;
      loc.dtTotal = loc.armorDt + loc.naturalDt;
      // Połowa END ran okalecza, END ran w głowie/tułowiu zabija, w kończynie ją odrywa (s. 462)
      loc.lethal = loc.wounds > 0 && loc.wounds >= endT;
      loc.autoCrippled = loc.wounds > 0 && loc.wounds * 2 >= endT;
      loc.isCrippled = loc.crippled || loc.autoCrippled || loc.lethal;
      const vital = k === "head" || k === "torso";
      loc.status = loc.lethal ? (vital ? "dead" : "maimed") : loc.isCrippled ? "crippled" : loc.wounds ? "wounded" : "ok";
      loc.limit = endT;
      loc.crippleAt = Math.max(1, Math.ceil(endT / 2));
    }
    const L = this.locations;
    this.totalWounds = totalWounds;
    this.dead = L.head.lethal || L.torso.lethal;
    this.unconsciousAt = 4 * endT;
    this.unconsciousRisk = endT > 0 && totalWounds >= 4 * endT;

    // Ruch: −5 ft za okaleczoną nogę, przy ≤ 1 sprawnej nodze brak ruchu; przeciążenie −5 ft / 10 lb (s. 18, 444)
    const badLegs = LEGS.filter(k => L[k].isCrippled).length;
    const overSpeed = overloadSpeed(this.weight, this.carry);
    let speed = Math.floor((2.5 * agi * (100 + pct("ground")) / 100) / 5) * 5 + (this.speedBonus ?? 0) + this.fx.speed;
    speed -= 5 * badLegs + overSpeed;
    if (LEGS.length - badLegs <= 1) speed = 0;
    this.speed = Math.max(0, speed);
    this.speedNotes = [
      badLegs ? `okaleczone nogi: −${5 * badLegs} ft` : "",
      LEGS.length - badLegs <= 1 ? "≤ 1 sprawna noga: bez pomocy nie idzie" : "",
      overSpeed ? `przeciążenie: −${overSpeed} ft` : ""
    ].filter(Boolean);
    this.flySpeed = Math.floor((5 * agi * (100 + pct("fly")) / 100) / 5) * 5;
    this.canFly = !L.wings.isCrippled;
    if (this.overload > 0) this.flySpeed = Math.min(this.flySpeed, this.speed);

    // Efekty stanu → rzuty (effects.mjs → actorEffects): okaleczenia (s. 443–446, 462) i ciężar przy skradaniu
    const st = [];
    const add = (type, target, value, source) => { if (value) st.push({ type, target, value, when: "", source, id: `state.${st.length}` }); };
    if (L.head.isCrippled) { add("basedStep", "int,per,cha", -2, "Okaleczona głowa"); add("mfdStep", "attack", -1, "Okaleczona głowa (celność)"); }
    if (L.torso.isCrippled) add("basedStep", "end,str,agi", -2, "Okaleczony tułów");
    if (badLegs) {
      add("mfdStep", "sneak", -badLegs, `Okaleczone nogi (${badLegs})`);
      add("mfdStep", "bigGuns", -badLegs, `Okaleczone nogi (${badLegs}) — siodło bojowe`);
    }
    if (L.wings.isCrippled) add("mfdStep", "flight", -2, "Okaleczone skrzydła");
    const otherCrippled = Object.keys(L).filter(k => k !== "horn" && L[k].isCrippled).length;
    add("mfdStep", "magic", -(L.horn.isCrippled ? 2 : 0) - otherCrippled, "Okaleczenia (zaklęcia)");
    add("skillRoll", "sneak", -this.sneakPenalty, `Obciążenie ${this.weight} lb`);
    this.stateFx = st;
    // kary do rzutów umiejętności ze stanu widać od razu na karcie (próg MFD 1)
    for (const e of st.filter(x => x.type === "skillRoll")) {
      for (const [k, sk] of Object.entries(this.skills)) {
        if (!hits(e.target, k)) continue;
        sk.fxRoll += e.value;
        sk.rollMod += e.value;
        sk.fxRollSources.push(`${e.source} ${signed(e.value)}`);
      }
    }
  }
}

export class CharacterData extends BaseActorData {}
export class NpcData extends BaseActorData {}

// ---------- Itemy ----------
const desc = () => new F.HTMLField({ initial: "" });
const str = (initial = "") => new F.StringField({ initial });
const bool = (initial = false) => new F.BooleanField({ initial });

/** Lista efektów { type, target, value, when } — patrz effects.mjs. */
const effectsField = () => new F.ArrayField(new F.SchemaField({
  type: new F.StringField({ initial: "skillRoll" }),
  target: new F.StringField({ initial: "all" }),
  value: new F.NumberField({ required: true, nullable: false, initial: 0 }),
  when: new F.StringField({ initial: "" })
}));

/** Nowy przedmiot bez własnego obrazka dostaje ikonę PipBucka pasującą do rodzaju. */
class FoeItemData extends foundry.abstract.TypeDataModel {
  async _preCreate(data, options, user) {
    if ((await super._preCreate?.(data, options, user)) === false) return false;
    const img = data?.img ?? this.parent?.img;
    if (!img || img === "icons/svg/item-bag.svg") this.parent?.updateSource?.({ img: iconFor(this.parent.type, { ...this, ...(data?.system ?? {}) }) });
  }
}

const perLocation = field => {
  const o = {};
  for (const k of Object.keys(LOCATIONS)) o[k] = field(k);
  return new F.SchemaField(o);
};

export class WeaponData extends FoeItemData {
  static defineSchema() {
    return {
      skill: str("smallGuns"),
      kind: str(""),                     // rodzaj z katalogu (smallGuns, bigGunsAoe, explosive, special…)
      damage: str("1d10"),
      shots: num(1, { min: 1 }),         // seria „/N”: naboje na strzał
      satsCost: num(20),
      ammo: new F.SchemaField({ value: num(0), max: num(0) }),
      ammoType: str(""),
      reload: str(""),                   // DTM, DTM+5, Revolver, Internal, Breech…
      range: str(""),
      rangeInc: num(0, { min: 0 }),      // przedział zasięgu w ft (0 = wręcz albo liczony z „range”)
      crit: str("x1"),
      ignoreDT: num(0, { min: 0 }),
      aoe: new F.SchemaField({ enabled: bool(false), splash: str(""), inc: str(""), radius: str("") }),
      // specjalne efekty (s. 200–202): ogień i dezintegracja: "" | "hit" (każde trafienie) | "crit" (tylko krytyk)
      specials: new F.SchemaField({
        fire: str(""), electric: bool(false), rads: bool(false), disintegrate: str(""), shock: bool(false),
        poison: str(""), knockdown: bool(false), concealable: bool(false), scoped: bool(false),
        silenced: bool(false), timed: bool(false), placed: bool(false)
      }),
      consumable: bool(false),           // granaty, miny: atak zużywa sztukę
      qty: num(1, { min: 0 }),
      mw: bool(false),                   // da się trzymać w pysku
      weight: new F.NumberField({ initial: 0 }),
      value: num(0, { min: 0 }),
      description: desc()
    };
  }
}

export const ARMOR_CATEGORIES = {
  clothing: "Ubranie", light: "Lekki", medium: "Średni", heavy: "Ciężki", helmet: "Hełm / nakrycie głowy", accessory: "Akcesorium"
};

export class ArmorData extends FoeItemData {
  static defineSchema() {
    return {
      category: str("light"),
      dt: num(0, { min: 0 }),
      wear: perLocation(() => num(0, { min: 0 })),    // degradacja DT na lokacji (zasada opcjonalna)
      cover: perLocation(k => bool(defaultCover("light")[k])),
      equipped: bool(false),
      powered: bool(false),
      effects: effectsField(),
      weight: new F.NumberField({ initial: 0 }),
      value: num(0, { min: 0 }),
      description: desc()
    };
  }

  /** Hełm sam osłania głowę, akcesorium niczego (o ile nie podano osłony). */
  async _preCreate(data, options, user) {
    if ((await super._preCreate?.(data, options, user)) === false) return false;
    const given = data?.system?.cover ?? data?.cover;   // pełne dane dokumentu albo same dane systemu
    if (!given && this.category !== "light") this.updateSource({ cover: defaultCover(this.category) });
  }

  /** Zmiana kategorii między ubraniem/pancerzem, hełmem i akcesorium przestawia osłonę. */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate?.(changes, options, user)) === false) return false;
    const cat = changes.system?.category;
    if (!cat || cat === this.category || changes.system.cover) return;
    const group = c => (c === "helmet" || c === "accessory" ? c : "body");
    if (group(cat) !== group(this.category)) changes.system.cover = defaultCover(cat);
  }
}

export const GEAR_CATEGORIES = {
  misc: "Różne", ammo: "Amunicja", food: "Jedzenie i picie", drug: "Leki i używki", book: "Książki i magazyny",
  pipbuck: "PipBuck", saddle: "Siodło bojowe i dodatki"
};

export class GearData extends FoeItemData {
  static defineSchema() {
    return {
      category: str("misc"),
      qty: num(1),
      weight: new F.NumberField({ initial: 0 }),
      value: num(0, { min: 0 }),
      ammoType: str(""),
      description: desc()
    };
  }
}
export class FeatureData extends FoeItemData {
  static defineSchema() {
    return {
      kind: new F.StringField({ initial: "trait" }),
      active: new F.BooleanField({ initial: true }),
      // efekty mechaniczne — patrz effects.mjs
      effects: effectsField(),
      description: desc()
    };
  }
}
