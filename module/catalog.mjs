import { WEAPON_KINDS, ARMOR_KINDS, GEAR_KINDS, catalogItem, priceOf } from "./catalog-data.mjs";
import { SKILLS, LOCATIONS } from "./data.mjs";
import { shortFx } from "./effects.mjs";
import { spellItemData, spellLimits, COST_LABELS } from "./magic.mjs";
import { recipeItemData, RARITY } from "./zebra.mjs";
import { maneuverItemData, maneuverWarnings, isWeatherManeuver, MFD_LABEL } from "./flight.mjs";
import { addPerk, perkStatus, reqView, autoSummary, perkItemData } from "./perks.mjs";
import { importCreature, BESTIARY_KINDS } from "./bestiary.mjs";
import { VEHICLE_KINDS, VEHICLE_POWER, sizeRow } from "./vehicle-data.mjs";
import { canFreeAdd } from "./permissions.mjs";
import { SPECIAL_AMMO, AMMO_GROUPS, ammoGroup, isShotgunAmmo, variantName, specialAmmoOn } from "./ammo-data.mjs";
import { t, tn, isPL, tmap, tdata } from "./i18n.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let cache = null;
/** Katalog z podręcznika (data/catalog.json), wczytywany raz. */
export function loadCatalog() {
  const get = name => fetch(`systems/${game.system.id}/data/${name}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  cache ??= Promise.all([get("catalog.json"), get("spells.json").catch(() => []), get("recipes.json").catch(() => []), get("maneuvers.json").catch(() => []), get("perks.json").catch(() => []), get("bestiary.json").catch(() => []), get("vehicles.json").catch(() => []), get("cyber.json").catch(() => [])])
    .then(([cat, spells, recipes, maneuvers, perks, bestiary, vehicles, cyber]) => ({ ...cat, spells, recipes, maneuvers, perks, bestiary, vehicles, cyber, ammo: Object.values(SPECIAL_AMMO) }))
    .catch(err => { cache = null; throw err; });
  return cache;
}

/** Zakładki katalogu (tworzone przy otwarciu — etykiety w języku gracza). */
const levels = (list, label = l => t("Level {n}", { n: l })) => Object.fromEntries(list.map(l => [`L${l}`, label(l)]));
const TABS = () => ({
  weapons: { label: t("sec|Weapons"), icon: "fa-solid fa-gun", kinds: WEAPON_KINDS, head: [t("col|Type"), t("Damage"), t("Crit."), "SATS", t("Range"), t("Ammo"), "Lb", t("Price")] },
  armor: { label: t("Armor and clothing"), icon: "fa-solid fa-shield-halved", kinds: ARMOR_KINDS, head: [t("col|Type"), "DT", t("Covers"), t("Effects"), "Lb", t("Price")] },
  gear: { label: t("tab|Gear"), icon: "fa-solid fa-suitcase", kinds: GEAR_KINDS, head: [t("col|Type"), t("Description"), "Lb", t("Price")] },
  spells: { label: t("Spells"), icon: "fa-solid fa-hat-wizard", kinds: levels([0, 1, 2, 3, 4]),
    head: [t("Level"), "Strain", "SATS", t("From lvl"), t("Requirements")] },
  recipes: { label: t("Zebra recipes"), icon: "fa-solid fa-flask", kinds: levels([0, 1, 2, 3, 4]),
    head: [t("Level"), t("col|Usage"), t("Ingredients"), t("col|Special"), t("School")] },
  maneuvers: { label: t("Flight maneuvers"), icon: "fa-solid fa-feather",
    kinds: { L0: t("Level 0 (rank < 25)"), ...levels([1, 2, 3, 4], l => t("Level {n} ({r})", { n: l, r: 25 * l })), W: t("kinds|Weather") },
    head: [t("Level"), "MFD", t("Actions"), t("col|Type")] },
  perks: { label: t("Perks"), icon: "fa-solid fa-medal",
    kinds: { A: t("Available to the character"), ...levels([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]) },
    head: [t("Level"), t("Requirements"), t("col|Automatically"), t("Status")] },
  bestiary: { label: t("Bestiary"), icon: "fa-solid fa-dragon", kinds: { S: t("With full statistics"), ...BESTIARY_KINDS },
    head: [t("col|Type"), t("Level"), t("Areas (DT)"), t("Dmg/wound"), t("Statistics")] },
  ammo: { label: t("Special ammo"), icon: "fa-solid fa-bullseye", kinds: AMMO_GROUPS, head: [t("col|Type"), t("Effect"), t("Drawback"), t("Price")] },
  cyber: { label: t("Cybernetics"), icon: "fa-solid fa-microchip", kinds: { limb: t("Cyberlimbs"), implant: t("Implants (table IX)") },
    head: [t("col|Type"), t("Effects"), t("col|Power"), t("Talisman")] },
  vehicles: { label: t("Vehicles"), icon: "fa-solid fa-truck-pickup", kinds: { ...VEHICLE_KINDS, pulled: t("Pulled by ponies"), motor: t("Self-propelled") },
    head: [t("col|Type"), t("Size (L/W)"), t("Speed"), t("Crew"), t("Hull DT"), t("col|Weapon")] }
});
const PERK_STATUS = tmap({ ok: "✓ available", unknown: "? check", fail: "✗", taken: "■ has it" });
const KIND_LABEL = tmap({ active: "", passive: "man|passive", variable: "man|variable MFD", special: "man|special" });

const SHORT_ATTR = { str: "STR", per: "PER", end: "END", cha: "CHA", int: "INT", agi: "AGI", luck: "LCK" };
const fxLabels = () => ({
  ...SHORT_ATTR, ...Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label.split(" / ").pop()])), ...LOCATIONS,
  all: t("fx|all"), attack: t("fx|attacks"), melee: t("fx|melee"), ranged: t("fx|ranged")
});

function coverText(list = []) {
  const s = new Set(list);
  if (!s.size) return "—";
  const legs = ["flLeg", "frLeg", "rlLeg", "rrLeg"].filter(k => s.has(k)).length;
  const parts = [];
  if (s.has("head")) parts.push(t("loc|head"));
  if (s.has("torso")) parts.push(t("loc|torso"));
  if (legs === 4) parts.push(t("4 legs"));
  else if (s.has("flLeg") && s.has("frLeg")) parts.push(t("front legs"));
  else if (s.has("rlLeg") && s.has("rrLeg")) parts.push(t("hind legs"));
  else if (legs) parts.push(tn(legs, "{n} leg", "{n} legs"));
  if (s.has("wings")) parts.push(t("loc|wings"));
  if (s.has("horn")) parts.push(t("loc|horn"));
  return parts.join(", ");
}

function rowOf(tab, e, i, actor = null) {
  if (tab === "spells") {
    const req = e.requirements || "—";
    return {
      i, name: e.name, notes: e.desc, search: e.name.toLowerCase(), kind: `L${e.level}`, img: "systems/foe-rpg/icons/spell.svg", qty: 0, noBuy: true,
      cols: [e.level, COST_LABELS[e.cost] ?? e.costText, e.sats ? `${e.sats} AP` : "—", e.levelReq || "—", req.length > 70 ? `${req.slice(0, 68)}…` : req]
    };
  }
  if (tab === "recipes") {
    return {
      i, name: e.name, notes: e.desc, search: e.name.toLowerCase(), kind: `L${e.level}`, img: "systems/foe-rpg/icons/recipe.svg", qty: 0, noBuy: true,
      cols: [e.level, e.usage || "—", RARITY[e.rarity] ?? e.rarityText ?? "—", e.special || "—", e.school || "—"]
    };
  }
  if (tab === "bestiary") {
    const areas = (e.ar ?? []).map(([l, dt]) => `${l} ${dt}`).join(", ");
    return {
      i, name: e.name, notes: e.desc, search: `${e.name} ${e.group ?? ""}`.toLowerCase(), kind: `${e.kind}${e.a ? " S" : ""}`,
      img: "systems/foe-rpg/icons/creature.svg", qty: 0, noBuy: true,
      cols: [BESTIARY_KINDS[e.kind] ?? e.kind, e.lvl ?? "—", areas ? (areas.length > 60 ? `${areas.slice(0, 58)}…` : areas) : "—", e.dw ?? "—", e.a ? "✓" : t("description only")]
    };
  }
  if (tab === "ammo") {
    return {
      i, name: e.label, notes: `${e.effect}. ${t("Drawback: {d}.", { d: e.downside })}`, search: e.label.toLowerCase(), kind: e.group, img: "systems/foe-rpg/icons/ammo.svg", qty: 10,
      cols: [AMMO_GROUPS[e.group] + (e.shotgun ? ` ${t("(shotguns)")}` : ""), e.effect, e.downside, `×${isPL() ? String(e.cost).replace(".", ",") : e.cost}`]
    };
  }
  if (tab === "cyber") {
    const labels = fxLabels();
    const fxt = (e.fx ?? []).map(([type, target, value, when]) => shortFx({ type, target: target === "@loc" ? t("cyberlimb location") : target === "@attr" ? t("chosen") : target, value, when }, labels)).join(", ");
    return {
      i, name: tdata(e, "name"), notes: tdata(e, "desc"), search: `${e.name} ${e.name_pl ?? ""}`.toLowerCase(), kind: e.kind, img: "systems/foe-rpg/icons/cyber.svg", qty: 0, noBuy: true,
      cols: [e.kind === "limb" ? t("cyberlimb") : "implant", fxt || t("description"), e.power ? `${e.power} ${t("units")}` : "—", e.talisman ? "✓" : "—"]
    };
  }
  if (tab === "vehicles") {
    const size = sizeRow(e.size);
    return {
      i, name: tdata(e, "name"), notes: tdata(e, "desc"), search: `${e.name} ${e.name_pl ?? ""}`.toLowerCase(), kind: `${e.kind} ${e.power}`,
      img: "systems/foe-rpg/icons/vehicle.svg", qty: 0, noBuy: true,
      cols: [`${VEHICLE_KINDS[e.kind] ?? e.kind}, ${(VEHICLE_POWER[e.power] ?? e.power).split(" (")[0].toLowerCase()}`, `×${size.key} (${size.dw})`,
        e.power === "pulled" ? t("speed|pulled") : `${e.speed} ft`, `${e.crewMax}${e.passengers ? ` + ${e.passengers}` : ""}`, e.dt?.torso ?? 0, (e.weapons ?? []).join(", ") || "—"]
    };
  }
  if (tab === "perks") {
    const st = actor ? perkStatus(actor, e, reqView(actor)) : null;
    const req = e.requires || "—";
    const auto = autoSummary(e.name, fxLabels());
    return {
      i, name: e.ranks > 1 ? `${e.name} (×${e.ranks})` : e.name, notes: e.desc, search: `${e.name} ${e.alt}`.toLowerCase(),
      kind: `L${e.level}${st?.status === "ok" ? " A" : ""}`, img: "systems/foe-rpg/icons/perk.svg", qty: 0, noBuy: true,
      cols: [e.level, req.length > 60 ? `${req.slice(0, 58)}…` : req, auto ? (auto.length > 60 ? `${auto.slice(0, 58)}…` : auto) : "—",
        st ? `${PERK_STATUS[st.status]}${st.status === "fail" && st.missing.length ? ` ${st.missing.join(", ")}` : ""}` : "—"]
    };
  }
  if (tab === "maneuvers") {
    const weather = isWeatherManeuver(e.name);
    return {
      i, name: e.name, notes: e.desc, search: e.name.toLowerCase(), kind: weather ? `L${e.level} W` : `L${e.level}`,
      img: `systems/foe-rpg/icons/${weather ? "cloud" : "wing"}.svg`, qty: 0, noBuy: true,
      cols: [e.level, e.mfd ? MFD_LABEL[e.mfd] ?? e.mfd : "—", e.kind === "passive" ? "—" : e.actions,
        [KIND_LABEL[e.kind], e.tag === "dodge" ? t("aerial dodge") : e.tag === "block" ? t("aerial block") : "", weather ? t("man|weather") : "", e.requires ? e.requires.replace(/^Requires/i, t("man|requires")) : ""].filter(Boolean).join(", ") || "—"]
    };
  }
  const base = { i, name: e.name, notes: tdata(e, "notes") ?? "", search: e.name.toLowerCase(), price: e.value ?? 0 };
  if (tab === "weapons") {
    const d = catalogItem("weapons", e);
    const ammo = e.ammoType ? `${e.ammoType}${e.mag ? ` ×${e.mag}` : ""}` : "—";
    return {
      ...base, img: d.img, kind: e.kind, qty: d.system.consumable ? 1 : 0,
      cols: [WEAPON_KINDS[e.kind] ?? e.kind, `${e.damage}${e.shots > 1 ? `/${e.shots}` : ""}`, e.crit, e.sats,
        e.rangeInc ? `${e.rangeInc} ft` : e.range || (["melee", "unarmed"].includes(e.skill) ? t("fx|melee") : "—"), ammo, e.weight, e.value]
    };
  }
  if (tab === "armor") {
    const d = catalogItem("armor", e);
    return {
      ...base, img: d.img, kind: e.category, qty: 0,
      cols: [ARMOR_KINDS[e.category] ?? e.category, e.dt, coverText(e.cover), (e.effects ?? []).map(x => shortFx(x, fxLabels())).join(", ") || "—", e.weight, e.value]
    };
  }
  const d = catalogItem("gear", e);
  const desc = String(tdata(e, "notes") ?? "");
  return {
    ...base, img: d.img, kind: e.category, qty: e.category === "ammo" ? 10 : 1,
    cols: [GEAR_KINDS[e.category] ?? e.category, desc.length > 90 ? `${desc.slice(0, 88)}…` : desc || "—", e.weight, e.value]
  };
}

/** Dodaje przedmiot do aktora; ekwipunek i granaty o tej samej nazwie łączą się w stos. */
export async function addItemToActor(actor, data, qty = 1) {
  const stack = data.type === "gear" || (data.type === "weapon" && data.system?.consumable);
  if (stack) {
    const same = actor.items.find(i => i.type === data.type && i.name === data.name);
    if (same) {
      await same.update({ "system.qty": (Number(same.system.qty) || 0) + qty });
      return same;
    }
  }
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  return item;
}

/**
 * Okno katalogu: broń, pancerze i ekwipunek z podręcznika.
 * Z karty postaci dodaje (albo kupuje za kapsle) przedmioty postaci; bez postaci tworzy przedmioty świata.
 */
export class FoeCatalog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "foe-catalog-{id}",
    classes: ["foe-rpg", "foe-catalog"],
    window: { title: "Item catalog", icon: "fa-solid fa-boxes-stacked", resizable: true },
    position: { width: 940, height: 720 },
    actions: {
      setTab: FoeCatalog.#onSetTab,
      add: FoeCatalog.#onAdd,
      buy: FoeCatalog.#onBuy
    }
  };

  static PARTS = { body: { template: "systems/foe-rpg/templates/catalog.hbs", scrollable: [".cat-scroll"] } };

  constructor({ actor = null, tab = "weapons", ...options } = {}) {
    super(options);
    this.actor = actor;
    this.tab = TABS()[tab] ? tab : "weapons";
    this.kind = "";
    this.search = "";
  }

  get title() {
    return this.actor ? t("Catalog: {name}", { name: this.actor.name }) : t("Item catalog (world)");
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    let data;
    try { data = await loadCatalog(); }
    catch (err) { return { ...ctx, error: t("Couldn't load the catalog ({e}).", { e: err.message }) }; }
    const tabs = TABS();
    const def = tabs[this.tab];
    const list = data[this.tab] ?? [];
    const rows = list.map((e, i) => rowOf(this.tab, e, i, this.actor));
    const count = k => rows.filter(r => String(r.kind).split(" ").includes(k)).length;
    return {
      ...ctx,
      tabs: Object.entries(tabs).map(([id, tb]) => ({ id, label: tb.label, icon: tb.icon, count: data[id]?.length ?? 0, active: id === this.tab })),
      kinds: Object.entries(def.kinds).map(([v, l]) => ({ v, label: l, n: count(v), sel: v === this.kind })).filter(k => k.n),
      head: def.head,
      rows,
      search: this.search,
      actor: this.actor,
      caps: this.actor?.system.caps ?? 0,
      isGear: this.tab === "gear",
      isBestiary: this.tab === "bestiary",
      isVehicles: this.tab === "vehicles",
      isCyber: this.tab === "cyber",
      isAmmo: this.tab === "ammo", ammoOff: this.tab === "ammo" && !specialAmmoOn(),
      // gracz: „Dodaj” za darmo tylko za zgodą MG (ustawienie świata); kupuje za kapsle
      lockAdd: !!this.actor && !canFreeAdd(this.tab)
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    const search = root.querySelector("input[name=search]");
    const kind = root.querySelector("select[name=kind]");
    const apply = () => {
      const q = (search?.value ?? "").trim().toLowerCase();
      let shown = 0, all = 0;
      for (const tr of root.querySelectorAll("tr[data-i]")) {
        all++;
        const ok = (!this.kind || tr.dataset.kind.split(" ").includes(this.kind)) && (!q || tr.dataset.name.includes(q));
        tr.hidden = !ok;
        if (ok) shown++;
      }
      const c = root.querySelector(".cat-count");
      if (c) c.textContent = `${shown} / ${all}`;
    };
    search?.addEventListener("input", () => { this.search = search.value; apply(); });
    kind?.addEventListener("change", () => { this.kind = kind.value; apply(); });
    apply();
  }

  static #onSetTab(event, target) {
    if (target.dataset.tab === this.tab) return;
    this.tab = target.dataset.tab;
    this.kind = "";
    this.render();
  }

  static #onAdd(event, target) { return this.#acquire(target, false); }
  static #onBuy(event, target) { return this.#acquire(target, true); }

  /** Zaklęcie do postaci: ostrzega o braku magii, wymaganym poziomie i limicie zaklęć (s. 246), ale decyzja należy do MG. */
  async #learnSpell(entry, itemData) {
    const a = this.actor;
    if (a.items.some(i => i.type === "spell" && i.name === entry.name)) return ui.notifications.info(t("{name} already knows {what}.", { name: a.name, what: entry.name }));
    const warns = [];
    if (!a.system.caster) warns.push(t("the character doesn't cast unicorn spells"));
    if (entry.levelReq && a.system.level < entry.levelReq) warns.push(t("requires level {n}", { n: entry.levelReq }));
    const lim = spellLimits(a)[entry.level];
    const have = a.items.filter(i => i.type === "spell" && (i.system.tradition ?? "unicorn") === "unicorn" && i.system.level === entry.level).length;
    if (lim !== undefined && have >= lim) warns.push(t("level {l} spell limit: {n}", { l: entry.level, n: lim }));
    await a.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications[warns.length ? "warn" : "info"](warns.length ? t("{name}: spell {what} added (note: {w}).", { name: a.name, what: entry.name, w: warns.join("; ") }) : t("{name}: spell {what} added.", { name: a.name, what: entry.name }));
  }

  /** Receptura zebr: ostrzega, gdy postać nie jest zebrą-szamanem albo nie ma wymaganego poziomu. */
  async #learnRecipe(entry, itemData) {
    const a = this.actor;
    if (a.items.some(i => i.type === "spell" && i.name === entry.name)) return ui.notifications.info(t("{name} already knows {what}.", { name: a.name, what: entry.name }));
    const warns = [];
    if (!a.system.zebraMage) warns.push(t("the character isn't a zebra who knows magic"));
    if (entry.levelReq && a.system.level < entry.levelReq) warns.push(t("requires level {n}", { n: entry.levelReq }));
    await a.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications[warns.length ? "warn" : "info"](warns.length ? t("{name}: recipe {what} added (note: {w}).", { name: a.name, what: entry.name, w: warns.join("; ") }) : t("{name}: recipe {what} added.", { name: a.name, what: entry.name }));
  }

  /** Manewr lotu: ostrzega o randze, limitach (ranga/10, AGI) i wymaganiach. */
  async #learnManeuver(entry, itemData) {
    const a = this.actor;
    if (a.items.some(i => i.type === "spell" && i.name === entry.name)) return ui.notifications.info(t("{name} already knows {what}.", { name: a.name, what: entry.name }));
    const warns = maneuverWarnings(a, entry);
    await a.createEmbeddedDocuments("Item", [itemData]);
    const learn = itemData.system.learned ? "" : ` ${t("Before you can use it without a penalty, you have to master it (a roll with a 3-step penalty).")}`;
    ui.notifications[warns.length ? "warn" : "info"]((warns.length ? t("{name}: maneuver {what} added (note: {w}).", { name: a.name, what: entry.name, w: warns.join("; ") }) : t("{name}: maneuver {what} added.", { name: a.name, what: entry.name })) + learn);
  }

  /** Amunicja specjalna: wybór kalibru, cena = cena zwykłej × mnożnik (s. 202–203). */
  async #acquireAmmo(entry, data, qty, buy) {
    const calibers = data.gear.filter(g => g.category === "ammo" && ammoGroup(g.ammoType) === entry.group && (!entry.shotgun || isShotgunAmmo(g.ammoType)));
    if (!calibers.length) return ui.notifications.warn(t("No matching ammo in the catalog."));
    const own = new Set((this.actor?.items ?? []).filter(i => i.type === "weapon").map(i => i.system.ammoType));
    const def = calibers.find(g => own.has(g.ammoType)) ?? calibers[0];
    const pick = await foundry.applications.api.DialogV2.wait({
      window: { title: entry.label }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
      content: `<div class="foe-dialog"><label class="atk-row">${t("Caliber")} <select name="cal">${calibers.map(g => `<option value="${g.name}" ${g === def ? "selected" : ""}>${g.name}${own.has(g.ammoType) ? " ★" : ""} — ${t("{n} caps each", { n: Math.max(1, Math.round((g.value || 0) * entry.cost)) })}</option>`).join("")}</select></label>
        <label class="atk-row">${t("Quantity")} <input type="number" name="qty" value="${qty}" min="1"></label>
        <p class="hint">${t("★ — the caliber of this character's weapon.")} ${entry.effect}; ${t("drawback: {d}.", { d: entry.downside })}</p></div>`,
      buttons: [{ action: "ok", label: buy ? t("Buy") : t("Add"), icon: "fa-solid fa-check", default: true,
        callback: (ev, btn) => ({ cal: btn.form.elements.cal.value, qty: Math.max(1, Math.floor(Number(btn.form.elements.qty.value) || 1)) }) }]
    });
    if (!pick) return;
    const base = calibers.find(g => g.name === pick.cal);
    const key = Object.keys(SPECIAL_AMMO).find(k => SPECIAL_AMMO[k] === entry);
    const unit = Math.max(1, Math.round((base.value || 0) * entry.cost));
    const itemData = { ...catalogItem("gear", base, pick.qty), name: variantName(base.name, entry) };
    itemData.system = { ...itemData.system, variant: key, value: unit };
    itemData.flags = { "foe-rpg": { catalog: base.name, variant: key } };
    if (!this.actor) {
      if (!game.user.can("ITEM_CREATE")) return ui.notifications.warn(t("You don't have permission to create items."));
      await Item.implementation.create(itemData);
      return ui.notifications.info(t("Added to the world items: {name}.", { name: itemData.name }));
    }
    if (!this.actor.isOwner) return ui.notifications.warn(t("You don't own this character."));
    if (buy) {
      const price = unit * pick.qty;
      const caps = Number(this.actor.system.caps) || 0;
      if (caps < price) return ui.notifications.warn(t("Not enough caps: {what} costs {price} and you have {caps}.", { what: `${itemData.name} ×${pick.qty}`, price, caps }));
      await this.actor.update({ "system.caps": caps - price });
    }
    await addItemToActor(this.actor, itemData, pick.qty);
    ui.notifications.info((buy ? t("{name}: bought {what} for {caps}.", { name: this.actor.name, what: `${itemData.name} ×${pick.qty}`, caps: tn(unit * pick.qty, "{n} cap", "{n} caps") }) : t("{name}: added {what}.", { name: this.actor.name, what: `${itemData.name} ×${pick.qty}` })) + (specialAmmoOn() ? "" : ` ${t("Note: the “Special ammo” rule is off in the world settings.")}`));
    this.render();
  }

  async #acquire(target, buy) {
    const row = target.closest("[data-i]");
    const data = await loadCatalog();
    const entry = data[this.tab]?.[Number(row?.dataset.i)];
    if (!entry) return;
    const qty = Math.max(1, Math.floor(Number(row.querySelector("input[name=qty]")?.value) || 1));
    const itemData = this.tab === "spells" ? spellItemData(entry) : this.tab === "recipes" ? recipeItemData(entry) : this.tab === "maneuvers" ? maneuverItemData(entry) : this.tab === "perks" ? perkItemData(entry) : ["bestiary", "vehicles", "cyber", "ammo"].includes(this.tab) ? null : catalogItem(this.tab, entry, qty);
    const what = qty > 1 ? `${entry.name} ×${qty}` : entry.name;
    if (!buy && this.actor && !canFreeAdd(this.tab)) return ui.notifications.warn(t("Only the GM adds for free — buy for caps or ask the GM."));

    if (this.tab === "ammo") return this.#acquireAmmo(entry, data, qty, buy);
    if (this.tab === "cyber") {
      if (!this.actor) {
        if (!game.user.can("ITEM_CREATE")) return ui.notifications.warn(t("You don't have permission to create items."));
        const { cyberItemData } = await import("./cyber-data.mjs");
        const item = await Item.implementation.create(cyberItemData(entry, { loc: "flLeg", attr: "str" }));
        return ui.notifications.info(t("Added to the world items: {name} (you can change the location and attribute in the item).", { name: item?.name ?? entry.name }));
      }
      const { installCyber } = await import("./cyber.mjs");
      return installCyber(this.actor, entry);
    }
    if (this.tab === "vehicles") {
      const { importVehicle } = await import("./vehicle.mjs");
      return importVehicle(entry, data);
    }
    if (this.tab === "bestiary") {
      const { spellItemData } = await import("./magic.mjs");
      const { maneuverItemData } = await import("./flight.mjs");
      return importCreature(entry, { catalog: data, spells: data.spells ?? [], maneuvers: data.maneuvers ?? [], spellItemData, maneuverItemData });
    }
    if (this.tab === "perks" && this.actor) {
      if (!this.actor.isOwner) return ui.notifications.warn(t("You don't own this character."));
      const item = await addPerk(this.actor, entry);
      if (item) this.render();
      return;
    }
    if (!this.actor) {
      if (!game.user.can("ITEM_CREATE")) return ui.notifications.warn(t("You don't have permission to create items."));
      const item = await Item.implementation.create(itemData);
      return ui.notifications.info(t("Added to the world items: {name}.", { name: item?.name ?? entry.name }));
    }
    if (!this.actor.isOwner) return ui.notifications.warn(t("You don't own this character."));
    if (this.tab === "spells") return this.#learnSpell(entry, itemData);
    if (this.tab === "recipes") return this.#learnRecipe(entry, itemData);
    if (this.tab === "maneuvers") return this.#learnManeuver(entry, itemData);

    if (buy) {
      const price = priceOf(entry, qty);
      const caps = Number(this.actor.system.caps) || 0;
      if (caps < price) return ui.notifications.warn(t("Not enough caps: {what} costs {price} and you have {caps}.", { what, price, caps }));
      await this.actor.update({ "system.caps": caps - price });
      const el = this.element.querySelector(".cat-caps b");
      if (el) el.textContent = this.actor.system.caps;
    }
    await addItemToActor(this.actor, itemData, qty);
    ui.notifications.info(buy ? t("{name}: bought {what} for {caps}.", { name: this.actor.name, what, caps: tn(priceOf(entry, qty), "{n} cap", "{n} caps") }) : t("{name}: added {what}.", { name: this.actor.name, what }));
  }
}

/** Otwiera katalog dla postaci (jedno okno na postać) albo dla świata. */
export function openCatalog(actor = null, tab = "weapons") {
  const open = [...foundry.applications.instances.values()].find(a => a instanceof FoeCatalog && a.actor === actor);
  if (open) {
    if (open.tab !== tab) { open.tab = tab; open.kind = ""; }
    open.bringToFront?.();
    return open.render({ force: true });
  }
  return new FoeCatalog({ actor, tab }).render({ force: true });
}

/** Przycisk „Katalog FoE” w zakładce przedmiotów (dla osób, które mogą tworzyć przedmioty). */
export function registerCatalogButton() {
  Hooks.on("renderItemDirectory", (app, html) => {
    if (!game.user.can("ITEM_CREATE")) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-catalog-open")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "foe-catalog-open";
    btn.innerHTML = `<i class="fa-solid fa-boxes-stacked"></i> ${t("FoE Catalog")}`;
    btn.addEventListener("click", () => openCatalog(null, "weapons"));
    const bar = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
    (bar ?? root).append(btn);
  });
  // Bestiariusz w zakładce aktorów (MG): potwory i NPC z podręcznika
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.can("ACTOR_CREATE")) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-bestiary-open")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "foe-catalog-open foe-bestiary-open";
    btn.innerHTML = `<i class="fa-solid fa-dragon"></i> ${t("FoE Bestiary")}`;
    btn.addEventListener("click", () => openCatalog(null, "bestiary"));
    const veh = document.createElement("button");
    veh.type = "button";
    veh.className = "foe-catalog-open foe-vehicles-open";
    veh.innerHTML = `<i class="fa-solid fa-truck-pickup"></i> ${t("FoE Vehicles")}`;
    veh.addEventListener("click", () => openCatalog(null, "vehicles"));
    const bar = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
    (bar ?? root).append(btn, veh);
  });
}
