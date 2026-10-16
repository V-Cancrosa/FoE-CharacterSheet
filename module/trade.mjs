/**
 * Okno wymiany przy przedmiocie i przy kapslach — tylko z kimś, kogo postać ma przy sobie na mapie:
 *   „Przekaż” — token stoi obok (styka się bokiem albo rogiem) albo jesteście w tym samym pojeździe,
 *   „Rzuć” — token w zasięgu rzutu; test Explosives, chybiony przedmiot upada obok celu (throw.mjs),
 *   „Sprzedaj” — postać albo NPC obok; oferta na czacie, cena z Mercantile (sale.mjs).
 * Lista bierze tylko tokeny z oglądanej sceny, które gracz widzi — nie zdradza NPC spoza mapy ani ukrytych.
 */
import { esc, warn, stacks, qtyOf, capsOf, capsText, handOver, gridOf, rectOf, tokenOf } from "./give.mjs";
import { tokenDistance, isAdjacent, throwSteps, suggestPrice, direction, DIR_NAMES } from "./trade-data.mjs";
import { throwItem, throwInfo, knowsTK } from "./throw.mjs";
import { offerSale } from "./sale.mjs";
import { t, tn, isPL, lang } from "./i18n.mjs";

const { DialogV2 } = foundry.applications.api;
const TYPES = ["character", "npc", "vehicle"];
const fmt = n => (isPL() ? String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ",") : String(Math.round((Number(n) || 0) * 100) / 100));
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : x?.[0] instanceof HTMLElement ? x[0] : null);
const mercantile = a => { const sk = a?.system?.skills?.mercantile; return sk ? (Number(sk.rank) || 0) + (Number(sk.rollMod) || 0) : 0; };

/** Pojazdy, w których siedzi aktor (albo sam pojazd), z załogą — w środku nie ma tokenów, a są obok siebie. */
function crewmates(source) {
  const out = [];
  const inside = v => (v.system?.vehicle?.crew ?? []).some(c => c.uuid === source.uuid);
  const vehicles = source.type === "vehicle" ? [source] : (game.actors?.filter(a => a.type === "vehicle" && inside(a)) ?? []);
  for (const v of vehicles) {
    if (v.uuid !== source.uuid) out.push({ actor: v, note: t("you're inside") });
    for (const c of v.system?.vehicle?.crew ?? []) {
      if (c.uuid === source.uuid) continue;
      let a = null;
      try { a = fromUuidSync(c.uuid); } catch { a = null; }
      if (a) out.push({ actor: a, note: t("in the vehicle {name}", { name: v.name }) });
    }
  }
  return out;
}

/**
 * Kto jest w pobliżu: { me, list: [{ uuid, token, name, type, pc, actor, adjacent, dist, note }] } — najpierw ci obok.
 * dist — odległość w ft (null: bez tokenu, np. w tym samym pojeździe); maxDist — dalszych nie pokazuje.
 */
export function nearby(source, maxDist = Infinity) {
  const map = new Map();
  const add = c => {
    const old = map.get(c.uuid);
    if (!old) return map.set(c.uuid, c);
    old.adjacent ||= c.adjacent;
    old.note ||= c.note;
    if (c.dist !== null && (old.dist === null || c.dist < old.dist)) Object.assign(old, { dist: c.dist, token: c.token, name: c.name });
  };
  const me = tokenOf(source);
  if (me) {
    const grid = gridOf(me.parent);
    const mine = rectOf(me, grid.size);
    for (const tk of canvas.tokens?.placeables ?? []) {
      const a = tk.actor;
      if (!a || tk.document === me || a.uuid === source.uuid || !TYPES.includes(a.type)) continue;
      if (!game.user.isGM && !(tk.isVisible ?? tk.visible)) continue;
      if (a.statuses?.has?.("dead")) continue;
      const r = rectOf(tk.document, grid.size);
      const elev = [me.elevation, tk.document.elevation];
      const adjacent = isAdjacent(mine, r, grid, elev);
      const dist = tokenDistance(mine, r, grid, elev);
      if (!adjacent && dist > maxDist) continue;
      // nazwa NPC tylko wtedy, gdy MG pokazuje ją graczom na mapie (najechanie albo zawsze)
      const known = game.user.isGM || a.isOwner || a.hasPlayerOwner || [30, 50].includes(Number(tk.document.displayName));
      add({ uuid: a.uuid, token: tk.document.uuid, name: known ? (tk.name || a.name) : t("unknown NPC"), type: a.type, pc: !!a.hasPlayerOwner, actor: a,
        adjacent, dist, note: known ? "" : DIR_NAMES[direction(mine, r)] });
    }
  }
  for (const { actor: a, note } of crewmates(source)) {
    if (a.uuid === source.uuid || !TYPES.includes(a.type)) continue;
    add({ uuid: a.uuid, token: null, name: a.name, type: a.type, pc: !!a.hasPlayerOwner, actor: a, adjacent: true, dist: null, note });
  }
  const list = [...map.values()].sort((x, y) => (Number(y.adjacent) - Number(x.adjacent)) || ((x.dist ?? 0) - (y.dist ?? 0)) || x.name.localeCompare(y.name, lang()));
  return { me, list };
}

const where = c => (c.dist === null ? c.note : `${c.adjacent ? t("adjacent") : `${fmt(c.dist)} ft`}${c.note ? `, ${c.note}` : ""}`) + (c.type === "vehicle" ? `, ${t("hold")}` : "");

/** Okno wymiany; item = null — kapsle. */
async function tradeDialog(source, item = null) {
  if (!source?.isOwner) return warn(t("You don't own: {name}.", { name: source?.name ?? "?" }));
  const caps = !item;
  const have = caps ? capsOf(source) : qtyOf(item);
  if (have <= 0) return warn(caps ? t("{name}: no caps.", { name: source.name }) : t("{name}: nothing to give.", { name: item.name }));
  const vehicle = source.type === "vehicle";
  const tk = !vehicle && knowsTK(source);
  // dalej niż najdalszy możliwy rzut (najlżejsza rzecz) nikogo nie pokazujemy
  const reach = vehicle ? 0 : Math.max(throwInfo(source, null, 1, false).max || 0, tk ? throwInfo(source, null, 1, true).max || 0 : 0);
  const { me, list } = nearby(source, reach);
  if (!list.length) {
    return warn(me
      ? t("There's nobody nearby — place your tokens next to each other (or throw to someone you can see in range).")
      : t("{name} has no token on this scene — exchange works only between tokens on the map (or in the same vehicle).", { name: source.name }));
  }
  const byUuid = new Map(list.map(c => [c.uuid, c]));
  const near = list.filter(c => c.adjacent), far = list.filter(c => !c.adjacent);
  const opt = c => `<option value="${esc(c.uuid)}">${esc(c.name)} — ${esc(where(c))}</option>`;
  const select = [
    near.length ? `<optgroup label="${t("Adjacent")}">${near.map(opt).join("")}</optgroup>` : "",
    far.length ? `<optgroup label="${t("Further away — throw only")}">${far.map(opt).join("")}</optgroup>` : ""
  ].join("");
  const unitW = Number(item?.system?.weight) || 0, unitV = Number(item?.system?.value) || 0;
  const info = caps
    ? `${t("Caps:")} <b>${have}</b>`
    : `<b>${esc(item.name)}</b>${stacks(item) ? ` — ${t("you have {n}", { n: have })}` : ""} · ${fmt(unitW)} lb${stacks(item) ? t("/each") : ""} · ${t("value {v}", { v: unitV })}${stacks(item) ? t("/each") : ""}${item.system?.equipped ? ` · ${t("worn / in use right now")}` : ""}`;
  const sell = !caps && !vehicle;
  const content = `<div class="foe-dialog trade-dlg">
    <div class="atk-info"><div>${info}</div></div>
    ${caps || have > 1 ? `<label class="atk-row">${t("How many")} <input type="number" name="qty" value="${caps ? Math.min(10, have) : have}" min="1" max="${have}"></label>` : ""}
    <label class="atk-row">${t("To whom")} <select name="to">${select}</select></label>
    ${tk ? `<label class="atk-row">${t("Throw")} <select name="how"><option value="hoof">${t("with a hoof / in the mouth (STR)")}</option><option value="tk">${t("with telekinesis (INT)")}</option></select></label>` : ""}
    ${vehicle ? "" : `<p class="hint trade-throw"></p>`}
    ${sell ? `<label class="atk-row trade-price">${t("Price (caps)")} <input type="number" name="price" value="0" min="0" step="1"></label><p class="hint trade-price-hint"></p>` : ""}
    <p class="hint">${t("You can give and sell only to someone adjacent (the tokens touch) or in the same vehicle; throw — to someone you can see in range (Explosives test).")}</p>
  </div>`;

  const read = action => (ev, btn) => {
    const el = btn.form.elements;
    return { action, to: el.to.value, qty: Number(el.qty?.value ?? 1) || 1, price: Number(el.price?.value ?? 0) || 0, how: el.how?.value ?? "hoof" };
  };
  const render = (event, dialog) => {
    const root = elementOf(dialog) ?? elementOf(event?.target);
    const form = root?.querySelector("form") ?? root;
    const el = form?.elements;
    if (!el?.to) return;
    const button = a => root.querySelector(`button[data-action="${a}"]`);
    const throwHint = root.querySelector(".trade-throw"), priceHint = root.querySelector(".trade-price-hint");
    const state = () => {
      const c = byUuid.get(el.to.value);
      const qty = Math.min(have, Math.max(1, Number(el.qty?.value) || 1));
      return { c, qty };
    };
    const refreshPrice = () => {
      const { c, qty } = state();
      if (!el.price || !c) return;
      const s = suggestPrice({ value: unitV, qty: stacks(item) ? qty : 1, sellerPC: !!source.hasPlayerOwner, buyerPC: c.pc, sellerEff: mercantile(source), buyerEff: mercantile(c.actor) });
      el.price.value = s.price;
      if (priceHint) priceHint.textContent = c.adjacent && c.type !== "vehicle" ? t("Suggested price: {rule} (value {caps}). The buyer still has to accept it.", { rule: s.rule, caps: capsText(unitV * (stacks(item) ? qty : 1)) }) : "";
    };
    const refresh = () => {
      const { c, qty } = state();
      const prof = vehicle ? null : throwInfo(source, item, qty, el.how?.value === "tk");
      const steps = c && c.dist !== null && prof?.ok ? throwSteps(c.dist, prof.inc) : null;
      const canThrow = !!c?.token && !!prof?.ok && steps !== null;
      if (throwHint) {
        throwHint.textContent = !c ? ""
          : !c.token ? t("Throw: only to someone visible on the map.")
          : !prof.ok ? t("Throw: {why}.", { why: prof.reason })
          : steps === null ? t("Throw: too far — {d} ft, and the throw reaches {max} ft (increment {inc} ft).", { d: fmt(c.dist), max: prof.max, inc: prof.inc })
          : t("Throw (Explosives): increment {inc} ft, reaches {max} ft · {d} ft to the target — {pen}.", { inc: prof.inc, max: prof.max, d: fmt(c.dist), pen: steps ? tn(steps, "{n} MFD step harder", "{n} MFD steps harder") : t("no distance penalty") });
      }
      const give = button("give"), toss = button("throw"), sale = button("sell");
      if (give) { give.disabled = !c?.adjacent; give.title = c?.adjacent ? "" : t("Only to someone adjacent — walk up or throw"); }
      if (toss) { toss.disabled = !canThrow; toss.title = canThrow ? "" : t("Out of throwing range or too heavy"); }
      if (sale) { const ok = !!c?.adjacent && c.type !== "vehicle"; sale.disabled = !ok; sale.title = ok ? "" : t("You can sell to an adjacent character or NPC"); }
    };
    el.to.addEventListener("change", () => { refresh(); refreshPrice(); });
    el.qty?.addEventListener("input", () => { refresh(); refreshPrice(); });
    el.how?.addEventListener("change", refresh);
    refresh();
    refreshPrice();
  };

  const pick = await DialogV2.wait({
    window: { title: `${caps ? t("Caps") : item.name}: ${[t("give"), vehicle ? "" : t("throw"), sell ? t("sell") : ""].filter(Boolean).join(", ")}` },
    classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false, content, render,
    buttons: [
      { action: "give", label: t("Give"), icon: "fa-solid fa-hand-holding", default: true, callback: read("give") },
      ...(vehicle ? [] : [{ action: "throw", label: t("btn|Throw"), icon: "fa-solid fa-baseball", callback: read("throw") }]),
      ...(sell ? [{ action: "sell", label: t("Sell"), icon: "fa-solid fa-sack-dollar", callback: read("sell") }] : [])
    ]
  });
  if (!pick || typeof pick !== "object") return null;
  const c = byUuid.get(pick.to);
  if (!c) return null;
  const qty = Math.min(have, Math.max(1, Math.floor(pick.qty) || 1));
  if (pick.action === "give") {
    if (!c.adjacent) return warn(t("{name} isn't adjacent — walk up or throw.", { name: c.name }));
    return handOver(caps ? { op: "caps", from: source.uuid, to: c.uuid, toName: c.name, qty } : { op: "item", from: source.uuid, itemId: item.id, to: c.uuid, toName: c.name, qty });
  }
  if (pick.action === "throw") return throwItem(source, { item, caps: caps ? qty : 0, qty, target: c, tk: pick.how === "tk" });
  if (pick.action === "sell") {
    if (!c.adjacent || c.type === "vehicle") return warn(t("{name}: you can sell only to a character or NPC who is adjacent.", { name: c.name }));
    return offerSale(source, item, c, qty, pick.price);
  }
  return null;
}

/** „Wymiana” przy przedmiocie (broń, pancerz, ekwipunek, ładownia pojazdu). */
export const giveItem = (source, item) => (item ? tradeDialog(source, item) : null);
/** „Wymiana” przy kapslach. */
export const giveCaps = source => tradeDialog(source, null);
