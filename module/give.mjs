/**
 * Wymiana — rdzeń: przeniesienie przedmiotu albo kapsli między aktorami i kanał do MG.
 * Gdy gracz nie jest właścicielem odbiorcy, przeniesienie wykonuje przeglądarka MG (kanał systemu) — sprawdza przy tym,
 * że prośba pochodzi od właściciela dającego. Na czacie zostaje ślad wymiany.
 * Okno wymiany (kto stoi obok, rzut, sprzedaż): trade.mjs; rzut przedmiotem: throw.mjs; sprzedaż: sale.mjs.
 */
import { addItemToActor } from "./catalog.mjs";
import { t, tn } from "./i18n.mjs";

export const F = "foe-rpg";
export const SOCKET = `system.${F}`;
export const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
export const warn = msg => { ui.notifications.warn(msg); return null; };

export const stacks = it => it?.type === "gear" || (it?.type === "weapon" && !!it.system?.consumable);
export const qtyOf = it => (stacks(it) ? Math.max(0, Number(it.system?.qty) || 0) : 1);
export const capsOf = actor => Math.max(0, Number(actor?.system?.caps) || 0);
/** „1 cap”, „3 caps” — po polsku „1 kapsel”, „3 kapsle”, „5 kapsli”, „22 kapsle”. */
export const capsText = n => tn(Number(n) || 0, "{n} cap", "{n} caps");

/** Siatka sceny: { size (px), distance (ft na pole), diagonals (reguła przekątnych), gridless }. */
export function gridOf(scene) {
  const g = scene?.grid ?? {};
  let diagonals = g.diagonals;
  if (diagonals === undefined) { try { diagonals = game.settings.get("core", "gridDiagonals"); } catch { diagonals = 0; } }
  return { size: Number(g.size) || 100, distance: Number(g.distance) || 5, diagonals: Number(diagonals) || 0, gridless: g.type === 0 };
}

/** Prostokąt tokenu w px. */
export const rectOf = (doc, size) => ({
  x: Number(doc?.x) || 0, y: Number(doc?.y) || 0, w: (Number(doc?.width) || 1) * size, h: (Number(doc?.height) || 1) * size
});

/** Token aktora na oglądanej scenie (zaznaczony, gdy jest kilka); bez tokenu — null. */
export function tokenOf(actor) {
  const scene = canvas?.ready ? canvas.scene : null;
  if (!scene || !actor) return null;
  const docs = actor.isToken ? [actor.token].filter(t => t?.parent?.id === scene.id) : (actor.getActiveTokens?.(true, true) ?? []);
  return docs.find(d => d.object?.controlled) ?? docs[0] ?? null;
}

/** Dane przedmiotu do skopiowania: bez id, zdjęty, z ilością n (stosy). */
export function itemCopy(it, n) {
  const data = it.toObject();
  delete data._id;
  if (data.system) {
    if ("equipped" in data.system) data.system.equipped = false;
    if (stacks(it)) data.system.qty = n;
  }
  return data;
}

/** Dodaje przedmiot z danych (stos — n sztuk, inne — jedna sztuka). */
export function putItem(dst, data, n = 1) {
  const d = foundry.utils.deepClone(data);
  const stack = d.type === "gear" || (d.type === "weapon" && d.system?.consumable);
  if (stack) d.system.qty = n;
  return addItemToActor(dst, d, stack ? n : 1);
}

/** Zdejmuje n sztuk przedmiotu z aktora (stos zmniejsza, resztę usuwa). */
export async function dropItem(it, n) {
  const have = qtyOf(it);
  if (stacks(it) && n < have) return it.update({ "system.qty": have - n });
  return it.delete();
}

/** Przenosi przedmiot: najpierw do odbiorcy, potem zdejmuje z dającego. Zwraca { name, n } albo null. */
export async function moveItem(src, itemId, dst, qty) {
  const it = src?.items?.get(itemId);
  if (!it || !dst) return null;
  const have = qtyOf(it);
  const n = stacks(it) ? Math.min(have, Math.max(1, Number(qty) || 1)) : 1;
  if (n <= 0) return null;
  await putItem(dst, itemCopy(it, n), n);
  await dropItem(it, n);
  return { name: it.name, n };
}

/** Przenosi kapsle; zwraca liczbę przeniesionych. */
export async function moveCaps(src, dst, qty) {
  const have = capsOf(src);
  const n = Math.min(have, Math.max(1, Math.floor(Number(qty) || 1)));
  if (!n || !dst) return 0;
  await src.update({ "system.caps": have - n });
  await dst.update({ "system.caps": capsOf(dst) + n });
  return n;
}

/**
 * MG dodaje (delta > 0) albo zabiera (delta < 0) kapsle — nagroda, łapówka, kradzież, poprawka. Nie schodzi poniżej zera;
 * na czacie zostaje wpis z powodem (widoczność jak w przełączniku trybu nad czatem). Zwraca faktyczną zmianę.
 */
export async function adjustCaps(actor, delta, reason = "") {
  if (!game.user.isGM) return warn(t("Only the GM adds or takes away caps — to give caps to someone, use the button in the Gear tab."));
  const want = Math.trunc(Number(delta) || 0);
  if (!actor || !want) return null;
  const have = capsOf(actor);
  const total = Math.max(0, have + want);
  const applied = total - have;
  if (!applied) return warn(t("{name} has no caps to take away.", { name: actor.name }));
  await actor.update({ "system.caps": total });
  const why = String(reason ?? "").trim();
  const notes = [why, -want > have ? t("only {caps} on hand", { caps: capsText(have) }) : "", t("now: {caps}", { caps: capsText(total) })];
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="foe-card reload"><div class="fc-tag"><span>${t("PIPBUCK // CAPS")}</span><span>${t("GM")}</span></div>
      <h3>${esc(actor.name)}: ${applied > 0 ? "+" : "−"}${esc(capsText(Math.abs(applied)))}</h3><div class="fc-calc">${notes.filter(Boolean).map(esc).join(" · ")}</div></div>`
  });
  return applied;
}

/** Okno MG przy kapslach na karcie: ile, za co, „Dodaj” albo „Zabierz” (liczba ujemna też zabiera). */
export async function promptAdjustCaps(actor) {
  if (!game.user.isGM) return warn(t("Only the GM adds or takes away caps — to give caps to someone, use the button in the Gear tab."));
  const read = sign => (ev, btn) => {
    const el = btn.form.elements;
    const n = Math.trunc(Number(el.n.value) || 0);
    return { n: sign < 0 ? -Math.abs(n) : n, reason: el.reason.value };
  };
  const r = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Caps: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog caps-dlg">
      <div class="atk-info"><div>${t("Caps:")} <b>${capsOf(actor)}</b></div></div>
      <label class="atk-row">${t("How many")} <input type="number" name="n" value="10" step="1" autofocus></label>
      <label class="atk-row">${t("What for (optional)")} <input type="text" name="reason" placeholder="${esc(t("e.g. a job reward"))}"></label>
      <p class="hint">${t("Typing -50 takes away too. Caps never drop below 0. A short note goes to chat (to hide it from players, pick “GM roll” in the switch above the chat).")}</p>
    </div>`,
    buttons: [
      { action: "add", label: t("Add"), icon: "fa-solid fa-plus", default: true, callback: read(1) },
      { action: "take", label: t("Take away"), icon: "fa-solid fa-minus", callback: read(-1) }
    ]
  });
  if (!r?.n) return null;
  return adjustCaps(actor, r.n, r.reason);
}

/** Operacja wykonywana przez MG: MG robi ją od razu, gracz wysyła ją kanałem systemu. */
export function viaGM(payload, apply) {
  const p = { user: game.user.id, ...payload };
  if (game.user.isGM) return apply(p);
  if (!game.users.activeGM) return warn(t("This requires a logged-in GM."));
  game.socket.emit(SOCKET, p);
  return true;
}

/** Przekazanie: właściciel obu stron (albo MG) przenosi sam; inaczej prośba do MG. */
export async function handOver(data) {
  const payload = { kind: "give", user: game.user.id, ...data };
  const to = await fromUuid(data.to).catch(() => null);
  if (game.user.isGM || to?.isOwner) return transfer(payload);
  if (!game.users.activeGM) return warn(t("Giving to another character requires a logged-in GM."));
  game.socket.emit(SOCKET, payload);
  ui.notifications.info(t("Hand-over sent — the GM will record it."));
  return true;
}

/**
 * Wykonanie przeniesienia (MG albo właściciel obu stron). tag — dopisek na karcie („przekazanie”, „rzut — złapane”);
 * toName — nazwa odbiorcy, jaką widział gracz (NPC z ukrytą nazwą to „nieznany NPC”).
 */
export async function transfer({ op, from, itemId, to, toName, qty, user, tag = t("hand-over") }) {
  const src = await fromUuid(from).catch(() => null);
  const dst = await fromUuid(to).catch(() => null);
  if (!src || !dst || src.uuid === dst.uuid) return null;
  const who = game.users.get(user);
  if (who && !who.isGM && !src.testUserPermission?.(who, "OWNER")) return null;   // tylko właściciel może oddawać swoje rzeczy
  let line;
  if (op === "caps") {
    const n = await moveCaps(src, dst, qty);
    if (!n) return null;
    line = capsText(n);
  } else {
    const r = await moveItem(src, itemId, dst, qty);
    if (!r) return null;
    line = `${r.name}${r.n > 1 ? ` ×${r.n}` : ""}`;
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: src }),
    content: `<div class="foe-card reload"><div class="fc-tag"><span>${t("PIPBUCK // TRADE")}</span><span>${esc(tag)}</span></div>
      <h3>${esc(src.name)} → ${esc(toName || dst.name)}</h3><div class="fc-calc">${esc(line)}</div></div>`
  });
}

export function registerGiveHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      if (payload?.kind !== "give" || !game.users.activeGM?.isSelf) return;
      transfer(payload).catch(err => console.error(`${F} | hand-over`, err));
    });
  });
}
