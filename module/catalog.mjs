import { WEAPON_KINDS, ARMOR_KINDS, GEAR_KINDS, catalogItem, priceOf } from "./catalog-data.mjs";
import { SKILLS, LOCATIONS } from "./data.mjs";
import { shortFx } from "./effects.mjs";
import { spellItemData, spellLimits, COST_LABELS } from "./magic.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let cache = null;
/** Katalog z podręcznika (data/catalog.json), wczytywany raz. */
export function loadCatalog() {
  const get = name => fetch(`systems/${game.system.id}/data/${name}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  cache ??= Promise.all([get("catalog.json"), get("spells.json").catch(() => [])])
    .then(([cat, spells]) => ({ ...cat, spells }))
    .catch(err => { cache = null; throw err; });
  return cache;
}

const TABS = {
  weapons: { label: "Broń", icon: "fa-solid fa-gun", kinds: WEAPON_KINDS, head: ["Rodzaj", "Obrażenia", "Kryt.", "SATS", "Zasięg", "Amunicja", "Lb", "Cena"] },
  armor: { label: "Pancerze i ubrania", icon: "fa-solid fa-shield-halved", kinds: ARMOR_KINDS, head: ["Rodzaj", "DT", "Osłania", "Efekty", "Lb", "Cena"] },
  gear: { label: "Ekwipunek", icon: "fa-solid fa-suitcase", kinds: GEAR_KINDS, head: ["Rodzaj", "Opis", "Lb", "Cena"] },
  spells: { label: "Zaklęcia", icon: "fa-solid fa-hat-wizard", kinds: { L0: "Poziom 0", L1: "Poziom 1", L2: "Poziom 2", L3: "Poziom 3", L4: "Poziom 4" },
    head: ["Poziom", "Strain", "SATS", "Od poz.", "Wymagania"] }
};

const SHORT_ATTR = { str: "STR", per: "PER", end: "END", cha: "CHA", int: "INT", agi: "AGI", luck: "LCK" };
const FX_LABELS = {
  ...SHORT_ATTR, ...Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label.split(" / ").pop()])), ...LOCATIONS,
  all: "wszystko", attack: "ataki", melee: "wręcz", ranged: "dystans"
};

function coverText(list = []) {
  const s = new Set(list);
  if (!s.size) return "—";
  const legs = ["flLeg", "frLeg", "rlLeg", "rrLeg"].filter(k => s.has(k)).length;
  const parts = [];
  if (s.has("head")) parts.push("głowa");
  if (s.has("torso")) parts.push("tułów");
  if (legs === 4) parts.push("4 nogi");
  else if (s.has("flLeg") && s.has("frLeg")) parts.push("przednie nogi");
  else if (s.has("rlLeg") && s.has("rrLeg")) parts.push("tylne nogi");
  else if (legs) parts.push(`${legs} nogi`);
  if (s.has("wings")) parts.push("skrzydła");
  if (s.has("horn")) parts.push("róg");
  return parts.join(", ");
}

function rowOf(tab, e, i) {
  if (tab === "spells") {
    const req = e.requirements || "—";
    return {
      i, name: e.name, notes: e.desc, search: e.name.toLowerCase(), kind: `L${e.level}`, img: "systems/foe-rpg/icons/spell.svg", qty: 0, noBuy: true,
      cols: [e.level, COST_LABELS[e.cost] ?? e.costText, e.sats ? `${e.sats} AP` : "—", e.levelReq || "—", req.length > 70 ? `${req.slice(0, 68)}…` : req]
    };
  }
  const base = { i, name: e.name, notes: e.notes ?? "", search: e.name.toLowerCase(), price: e.value ?? 0 };
  if (tab === "weapons") {
    const d = catalogItem("weapons", e);
    const ammo = e.ammoType ? `${e.ammoType}${e.mag ? ` ×${e.mag}` : ""}` : "—";
    return {
      ...base, img: d.img, kind: e.kind, qty: d.system.consumable ? 1 : 0,
      cols: [WEAPON_KINDS[e.kind] ?? e.kind, `${e.damage}${e.shots > 1 ? `/${e.shots}` : ""}`, e.crit, e.sats,
        e.rangeInc ? `${e.rangeInc} ft` : e.range, ammo, e.weight, e.value]
    };
  }
  if (tab === "armor") {
    const d = catalogItem("armor", e);
    return {
      ...base, img: d.img, kind: e.category, qty: 0,
      cols: [ARMOR_KINDS[e.category] ?? e.category, e.dt, coverText(e.cover), (e.effects ?? []).map(x => shortFx(x, FX_LABELS)).join(", ") || "—", e.weight, e.value]
    };
  }
  const d = catalogItem("gear", e);
  const desc = String(e.notes ?? "");
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
    window: { title: "Katalog przedmiotów", icon: "fa-solid fa-boxes-stacked", resizable: true },
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
    this.tab = TABS[tab] ? tab : "weapons";
    this.kind = "";
    this.search = "";
  }

  get title() {
    return this.actor ? `Katalog: ${this.actor.name}` : "Katalog przedmiotów (świat)";
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    let data;
    try { data = await loadCatalog(); }
    catch (err) { return { ...ctx, error: `Nie udało się wczytać katalogu (${err.message}).` }; }
    const def = TABS[this.tab];
    const list = data[this.tab] ?? [];
    const count = k => list.filter(e => (e.kind ?? e.category) === k).length;
    return {
      ...ctx,
      tabs: Object.entries(TABS).map(([id, t]) => ({ id, label: t.label, icon: t.icon, count: data[id]?.length ?? 0, active: id === this.tab })),
      kinds: Object.entries(def.kinds).map(([v, l]) => ({ v, label: l, n: count(v), sel: v === this.kind })).filter(k => k.n),
      head: def.head,
      rows: list.map((e, i) => rowOf(this.tab, e, i)),
      search: this.search,
      actor: this.actor,
      caps: this.actor?.system.caps ?? 0,
      isGear: this.tab === "gear"
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
        const ok = (!this.kind || tr.dataset.kind === this.kind) && (!q || tr.dataset.name.includes(q));
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
    if (a.items.some(i => i.type === "spell" && i.name === entry.name)) return ui.notifications.info(`${a.name} zna już ${entry.name}.`);
    const warns = [];
    if (!a.system.caster) warns.push("postać nie rzuca zaklęć jednorożców");
    if (entry.levelReq && a.system.level < entry.levelReq) warns.push(`wymaga poziomu ${entry.levelReq}`);
    const lim = spellLimits(a)[entry.level];
    const have = a.items.filter(i => i.type === "spell" && i.system.level === entry.level).length;
    if (lim !== undefined && have >= lim) warns.push(`limit zaklęć poziomu ${entry.level}: ${lim}`);
    await a.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications[warns.length ? "warn" : "info"](`${a.name}: dodano zaklęcie ${entry.name}${warns.length ? ` (uwaga: ${warns.join("; ")})` : ""}.`);
  }

  async #acquire(target, buy) {
    const row = target.closest("[data-i]");
    const data = await loadCatalog();
    const entry = data[this.tab]?.[Number(row?.dataset.i)];
    if (!entry) return;
    const qty = Math.max(1, Math.floor(Number(row.querySelector("input[name=qty]")?.value) || 1));
    const itemData = this.tab === "spells" ? spellItemData(entry) : catalogItem(this.tab, entry, qty);
    const what = qty > 1 ? `${entry.name} ×${qty}` : entry.name;

    if (!this.actor) {
      if (!game.user.can("ITEM_CREATE")) return ui.notifications.warn("Nie masz uprawnień do tworzenia przedmiotów.");
      const item = await Item.implementation.create(itemData);
      return ui.notifications.info(`Dodano do przedmiotów świata: ${item?.name ?? entry.name}.`);
    }
    if (!this.actor.isOwner) return ui.notifications.warn("Nie jesteś właścicielem tej postaci.");
    if (this.tab === "spells") return this.#learnSpell(entry, itemData);

    if (buy) {
      const price = priceOf(entry, qty);
      const caps = Number(this.actor.system.caps) || 0;
      if (caps < price) return ui.notifications.warn(`Za mało kapsli: ${what} kosztuje ${price}, a masz ${caps}.`);
      await this.actor.update({ "system.caps": caps - price });
      const el = this.element.querySelector(".cat-caps b");
      if (el) el.textContent = this.actor.system.caps;
    }
    await addItemToActor(this.actor, itemData, qty);
    ui.notifications.info(`${this.actor.name}: ${buy ? "kupiono" : "dodano"} ${what}${buy ? ` za ${priceOf(entry, qty)} kapsli` : ""}.`);
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
    btn.innerHTML = `<i class="fa-solid fa-boxes-stacked"></i> Katalog FoE`;
    btn.addEventListener("click", () => openCatalog(null, "weapons"));
    const bar = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
    (bar ?? root).append(btn);
  });
}
