/**
 * Katalog przedmiotów z podręcznika v1.22 (data/catalog.json) → dane przedmiotów Foundry.
 * Czyste funkcje (bez Foundry), żeby dało się je testować.
 */

const I = "systems/foe-rpg/icons";
export const ICONS = {
  weapon: { smallGuns: `${I}/gun.svg`, energy: `${I}/energy.svg`, bigGuns: `${I}/biggun.svg`, bigGunsAoe: `${I}/biggun.svg`,
    explosive: `${I}/explosive.svg`, melee: `${I}/melee.svg`, unarmed: `${I}/unarmed.svg`, special: `${I}/bow.svg`, default: `${I}/gun.svg` },
  armor: { clothing: `${I}/clothing.svg`, light: `${I}/armor.svg`, medium: `${I}/armor.svg`, heavy: `${I}/armor.svg`,
    helmet: `${I}/helmet.svg`, accessory: `${I}/accessory.svg`, powered: `${I}/power.svg`, default: `${I}/armor.svg` },
  gear: { ammo: `${I}/ammo.svg`, food: `${I}/food.svg`, drug: `${I}/drug.svg`, book: `${I}/book.svg`, pipbuck: `${I}/pipbuck.svg`,
    saddle: `${I}/saddle.svg`, misc: `${I}/misc.svg`, default: `${I}/misc.svg` },
  feature: { default: `${I}/feature.svg` }
};

/** Ikona dla przedmiotu danego typu (np. nowego, bez obrazka). */
export function iconFor(type, sys = {}) {
  const set = ICONS[type] ?? ICONS.gear;
  if (type === "weapon") return set[sys.kind] ?? set[{ melee: "melee", unarmed: "unarmed", energy: "energy", bigGuns: "bigGuns", explosives: "explosive" }[sys.skill]] ?? set.default;
  if (type === "armor") return sys.powered ? set.powered : set[sys.category] ?? set.default;
  if (type === "gear") return set[sys.category] ?? set.default;
  return set.default;
}

export const WEAPON_KINDS = {
  smallGuns: "Small Guns", energy: "Energy Weapons", bigGuns: "Big Guns", bigGunsAoe: "Big Guns (obszarowe)",
  explosive: "Materiały wybuchowe", special: "Łuki i rzucane", melee: "Melee", unarmed: "Unarmed"
};
export const ARMOR_KINDS = {
  clothing: "Ubrania", light: "Lekkie", medium: "Średnie", heavy: "Ciężkie", helmet: "Hełmy i nakrycia głowy", accessory: "Akcesoria"
};
export const GEAR_KINDS = {
  ammo: "Amunicja", drug: "Leki i używki", food: "Jedzenie i picie", book: "Książki i magazyny",
  pipbuck: "PipBucki", saddle: "Siodła bojowe i dodatki", misc: "Różne"
};

const LOCS = ["head", "torso", "flLeg", "frLeg", "rlLeg", "rrLeg", "wings", "horn"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const notesHtml = notes => (notes ? `<p>${esc(notes)}</p>` : "");
const clean = v => (v && v !== "--" && v !== "None" ? String(v) : "");

export function weaponItem(e) {
  const aoe = !!e.aoe || e.kind === "explosive" || e.kind === "bigGunsAoe";
  const system = {
    skill: e.skill, kind: e.kind, damage: e.damage || "0", shots: Math.max(1, e.shots || 1), satsCost: e.sats || 0,
    ammo: { value: e.mag || 0, max: e.mag || 0 }, ammoType: e.ammoType || "", reload: e.reload || "",
    range: e.rangeInc ? `${e.rangeInc} ft` : e.range || "", rangeInc: e.rangeInc || 0,
    crit: e.crit || "x1", ignoreDT: e.ignoreDT || 0,
    aoe: { enabled: aoe, splash: clean(e.splash), inc: clean(e.aoeInc), radius: clean(e.radius) },
    consumable: e.kind === "explosive", qty: 1,
    mw: !!e.mw, weight: e.weight || 0, value: e.value || 0, description: notesHtml(e.notes)
  };
  return { name: e.name, type: "weapon", img: iconFor("weapon", system), system, flags: { "foe-rpg": { catalog: e.name } } };
}

export function armorItem(e) {
  const cover = Object.fromEntries(LOCS.map(k => [k, (e.cover ?? []).includes(k)]));
  const system = {
    category: e.category, dt: e.dt || 0, cover, equipped: false, powered: !!e.powered,
    effects: (e.effects ?? []).map(x => ({ type: x.type, target: x.target ?? "all", value: Number(x.value) || 0, when: x.when ?? "" })),
    weight: e.weight || 0, value: e.value || 0, description: notesHtml(e.notes)
  };
  return { name: e.name, type: "armor", img: iconFor("armor", system), system, flags: { "foe-rpg": { catalog: e.name } } };
}

export function gearItem(e, qty = 1) {
  const system = {
    category: e.category || "misc", qty: Math.max(1, qty), weight: e.weight || 0, value: e.value || 0,
    ammoType: e.ammoType || "", description: notesHtml(e.notes)
  };
  return { name: e.name, type: "gear", img: iconFor("gear", system), system, flags: { "foe-rpg": { catalog: e.name } } };
}

/** Dane przedmiotu z wpisu katalogu; tab: weapons | armor | gear. */
export function catalogItem(tab, entry, qty = 1) {
  if (tab === "weapons") { const d = weaponItem(entry); if (d.system.consumable) d.system.qty = Math.max(1, qty); return d; }
  if (tab === "armor") return armorItem(entry);
  return gearItem(entry, qty);
}

/** Ile ma kosztować zakup (cena za sztukę × ilość). */
export const priceOf = (entry, qty = 1) => (Number(entry.value) || 0) * Math.max(1, qty);
