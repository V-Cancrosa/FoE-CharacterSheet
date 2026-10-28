/**
 * Rzut przedmiotem (albo kapslami) do kogoś na mapie, np. w walce: test Explosives z karą za odległość.
 * Udany — cel łapie. Chybiony — przedmiot upada obok celu (każdy brakujący krok MFD to 5 ft dalej, kierunek k8):
 * na mapie pojawia się znacznik, a na czacie karta z „Podnieś” dla tego, kto stanie obok.
 * Udany przerzut za kartę szczęścia oddaje przedmiot celowi (o ile nikt go jeszcze nie podniósł).
 * Wynik rozstrzyga przeglądarka MG (bez MG — rzucający, jeśli jest właścicielem celu). Zasady: trade-data.mjs.
 * Tu też upuszczanie przedmiotu na ziemię z ekwipunku (ta sama karta „Podnieś” i znacznik pod tokenem).
 */
import {
  F, SOCKET, esc, warn, stacks, qtyOf, capsOf, capsText, itemCopy, putItem, dropItem, transfer, viaGM, gridOf, rectOf, tokenOf
} from "./give.mjs";
import { throwProfile, throwSteps, missedSteps, landingCell, isAdjacent, DIR_NAMES } from "./trade-data.mjs";
import { promptMfd, rollTest, threshold } from "./rolls.mjs";
import { rollContext } from "./effects.mjs";
import { rangeBands } from "./combat.mjs";
import { MFD_STEPS } from "./data.mjs";
import { t } from "./i18n.mjs";

const MISC = `systems/${F}/icons/misc.svg`;
const hasFeature = (actor, re) => (actor?.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));

export function registerThrowSettings() {
  game.settings.register(F, "groundMarkers", {
    name: "Thrown item: map marker",
    hint: "When a throw fails, a tile with the item's picture appears where it landed; it disappears when someone picks it up.",
    scope: "world", config: true, type: Boolean, default: true
  });
}
const markersOn = () => { try { return game.settings.get(F, "groundMarkers"); } catch { return true; } };

/** Czy postać rzuci telekinezą: rzuca zaklęcia jednorożców, zna telekinezę i nie ma wypalenia. */
export const knowsTK = actor => !!actor?.system?.caster && !actor.system.burnout
  && (actor.items ?? []).some(i => i.type === "spell" && /telekine/i.test(i.name));

/** Zasięg rzutu dla postaci: przedmiot (null — kapsle), ilość, telekineza. */
export function throwInfo(actor, item, qty = 1, tk = false) {
  const a = actor?.system?.attributes ?? {};
  const weight = item ? (Number(item.system?.weight) || 0) * (stacks(item) ? Math.max(1, Number(qty) || 1) : 1) : 0;
  return throwProfile({
    str: a.str?.total ?? 0, int: a.int?.total ?? 0, weight, tk: !!tk && knowsTK(actor),
    heave: hasFeature(actor, /^heave,?\s*ho/i), oops: hasFeature(actor, /^oops/i)
  });
}

/**
 * Rzut: target — { uuid, token, name, dist } z okna wymiany; item — przedmiot albo null (kapsle: caps = ile).
 * Okno MFD z odległością, potem karta testu; wynik rozstrzyga hak createChatMessage.
 */
export async function throwItem(source, { item = null, caps = 0, qty = 1, target, tk = false } = {}) {
  if (!source?.isOwner) return warn(t("You don't own: {name}.", { name: source?.name ?? "?" }));
  const sk = source.system?.skills?.explosives;
  if (!sk) return warn(t("{name}: no Explosives skill.", { name: source.name }));
  if (!target?.token || target.dist === null || target.dist === undefined) return warn(t("You can throw only to someone visible on the map."));
  const n = item ? (stacks(item) ? Math.min(qtyOf(item), Math.max(1, Number(qty) || 1)) : 1) : Math.min(capsOf(source), Math.max(1, Number(caps) || 1));
  if (!n) return warn(t("There's nothing to throw."));
  const prof = throwInfo(source, item, n, tk);
  if (!prof.ok) return warn(`${source.name}: ${prof.reason}.`);
  const steps = throwSteps(target.dist, prof.inc);
  if (steps === null) return warn(t("{name} is too far: {d} ft, and the throw reaches {max} ft.", { name: target.name, d: target.dist, max: prof.max }));
  const dst = await fromUuid(target.uuid).catch(() => null);
  if (!dst) return warn(t("That target is gone."));
  if (!game.users.activeGM && !dst.isOwner) return warn(t("Throwing to someone else's character requires a logged-in GM."));

  const label = item ? `${item.name}${n > 1 ? ` ×${n}` : ""}` : capsText(n);
  const bands = rangeBands(prof.inc, 4);
  const extraHtml = `
    <div class="atk-info">
      <div>${esc(label)} → <b>${esc(target.name)}</b> · ${target.dist} ft · ${t("range increment {n} ft", { n: prof.inc })}${tk ? ` (${t("telekinesis")})` : ""}</div>
      <div>${t("Success — the target catches it; failure — it falls next to the target, 5 ft further for each missing MFD step.")}</div>
    </div>
    <label class="atk-row">${t("Distance")} <select name="range">${bands.map(b => `<option value="${b.steps}" ${-b.steps === steps ? "selected" : ""}>${b.label}${b.steps ? ` (${b.steps} ${t("st.")})` : ""}</option>`).join("")}</select></label>`;
  const rc = rollContext(source, { kind: "attack", skill: "explosives", skillAttr: sk.attr }, { manualMod: sk.mod });
  const r = await promptMfd(t("Throw: {label} → {name}", { label, name: target.name }), sk.tn, rc, {
    defaultStep: "1", extraHtml,
    readExtra: form => {
      const sel = form.querySelector("select[name=range]");
      const v = Number(sel?.value) || 0;
      return { steps: v, mod: 0, notes: v ? [t("Distance {d}", { d: sel.selectedOptions[0]?.textContent.split(" (")[0] })] : [], data: null };
    }
  });
  if (!r) return null;
  const { extra, ...roll } = r;
  const throwing = {
    id: foundry.utils.randomID(), from: source.uuid, to: target.uuid, token: target.token, toName: target.name,
    itemId: item?.id ?? null, caps: item ? 0 : n, qty: n, label, dist: target.dist, tk: !!tk, fromElev: Number(tokenOf(source)?.elevation) || 0
  };
  return rollTest(source, { label: t("Item throw (Explosives): {label} → {name}", { label, name: target.name }), baseTn: sk.tn, ...roll, throwing });
}

// ======================================================================
// Rozstrzygnięcie (MG)
// ======================================================================

/** Kto rozstrzyga rzut: aktywny MG, a bez MG — autor karty testu. */
function isExecutor(msg) {
  const gm = game.users.activeGM;
  return gm ? gm.isSelf : !!msg.author?.isSelf;
}

const groundOf = throwId => game.messages?.find(m => m.flags?.[F]?.ground?.throwId === throwId) ?? null;

/** Rozstrzygnięcia tego samego rzutu (pierwszy rzut, przerzuty) idą po kolei. */
const CHAIN = new Map();
function inOrder(id, fn) {
  const next = (CHAIN.get(id) ?? Promise.resolve()).catch(() => null).then(fn);
  CHAIN.set(id, next);
  next.finally(() => { if (CHAIN.get(id) === next) CHAIN.delete(id); }).catch(() => null);
  return next;
}

/** O ile kroków MFD chybiono (z karty testu). */
function missedOf(msg) {
  const tst = msg.flags[F].test;
  const target = Math.max(0, MFD_STEPS.findIndex(s => s.key === tst.step));
  const total = Number(msg.rolls?.[0]?.total);
  let ach = -1;
  if (tst.result !== "crit-fail" && Number.isFinite(total)) MFD_STEPS.forEach((s, i) => { if (total <= threshold(tst.baseTn, s, tst.mod ?? 0)) ach = i; });
  return missedSteps(target, ach);
}

async function resolveThrow(msg) {
  const test = msg.flags?.[F]?.test;
  const th = test?.throwing;
  if (!th?.id || !th.from || !th.to) return null;
  const src = await fromUuid(th.from).catch(() => null);
  if (!src) return null;
  const author = msg.author;
  if (author && !author.isGM && !src.testUserPermission?.(author, "OWNER")) return null;
  const ok = test.result === "success" || test.result === "crit-success";
  const ground = groundOf(th.id);
  if (ok) {
    // przerzut po chybieniu: przedmiot już leży — cel go łapie, jeśli nikt go nie podniósł
    if (ground) return ground.flags[F].ground.taken ? null : collect(ground, th.to, { caught: true, name: th.toName });
    return transfer({ op: th.caps ? "caps" : "item", from: th.from, itemId: th.itemId, to: th.to, toName: th.toName, qty: th.caps || th.qty, user: author?.id, tag: t("throw — caught") });
  }
  if (ground) return null;   // już leży (przerzut też chybił)
  return drop(msg, th, src);
}

/** Chybiony rzut: przedmiot schodzi z rzucającego i ląduje obok celu (znacznik + karta na czacie). */
async function drop(msg, th, src) {
  let entry;
  if (th.caps) {
    const have = capsOf(src);
    const n = Math.min(have, th.caps);
    if (!n) return null;
    await src.update({ "system.caps": have - n });
    entry = { caps: n, qty: n, label: capsText(n), img: MISC, data: null };
  } else {
    const it = src.items.get(th.itemId);
    if (!it) return null;
    const n = stacks(it) ? Math.min(qtyOf(it), Math.max(1, th.qty)) : 1;
    if (!n) return null;
    const data = itemCopy(it, n);
    await dropItem(it, n);
    entry = { caps: 0, qty: n, label: `${it.name}${n > 1 ? ` ×${n}` : ""}`, img: it.img || MISC, data };
  }
  const tok = th.token ? await fromUuid(th.token).catch(() => null) : null;
  const scene = tok?.parent ?? null;
  const grid = gridOf(scene);
  const ft = missedOf(msg) * 5;
  const d8 = (await new Roll("1d8").evaluate()).total;
  let spot = null, tile = null;
  if (tok && scene) {
    spot = landingCell(rectOf(tok, grid.size), grid.size, Math.max(1, Math.round(ft / grid.distance)), d8, scene.dimensions?.sceneRect ?? null);
    if (game.user.isGM && markersOn()) {
      const k = Math.round(grid.size * 0.7), pad = Math.round((grid.size - k) / 2);
      try {
        [tile] = await scene.createEmbeddedDocuments("Tile", [{
          texture: { src: entry.img }, x: spot.x + pad, y: spot.y + pad, width: k, height: k, flags: { [F]: { ground: th.id } }
        }]);
      } catch (err) { console.warn(`${F} | item marker`, err); }
    }
  }
  const ground = {
    // spada na niższy z poziomów (rzut do lecącego pegaza ląduje na ziemi, na dachu zostaje na dachu)
    throwId: th.id, scene: scene?.id ?? null, x: spot?.x ?? null, y: spot?.y ?? null, size: grid.size,
    elevation: Math.min(Number(th.fromElev) || 0, Number(tok?.elevation) || 0),
    tile: tile?.id ?? null, from: src.name, to: th.to, toName: th.toName ?? "", ft, dir: DIR_NAMES[d8 - 1], ...entry, taken: null, caught: false
  };
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: src }), content: groundCard(ground), flags: { [F]: { ground } } });
}

function groundCard(g) {
  const tag = g.dropped
    ? `<span>${t("PIPBUCK // ON THE GROUND")}</span><span>${t("dropped")}</span>`
    : `<span>${t("PIPBUCK // THROW")}</span><span>${t("not caught")}</span>`;
  const calc = g.dropped
    ? (g.scene ? t("{from} put it down where they stand.", { from: esc(g.from) }) : t("{from} put it down (no token on the map — anyone can pick it up from this card).", { from: esc(g.from) }))
    : t("{from} → {to}: lies about {ft} ft {dir} of the target.", { from: esc(g.from), to: esc(g.toName), ft: g.ft, dir: esc(g.dir) });
  return `<div class="foe-card foe-ground">
    <div class="fc-tag">${tag}</div>
    <h3>${t("{label} — on the ground", { label: esc(g.label) })}</h3>
    <div class="fc-calc">${calc}</div>
    <div class="foe-ground-act"></div>
  </div>`;
}

// ======================================================================
// Upuszczanie
// ======================================================================

/** Ile sztuk upuścić (stos): null — anulowano. */
async function askQty(item, have) {
  const r = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Drop: {name}", { name: item.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 380 }, rejectClose: false,
    content: `<div class="foe-dialog trade-dlg">
      <div class="atk-info"><div><b>${esc(item.name)}</b> — ${t("you have {n}", { n: have })}</div></div>
      <label class="atk-row">${t("How many")} <input type="number" name="qty" value="${have}" min="1" max="${have}" step="1" autofocus></label>
    </div>`,
    buttons: [{ action: "drop", label: t("Drop"), icon: "fa-solid fa-arrow-down", default: true, callback: (ev, btn) => Number(btn.form.elements.qty.value) || 0 }]
  });
  return r ? Math.min(have, Math.max(1, Math.trunc(r))) : null;
}

/**
 * Upuszczenie na ziemię (przycisk w ekwipunku): przedmiot schodzi z postaci i leży pod jej tokenem — znacznik na mapie
 * i karta z „Podnieś” jak po chybionym rzucie (podnosi ten, kto stanie obok). Znacznik stawia MG (kafelek);
 * bez MG gracz upuszcza sam, tylko bez znacznika.
 */
export async function dropToGround(actor, item) {
  if (!actor?.isOwner || !item) return warn(t("You don't own: {name}.", { name: actor?.name ?? "?" }));
  const have = qtyOf(item);
  const n = stacks(item) && have > 1 ? await askQty(item, have) : 1;
  if (!n) return null;
  const tok = tokenOf(actor);
  const payload = { kind: "throw", op: "drop", user: game.user.id, actor: actor.uuid, itemId: item.id, qty: n, token: tok?.uuid ?? null };
  if (game.user.isGM || !game.users.activeGM) return dropOp(payload);
  game.socket.emit(SOCKET, payload);
  return true;
}

/** Wykonanie upuszczenia (MG albo — bez MG — sam gracz, właściciel postaci). */
async function dropOp({ op, actor: uuid, itemId, qty, token, user }) {
  if (op !== "drop") return null;
  const actor = await fromUuid(uuid).catch(() => null);
  const who = game.users.get(user);
  if (!actor || (who && !who.isGM && !actor.testUserPermission?.(who, "OWNER"))) return null;
  const it = actor.items.get(itemId);
  if (!it) return null;
  const n = stacks(it) ? Math.min(qtyOf(it), Math.max(1, Number(qty) || 1)) : 1;
  if (!n) return null;
  const data = itemCopy(it, n);
  const entry = { caps: 0, qty: n, label: `${it.name}${n > 1 ? ` ×${n}` : ""}`, img: it.img || MISC, data };
  await dropItem(it, n);
  const tok = token ? await fromUuid(token).catch(() => null) : null;
  const scene = tok?.parent ?? null;
  const grid = gridOf(scene);
  let spot = null, tile = null;
  if (tok && scene) {
    // pole pod tokenem (lewy górny róg większego tokena)
    spot = { x: Math.floor(tok.x / grid.size) * grid.size, y: Math.floor(tok.y / grid.size) * grid.size };
    if (game.user.isGM && markersOn()) {
      const k = Math.round(grid.size * 0.5), pad = Math.round((grid.size - k) / 2);
      try {
        [tile] = await scene.createEmbeddedDocuments("Tile", [{
          texture: { src: entry.img }, x: spot.x + pad, y: spot.y + pad, width: k, height: k, flags: { [F]: { ground: "drop" } }
        }]);
      } catch (err) { console.warn(`${F} | item marker`, err); }
    }
  }
  const ground = {
    throwId: foundry.utils.randomID(), dropped: true, scene: scene?.id ?? null, x: spot?.x ?? null, y: spot?.y ?? null, size: grid.size,
    elevation: Number(tok?.elevation) || 0, tile: tile?.id ?? null, from: actor.name, to: null, toName: "", ft: 0, dir: "", ...entry, taken: null, caught: false
  };
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: groundCard(ground), flags: { [F]: { ground } } });
}

// ======================================================================
// Podnoszenie
// ======================================================================

/** Kto podnosi: zaznaczony własny token, potem postać gracza. */
function pickerActor() {
  const own = (canvas?.tokens?.controlled ?? []).map(tk => tk.actor).find(a => a?.isOwner && ["character", "npc"].includes(a.type));
  return own ?? game.user.character ?? null;
}

/** Pole, na którym leży przedmiot (kafelek, jeśli MG go przesunął). */
function spotOf(g, scene) {
  const tile = g.tile ? scene?.tiles?.get(g.tile) : null;
  const s = Number(g.size) || 100;
  if (tile) {
    const cx = tile.x + tile.width / 2, cy = tile.y + tile.height / 2;
    return { x: Math.floor(cx / s) * s, y: Math.floor(cy / s) * s, w: s, h: s };
  }
  return g.x === null || g.x === undefined ? null : { x: g.x, y: g.y, w: s, h: s };
}

/** „Podnieś” z karty przedmiotu na ziemi (postać musi stać obok znacznika; MG — bez sprawdzania). */
export async function pickUp(message) {
  const g = message.flags?.[F]?.ground;
  if (!g || g.taken) return warn(t("Someone has already picked it up."));
  const actor = pickerActor();
  if (!actor) return warn(t("Select your character's token (or assign a character to the player) to pick up the item."));
  if (!game.user.isGM && g.scene) {
    if (canvas?.scene?.id !== g.scene) return warn(t("The item is on another scene."));
    const tok = tokenOf(actor);
    if (!tok) return warn(t("{name} has no token on this scene.", { name: actor.name }));
    const grid = gridOf(canvas.scene);
    const spot = spotOf(g, canvas.scene);
    if (spot && !isAdjacent(rectOf(tok, grid.size), spot, grid, [tok.elevation, g.elevation])) {
      return warn(t("{name} must stand next to the item (the marker on the map) to pick it up.", { name: actor.name }));
    }
  }
  return viaGM({ kind: "throw", op: "pickup", messageId: message.id, picker: actor.uuid }, pickupOp);
}

/** MG: prośba gracza o podniesienie (tylko własną postacią). */
async function pickupOp({ op, messageId, picker, user }) {
  if (op !== "pickup") return null;
  const msg = game.messages?.get(messageId);
  const actor = await fromUuid(picker).catch(() => null);
  const who = game.users.get(user);
  if (!msg || !actor || (who && !who.isGM && !actor.testUserPermission?.(who, "OWNER"))) return null;
  return collect(msg, picker, { caught: false });
}

const BUSY = new Set();

/** Przedmiot z ziemi trafia do aktora; karta dostaje adnotację, znacznik znika. */
async function collect(msg, to, { caught = false, name = "" } = {}) {
  if (BUSY.has(msg.id)) return null;
  BUSY.add(msg.id);
  try {
    const g = msg.flags?.[F]?.ground;
    if (!g || g.taken) return null;
    const actor = await fromUuid(to).catch(() => null);
    if (!actor) return null;
    if (g.caps) await actor.update({ "system.caps": capsOf(actor) + g.caps });
    else if (g.data) await putItem(actor, g.data, g.qty);
    await msg.update({ [`flags.${F}.ground.taken`]: name || actor.name, [`flags.${F}.ground.caught`]: caught });
    const tile = g.tile ? game.scenes?.get(g.scene)?.tiles?.get(g.tile) : null;
    if (tile) await tile.delete().catch(() => null);
    return true;
  } finally {
    BUSY.delete(msg.id);
  }
}

function decorate(message, html) {
  const g = message.flags?.[F]?.ground;
  if (!g) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const box = root?.querySelector(".foe-ground-act");
  if (!box) return;
  if (g.taken) {
    box.innerHTML = `<div class="fc-meta">${g.caught ? t("Caught after a reroll") : t("Picked up by")}: <b>${esc(g.taken)}</b></div>`;
    return;
  }
  box.innerHTML = `<button type="button" class="foe-luck" data-foe-ground="pick"><i class="fa-solid fa-hand"></i> ${t("Pick up")}</button>
    <div class="fc-meta">${t("Stand with your token next to the item (the marker on the map), select your token and click.")}</div>`;
  box.querySelector("[data-foe-ground=pick]")?.addEventListener("click", ev => {
    ev.preventDefault();
    pickUp(message).catch(err => { console.error(`${F} | pick up`, err); ui.notifications.error(t("Picking up: {msg}", { msg: err.message })); });
  });
}

export function registerThrowHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      if (payload?.kind !== "throw" || !game.users.activeGM?.isSelf) return;
      (payload.op === "drop" ? dropOp(payload) : pickupOp(payload)).catch(err => console.error(`${F} | ground item`, err));
    });
  });
  Hooks.on("createChatMessage", msg => {
    const th = msg.flags?.[F]?.test?.throwing;
    if (!th?.id || !isExecutor(msg)) return;
    inOrder(th.id, () => resolveThrow(msg)).catch(err => console.error(`${F} | item throw`, err));
  });
  // usunięta karta przedmiotu na ziemi — znika też znacznik z mapy
  Hooks.on("deleteChatMessage", msg => {
    const g = msg.flags?.[F]?.ground;
    if (!g?.tile || g.taken || !game.users.activeGM?.isSelf) return;
    game.scenes?.get(g.scene)?.tiles?.get(g.tile)?.delete().catch(() => null);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { decorate(message, html); } catch (err) { console.warn(`${F} | throw card`, err); }
  });
}
