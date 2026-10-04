import { actorEffects, sumFx, sourcesFx, hits, signed } from "./effects.mjs";
import { LAYER_CATEGORIES, defaultCover, layerPenalties, overloadSpeed, sneakWeightPenalty } from "./combat.mjs";
import { iconFor } from "./catalog-data.mjs";
import { unpoweredLocs, powerState, isCyborg, LIMB_LOCS } from "./cyber-data.mjs";
import { sizeRow, defaultStructure, defaultPilotSkill, vehicleSpeed, VEHICLE_LOCS, AREA_EFFECTS, AREA_STATUS } from "./vehicle-data.mjs";

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
    value: num(k === "luck" ? 5 : 5, { min: 0, max: 30 }),   // potwory z bestiariusza mają nawet 18
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
      xp: num(0, { min: 0 }),              // punkty doświadczenia (tabela XII)
      woundBonus: num(0),
      // progi z bloku statystyk potwora (0 = jak u kucyków: okaleczenie od połowy END, utrata/śmierć od END)
      woundLimits: new F.SchemaField({ cripple: num(0, { min: 0 }), maim: num(0, { min: 0 }) }),
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
      altitude: num(0, { min: 0 }),            // wysokość lotu w ft
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
      skillPoints: sum("skillPoints"), satsRegen: sum("satsRegen"), xpPct: sum("xpPct"),
      critSuccess: sum("critSuccess", e => hits(e.target, "all")), critFail: sum("critFail", e => hits(e.target, "all")),
      dtAll: sum("dt", e => hits(e.target, "all")),
      // kończyny: Adamantium Bone Lacing ×2 (przed premiami stałymi), Cyberpony i protezy +1
      limbMult: Math.max(1, fx.filter(e => e.type === "limbMult" && !e.when).reduce((m, e) => Math.max(m, Number(e.value) || 1), 1)),
      dodgeSources: src("dodge")
    };
    this.resources.sats.max = 40 + agi * 5 + this.fx.sats;
    this.satsRegen = 5 + this.fx.satsRegen;   // AP na rundę walki (Cooler Under Fire +10)
    this.resources.luck.max = Math.max(0, Math.max(3, Math.ceil(a.luck.total / 2) + 2) + this.fx.luckCards);
    this.strainBonus = this.fx.strain;
    // Magia jednorożców (s. 242): pula strain = END + INT + 2 (alikorny + 5) + cechy; zebry używają składników
    const race = String(this.race ?? "");
    this.caster = this.skills.magic?.known !== false && !/zebr/i.test(race);
    this.zebraMage = this.skills.magic?.known !== false && /zebr|shaman|szaman/i.test(race);
    this.alicorn = /alikorn|alicorn/i.test(race);
    this.strainMax = this.caster
      ? Math.max(0, a.end.total + a.int.total + (this.alicorn ? 5 : 2) + this.fx.strain)
      : Math.max(0, this.resources.strain.max + this.fx.strain);
    const mflags = this.parent?.flags?.["foe-rpg"] ?? {};
    this.burnout = !!mflags.burnout;
    this.maintained = Array.isArray(mflags.maintained) ? mflags.maintained : [];
    this.dmgPerWound = Math.min(20, 10 + Math.floor(this.level / 3)) + this.woundBonus + this.fx.wound;
    // Inicjatywa: d100 ± próg AGI ¼ (gracz wybiera po rzucie) − premie z cech (s. 436)
    this.initAgi = Math.floor(a.agi.tn / 4);
    this.initFx = this.fx.initiative;
    this.initMod = this.initAgi + this.initFx;
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
    // cybernetyka: protezy bez zasilania działają jak okaleczone (zasada z s. 105 — klejnoty dają pełną moc)
    const cyberPower = powerState(this.parent);
    const dead = new Set(unpoweredLocs(this.parent, cyberPower));
    this.cyber = { units: cyberPower.units, powered: cyberPower.powered, tracked: cyberPower.tracked, hoursLeft: cyberPower.hoursLeft, offline: [...dead] };
    this.cyborg = isCyborg(this.parent);
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
      loc.fireDt = sum("fireDt", e => hits(e.target, k));
      // Połowa END ran okalecza, END ran w głowie/tułowiu zabija, w kończynie ją odrywa (s. 462)
      const limb = LIMB_LOCS.includes(k);
      const mult = limb ? this.fx.limbMult : 1;
      const plus = limb ? sum("limbWounds", e => hits(e.target, k)) : 0;
      const maimAt = Math.floor((this.woundLimits?.maim || endT) * mult) + plus;
      const crippleAt = (this.woundLimits?.cripple || endT / 2) * mult + plus;
      loc.lethal = loc.wounds > 0 && loc.wounds >= maimAt;
      loc.autoCrippled = loc.wounds > 0 && loc.wounds >= crippleAt;
      loc.offline = dead.has(k);
      loc.isCrippled = loc.crippled || loc.autoCrippled || loc.lethal || loc.offline;
      const vital = k === "head" || k === "torso";
      loc.status = loc.lethal ? (vital ? "dead" : "maimed") : loc.isCrippled ? "crippled" : loc.wounds ? "wounded" : "ok";
      loc.limit = maimAt;
      loc.crippleAt = Math.max(1, Math.ceil(crippleAt));
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
    // Lot (s. 379, 444): wymaga rasowej umiejętności Flight; przeciążenie uziemia, okaleczone skrzydła nie niosą
    const flightless = items.some(i => i.type === "feature" && i.system?.active !== false && /flightless|stubby little/i.test(i.name));
    this.flier = this.skills.flight?.known !== false;
    this.canFly = this.flier && !flightless && !L.wings.isCrippled && this.overload <= 0;
    this.flyNote = !this.flier ? "" : flightless ? "nie lata (wada)" : L.wings.isCrippled ? "skrzydła okaleczone" : this.overload > 0 ? "przeciążenie — uziemiony" : "";
    this.flightLoad = Math.max(0, Math.round(this.weight - 100));

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
    add("skillRoll", "flight", -this.flightLoad, `Ciężar ponad 100 lb (${this.weight} lb)`);
    const otherCrippled = Object.keys(L).filter(k => k !== "horn" && L[k].isCrippled).length;
    add("mfdStep", "magic", -(L.horn.isCrippled ? 2 : 0) - otherCrippled, "Okaleczenia (zaklęcia)");
    add("skillRoll", "sneak", -this.sneakPenalty, `Obciążenie ${this.weight} lb`);
    // Podtrzymywane zaklęcia: −1 krok celności i rzutów INT/AGI za każde (s. 244)
    const held = this.maintained.length;
    if (held) {
      add("basedStep", "int,agi", -held, `Podtrzymywane zaklęcia (${held})`);
      add("mfdStep", "attack", -held, `Podtrzymywane zaklęcia (${held}) — celność`);
    }
    // pojazd: stany stref liczy VehicleData (kabina to nie głowa kucyka)
    this.stateFx = this.parent?.type === "vehicle" ? [] : st;
    // kary do rzutów umiejętności ze stanu widać od razu na karcie (próg MFD 1)
    for (const e of this.stateFx.filter(x => x.type === "skillRoll")) {
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

/**
 * Pojazd (zasady w vehicle-data.mjs): strefy kadłub/kabina/napęd/uzbrojenie na lokacjach systemu,
 * D/W i trafianie wg rozmiaru z tabeli XLI, załoga z odnośnikami do aktorów.
 * Atrybuty i umiejętności pojazdu to „załoga bez imienia” — używane, gdy na stanowisku nie ma postaci.
 */
export class VehicleData extends BaseActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      race: new F.StringField({ initial: "Pojazd" }),
      vehicle: new F.SchemaField({
        kind: new F.StringField({ initial: "ground" }),        // ground | sky | water | rail
        power: new F.StringField({ initial: "pulled" }),       // pulled | motor
        size: new F.StringField({ initial: "4" }),             // wiersz tabeli XLI
        speed: num(30, { min: 0 }),                            // ft na akcję (własny napęd)
        handling: num(0),                                      // kroki MFD sterowania (+ łatwiej)
        pilotSkill: new F.StringField({ initial: "" }),        // umiejętność albo atrybut; "" = wg rodzaju
        crewMax: num(1, { min: 0 }),
        passengers: num(2, { min: 0 }),
        harness: num(2, { min: 0 }),                           // miejsca w zaprzęgu
        cargo: num(500, { min: 0 }),                           // udźwig w lb
        currentSpeed: num(0, { min: 0 }),                      // aktualna prędkość w ft (zderzenia, strzał z ruchu)
        crew: new F.ArrayField(new F.SchemaField({
          uuid: new F.StringField({ initial: "" }),
          name: new F.StringField({ initial: "" }),
          role: new F.StringField({ initial: "passenger" })
        }))
      })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const v = this.vehicle;
    const size = sizeRow(v.size);
    this.isVehicle = true;
    this.size = size;
    this.dmgPerWound = size.dw + (this.woundBonus ?? 0) + (this.fx?.wound ?? 0);
    // wytrzymałość strefy: ile ran ją niszczy (MG może wpisać własną w „Progi”)
    this.structure = this.woundLimits?.maim || defaultStructure(v.size);
    const crip = this.woundLimits?.cripple || Math.max(1, Math.ceil(this.structure / 2));
    const state = {};
    for (const k of VEHICLE_LOCS) {
      const L = this.locations[k];
      L.limit = this.structure;
      L.crippleAt = crip;
      L.lethal = L.wounds > 0 && L.wounds >= this.structure;
      L.autoCrippled = L.wounds > 0 && L.wounds >= crip;
      L.isCrippled = L.crippled || L.autoCrippled || L.lethal;
      L.status = L.lethal ? "destroyed" : L.isCrippled ? "crippled" : L.wounds ? "wounded" : "ok";
      L.statusText = L.lethal ? AREA_STATUS[k] : L.isCrippled ? "USZKODZONA" : L.wounds ? "draśnięta" : "";
      L.effect = L.lethal ? AREA_EFFECTS[k].lethal : L.isCrippled ? AREA_EFFECTS[k].crippled : "";
      state[k] = L.lethal ? "lethal" : L.isCrippled ? "crippled" : "ok";
    }
    this.totalWounds = VEHICLE_LOCS.reduce((t, k) => t + this.locations[k].wounds, 0);
    this.dead = this.locations.torso.lethal;
    this.unconsciousRisk = false;
    this.unconsciousAt = VEHICLE_LOCS.length * this.structure;
    this.areaState = state;

    // sterowanie i strzelanie: kary ze stref
    this.pilotSkill = v.pilotSkill || defaultPilotSkill(v.kind);
    this.pilotSteps = (state.head === "lethal" ? -3 : state.head === "crippled" ? -1 : 0) + (state.wings === "crippled" ? -2 : 0);
    this.gunSteps = state.horn === "crippled" ? -2 : 0;
    this.gunsDown = state.horn === "lethal";

    // załoga: odnośniki do aktorów (prędkość zaprzęgu wg najwolniejszego)
    const find = uuid => { try { return uuid ? globalThis.fromUuidSync?.(uuid) ?? null : null; } catch { return null; } };
    this.crewList = (v.crew ?? []).map((c, i) => ({ ...c, index: i, actor: find(c.uuid) }));
    const pullers = this.crewList.filter(c => c.role === "puller").map(c => ({
      name: c.actor?.name ?? c.name, speed: c.actor?.system?.speed ?? 0, flySpeed: c.actor?.system?.flySpeed ?? 0,
      canFly: !!c.actor?.system?.canFly
    }));
    this.carry = v.cargo;
    this.overload = Math.max(0, Math.round((this.weight - this.carry) * 10) / 10);
    const sp = vehicleSpeed(v, { pullers, propulsion: state.wings, cargo: this.weight, cargoMax: v.cargo });
    this.speed = sp.speed;
    this.speedNotes = sp.notes;
    this.falling = v.kind === "sky" && this.altitude > 0 && (state.wings === "lethal" || (v.power === "pulled" && sp.speed === 0));
    const count = r => this.crewList.filter(c => c.role === r).length;
    this.crewCount = { pilot: count("pilot"), gunner: count("gunner"), puller: count("puller"), passenger: count("passenger") };
    this.crewWarnings = [
      count("pilot") + count("gunner") > v.crewMax ? `załoga ${count("pilot") + count("gunner")}/${v.crewMax}` : "",
      count("passenger") > v.passengers ? `pasażerowie ${count("passenger")}/${v.passengers}` : "",
      count("puller") > v.harness && v.power === "pulled" ? `zaprzęg ${count("puller")}/${v.harness}` : "",
      count("pilot") > 1 ? "więcej niż jeden kierowca — steruje pierwszy" : ""
    ].filter(Boolean);
  }
}

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
      flat: bool(false),                 // obrażenia z bloku bestiariusza — bez dodatkowych premii STR/rangi
      mounted: bool(false),              // zamontowana na siodle bojowym
      armorless: bool(false),            // ignoruje pancerz noszony (Sonic Screech) — liczy się tylko naturalne DT
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
  misc: "Różne", ammo: "Amunicja", food: "Jedzenie i picie", medical: "Leczenie", drug: "Leki i używki", book: "Książki i magazyny",
  pipbuck: "PipBuck", saddle: "Siodło bojowe i dodatki",
  ingredient: "Składniki zebr", potion: "Mikstury i wywary zebr", talisman: "Talizmany i fetysze"
};

export class GearData extends FoeItemData {
  static defineSchema() {
    return {
      category: str("misc"),
      qty: num(1),
      weight: new F.NumberField({ initial: 0 }),
      value: num(0, { min: 0 }),
      ammoType: str(""),
      rarity: num(0, { min: 0, max: 4 }),     // składniki zebr
      usage: str(""),                         // wyrób zebr: Drink / Throw / Apply / Worn
      damage: str(""),                        // wyrób rzucany
      heal: str(""),                          // leczenie: bandage | potion | rejuv | restore | talisman | rejuvTalisman | restoreTalisman
      charges: num(0, { min: 0 }),            // ładunki talizmanu, zawartość rezerwy energii/paliwa
      equipped: bool(false),                  // siodło bojowe i akcesoria: założone
      description: desc()
    };
  }
}
/** Zaklęcie jednorożca / alikorna (rozdz. 5). Koszt strain: 1 niski, 2 średni, 3 wysoki, 4 bardzo wysoki. */
export class SpellData extends FoeItemData {
  static defineSchema() {
    return {
      level: num(1, { min: 0, max: 4 }),
      cost: num(1, { min: 0 }),
      costText: str(""),
      satsCost: num(0, { min: 0 }),           // 0 = nie da się w SATS
      targeted: bool(false),                  // drugi rzut Magic na trafienie (przedział zasięgu 20 ft)
      maintained: bool(false),                // koszt co rundę
      damage: str(""),                        // np. „1d12”, „3d8 + INT”, „4d4 + 2*INT”
      crit: str("x1"),
      ignoreDT: num(0, { min: 0 }),
      levelReq: num(0, { min: 0 }),
      requirements: str(""),
      precursors: str(""),
      precursorFor: str(""),
      learn: num(0, { min: 0, max: 95 }),     // procent nauki (zasada zalecana, s. 246)
      // magia zebr (s. 327–332): receptura zamiast zaklęcia
      tradition: str("unicorn"),              // unicorn | zebra | flight
      usage: str(""),                         // Drink, Throw, Apply, Worn, Cast…
      rarity: num(1, { min: 1, max: 4 }),     // rzadkość składników: 1 niska … 4 bardzo wysoka
      special: str(""),                       // składnik specjalny
      school: str(""),                        // Alchemy, Ritual, Talisman
      // magia lotu (s. 379–394): manewr zamiast zaklęcia
      mfd: str("1"),                          // MFD wykonania
      kind: str("active"),                    // active | passive | variable | special
      tag: str(""),                           // dodge (unik powietrzny) | block
      actions: num(1, { min: 0 }),            // ile akcji zajmuje
      requires: str(""),
      learned: bool(false),                   // opanowany (udany rzut przy nauce z karą 3 kroków)
      attempts: num(0, { min: 0 }),           // zużyte próby nauki (limit = poziom postaci)
      description: desc()
    };
  }
}

export class FeatureData extends FoeItemData {
  static defineSchema() {
    return {
      kind: new F.StringField({ initial: "trait" }),       // trait | hindrance | perk | implant | cyberlimb | other
      active: new F.BooleanField({ initial: true }),
      // cybernetyka (cyber-data.mjs): lokacja protezy, zużycie energii (kończyna 1, tułów 2), talizman naprawczy,
      // wewnętrzny magazyn energii (pojemność i zawartość w punktach), regeneracja (sekundy na ranę)
      cyber: new F.SchemaField({
        loc: new F.StringField({ initial: "" }),
        power: new F.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        talisman: new F.BooleanField({ initial: false }),
        capacity: num(0, { min: 0 }),
        charges: num(0, { min: 0 }),
        regen: num(0, { min: 0 })
      }),
      // efekty mechaniczne — patrz effects.mjs
      effects: effectsField(),
      description: desc()
    };
  }
}
