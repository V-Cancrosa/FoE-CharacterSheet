/**
 * Wymiana między postaciami: „Przekaż” przy przedmiocie (broń, pancerz, ekwipunek, ładownia pojazdu) i przy kapslach.
 * Odbiorcy: inne postacie, pojazdy, a z bieżącej sceny także NPC (np. kupiec). Stosy — z wyborem ilości.
 * Gdy gracz nie jest właścicielem odbiorcy, przeniesienie wykonuje przeglądarka MG (kanał systemu) — sprawdza przy tym,
 * że prośba pochodzi od właściciela dającego. Na czacie zostaje ślad wymiany.
 */
import { addItemToActor } from "./catalog.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const SOCKET = `system.${F}`;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

const stacks = it => it.type === "gear" || (it.type === "weapon" && !!it.system?.consumable);
const qtyOf = it => (stacks(it) ? Math.max(0, Number(it.system?.qty) || 0) : 1);

/** Możliwi odbiorcy: postacie i pojazdy świata oraz postacie/NPC z tokenów bieżącej sceny. */
export function recipients(source) {
  const out = new Map();
  const add = (actor, label) => {
    if (!actor || actor.uuid === source.uuid || out.has(actor.uuid)) return;
    if (!["character", "npc", "vehicle"].includes(actor.type)) return;
    out.set(actor.uuid, { uuid: actor.uuid, label });
  };
  for (const a of game.actors ?? []) {
    if (a.type === "character") add(a, `${a.name}${a.hasPlayerOwner ? "" : " (postać MG)"}`);
    else if (a.type === "vehicle") add(a, `${a.name} (ładownia pojazdu)`);
    else if (a.type === "npc" && game.user.isGM) add(a, `${a.name} (NPC)`);
  }
  for (const t of canvas?.tokens?.placeables ?? []) {
    if (!t.actor || (!game.user.isGM && !t.visible)) continue;
    add(t.actor, `${t.name} (na scenie${t.actor.type === "npc" ? ", NPC" : ""})`);
  }
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label, "pl"));
}

async function ask(source, title, body) {
  const list = recipients(source);
  if (!list.length) return warn("Nie ma komu przekazać — brak innych postaci, pojazdów ani tokenów na scenie.");
  return DialogV2.wait({
    window: { title }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog">${body}
      <label class="atk-row">Dla <select name="to">${list.map(r => `<option value="${esc(r.uuid)}">${esc(r.label)}</option>`).join("")}</select></label></div>`,
    buttons: [{ action: "give", label: "Przekaż", icon: "fa-solid fa-hand-holding", default: true,
      callback: (ev, btn) => ({ to: btn.form.elements.to.value, qty: Number(btn.form.elements.qty?.value ?? 1) || 1 }) }]
  });
}

/** „Przekaż” przy przedmiocie. */
export async function giveItem(source, item) {
  if (!source?.isOwner) return warn(`Nie jesteś właścicielem: ${source?.name ?? "?"}.`);
  if (!item) return null;
  const have = qtyOf(item);
  if (have <= 0) return warn(`${item.name}: nic do przekazania.`);
  const body = `<div class="atk-info"><div><b>${esc(item.name)}</b>${stacks(item) ? ` — masz ${have}` : ""}${item.system?.equipped ? " · teraz założone / w użyciu" : ""}</div></div>
    ${stacks(item) && have > 1 ? `<label class="atk-row">Ile <input type="number" name="qty" value="${have}" min="1" max="${have}"></label>` : ""}`;
  const pick = await ask(source, `Przekaż: ${item.name}`, body);
  if (!pick?.to) return null;
  return request({ op: "item", from: source.uuid, itemId: item.id, to: pick.to, qty: Math.min(have, Math.max(1, pick.qty)) });
}

/** „Przekaż” przy kapslach. */
export async function giveCaps(source) {
  if (!source?.isOwner) return warn(`Nie jesteś właścicielem: ${source?.name ?? "?"}.`);
  const have = Math.max(0, Number(source.system?.caps) || 0);
  if (!have) return warn(`${source.name}: brak kapsli.`);
  const body = `<div class="atk-info"><div>Kapsle: <b>${have}</b></div></div>
    <label class="atk-row">Ile <input type="number" name="qty" value="${Math.min(10, have)}" min="1" max="${have}"></label>`;
  const pick = await ask(source, `Przekaż kapsle: ${source.name}`, body);
  if (!pick?.to) return null;
  return request({ op: "caps", from: source.uuid, to: pick.to, qty: Math.min(have, Math.max(1, pick.qty)) });
}

/** Właściciel obu stron (albo MG) przenosi sam; inaczej prośba do MG. */
async function request(data) {
  const payload = { kind: "give", user: game.user.id, ...data };
  const to = await fromUuid(data.to).catch(() => null);
  if (game.user.isGM || to?.isOwner) return transfer(payload);
  if (!game.users.activeGM) return warn("Przekazanie innej postaci wymaga zalogowanego MG.");
  game.socket.emit(SOCKET, payload);
  ui.notifications.info("Przekazanie wysłane — MG je zapisze.");
  return true;
}

/** Wykonanie przeniesienia (MG albo właściciel obu stron). */
export async function transfer({ op, from, itemId, to, qty, user }) {
  const src = await fromUuid(from).catch(() => null);
  const dst = await fromUuid(to).catch(() => null);
  if (!src || !dst || src.uuid === dst.uuid) return null;
  const who = game.users.get(user);
  if (who && !who.isGM && !src.testUserPermission?.(who, "OWNER")) return null;   // tylko właściciel może oddawać swoje rzeczy
  let line;
  if (op === "caps") {
    const have = Math.max(0, Number(src.system?.caps) || 0);
    const n = Math.min(have, Math.max(1, Number(qty) || 1));
    if (!n) return null;
    await src.update({ "system.caps": have - n });
    await dst.update({ "system.caps": (Number(dst.system?.caps) || 0) + n });
    line = `${n} kapsli`;
  } else {
    const it = src.items.get(itemId);
    if (!it) return null;
    const have = qtyOf(it);
    const n = stacks(it) ? Math.min(have, Math.max(1, Number(qty) || 1)) : 1;
    const data = it.toObject();
    delete data._id;
    if (data.system) {
      if ("equipped" in data.system) data.system.equipped = false;
      if (stacks(it)) data.system.qty = n;
    }
    await addItemToActor(dst, data, n);
    if (stacks(it) && n < have) await it.update({ "system.qty": have - n });
    else await it.delete();
    line = `${it.name}${n > 1 ? ` ×${n}` : ""}`;
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: src }),
    content: `<div class="foe-card reload"><div class="fc-tag"><span>PIPBUCK // WYMIANA</span><span>przekazanie</span></div>
      <h3>${esc(src.name)} → ${esc(dst.name)}</h3><div class="fc-calc">${esc(line)}</div></div>`
  });
}

export function registerGiveHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      if (payload?.kind !== "give" || !game.users.activeGM?.isSelf) return;
      transfer(payload).catch(err => console.error(`${F} | przekazanie`, err));
    });
  });
}
