/**
 * Przeszukiwanie ciał NPC: łup z bestiariusza (albo nasze domyślne) i rzeczy, które NPC ma przy sobie.
 * MG klika „Przeszukaj” (karta NPC albo przypomnienie na czacie po śmierci NPC); na czacie pojawia się karta łupu,
 * z której gracze biorą przedmioty („Weź”, „Weź wszystko”) — trafiają do postaci z zaznaczonego tokenu.
 * Oznaczenie zabranych rzeczy i usunięcie ich z NPC robi przeglądarka MG (kanał systemu). Zasady: loot-data.mjs.
 */
import { parseLoot, genericKind, matchItem, defaultLoot, carriedLoot, ammoFor, weightedPick } from "./loot-data.mjs";
import { loadCatalog, addItemToActor } from "./catalog.mjs";
import { weaponItem, armorItem, gearItem } from "./catalog-data.mjs";
import { lootTables, lootWeight } from "./tables-data.mjs";
import { t, tmap } from "./i18n.mjs";

const F = "foe-rpg";
const SOCKET = `system.${F}`;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const SRC = tmap({ npc: "carried", book: "bestiary", house: "house default" });

export function registerLootSettings() {
  game.settings.register(F, "lootReminder", {
    name: "Loot: reminder when an NPC dies",
    hint: "When an NPC dies, the GM gets a whispered chat reminder with a “Search” button (loot from the bestiary and the NPC's things).",
    scope: "world", config: true, type: Boolean, default: true
  });
}

// ======================================================================
// Losowanie łupu (MG)
// ======================================================================

async function rollQty(q) {
  const s = String(q || "1").trim();
  if (/^\d+$/.test(s)) return Math.max(1, Number(s));
  return Math.max(1, (await new Roll(s).evaluate()).total);
}

let POOLS = null;
const pools = catalog => (POOLS ??= Object.fromEntries(lootTables(catalog).map(d => [d.id, d.results])));

/** Amunicja do broni, którą NPC ma przy sobie. */
function npcAmmo(npc, catalog) {
  for (const it of npc.items ?? []) {
    if (it.type !== "weapon") continue;
    const a = ammoFor(it.system?.ammoType, catalog);
    if (a) return a;
  }
  return null;
}

/** Wpis łupu → pozycja karty: { kind: caps|catalog|own, label, qty, type?, name?, data? }. */
async function resolve(entry, npc, catalog) {
  const g = genericKind(entry.name);
  const qty = await rollQty(entry.qty);
  const val = e => Number(e.value) || 0;
  const pick = list => weightedPick(list);
  if (g === "caps") return { kind: "caps", label: t("Caps"), qty };
  let name = null, type = "gear";
  if (g === "ammo") name = npcAmmo(npc, catalog) ?? pick(pools(catalog)["loot-ammo"] ?? [])?.item;
  else if (g === "food") name = pick(pools(catalog)["loot-food"] ?? [])?.item;
  else if (g === "drug") name = pick(pools(catalog)["loot-chems"] ?? [])?.item;
  else if (g === "clothes") {
    type = "armor";
    name = pick((catalog.armor ?? []).filter(a => a.category === "clothing" && !a.powered && val(a) > 0).map(a => ({ item: a.name, weight: lootWeight(val(a)) })))?.item;
  } else if (g === "toy") name = pick((catalog.gear ?? []).filter(x => /^toy /i.test(x.name)).map(x => ({ item: x.name, weight: 1 })))?.item;
  if (g) return name ? { kind: "catalog", type, name, label: name, qty } : null;
  const m = matchItem(entry.name, catalog);
  if (m) return { kind: "catalog", type: m.type, name: m.name, label: m.name, qty };
  return {
    kind: "own", label: entry.name, qty,
    data: { name: entry.name, type: "gear", img: `systems/${F}/icons/misc.svg`,
      system: { category: "misc", qty, weight: 0, value: 0, description: `<p>${t("Bestiary loot: {x}", { x: esc(entry.raw || entry.name) })}</p>` } }
  };
}

/** Rzeczy NPC → pozycje karty (z danymi do skopiowania). */
function carriedRows(npc, catalog) {
  const rows = [];
  for (const it of npc.items ?? []) {
    const c = carriedLoot(it, catalog);
    if (!c) continue;
    let data;
    if (it.type === "weapon") {
      data = weaponItem(c);
      const loaded = Number(it.system?.ammo?.value);
      if (Number.isFinite(loaded)) data.system.ammo.value = Math.max(0, Math.min(data.system.ammo.max, loaded));
    } else {
      data = it.toObject ? it.toObject() : foundry.utils.deepClone(it);
      delete data._id;
      if (data.system) data.system.equipped = false;
    }
    const qty = it.type === "gear" || data.system?.consumable ? Math.max(1, Number(it.system?.qty) || 1) : 1;
    rows.push({ kind: "npc", label: it.name, qty, itemId: it.id, data, src: "npc" });
  }
  return rows;
}

/** Przeszukanie ciała: karta łupu na czacie, NPC oznaczony jako przeszukany. */
export async function searchBody(npc) {
  if (!game.user.isGM) return warn(t("The GM rolls the loot."));
  if (!npc || npc.type !== "npc") return warn(t("Only an NPC can be searched."));
  if (npc.getFlag(F, "looted")) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Loot: {name}", { name: npc.name }) }, content: `<p>${t("This body has already been searched. Roll the loot again?")}</p>`, rejectClose: false
    });
    if (!ok) return null;
  }
  const catalog = await loadCatalog();
  const be = (catalog.bestiary ?? []).find(e => e.name === npc.getFlag(F, "bestiary"));
  const rows = carriedRows(npc, catalog);
  const missed = [];
  const entries = be?.loot ? parseLoot(be.loot) : be ? defaultLoot(be, catalog) : [];
  // rzecz, którą NPC ma przy sobie, jest pewna — ten sam przedmiot z listy łupu podręcznika nie liczy się drugi raz
  const carried = new Set(rows.map(r => String(r.data?.name ?? r.label).toLowerCase()));
  for (const en of entries) {
    const same = !genericKind(en.name) && matchItem(en.name, catalog);
    if (same && carried.has(same.name.toLowerCase())) continue;
    if (en.chance < 100) {
      const r = (await new Roll("1d100").evaluate()).total;
      if (r > en.chance) { missed.push(`${en.name} (${en.chance}%: ${r})`); continue; }
    }
    const row = await resolve(en, npc, catalog);
    if (row) rows.push({ ...row, src: en.house ? "house" : "book", note: en.note || "" });
  }
  const loot = { npc: npc.uuid, name: npc.name, rows: rows.map(r => ({ ...r, taken: null })), missed, book: !!be?.loot, house: !be?.loot && entries.length > 0 };
  const msg = await ChatMessage.create({ speaker: { alias: npc.name }, content: staticCard(loot), flags: { [F]: { loot } } });
  await npc.setFlag(F, "looted", true);
  return msg;
}

/** Treść karty (zapasowa; przyciski i stan zabrania dorysowuje hak czatu). */
function staticCard(loot) {
  return `<div class="foe-card foe-loot">
    <div class="fc-tag"><span>${t("PIPBUCK // LOOT")}</span><span>${t("search")}</span></div>
    <h3>${esc(loot.name)}</h3>
    <ul class="foe-loot-list">${loot.rows.map(r => `<li><span class="nm">${esc(r.label)}${r.qty > 1 ? ` ×${r.qty}` : ""}</span></li>`).join("") || `<li><em>${t("Nothing.")}</em></li>`}</ul>
    ${loot.missed.length ? `<div class="fc-meta">${t("Not found: {list}", { list: esc(loot.missed.join(", ")) })}</div>` : ""}
  </div>`;
}

// ======================================================================
// Zabieranie (gracz) i zapis stanu (MG)
// ======================================================================

/** Postać, która bierze: własny zaznaczony token (nie przeszukiwany NPC), potem postać gracza. */
function userActor(exclude = null) {
  const own = (canvas?.tokens?.controlled ?? []).map(tk => tk.actor).find(a => a?.isOwner && ["character", "npc"].includes(a.type) && a.uuid !== exclude);
  return own ?? game.user.character ?? null;
}

async function give(actor, r, catalog) {
  if (r.kind === "caps") return actor.update({ "system.caps": (Number(actor.system.caps) || 0) + r.qty });
  let data;
  if (r.kind === "catalog") {
    const list = { weapon: catalog.weapons, armor: catalog.armor, gear: catalog.gear }[r.type] ?? [];
    const e = list.find(x => x.name === r.name);
    if (!e) return warn(t("“{name}” isn't in the catalog.", { name: r.name }));
    data = r.type === "weapon" ? weaponItem(e) : r.type === "armor" ? armorItem(e) : gearItem(e, r.qty);
  } else data = foundry.utils.deepClone(r.data);
  const stacks = data.type === "gear" || (data.type === "weapon" && data.system?.consumable);
  if (stacks) {
    data.system.qty = r.qty;
    return addItemToActor(actor, data, r.qty);
  }
  for (let i = 0; i < r.qty; i++) await addItemToActor(actor, foundry.utils.deepClone(data), 1);
  return true;
}

export async function takeLoot(message, indexes) {
  const loot = message.flags?.[F]?.loot;
  if (!loot) return null;
  const actor = userActor(loot.npc);
  if (!actor) return warn(t("Select your character's token (or assign a character to the player) to take the loot."));
  if (!actor.isOwner) return warn(t("You don't own: {name}.", { name: actor.name }));
  const catalog = await loadCatalog();
  const given = [];
  for (const i of indexes) {
    const r = loot.rows[i];
    if (!r || r.taken) continue;
    await give(actor, r, catalog);
    given.push(i);
  }
  if (!given.length) return warn(t("Someone has already taken these things."));
  ui.notifications.info(`${actor.name}: ${given.map(i => `${loot.rows[i].label}${loot.rows[i].qty > 1 ? ` ×${loot.rows[i].qty}` : ""}`).join(", ")}.`);
  const payload = { kind: "loot", op: "take", messageId: message.id, idx: given, who: actor.name };
  if (game.user.isGM) return applyLootOp(payload);
  if (!game.users.activeGM) return warn(t("The GM is offline — the items were added, but the loot card won't update."));
  game.socket.emit(SOCKET, payload);
  return true;
}

/** MG: oznacz zabrane pozycje, rzeczy NPC usuń z jego ekwipunku. */
async function applyLootOp({ op, messageId, idx, who }) {
  if (op !== "take") return;
  const msg = game.messages?.get(messageId);
  const loot = msg ? foundry.utils.deepClone(msg.flags?.[F]?.loot) : null;
  if (!loot) return;
  const npc = loot.npc ? await fromUuid(loot.npc).catch(() => null) : null;
  for (const i of idx ?? []) {
    const r = loot.rows[i];
    if (!r || r.taken) continue;
    r.taken = String(who ?? "?");
    if (r.kind === "npc" && npc) await npc.items?.get(r.itemId)?.delete();
  }
  return msg.update({ [`flags.${F}.loot.rows`]: loot.rows });
}

// ======================================================================
// Czat i haki
// ======================================================================

function decorate(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const flags = message.flags?.[F] ?? {};
  if (flags.lootPrompt) {
    const b = root.querySelector("[data-foe-loot=search]");
    if (!game.user.isGM) b?.remove();
    b?.addEventListener("click", async ev => {
      ev.preventDefault();
      const npc = await fromUuid(flags.lootPrompt).catch(() => null);
      if (!npc) return warn(t("That NPC is gone."));
      return searchBody(npc);
    });
  }
  const loot = flags.loot;
  const list = loot && root.querySelector(".foe-loot-list");
  if (!list) return;
  list.innerHTML = loot.rows.map((r, i) => `
    <li class="${r.taken ? "taken" : ""}">
      <span class="nm">${esc(r.label)}${r.qty > 1 ? ` ×${r.qty}` : ""}<small>${esc(SRC[r.src] ?? "")}${r.note ? ` · ${esc(r.note)}` : ""}</small></span>
      ${r.taken ? `<em>${t("taken by: {name}", { name: esc(r.taken) })}</em>` : `<button type="button" class="foe-luck" data-foe-loot="take" data-i="${i}"><i class="fa-solid fa-hand"></i> ${t("Take")}</button>`}
    </li>`).join("") || `<li><em>${t("Nothing — empty pockets.")}</em></li>`;
  const open = loot.rows.map((r, i) => (r.taken ? null : i)).filter(i => i !== null);
  if (open.length > 1) list.insertAdjacentHTML("afterend", `<button type="button" class="foe-luck foe-loot-all" data-foe-loot="all"><i class="fa-solid fa-sack-dollar"></i> ${t("Take all ({n})", { n: open.length })}</button>`);
  if (loot.house) list.insertAdjacentHTML("afterend", `<div class="fc-meta">${t("The rulebook gives no loot for this creature — these are our defaults.")}</div>`);
  for (const b of root.querySelectorAll("[data-foe-loot=take], [data-foe-loot=all]")) b.addEventListener("click", ev => {
    ev.preventDefault();
    const idx = b.dataset.foeLoot === "all" ? open : [Number(b.dataset.i)];
    takeLoot(message, idx).catch(err => { console.error(`${F} | loot`, err); ui.notifications.error(t("Loot: {name}", { name: err.message })); });
  });
}

/** Przypomnienie (szeptem do MG), gdy NPC dostanie status „martwy”. */
async function remind(actor) {
  if (actor.getFlag(F, "looted") || actor.getFlag(F, "lootPrompted")) return;
  await actor.setFlag(F, "lootPrompted", true);
  return ChatMessage.create({
    speaker: { alias: actor.name },
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<div class="foe-card foe-loot">
      <div class="fc-tag"><span>${t("PIPBUCK // LOOT")}</span><span>${t("body")}</span></div>
      <h3>${t("{name} is dead", { name: esc(actor.name) })}</h3>
      <div class="fc-meta">${t("Search the body? Loot from the bestiary and the things the NPC carries — the players take them from the card.")}</div>
      <button type="button" class="foe-luck" data-foe-loot="search"><i class="fa-solid fa-magnifying-glass"></i> ${t("btn|Search")}</button>
    </div>`,
    flags: { [F]: { lootPrompt: actor.uuid } }
  });
}

export function registerLootHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      if (payload?.kind !== "loot" || !game.users.activeGM?.isSelf) return;
      applyLootOp(payload).catch(err => console.error(`${F} | loot`, err));
    });
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { decorate(message, html); } catch (err) { console.warn(`${F} | loot card`, err); }
  });
  Hooks.on("createActiveEffect", effect => {
    if (!game.users.activeGM?.isSelf || !effect.statuses?.has?.("dead")) return;
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || actor.type !== "npc") return;
    try { if (!game.settings.get(F, "lootReminder")) return; } catch { return; }
    remind(actor).catch(err => console.warn(`${F} | loot reminder`, err));
  });
}
