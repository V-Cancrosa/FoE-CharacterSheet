/**
 * Tabele losowe w Foundry: przycisk „Tabele FoE” w zakładce tabel (MG) tworzy albo aktualizuje folder z tabelami
 * z podręcznika i tabelami łupów; wynik każdej tabeli (także zrobionej ręcznie) wygląda na czacie jak karta PipBucka,
 * a przy stworach, pojazdach i przedmiotach pojawiają się przyciski. Dane: tables-data.mjs, data/tables.json.
 */
import { allTableDocs, matchNames } from "./tables-data.mjs";
import { loadCatalog, addItemToActor } from "./catalog.mjs";
import { importCreature } from "./bestiary.mjs";
import { weaponItem, armorItem, gearItem } from "./catalog-data.mjs";
import { ATTRS } from "./data.mjs";
import { t } from "./i18n.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

let BOOK = null;
const loadBook = () => (BOOK ??= fetch(`systems/${F}/data/tables.json`).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}).catch(err => { BOOK = null; throw err; }));

// ======================================================================
// Import do świata
// ======================================================================

/** Tworzy albo aktualizuje tabele systemu w folderze „Tabele FoE” (bez dublowania). */
export async function importTables() {
  if (!game.user.isGM) return warn(t("The GM imports the FoE tables."));
  const [book, catalog] = await Promise.all([loadBook(), loadCatalog()]);
  const docs = allTableDocs(book, catalog);
  let folder = game.folders?.find(f => f.type === "RollTable" && (f.getFlag?.(F, "tables") || ["Tabele FoE", "FoE Tables"].includes(f.name))); // pl-ok: dawna nazwa folderu
  folder ??= await Folder.create({ name: t("FoE Tables"), type: "RollTable", color: "#1f6b3f", flags: { [F]: { tables: true } } });
  let created = 0, updated = 0;
  for (const d of docs) {
    const id = d.flags[F].tableId;
    const existing = game.tables?.find(tb => tb.getFlag?.(F, "tableId") === id);
    if (existing) {
      const { results, ...data } = d;
      await existing.update({ ...data, folder: folder?.id ?? null });
      const old = existing.results.map(r => r.id);
      if (old.length) await existing.deleteEmbeddedDocuments("TableResult", old);
      await existing.createEmbeddedDocuments("TableResult", results);
      updated++;
    } else {
      await RollTable.implementation.create({ ...d, folder: folder?.id ?? null });
      created++;
    }
  }
  ui.notifications.info(t("FoE tables: {c} created, {u} updated (folder “{f}”).", { c: created, u: updated, f: folder?.name ?? t("FoE Tables") }));
  return { created, updated };
}

// ======================================================================
// Czat
// ======================================================================

/** Wynik losowania zapisuje we flagach wiadomości, które wyniki wypadły (niezależnie od wyglądu karty w rdzeniu). */
export function registerRollTableClass() {
  const Base = CONFIG.RollTable?.documentClass;
  if (!Base || Base.prototype.foeTableDraw) return;
  class FoeRollTable extends Base {
    get foeTableDraw() { return true; }
    async toMessage(results, options = {}) {
      const draw = { table: this.uuid, results: (results ?? []).map(r => r?.uuid).filter(Boolean) };
      const messageData = foundry.utils.mergeObject(options.messageData ?? {}, { flags: { [F]: { tableDraw: draw } } }, { inplace: false });
      return super.toMessage(results, { ...options, messageData });
    }
  }
  CONFIG.RollTable.documentClass = FoeRollTable;
}

/** Postać, której dotyczą przyciski: własny zaznaczony token, potem postać gracza. */
function userActor() {
  const own = (canvas?.tokens?.controlled ?? []).map(tk => tk.actor).find(a => a?.isOwner && !["terminal", "vehicle", "casino"].includes(a.type));
  return own ?? game.user.character ?? null;
}

/** Wylosowane wyniki: z flag systemu, a dla starszych wiadomości — z rzutu. */
function drawnResults(message) {
  const draw = message.flags?.[F]?.tableDraw;
  const table = draw?.table ? fromUuidSync(draw.table) : game.tables?.get(message.flags?.core?.RollTable);
  let results = (draw?.results ?? []).map(u => fromUuidSync(u)).filter(Boolean);
  if (!results.length && table?.getResultsForRoll && message.rolls?.[0]) {
    try { results = table.getResultsForRoll(message.rolls[0].total) ?? []; } catch { results = []; }
  }
  return { table, results };
}

/** Wskazówki dla wyniku: z flag tabel systemu albo z dopasowania nazw w tabelach MG. */
async function hintsFor(result, data) {
  const own = result.flags?.[F];
  if (own) return own;
  const text = `${result.name ?? ""} ${result.description ?? result.text ?? ""}`;
  const m = matchNames(text, {
    creatures: (data.bestiary ?? []).map(e => e.name),
    items: [...(data.weapons ?? []).map(e => ({ name: e.name, itemType: "weapon" })), ...(data.armor ?? []).map(e => ({ name: e.name, itemType: "armor" })),
      ...(data.gear ?? []).map(e => ({ name: e.name, itemType: "gear" }))]
  });
  // pojazdy: nazwa angielska z nawiasu („Wóz (Wagon)” → Wagon), całe słowa
  const short = v => (String(v.name).match(/\(([^)]+)\)\s*$/)?.[1] ?? v.name);
  const vm = matchNames(text, { creatures: (data.vehicles ?? []).map(short) }).creatures[0];
  const vehicle = vm ? (data.vehicles ?? []).find(v => short(v) === vm)?.name : null;
  return { creatures: m.creatures, items: m.items, vehicle };
}

const button = (action, label, icon, attrs = {}) =>
  `<button type="button" class="foe-luck foe-table-btn" data-foe-table="${action}" ${Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;

/** Przyciski pod kartą wyniku. */
async function decorate(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const isDraw = message.flags?.[F]?.tableDraw || message.flags?.core?.RollTable;
  if (!isDraw) return;
  const content = root.querySelector(".message-content") ?? root;
  if (content.dataset.foeTableCard) return;
  content.dataset.foeTableCard = "1";
  content.classList.add("foe-card", "foe-table-card");
  const { table, results } = drawnResults(message);
  content.insertAdjacentHTML("afterbegin", `<div class="fc-tag"><span>${t("PIPBUCK // TABLE")}</span><span>${esc(table?.name ?? "")}</span></div>`);
  if (!results.length) return;
  const data = await loadCatalog().catch(() => ({}));
  const canCreate = game.user.can?.("ACTOR_CREATE");
  const rows = [];
  for (const r of results) {
    const h = await hintsFor(r, data);
    const btns = [];
    if (canCreate) for (const c of h.creatures ?? []) btns.push(button("creature", t("Add NPC: {name}", { name: c }), "fa-dragon", { name: c }));
    if (canCreate && h.vehicle) btns.push(button("vehicle", t("Add vehicle: {name}", { name: h.vehicle }), "fa-truck-pickup", { name: h.vehicle }));
    if (h.item) btns.push(button("item", t("Add to inventory: {name}", { name: `${h.item}${h.qty && h.qty !== "1" ? ` (${h.qty})` : ""}` }), "fa-box-open", { name: h.item, type: h.itemType ?? "weapon", qty: h.qty ?? "1" }));
    for (const it of h.items ?? []) btns.push(button("item", t("Add to inventory: {name}", { name: it.name }), "fa-box-open", { name: it.name, type: it.itemType, qty: "1" }));
    if (h.attr) btns.push(button("attr", t("Apply starvation: {attr} −1", { attr: ATTRS[h.attr] ?? h.attr }), "fa-utensils", { attr: h.attr }));
    if (h.again && table && (game.user.isGM || table.isOwner)) btns.push(button("again", t("Roll again"), "fa-rotate", { table: table.uuid }));
    if (btns.length) rows.push(btns.join(""));
  }
  if (!rows.length) return;
  content.insertAdjacentHTML("beforeend", `<div class="foe-table-actions">${rows.join("")}</div>`);
  for (const b of content.querySelectorAll("[data-foe-table]")) b.addEventListener("click", ev => {
    ev.preventDefault();
    onButton(b.dataset).catch(err => { console.error(`${F} | table`, err); ui.notifications.error(t("Table: {msg}", { msg: err.message })); });
  });
}

async function onButton(ds) {
  const data = await loadCatalog();
  if (ds.foeTable === "creature") {
    const e = (data.bestiary ?? []).find(x => x.name === ds.name);
    if (!e) return warn(t("“{name}” isn't in the bestiary.", { name: ds.name }));
    const { spellItemData } = await import("./magic.mjs");
    const { maneuverItemData } = await import("./flight.mjs");
    return importCreature(e, { catalog: data, spells: data.spells ?? [], maneuvers: data.maneuvers ?? [], spellItemData, maneuverItemData });
  }
  if (ds.foeTable === "vehicle") {
    const e = (data.vehicles ?? []).find(x => x.name === ds.name) ?? (data.vehicles ?? []).find(x => x.name.includes(ds.name));
    if (!e) return warn(t("There's no vehicle “{name}”.", { name: ds.name }));
    const { importVehicle } = await import("./vehicle.mjs");
    return importVehicle(e, data);
  }
  if (ds.foeTable === "again") {
    const table = fromUuidSync(ds.table);
    return table?.draw?.();
  }
  const actor = userActor();
  if (!actor) return warn(t("Select a character token (or assign a character to the player) to add the result to it."));
  if (!actor.isOwner) return warn(t("You don't own: {name}.", { name: actor.name }));
  if (ds.foeTable === "item") {
    const list = { weapon: data.weapons, armor: data.armor, gear: data.gear }[ds.type] ?? [];
    const e = list.find(x => x.name === ds.name);
    if (!e) return warn(t("“{name}” isn't in the catalog.", { name: ds.name }));
    const q = String(ds.qty || "1").trim();
    const qty = Math.max(1, /^\d+$/.test(q) ? Number(q) : (await new Roll(q).evaluate()).total);
    const item = ds.type === "weapon" ? weaponItem(e) : ds.type === "armor" ? armorItem(e) : gearItem(e, qty);
    const stacks = item.type === "gear" || (item.type === "weapon" && item.system?.consumable);
    if (stacks) {
      item.system.qty = qty;
      await addItemToActor(actor, item, qty);
    } else for (let i = 0; i < qty; i++) await addItemToActor(actor, foundry.utils.deepClone(item), 1);
    return ui.notifications.info(t("{name}: added {what}.", { name: actor.name, what: `${qty > 1 ? `${qty} × ` : ""}${e.name}` }));
  }
  if (ds.foeTable === "attr") return applyStarvation(actor, ds.attr);
  return null;
}

/** Głód: −1 tymczasowo do atrybutu w cesze „Głód” (usuń cechę, gdy postać się naje). */
export async function applyStarvation(actor, attr) {
  if (!ATTRS[attr]) return null;
  const feat = actor.items.find(i => i.type === "feature" && i.getFlag?.(F, "starvation"));
  if (feat) {
    const effects = foundry.utils.deepClone(feat.system.effects ?? []);
    const e = effects.find(x => x.type === "tempAttr" && x.target === attr);
    if (e) e.value = (Number(e.value) || 0) - 1;
    else effects.push({ type: "tempAttr", target: attr, value: -1, when: "" });
    await feat.update({ "system.effects": effects });
  } else {
    await actor.createEmbeddedDocuments("Item", [{
      name: t("Starvation"), type: "feature", img: `systems/${F}/icons/food.svg`, flags: { [F]: { starvation: true } },
      system: { kind: "other", active: true, effects: [{ type: "tempAttr", target: attr, value: -1, when: "" }],
        description: `<p>${t("Table XXXII (p. 477): every day without a full meal is −1 temporarily to a random attribute. Remove this feature when the character eats (a nourishing meal); non-nourishing food lets you ignore the penalties for 8 hours.")}</p>` }
    }]);
  }
  return ui.notifications.info(t("{name}: starvation — {attr} −1.", { name: actor.name, attr: ATTRS[attr] }));
}

export function registerTableHooks() {
  Hooks.on("renderRollTableDirectory", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-tables-import")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "foe-catalog-open foe-tables-import";
    btn.title = t("Creates or updates the “FoE Tables” folder: random encounters, starvation, diseases, traps and loot from the catalog. Changes to these tables will be overwritten — make your own tables separately.");
    btn.innerHTML = `<i class="fa-solid fa-table-list"></i> ${t("FoE Tables")}`;
    btn.addEventListener("click", () => importTables().catch(err => { console.error(`${F} | tables`, err); ui.notifications.error(t("FoE tables: {msg}", { msg: err.message })); }));
    const bar = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
    (bar ?? root).append(btn);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    decorate(message, html).catch(err => console.warn(`${F} | table card`, err));
  });
}
