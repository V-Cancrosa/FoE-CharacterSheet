/**
 * Sprzedaż komuś, kto stoi obok: oferta na czacie z ceną (podpowiedź z Mercantile, Tabela XXXI — trade-data.mjs).
 * Kupujący (jego gracz, a za NPC — MG) klika „Kupuję” albo „Odrzuć”; sprzedający może ofertę wycofać.
 * Przedmiot i kapsle przenosi przeglądarka MG (kanał systemu): sprawdza, czy sprzedający dalej ma przedmiot,
 * a kupujący kapsle (kupiec-NPC, który ma za mało, płaci za zgodą MG tyle, ile ma).
 */
import { F, SOCKET, esc, warn, stacks, qtyOf, capsOf, capsText, moveItem, viaGM } from "./give.mjs";
import { t, tmap } from "./i18n.mjs";

const STATUS = tmap({ open: "waiting for the buyer", sold: "sold", declined: "declined", withdrawn: "withdrawn", failed: "fell through" });
const sync = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };

/** Oferta: target — { uuid, name } z okna wymiany. */
export async function offerSale(seller, item, target, qty, price) {
  if (!seller?.isOwner) return warn(t("You don't own: {name}.", { name: seller?.name ?? "?" }));
  if (!item || !target?.uuid) return null;
  const n = stacks(item) ? Math.min(qtyOf(item), Math.max(1, Math.floor(Number(qty) || 1))) : 1;
  if (!n) return warn(t("{name}: there's nothing to sell.", { name: item.name }));
  const offer = {
    id: foundry.utils.randomID(), seller: seller.uuid, sellerName: seller.name, buyer: target.uuid, buyerName: target.name,
    itemId: item.id, label: item.name, img: item.img || "icons/svg/item-bag.svg", qty: n, price: Math.max(0, Math.floor(Number(price) || 0)),
    value: Number(item.system?.value) || 0, status: "open", by: "", reason: ""
  };
  ui.notifications.info(t("Offer for: {name} — the answer will be in the chat.", { name: target.name }));
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: seller }), content: offerCard(offer), flags: { [F]: { offer } } });
}

function offerCard(o) {
  return `<div class="foe-card foe-offer">
    <div class="fc-tag"><span>${t("PIPBUCK // SALE")}</span><span>${t("offer")}</span></div>
    <h3>${esc(o.sellerName)} → ${esc(o.buyerName)}</h3>
    <div class="offer-row"><img src="${esc(o.img)}" alt=""><span class="nm"><b>${esc(o.label)}</b>${o.qty > 1 ? ` ×${o.qty}` : ""}</span><span class="offer-price">${capsText(o.price)}</span></div>
    <div class="foe-offer-act"><div class="fc-meta">${STATUS[o.status] ?? ""}</div></div>
  </div>`;
}

// ======================================================================
// Odpowiedź na ofertę (gracz) i jej wykonanie (MG)
// ======================================================================

/** Odpowiedź na ofertę z karty: accept | decline | withdraw. */
export async function answerOffer(message, op) {
  const o = message.flags?.[F]?.offer;
  if (!o || o.status !== "open") return warn(t("This offer is no longer valid."));
  if (op === "withdraw") {
    const seller = await fromUuid(o.seller).catch(() => null);
    if (!game.user.isGM && !seller?.isOwner) return warn(t("Only the seller can withdraw the offer."));
    return viaGM({ kind: "sale", op, messageId: message.id }, applySale);
  }
  const buyer = await fromUuid(o.buyer).catch(() => null);
  if (!buyer) return warn(t("The buyer is gone."));
  if (!game.user.isGM && !buyer.isOwner) return warn(t("The player of {name} answers (or the GM).", { name: buyer.name }));
  if (op === "decline") return viaGM({ kind: "sale", op, messageId: message.id }, applySale);
  let force = false;
  const caps = capsOf(buyer);
  if (caps < o.price) {
    if (buyer.hasPlayerOwner || !game.user.isGM) return warn(t("{name} has too few caps: {have} of {price}.", { name: buyer.name, have: caps, price: o.price }));
    force = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Buyer: {name}", { name: buyer.name }) }, rejectClose: false,
      content: `<p>${t("{name} has only {have}, and the price is {price}. Buy anyway? The buyer's caps drop to 0, and the seller gets the full price.", { name: esc(buyer.name), have: capsText(caps), price: capsText(o.price) })}</p>`
    });
    if (!force) return null;
  }
  return viaGM({ kind: "sale", op: "accept", messageId: message.id, force }, applySale);
}

const BUSY = new Set();

async function applySale({ op, messageId, user, force = false }) {
  const msg = game.messages?.get(messageId);
  const o = msg?.flags?.[F]?.offer;
  if (!o || o.status !== "open" || BUSY.has(messageId)) return null;
  BUSY.add(messageId);
  try {
    const who = game.users.get(user);
    const seller = await fromUuid(o.seller).catch(() => null);
    const buyer = await fromUuid(o.buyer).catch(() => null);
    const owns = a => !who || who.isGM || !!a?.testUserPermission?.(who, "OWNER");
    const set = (status, reason = "") => msg.update({
      [`flags.${F}.offer.status`]: status, [`flags.${F}.offer.by`]: who?.name ?? "", [`flags.${F}.offer.reason`]: reason
    });
    if (op === "withdraw") return owns(seller) ? set("withdrawn") : null;
    if (op === "decline") return owns(buyer) ? set("declined") : null;
    if (op !== "accept" || !owns(buyer)) return null;
    if (!seller || !buyer) return set("failed", t("the seller or the buyer is gone"));
    const it = seller.items.get(o.itemId);
    if (!it || qtyOf(it) < o.qty) return set("failed", t("{name} no longer has: {item}", { name: seller.name, item: `${o.label}${o.qty > 1 ? ` ×${o.qty}` : ""}` }));
    const caps = capsOf(buyer);
    if (caps < o.price && (buyer.hasPlayerOwner || !force)) return set("failed", t("{name} has too few caps ({have} of {price})", { name: buyer.name, have: caps, price: o.price }));
    const moved = await moveItem(seller, o.itemId, buyer, o.qty);
    if (!moved) return set("failed", t("the item could not be moved"));
    if (o.price) {
      await buyer.update({ "system.caps": Math.max(0, caps - o.price) });
      await seller.update({ "system.caps": capsOf(seller) + o.price });
    }
    return set("sold");
  } finally {
    BUSY.delete(messageId);
  }
}

function decorate(message, html) {
  const o = message.flags?.[F]?.offer;
  if (!o) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const box = root?.querySelector(".foe-offer-act");
  if (!box) return;
  root.querySelector(".foe-offer")?.classList.add(`st-${o.status}`);
  if (o.status !== "open") {
    box.innerHTML = `<div class="fc-meta"><b>${esc(STATUS[o.status] ?? o.status)}</b>${o.by ? ` · ${esc(o.by)}` : ""}${o.reason ? ` — ${esc(o.reason)}` : ""}</div>`;
    return;
  }
  const canBuy = game.user.isGM || !!sync(o.buyer)?.isOwner;
  const canSell = game.user.isGM || !!sync(o.seller)?.isOwner;
  box.innerHTML = `<div class="fc-meta">${STATUS.open}${o.value ? ` · ${t("rulebook value: {v}", { v: capsText(o.value * o.qty) })}` : ""}</div>
    <div class="offer-btns">
      ${canBuy ? `<button type="button" class="foe-luck" data-foe-offer="accept"><i class="fa-solid fa-check"></i> ${t("I'll buy it")}</button>
        <button type="button" class="foe-luck" data-foe-offer="decline"><i class="fa-solid fa-xmark"></i> ${t("Decline")}</button>` : ""}
      ${canSell ? `<button type="button" class="foe-luck" data-foe-offer="withdraw"><i class="fa-solid fa-rotate-left"></i> ${t("Withdraw")}</button>` : ""}
    </div>`;
  for (const b of box.querySelectorAll("[data-foe-offer]")) b.addEventListener("click", ev => {
    ev.preventDefault();
    answerOffer(message, b.dataset.foeOffer).catch(err => { console.error(`${F} | trade`, err); ui.notifications.error(t("Trade: {msg}", { msg: err.message })); });
  });
}

export function registerSaleHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      if (payload?.kind !== "sale" || !game.users.activeGM?.isSelf) return;
      applySale(payload).catch(err => console.error(`${F} | trade`, err));
    });
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { decorate(message, html); } catch (err) { console.warn(`${F} | offer card`, err); }
  });
}
