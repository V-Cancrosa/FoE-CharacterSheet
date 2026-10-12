/**
 * Sprzedaż komuś, kto stoi obok: oferta na czacie z ceną (podpowiedź z Mercantile, Tabela XXXI — trade-data.mjs).
 * Kupujący (jego gracz, a za NPC — MG) klika „Kupuję” albo „Odrzuć”; sprzedający może ofertę wycofać.
 * Przedmiot i kapsle przenosi przeglądarka MG (kanał systemu): sprawdza, czy sprzedający dalej ma przedmiot,
 * a kupujący kapsle (kupiec-NPC, który ma za mało, płaci za zgodą MG tyle, ile ma).
 */
import { F, SOCKET, esc, warn, stacks, qtyOf, capsOf, capsText, moveItem, viaGM } from "./give.mjs";

const STATUS = { open: "czeka na kupującego", sold: "sprzedane", declined: "odrzucone", withdrawn: "wycofane", failed: "nie doszło do skutku" };
const sync = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };

/** Oferta: target — { uuid, name } z okna wymiany. */
export async function offerSale(seller, item, target, qty, price) {
  if (!seller?.isOwner) return warn(`Nie jesteś właścicielem: ${seller?.name ?? "?"}.`);
  if (!item || !target?.uuid) return null;
  const n = stacks(item) ? Math.min(qtyOf(item), Math.max(1, Math.floor(Number(qty) || 1))) : 1;
  if (!n) return warn(`${item.name}: nie ma czego sprzedać.`);
  const offer = {
    id: foundry.utils.randomID(), seller: seller.uuid, sellerName: seller.name, buyer: target.uuid, buyerName: target.name,
    itemId: item.id, label: item.name, img: item.img || "icons/svg/item-bag.svg", qty: n, price: Math.max(0, Math.floor(Number(price) || 0)),
    value: Number(item.system?.value) || 0, status: "open", by: "", reason: ""
  };
  ui.notifications.info(`Oferta dla: ${target.name} — odpowiedź na czacie.`);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: seller }), content: offerCard(offer), flags: { [F]: { offer } } });
}

function offerCard(o) {
  return `<div class="foe-card foe-offer">
    <div class="fc-tag"><span>PIPBUCK // HANDEL</span><span>oferta</span></div>
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
  if (!o || o.status !== "open") return warn("Ta oferta jest już nieaktualna.");
  if (op === "withdraw") {
    const seller = await fromUuid(o.seller).catch(() => null);
    if (!game.user.isGM && !seller?.isOwner) return warn("Ofertę wycofuje sprzedający.");
    return viaGM({ kind: "sale", op, messageId: message.id }, applySale);
  }
  const buyer = await fromUuid(o.buyer).catch(() => null);
  if (!buyer) return warn("Kupującego już nie ma.");
  if (!game.user.isGM && !buyer.isOwner) return warn(`Odpowiada gracz postaci ${buyer.name} (albo MG).`);
  if (op === "decline") return viaGM({ kind: "sale", op, messageId: message.id }, applySale);
  let force = false;
  const caps = capsOf(buyer);
  if (caps < o.price) {
    if (buyer.hasPlayerOwner || !game.user.isGM) return warn(`${buyer.name} ma za mało kapsli: ${caps} z ${o.price}.`);
    force = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Kupiec: ${buyer.name}` }, rejectClose: false,
      content: `<p>${esc(buyer.name)} ma tylko ${capsText(caps)}, a cena to ${capsText(o.price)}. Kupić mimo to? Kapsle kupca spadną do 0, a sprzedający dostanie pełną cenę.</p>`
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
    if (!seller || !buyer) return set("failed", "nie ma już sprzedającego albo kupującego");
    const it = seller.items.get(o.itemId);
    if (!it || qtyOf(it) < o.qty) return set("failed", `${seller.name} nie ma już: ${o.label}${o.qty > 1 ? ` ×${o.qty}` : ""}`);
    const caps = capsOf(buyer);
    if (caps < o.price && (buyer.hasPlayerOwner || !force)) return set("failed", `${buyer.name} ma za mało kapsli (${caps} z ${o.price})`);
    const moved = await moveItem(seller, o.itemId, buyer, o.qty);
    if (!moved) return set("failed", "nie udało się przenieść przedmiotu");
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
  box.innerHTML = `<div class="fc-meta">${STATUS.open}${o.value ? ` · wartość z podręcznika: ${capsText(o.value * o.qty)}` : ""}</div>
    <div class="offer-btns">
      ${canBuy ? `<button type="button" class="foe-luck" data-foe-offer="accept"><i class="fa-solid fa-check"></i> Kupuję</button>
        <button type="button" class="foe-luck" data-foe-offer="decline"><i class="fa-solid fa-xmark"></i> Odrzuć</button>` : ""}
      ${canSell ? `<button type="button" class="foe-luck" data-foe-offer="withdraw"><i class="fa-solid fa-rotate-left"></i> Wycofaj</button>` : ""}
    </div>`;
  for (const b of box.querySelectorAll("[data-foe-offer]")) b.addEventListener("click", ev => {
    ev.preventDefault();
    answerOffer(message, b.dataset.foeOffer).catch(err => { console.error(`${F} | handel`, err); ui.notifications.error(`Handel: ${err.message}`); });
  });
}

export function registerSaleHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      if (payload?.kind !== "sale" || !game.users.activeGM?.isSelf) return;
      applySale(payload).catch(err => console.error(`${F} | handel`, err));
    });
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { decorate(message, html); } catch (err) { console.warn(`${F} | karta oferty`, err); }
  });
}
