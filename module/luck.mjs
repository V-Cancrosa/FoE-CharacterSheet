/**
 * Karty szczęścia w grze (zasady i obliczenia: luck-data.mjs). Przerzut porażki jest w attack.mjs (przycisk na karcie testu),
 * a karty przed rzutem i ratowanie krytycznej porażki — w rolls.mjs (okno rzutu i rollTest). Tutaj:
 *   - offerCritSave: po krytycznej porażce pytanie, czy wydać kartę na rzut Luck × 10 (zanim karta testu trafi na czat,
 *     więc wszystko, co zależy od wyniku — zamek, terminal, czar — widzi już uratowany wynik),
 *   - unik trafienia: przycisk na karcie trafienia dla właściciela celu (przed „Nanieś obrażenia”),
 *   - mniej ran: przycisk na karcie ran dla właściciela trafionego (tylko na najnowszej karcie tego celu),
 *   - wydanie karty z karty postaci: wyczyn, zmiana fabuły, oddanie karty innemu graczowi (za dwie swoje).
 * Karty mają postacie graczy (NPC nie); o karcie decyduje gracz postaci, a MG — gdy żaden jej gracz nie jest zalogowany.
 */
import { t } from "./i18n.mjs";
import { ATTRS } from "./data.mjs";
import { rollTest } from "./rolls.mjs";
import { toggleStatus } from "./conditions.mjs";
import { GIVE_COST, plainResult, saveOutcome, reduceExtra, woundsToRemove, lowestAttribute } from "./luck-data.mjs";

const F = "foe-rpg";
const SOCKET = `system.${F}`;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = m => ui.notifications.warn(m);

export const luckCards = actor => Math.max(0, Number(actor?.system?.resources?.luck?.value) || 0);

/** Czy ten użytkownik decyduje o kartach postaci: jej gracz, a MG — gdy żaden jej gracz nie jest zalogowany. */
export function decides(actor) {
  if (!actor?.isOwner) return false;
  if (!game.user.isGM) return true;
  return !game.users.some(u => !u.isGM && u.active && actor.testUserPermission?.(u, "OWNER"));
}

async function spend(actor, n = 1) {
  const have = luckCards(actor);
  if (have < n) { warn(t("{name}: not enough Luck cards ({have}/{n}).", { name: actor.name, have, n })); return false; }
  await actor.update({ "system.resources.luck.value": have - n });
  return true;
}

// ---------- ratowanie krytycznej porażki (wołane z rollTest) ----------
/**
 * Po krytycznej porażce: pytanie o kartę i rzut Luck × 10. Zwraca { cls (nowy wynik), lines, rolls, attempts }
 * albo null, gdy nikt nie wydał karty.
 */
export async function offerCritSave(actor, total) {
  if (actor?.type !== "character" || !decides(actor) || !luckCards(actor) || !actor.system?.attributes?.luck) return null;
  const tn = actor.system.attributes.luck.tn;
  const lines = [], rolls = [];
  let cls = "crit-fail";
  while (luckCards(actor) > 0) {
    const go = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Critical failure") },
      content: `<p>${t("{name} rolled {r} — a critical failure. Spend a Luck card ({n} left) and roll Luck × 10 (≤ {tn})? Success — a regular failure without side effects; critical success — a success; failure — the card is lost (you can give another one).",
        { name: esc(actor.name), r: total, n: luckCards(actor), tn })}</p>`,
      yes: { label: t("Spend a card"), icon: "fa-solid fa-clover" },
      no: { label: t("Accept") },
      rejectClose: false
    });
    if (!go || !(await spend(actor))) break;
    const roll = await new Roll("1d100").evaluate();
    rolls.push(roll);
    const res = plainResult(roll.total, tn);
    const out = saveOutcome(res);
    lines.push(t("Luck card: Luck × 10 ≤ {tn} → {r}: {what}", { tn, r: roll.total, what:
      out === "fail" ? t("saved — a regular failure") : out === "success" ? t("saved — a success!")
        : out === "stop" ? t("critical failure — no more attempts") : t("the card is lost") }));
    if (out === "fail" || out === "success") { cls = out; break; }
    if (out === "stop") break;
  }
  return rolls.length ? { cls, lines, rolls } : null;
}

// ---------- unik trafienia ----------
const woundsFor = attackId => game.messages?.some(m => m.flags?.[F]?.wounds?.attackMsg === attackId);

async function dodge(message, actor) {
  if (woundsFor(message.id)) return warn(t("Too late — the damage has already been applied."));
  if (actor.flags?.[F]?.luckDodge === message.id) return warn(t("{name} has already dodged this hit.", { name: actor.name }));
  if (!(await spend(actor))) return null;
  return rollTest(actor, {
    label: t("Luck: dodging the hit ({name})", { name: actor.name }), baseTn: actor.system.attributes.luck.tn, step: "1", mod: 0,
    notes: [t("Luck card")], noLuckSave: true, luckDodge: { of: message.id }
  });
}

/** Wynik uniku (u autora rzutu, także po przerzucie): sukces — trafienie nie liczy się przy nanoszeniu obrażeń. */
async function resolveDodge(msg) {
  const test = msg.flags[F].test;
  const actor = await fromUuid(test.actorUuid).catch(() => null);
  if (!actor) return;
  if (test.result === "success" || test.result === "crit-success") {
    await actor.setFlag(F, "luckDodge", test.luckDodge.of);
    ui.notifications.info(test.result === "crit-success"
      ? t("{name}: the shot misses — with an advantage (the GM decides which).", { name: actor.name })
      : t("{name}: the shot misses thanks to Luck.", { name: actor.name }));
  }
}

/** Cele, które uniknęły trafienia kartą (applyDamage je pomija). */
export const dodged = (actor, attackMsg) => !!attackMsg && actor?.flags?.[F]?.luckDodge === attackMsg;

// ---------- mniej ran ----------
/** Czy to najnowsza karta ran tego celu (zmniejszyć rany można tylko w chwili ich otrzymania). */
function latestFor(message, token) {
  const list = game.messages?.contents ?? [];
  const i = list.indexOf(message);
  return i >= 0 && !list.slice(i + 1).some(m => (m.flags?.[F]?.wounds?.fx ?? []).some(e => e.token === token));
}

async function removeWounds(actor, entry, msgId, count) {
  const state = actor.flags?.[F]?.luckReduce;
  const taken = state?.msg === msgId ? { ...(state.taken ?? {}) } : {};
  const plan = woundsToRemove(entry.locs ?? [], taken, count);
  const upd = {};
  let n = 0;
  for (const [loc, k] of Object.entries(plan)) {
    const cur = Number(actor.system.locations?.[loc]?.wounds) || 0;
    upd[`system.locations.${loc}.wounds`] = Math.max(0, cur - k);
    taken[loc] = (taken[loc] ?? 0) + k;
    n += k;
  }
  upd[`flags.${F}.luckReduce`] = { msg: msgId, taken };
  await actor.update(upd);
  // śmierć z tego trafienia cofa się, jeśli rany już nie zabijają
  if (actor.statuses?.has("dead") && !actor.system.dead) await toggleStatus(actor, "dead", false);
  return n;
}

async function reduce(message, actor, entry) {
  if (!latestFor(message, entry.token)) return warn(t("Wounds can be reduced only right when they are taken."));
  if (actor.flags?.[F]?.luckReduce?.msg === message.id) return warn(t("{name} has already used a Luck card on these wounds.", { name: actor.name }));
  if (!(await spend(actor))) return null;
  const first = await removeWounds(actor, entry, message.id, 1);
  const k = lowestAttribute(actor.system.attributes);
  ui.notifications.info(t("{name}: −{n} wound (Luck card); now a roll on the lowest attribute.", { name: actor.name, n: first }));
  return rollTest(actor, {
    label: t("Luck: fewer wounds — {attr} ({name})", { attr: ATTRS[k], name: actor.name }), baseTn: actor.system.attributes[k].tn, step: "1", mod: 0,
    notes: [t("each step harder than 1 — one wound less; a critical success — all of them")], noLuckSave: true,
    luckReduce: { of: message.id, token: entry.token, locs: entry.locs ?? [] }
  });
}

/** Wynik rzutu na mniej ran (u autora rzutu, także po przerzucie). */
async function resolveReduce(msg) {
  const test = msg.flags[F].test;
  const actor = await fromUuid(test.actorUuid).catch(() => null);
  if (!actor) return;
  const extra = reduceExtra({ total: msg.rolls?.[0]?.total, cls: test.result, tn: test.baseTn, mod: test.mod });
  if (!extra) return;
  const n = await removeWounds(actor, { locs: test.luckReduce.locs }, test.luckReduce.of, extra === Infinity ? 999 : extra);
  if (n) ui.notifications.info(t("{name}: another −{n} wounds thanks to Luck.", { name: actor.name, n }));
}

// ---------- karta postaci: wyczyn, fabuła, oddanie karty ----------
const playerCharacters = actor => game.actors.filter(a => a.type === "character" && a !== actor
  && game.users.some(u => !u.isGM && a.testUserPermission?.(u, "OWNER")));

export async function spendLuckDialog(actor) {
  if (!actor?.isOwner) return null;
  const have = luckCards(actor);
  if (!have) return warn(t("No Luck cards left."));
  const others = playerCharacters(actor);
  const content = `
    <div class="foe-dialog luck-dlg">
      <p>${t("{name} has {n} Luck cards.", { name: esc(actor.name), n: have })}</p>
      <div class="luck-opt">
        <label class="atk-row atk-check"><input type="radio" name="kind" value="amazing" checked> <span>${t("Something amazing")}</span>
          <small>${t("a feat beyond the character's abilities, if the GM agrees (1–3 cards, may still need a roll)")}</small></label>
        <label class="mod-row luck-sub" data-for="amazing">${t("Cards")} <input type="number" name="n" value="1" min="1" max="${Math.min(3, have)}" step="1"></label>
      </div>
      <div class="luck-opt">
        <label class="atk-row atk-check"><input type="radio" name="kind" value="story"> <span>${t("Story improvement")}</span>
          <small>${t("with the GM's consent, change what has just happened (1 card)")}</small></label>
      </div>
      ${others.length ? `<div class="luck-opt">
        <label class="atk-row atk-check"><input type="radio" name="kind" value="give" ${have < GIVE_COST ? "disabled" : ""}> <span>${t("Give a card to another player")}</span>
          <small>${t("costs two of your cards (p. 57)")}</small></label>
        <label class="mod-row luck-sub" data-for="give">${t("To")} <select name="to">${others.map(a => `<option value="${a.uuid}">${esc(a.name)}</option>`).join("")}</select></label>
      </div>` : ""}
      <label class="luck-what">${t("What happens")} <input type="text" name="what" value="" placeholder="${esc(t("e.g. the bullet ricochets off the helmet"))}"></label>
    </div>`;
  // pola dodatkowe działają tylko przy swojej opcji (liczba kart — „coś niesamowitego”, odbiorca — „daj kartę”)
  const sync = form => {
    const kind = form?.querySelector("input[name=kind]:checked")?.value;
    for (const row of form?.querySelectorAll(".luck-sub") ?? []) {
      const on = row.dataset.for === kind;
      row.classList.toggle("off", !on);
      for (const el of row.querySelectorAll("input, select")) el.disabled = !on;
    }
  };
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Spend a Luck card") },
    classes: ["foe-rpg", "foe-roll-dialog"],
    position: { width: 460 },
    content,
    rejectClose: false,
    render: (ev, dialog) => {
      const root = dialog instanceof HTMLElement ? dialog : dialog?.element ?? ev?.target?.element;
      const form = root?.tagName === "FORM" ? root : root?.querySelector?.("form");
      if (!form) return;
      form.addEventListener("change", () => sync(form));
      sync(form);
    },
    buttons: [{ action: "ok", label: t("Spend"), icon: "fa-solid fa-clover", default: true,
      callback: (ev, btn) => { const el = btn.form.elements; return { kind: el.kind.value, n: Number(el.n.value) || 1, to: el.to?.value ?? null, what: el.what.value.trim() }; } }]
  });
  if (!res) return null;
  const cost = res.kind === "give" ? GIVE_COST : res.kind === "story" ? 1 : Math.max(1, Math.min(3, Math.trunc(res.n)));
  if (res.kind === "give") {
    const to = res.to ? await fromUuid(res.to).catch(() => null) : null;
    if (!to) return warn(t("Pick a character."));
    if (!(await spend(actor, cost))) return null;
    if (to.isOwner) await to.update({ "system.resources.luck.value": luckCards(to) + 1 });
    else if (game.users.activeGM) game.socket.emit(SOCKET, { kind: "luck-give", to: to.uuid, from: actor.uuid, user: game.user.id });
    else { await actor.update({ "system.resources.luck.value": luckCards(actor) + cost }); return warn(t("Giving a card needs the GM logged in.")); }
    return card(actor, t("gives a Luck card to {name} (for two of their own)", { name: to.name }), res.what);
  }
  if (!(await spend(actor, cost))) return null;
  return card(actor, res.kind === "story" ? t("Story improvement — 1 Luck card (the GM decides)")
    : t("Something amazing — {n} Luck cards (the GM decides)", { n: cost }), res.what);
}

function card(actor, title, what) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="foe-card test"><div class="fc-tag"><span>PIPBUCK // ${t("LUCK")}</span><span><i class="fa-solid fa-clover"></i></span></div>
      <h3>${esc(actor.name)}</h3><div class="fc-meta">${esc(title)}${what ? `: <i>${esc(what)}</i>` : ""}</div></div>`
  });
}

// ---------- przyciski na kartach czatu ----------
function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "foe-luck";
  b.innerHTML = `<i class="fa-solid fa-clover"></i> ${esc(label)}`;
  b.addEventListener("click", async ev => { ev.preventDefault(); b.disabled = true; try { await onClick(); } finally { b.disabled = false; } });
  return b;
}

function decorate(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const box = root?.querySelector(".foe-card");
  if (!box) return;
  const test = message.flags?.[F]?.test;
  // trafienie: unik kartą dla celów, o których decyduje ten użytkownik
  if (test?.attack && !test.attack.aoe && (test.result === "success" || test.result === "crit-success") && !woundsFor(message.id)) {
    for (const u of test.attack.targets ?? []) {
      const actor = fromUuidSync?.(u)?.actor;
      if (actor?.type !== "character" || !decides(actor) || !luckCards(actor) || actor.flags?.[F]?.luckDodge === message.id) continue;
      box.append(button(t("Luck: {name} dodges", { name: actor.name }), () => dodge(message, actor)));
    }
  }
  // rany: mniej ran kartą
  const w = message.flags?.[F]?.wounds;
  for (const e of w?.fx ?? []) {
    if (!e.wounds || !e.locs?.length) continue;
    const actor = fromUuidSync?.(e.token)?.actor;
    if (actor?.type !== "character" || !decides(actor) || !luckCards(actor) || actor.flags?.[F]?.luckReduce?.msg === message.id || !latestFor(message, e.token)) continue;
    box.append(button(t("Luck: fewer wounds for {name}", { name: actor.name }), () => reduce(message, actor, e)));
  }
}

export function registerLuckHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { decorate(message, html); } catch (err) { console.warn(`${F} | luck buttons`, err); }
  });
  Hooks.on("createChatMessage", msg => {
    const test = msg.flags?.[F]?.test;
    if (!test || !msg.author?.isSelf) return;
    if (test.luckDodge?.of) resolveDodge(msg).catch(err => console.error(`${F} | luck dodge`, err));
    if (test.luckReduce?.of) resolveReduce(msg).catch(err => console.error(`${F} | luck wounds`, err));
  });
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, async p => {
      if (p?.kind !== "luck-give" || !game.users.activeGM?.isSelf) return;
      const to = await fromUuid(p.to).catch(() => null);
      if (to?.type === "character") await to.update({ "system.resources.luck.value": luckCards(to) + 1 });
    });
  });
}
