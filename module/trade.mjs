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

const { DialogV2 } = foundry.applications.api;
const TYPES = ["character", "npc", "vehicle"];
const fmt = n => String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ",");
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : x?.[0] instanceof HTMLElement ? x[0] : null);
const mercantile = a => { const sk = a?.system?.skills?.mercantile; return sk ? (Number(sk.rank) || 0) + (Number(sk.rollMod) || 0) : 0; };

/** Pojazdy, w których siedzi aktor (albo sam pojazd), z załogą — w środku nie ma tokenów, a są obok siebie. */
function crewmates(source) {
  const out = [];
  const inside = v => (v.system?.vehicle?.crew ?? []).some(c => c.uuid === source.uuid);
  const vehicles = source.type === "vehicle" ? [source] : (game.actors?.filter(a => a.type === "vehicle" && inside(a)) ?? []);
  for (const v of vehicles) {
    if (v.uuid !== source.uuid) out.push({ actor: v, note: "jesteś w środku" });
    for (const c of v.system?.vehicle?.crew ?? []) {
      if (c.uuid === source.uuid) continue;
      let a = null;
      try { a = fromUuidSync(c.uuid); } catch { a = null; }
      if (a) out.push({ actor: a, note: `w pojeździe ${v.name}` });
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
    for (const t of canvas.tokens?.placeables ?? []) {
      const a = t.actor;
      if (!a || t.document === me || a.uuid === source.uuid || !TYPES.includes(a.type)) continue;
      if (!game.user.isGM && !(t.isVisible ?? t.visible)) continue;
      if (a.statuses?.has?.("dead")) continue;
      const r = rectOf(t.document, grid.size);
      const elev = [me.elevation, t.document.elevation];
      const adjacent = isAdjacent(mine, r, grid, elev);
      const dist = tokenDistance(mine, r, grid, elev);
      if (!adjacent && dist > maxDist) continue;
      // nazwa NPC tylko wtedy, gdy MG pokazuje ją graczom na mapie (najechanie albo zawsze)
      const known = game.user.isGM || a.isOwner || a.hasPlayerOwner || [30, 50].includes(Number(t.document.displayName));
      add({ uuid: a.uuid, token: t.document.uuid, name: known ? (t.name || a.name) : "nieznany NPC", type: a.type, pc: !!a.hasPlayerOwner, actor: a,
        adjacent, dist, note: known ? "" : DIR_NAMES[direction(mine, r)] });
    }
  }
  for (const { actor: a, note } of crewmates(source)) {
    if (a.uuid === source.uuid || !TYPES.includes(a.type)) continue;
    add({ uuid: a.uuid, token: null, name: a.name, type: a.type, pc: !!a.hasPlayerOwner, actor: a, adjacent: true, dist: null, note });
  }
  const list = [...map.values()].sort((x, y) => (Number(y.adjacent) - Number(x.adjacent)) || ((x.dist ?? 0) - (y.dist ?? 0)) || x.name.localeCompare(y.name, "pl"));
  return { me, list };
}

const where = c => (c.dist === null ? c.note : `${c.adjacent ? "obok" : `${fmt(c.dist)} ft`}${c.note ? `, ${c.note}` : ""}`) + (c.type === "vehicle" ? ", ładownia" : "");

/** Okno wymiany; item = null — kapsle. */
async function tradeDialog(source, item = null) {
  if (!source?.isOwner) return warn(`Nie jesteś właścicielem: ${source?.name ?? "?"}.`);
  const caps = !item;
  const have = caps ? capsOf(source) : qtyOf(item);
  if (have <= 0) return warn(caps ? `${source.name}: brak kapsli.` : `${item.name}: nic do przekazania.`);
  const vehicle = source.type === "vehicle";
  const tk = !vehicle && knowsTK(source);
  // dalej niż najdalszy możliwy rzut (najlżejsza rzecz) nikogo nie pokazujemy
  const reach = vehicle ? 0 : Math.max(throwInfo(source, null, 1, false).max || 0, tk ? throwInfo(source, null, 1, true).max || 0 : 0);
  const { me, list } = nearby(source, reach);
  if (!list.length) {
    return warn(me
      ? "Nikogo nie ma w pobliżu — stańcie tokenami obok siebie (albo rzuć komuś, kogo widzisz w zasięgu)."
      : `${source.name} nie ma tokena na tej scenie — wymiana działa tylko między tokenami na mapie (albo w tym samym pojeździe).`);
  }
  const byUuid = new Map(list.map(c => [c.uuid, c]));
  const near = list.filter(c => c.adjacent), far = list.filter(c => !c.adjacent);
  const opt = c => `<option value="${esc(c.uuid)}">${esc(c.name)} — ${esc(where(c))}</option>`;
  const select = [
    near.length ? `<optgroup label="Obok">${near.map(opt).join("")}</optgroup>` : "",
    far.length ? `<optgroup label="Dalej — tylko rzut">${far.map(opt).join("")}</optgroup>` : ""
  ].join("");
  const unitW = Number(item?.system?.weight) || 0, unitV = Number(item?.system?.value) || 0;
  const info = caps
    ? `Kapsle: <b>${have}</b>`
    : `<b>${esc(item.name)}</b>${stacks(item) ? ` — masz ${have}` : ""} · ${fmt(unitW)} lb${stacks(item) ? "/szt." : ""} · wartość ${unitV}${stacks(item) ? "/szt." : ""}${item.system?.equipped ? " · teraz założone / w użyciu" : ""}`;
  const sell = !caps && !vehicle;
  const content = `<div class="foe-dialog trade-dlg">
    <div class="atk-info"><div>${info}</div></div>
    ${caps || have > 1 ? `<label class="atk-row">Ile <input type="number" name="qty" value="${caps ? Math.min(10, have) : have}" min="1" max="${have}"></label>` : ""}
    <label class="atk-row">Do kogo <select name="to">${select}</select></label>
    ${tk ? `<label class="atk-row">Rzut <select name="how"><option value="hoof">kopytem / w pysku (STR)</option><option value="tk">telekinezą (INT)</option></select></label>` : ""}
    ${vehicle ? "" : `<p class="hint trade-throw"></p>`}
    ${sell ? `<label class="atk-row trade-price">Cena (kapsle) <input type="number" name="price" value="0" min="0" step="1"></label><p class="hint trade-price-hint"></p>` : ""}
    <p class="hint">Przekazać i sprzedać można tylko komuś obok (tokeny się stykają) albo w tym samym pojeździe; rzucić — komuś, kogo widzisz w zasięgu (test Explosives).</p>
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
      if (priceHint) priceHint.textContent = c.adjacent && c.type !== "vehicle" ? `Proponowana cena: ${s.rule} (wartość ${capsText(unitV * (stacks(item) ? qty : 1))}). Kupujący i tak musi ją przyjąć.` : "";
    };
    const refresh = () => {
      const { c, qty } = state();
      const prof = vehicle ? null : throwInfo(source, item, qty, el.how?.value === "tk");
      const steps = c && c.dist !== null && prof?.ok ? throwSteps(c.dist, prof.inc) : null;
      const canThrow = !!c?.token && !!prof?.ok && steps !== null;
      if (throwHint) {
        throwHint.textContent = !c ? ""
          : !c.token ? "Rzut: tylko do kogoś, kogo widać na mapie."
          : !prof.ok ? `Rzut: ${prof.reason}.`
          : steps === null ? `Rzut: za daleko — ${fmt(c.dist)} ft, a rzut sięga ${prof.max} ft (przedział ${prof.inc} ft).`
          : `Rzut (Explosives): przedział ${prof.inc} ft, sięga ${prof.max} ft · do celu ${fmt(c.dist)} ft — ${steps ? `${steps} ${steps === 1 ? "krok" : "kroki"} MFD trudniej` : "bez kary za odległość"}.`;
      }
      const give = button("give"), toss = button("throw"), sale = button("sell");
      if (give) { give.disabled = !c?.adjacent; give.title = c?.adjacent ? "" : "Tylko komuś obok — podejdź albo rzuć"; }
      if (toss) { toss.disabled = !canThrow; toss.title = canThrow ? "" : "Poza zasięgiem rzutu albo za ciężkie"; }
      if (sale) { const ok = !!c?.adjacent && c.type !== "vehicle"; sale.disabled = !ok; sale.title = ok ? "" : "Sprzedać można postaci albo NPC obok"; }
    };
    el.to.addEventListener("change", () => { refresh(); refreshPrice(); });
    el.qty?.addEventListener("input", () => { refresh(); refreshPrice(); });
    el.how?.addEventListener("change", refresh);
    refresh();
    refreshPrice();
  };

  const pick = await DialogV2.wait({
    window: { title: `${caps ? "Kapsle" : item.name}: przekaż${vehicle ? "" : ", rzuć"}${sell ? ", sprzedaj" : ""}` },
    classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false, content, render,
    buttons: [
      { action: "give", label: "Przekaż", icon: "fa-solid fa-hand-holding", default: true, callback: read("give") },
      ...(vehicle ? [] : [{ action: "throw", label: "Rzuć", icon: "fa-solid fa-baseball", callback: read("throw") }]),
      ...(sell ? [{ action: "sell", label: "Sprzedaj", icon: "fa-solid fa-sack-dollar", callback: read("sell") }] : [])
    ]
  });
  if (!pick || typeof pick !== "object") return null;
  const c = byUuid.get(pick.to);
  if (!c) return null;
  const qty = Math.min(have, Math.max(1, Math.floor(pick.qty) || 1));
  if (pick.action === "give") {
    if (!c.adjacent) return warn(`${c.name} nie stoi obok — podejdź albo rzuć.`);
    return handOver(caps ? { op: "caps", from: source.uuid, to: c.uuid, toName: c.name, qty } : { op: "item", from: source.uuid, itemId: item.id, to: c.uuid, toName: c.name, qty });
  }
  if (pick.action === "throw") return throwItem(source, { item, caps: caps ? qty : 0, qty, target: c, tk: pick.how === "tk" });
  if (pick.action === "sell") {
    if (!c.adjacent || c.type === "vehicle") return warn(`${c.name}: sprzedać można postaci albo NPC, który stoi obok.`);
    return offerSale(source, item, c, qty, pick.price);
  }
  return null;
}

/** „Wymiana” przy przedmiocie (broń, pancerz, ekwipunek, ładownia pojazdu). */
export const giveItem = (source, item) => (item ? tradeDialog(source, item) : null);
/** „Wymiana” przy kapslach. */
export const giveCaps = source => tradeDialog(source, null);
