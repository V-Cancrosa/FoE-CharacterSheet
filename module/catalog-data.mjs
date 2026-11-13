/**
 * Katalog przedmiotów z podręcznika v1.22 (data/catalog.json) → dane przedmiotów Foundry.
 * Czyste funkcje (bez Foundry), żeby dało się je testować.
 */
import { tmap, tdata } from "./i18n.mjs";

const I = "systems/foe-rpg/icons";
export const ICONS = {
  weapon: { smallGuns: `${I}/gun.svg`, energy: `${I}/energy.svg`, bigGuns: `${I}/biggun.svg`, bigGunsAoe: `${I}/biggun.svg`,
    explosive: `${I}/explosive.svg`, melee: `${I}/melee.svg`, unarmed: `${I}/unarmed.svg`, special: `${I}/bow.svg`, default: `${I}/gun.svg` },
  armor: { clothing: `${I}/clothing.svg`, light: `${I}/armor.svg`, medium: `${I}/armor.svg`, heavy: `${I}/armor.svg`,
    helmet: `${I}/helmet.svg`, accessory: `${I}/accessory.svg`, powered: `${I}/power.svg`, default: `${I}/armor.svg` },
  gear: { ammo: `${I}/ammo.svg`, food: `${I}/food.svg`, drug: `${I}/drug.svg`, book: `${I}/book.svg`, pipbuck: `${I}/pipbuck.svg`,
    saddle: `${I}/saddle.svg`, misc: `${I}/misc.svg`, medical: `${I}/medical.svg`, ingredient: `${I}/ingredient.svg`, potion: `${I}/potion.svg`, talisman: `${I}/talisman.svg`,
    default: `${I}/misc.svg` },
  feature: { default: `${I}/feature.svg` },
  spell: { default: `${I}/spell.svg`, zebra: `${I}/recipe.svg`, flight: `${I}/wing.svg` }
};

const OTHER_DEFAULTS = ["perk", "cyber", "cloud", "wing", "recipe", "spell", "creature", "vehicle"].map(n => `${I}/${n}.svg`)
  .concat("icons/svg/item-bag.svg", "icons/svg/mystery-man.svg");

/** Czy obrazek to domyślna ikona (kategorii systemu albo Foundry) — wtedy można ją zastąpić ikoną z listy. */
export function isDefaultIcon(img) {
  if (!img || OTHER_DEFAULTS.includes(img)) return true;
  return Object.values(ICONS).some(set => Object.values(set).includes(img));
}

/** Mapa ikon z list (katalog po loadCatalog): klucz "rodzaj:nazwa" → ścieżka. */
export function iconMap(cat) {
  const m = new Map();
  const add = (kind, list) => { for (const e of list ?? []) if (e.icon) m.set(`${kind}:${e.name}`, e.icon); };
  add("item", [...(cat.weapons ?? []), ...(cat.armor ?? []), ...(cat.gear ?? [])]);
  add("spell", cat.spells); add("recipe", cat.recipes); add("maneuver", cat.maneuvers); add("perk", cat.perks);
  add("cyber", cat.cyber); add("bestiary", cat.bestiary); add("vehicle", cat.vehicles);
  return m;
}

/** Klucz ikony dokumentu (przedmiotu albo aktora) z flag systemu; null — nie pochodzi z listy. */
export function iconKeyOf(doc) {
  const f = doc.flags?.["foe-rpg"] ?? {};
  if (f.perk?.name) return `perk:${f.perk.name}`;
  if (f.cyber) return `cyber:${f.cyber}`;
  if (f.bestiary) return `bestiary:${f.bestiary}`;
  if (f.vehicle) return `vehicle:${f.vehicle}`;
  if (!f.catalog) return null;
  if (doc.type !== "spell") return `item:${f.catalog}`;
  const tr = doc.system?.tradition;
  return `${tr === "zebra" ? "recipe" : tr === "flight" ? "maneuver" : "spell"}:${f.catalog}`;
}

/** Aktualizacje obrazków dla dokumentów z list, które mają jeszcze domyślną ikonę. icons: z iconMap(). */
export function iconUpdates(docs, icons) {
  const out = [];
  for (const d of docs) {
    const icon = icons.get(iconKeyOf(d));
    if (!icon || d.img === icon || !isDefaultIcon(d.img)) continue;
    const u = { _id: d._id ?? d.id, img: icon };
    if (d.prototypeToken && isDefaultIcon(d.prototypeToken.texture?.src)) u["prototypeToken.texture.src"] = icon;
    out.push(u);
  }
  return out;
}

/** Ikona dla przedmiotu danego typu (np. nowego, bez obrazka). */
export function iconFor(type, sys = {}) {
  const set = ICONS[type] ?? ICONS.gear;
  if (type === "weapon") return set[sys.kind] ?? set[{ melee: "melee", unarmed: "unarmed", energy: "energy", bigGuns: "bigGuns", explosives: "explosive" }[sys.skill]] ?? set.default;
  if (type === "armor") return sys.powered ? set.powered : set[sys.category] ?? set.default;
  if (type === "gear") return set[sys.category] ?? set.default;
  if (type === "spell") return sys.tradition === "zebra" ? set.zebra : sys.tradition === "flight" ? set.flight : set.default;
  return set.default;
}

export const WEAPON_KINDS = tmap({
  smallGuns: "Small Guns", energy: "Energy Weapons", bigGuns: "Big Guns", bigGunsAoe: "Big Guns (area)",   // en=pl
  explosive: "Explosives", special: "Bows and thrown", melee: "Melee", unarmed: "Unarmed"   // en=pl
});
export const ARMOR_KINDS = tmap({
  clothing: "kinds|Clothing", light: "kinds|Light", medium: "kinds|Medium", heavy: "kinds|Heavy", helmet: "Helmets and headgear", accessory: "Accessories"
});
export const GEAR_KINDS = tmap({
  ammo: "Ammunition", medical: "Medical", drug: "Chems and drugs", food: "Food and drink", book: "Books and magazines",
  pipbuck: "PipBucks", saddle: "Battle saddles and add-ons", misc: "Miscellaneous"
});

const LOCS = ["head", "torso", "flLeg", "frLeg", "rlLeg", "rrLeg", "wings", "horn"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const notesHtml = notes => (notes ? `<p>${esc(notes)}</p>` : "");
const clean = v => (v && v !== "--" && v !== "None" ? String(v) : "");

/** Specjalne efekty broni odczytane z przypisów podręcznika. */
export function specialsFrom(e) {
  const n = String(e.notes ?? "");
  const has = re => re.test(n);
  const sp = {
    fire: has(/On critical hits, these weapons deal Fire/i) ? "crit"
      : has(/\bFire \(see Special|lit on Fire/) ? "hit" : "",
    electric: has(/\bElectric(ity|al) \(see Special/),
    rads: has(/\bRads \(see Special/),
    // pistolet i karabin Shock (FSW-32, FSW-42B) — w podręczniku bez przypisu, u nas jak broń Shock (zasada domowa)
    shock: has(/\bShock \(see Special/) || /\bShock (Pistol|Rifle)\b/.test(e.name ?? ""),
    poison: has(/\bPoison \(see Special|Poison \(non-magical|Can be poisoned|Poison and Concealable/) ? "other" : "",
    knockdown: has(/knock down the target|Knocks back/i),
    concealable: has(/Concealable/),
    scoped: has(/Scoped \(see Special/),
    silenced: has(/Silenced \(see Special/),
    timed: has(/Timed \(see Special/),
    placed: /\(placed\)/i.test(e.name ?? "")
  };
  // „mogą zachować zaklęcia: ogień, trucizna albo elektryczność” — to wariant broni, nie stały efekt
  if (has(/retain their enchantments/i)) { sp.fire = ""; sp.electric = false; sp.poison = ""; }
  // Broń energetyczna bez ognia dezintegruje (przypis ** s. 192), wyjątki: „never disintegrate”, Shock
  const never = has(/never disintegrate/i);
  if (has(/always disintegrate an enemy on a critical hit/i)) sp.disintegrate = "crit";
  else if (!never && (has(/disintegrat/i) || (e.skill === "energy" && !sp.fire && !sp.shock))) sp.disintegrate = "hit";
  else sp.disintegrate = "";
  return sp;
}

export function weaponItem(e) {
  const aoe = !!e.aoe || e.kind === "explosive" || e.kind === "bigGunsAoe";
  const system = {
    skill: e.skill, kind: e.kind, damage: e.damage || "0", shots: Math.max(1, e.shots || 1), satsCost: e.sats || 0,
    ammo: { value: e.mag || 0, max: e.mag || 0 }, ammoType: e.ammoType || "", reload: e.reload || "",
    range: e.rangeInc ? `${e.rangeInc} ft` : e.range || "", rangeInc: e.rangeInc || 0,
    crit: e.crit || "x1", ignoreDT: e.ignoreDT || 0,
    aoe: { enabled: aoe, splash: clean(e.splash), inc: clean(e.aoeInc), radius: clean(e.radius) },
    specials: specialsFrom(e), consumable: e.kind === "explosive", qty: 1,
    mw: !!e.mw, weight: e.weight || 0, value: e.value || 0, description: notesHtml(tdata(e, "notes"))
  };
  return { name: e.name, type: "weapon", img: e.icon || iconFor("weapon", system), system, flags: { "foe-rpg": { catalog: e.name } } };
}

export function armorItem(e) {
  const cover = Object.fromEntries(LOCS.map(k => [k, (e.cover ?? []).includes(k)]));
  const system = {
    category: e.category, dt: e.dt || 0, cover, equipped: false, powered: !!e.powered,
    effects: (e.effects ?? []).map(x => ({ type: x.type, target: x.target ?? "all", value: Number(x.value) || 0, when: x.when ?? "" })),
    weight: e.weight || 0, value: e.value || 0, description: notesHtml(tdata(e, "notes"))
  };
  return { name: e.name, type: "armor", img: e.icon || iconFor("armor", system), system, flags: { "foe-rpg": { catalog: e.name } } };
}

export function gearItem(e, qty = 1) {
  const system = {
    category: e.category || "misc", qty: Math.max(1, qty), weight: e.weight || 0, value: e.value || 0,
    ammoType: e.ammoType || "", heal: e.heal || "", charges: e.charges || 0, description: notesHtml(tdata(e, "notes"))
  };
  return { name: e.name, type: "gear", img: e.icon || iconFor("gear", system), system, flags: { "foe-rpg": { catalog: e.name } } };
}

/** Dane przedmiotu z wpisu katalogu; tab: weapons | armor | gear. */
export function catalogItem(tab, entry, qty = 1) {
  if (tab === "weapons") { const d = weaponItem(entry); if (d.system.consumable) d.system.qty = Math.max(1, qty); return d; }
  if (tab === "armor") return armorItem(entry);
  return gearItem(entry, qty);
}

/** Ile ma kosztować zakup (cena za sztukę × ilość). */
export const priceOf = (entry, qty = 1) => (Number(entry.value) || 0) * Math.max(1, qty);
