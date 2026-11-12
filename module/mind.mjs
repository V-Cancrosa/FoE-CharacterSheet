/**
 * Szaleństwo i dziczenie ghuli (s. 613–614).
 *   - Szaleństwo (opcja świata insanityRolls): gdy postać gracza dostaje wadę psychiczną w trakcie gry (nie w kreatorze),
 *     MG dostaje tajny rzut INT (MFD 1, każda Psychosis o krok łatwiej). Krytyczny sukces — karta decyzji MG: postać
 *     traci rozum (cecha „Obłęd”; MG prowadzi ją jako NPC albo omawia z graczem, jak widzi świat).
 *   - Dziczenie ghuli: świadomy ghul traci Cel → bez wsparcia przyjaciół dziczeje w ciągu 1k20 minut; przy przyjaciołach
 *     proces czeka. Ghul z promieniowania z oblanym INT dziczeje w ciągu kilku dni (system: 1k4+1). Gdy czas minie —
 *     karta decyzji MG (cecha „Dziki ghul”). Odzyskany Cel przerywa dziczenie; dziki ghul wraca tylko decyzją MG.
 * Flaga aktora foe-rpg.feral: { lost (czas utraty), support (wsparcie przyjaciół), due (termin), at (zdziczał) }.
 */
import { t } from "./i18n.mjs";
import { attrTest } from "./attr-test.mjs";
import { deadly, registerConfirmAction } from "./confirm.mjs";
import { isGhoul } from "./body.mjs";
import { HINDRANCES } from "./creation-data.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const setting = (key, fallback = true) => { try { return game.settings.get(F, key) ?? fallback; } catch { return fallback; } };
const now = () => Number(game.time?.worldTime) || 0;
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const ownersAndGM = actor => game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
const MIN = 60, DAY = 86400;

function card(actor, lines, { warn = "", gmOnly = false, tag = t("MIND") } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: gmOnly ? gmIds() : ownersAndGM(actor),
    content: `<div class="foe-card wounds"><div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>${esc(actor.name)}</span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}
      ${warn ? `<div class="fc-meta"><b class="warn">${esc(warn)}</b></div>` : ""}</div>`
  });
}

// ---------- szaleństwo ----------
const MENTAL = Object.entries(HINDRANCES).filter(([, h]) => /M/.test(h.type ?? ""));
const norm = s => String(s ?? "").toLowerCase().replace(/\s*\(.*$/, "").trim();
/** Klucz wady psychicznej z przedmiotu (flaga kreatora albo nazwa — angielska lub przetłumaczona) albo null. */
export function mentalKey(item) {
  if (item?.type !== "feature" || item.system?.kind !== "hindrance") return null;
  const src = String(item.flags?.[F]?.source ?? "");
  if (src.startsWith("hindrance:")) { const k = src.slice(10); return MENTAL.some(([key]) => key === k) ? k : null; }
  const n = norm(item.name);
  return MENTAL.find(([, h]) => norm(h.label) === n || norm(t(h.label)) === n)?.[0] ?? null;
}
export const psychoses = actor => (actor?.items ?? []).filter(i => i.system?.active !== false && mentalKey(i) === "psychosis").length;

async function insanityRoll(actor, item) {
  const n = Math.max(0, psychoses(actor) - (mentalKey(item) === "psychosis" ? 1 : 0));
  const res = await attrTest(actor, "int", t("Insanity (secret INT roll, p. 613): {h}", { h: item.name }), "1", {
    steps: n, secret: true, notes: [n ? t("Psychoses: {n} (each 1 MFD step easier)", { n }) : "", t("critical success — the character goes insane")].filter(Boolean)
  });
  if (res === "crit-success") await deadly(actor, "insanity", {}, {
    title: t("{name} goes insane (critical success on the secret INT roll).", { name: actor.name }),
    text: t("Handbook p. 613: the character no longer acts rationally and sees the world differently. Play them as an NPC, or tell the player privately how their view of reality is warped.")
  });
}

async function playInsanity(actor) {
  if (actor.items.some(i => i.flags?.[F]?.mind === "insane")) return null;
  await actor.createEmbeddedDocuments("Item", [{
    name: t("Insanity"), type: "feature", img: `systems/${F}/icons/feature.svg`, flags: { [F]: { mind: "insane" } },
    system: { kind: "hindrance", active: true, effects: [], description: `<p>${esc(t("Totally insane (p. 613): doesn't act rationally (not necessarily violently) and perceives the world differently than it is. The GM plays the character as an NPC or tells the player what they see. Insane characters tend to have a short life-span when death is on the line."))}</p>` }
  }]);
  return card(actor, [t("{name} has gone insane.", { name: actor.name })], { gmOnly: true });
}

// ---------- dziczenie ghuli ----------
export const feralState = actor => actor?.flags?.[F]?.feral ?? null;
const isFeral = actor => !!feralState(actor)?.at || (actor?.items ?? []).some(i => i.flags?.[F]?.ghoul === "feral");

/** Utrata Celu (MG). support — przyjaciele obok: proces czeka. */
export async function losePurpose(actor, { support = false } = {}) {
  if (!isGhoul(actor) || isFeral(actor)) return null;
  const w = now();
  if (support) {
    await actor.setFlag(F, "feral", { lost: w, support: true, due: null, at: null });
    return card(actor, [t("{name} has lost their Purpose — but friends are near: they won't go feral while that support lasts (p. 614).", { name: actor.name })], { gmOnly: true });
  }
  const roll = await new Roll("1d20").evaluate();
  await actor.setFlag(F, "feral", { lost: w, support: false, due: w + roll.total * MIN, at: null });
  return card(actor, [t("{name} has lost their Purpose and has no one around: goes feral in {n} minutes (1d20) unless they find a new Purpose (p. 614).", { name: actor.name, n: roll.total })], { gmOnly: true });
}

/** Wsparcie przyjaciół skończyło się — rusza odliczanie 1k20 minut. */
export async function supportGone(actor) {
  const st = feralState(actor);
  if (!st?.lost || st.at) return null;
  return losePurpose(actor, { support: false });
}

/** Odzyskany albo nowy Cel (MG): przerywa dziczenie; dziki ghul — tylko w ciągu tygodnia i rzadko (decyzja MG). */
export async function regainPurpose(actor) {
  const st = feralState(actor);
  const feralFeat = actor.items.filter(i => i.flags?.[F]?.ghoul === "feral" || i.flags?.[F]?.ghoul === "going");
  if (st?.at && now() - st.at > 7 * DAY) return card(actor, [t("{name} has been feral for over a week — restoring the Purpose no longer helps (p. 614).", { name: actor.name })], { gmOnly: true });
  await actor.setFlag(F, "feral", null);
  if (feralFeat.length) await actor.deleteEmbeddedDocuments("Item", feralFeat.map(i => i.id));
  return card(actor, [st?.at ? t("{name} snaps back to sanity — a rare case (p. 614).", { name: actor.name }) : t("{name} has a Purpose again — no longer going feral.", { name: actor.name })]);
}

/** Ghul z promieniowania z oblanym INT: zdziczeje w ciągu kilku dni (1k4+1). */
export async function slowFeral(actor) {
  const roll = await new Roll("1d4 + 1").evaluate();
  await actor.setFlag(F, "feral", { lost: now(), support: false, due: now() + roll.total * DAY, at: null, slow: true });
  return roll.total;
}

/** Upływ czasu (aktywny MG): termin minął — decyzja MG. */
export async function feralTick(actor, w = now()) {
  const st = feralState(actor);
  if (!st?.due || st.at || st.asked || w < st.due) return;
  await actor.setFlag(F, "feral", { ...st, asked: true });
  await deadly(actor, "ghoul-feral", {}, {
    title: t("{name} goes feral.", { name: actor.name }),
    text: t("Handbook p. 614: higher brain functions are gone — they attack everyone but ghouls and heavily tainted creatures. Restoring the Purpose within a week can rarely bring them back.")
  });
}

async function playFeral(actor) {
  const st = feralState(actor);
  if (!st?.due) return card(actor, [t("{name} has found a Purpose in the meantime — nothing happens.", { name: actor.name })], { gmOnly: true });
  await actor.setFlag(F, "feral", { ...st, at: now() });
  const old = actor.items.filter(i => i.flags?.[F]?.ghoul === "going");
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(i => i.id));
  await actor.createEmbeddedDocuments("Item", [{
    name: t("Feral ghoul"), type: "feature", img: `systems/${F}/icons/feature.svg`, flags: { [F]: { ghoul: "feral" } },
    system: { kind: "other", active: true, effects: [], description: `<p>${esc(t("A feral ghoul: higher brain functions are gone — the GM takes over the character (p. 614)."))}</p>` }
  }]);
  return card(actor, [], { warn: t("{name} has gone feral — the GM takes over the character.", { name: actor.name }) });
}

/** Dane do karty postaci (ghul). */
export function mindView(actor) {
  if (actor?.type !== "character" || !isGhoul(actor)) return null;
  const st = feralState(actor), w = now();
  let state;
  if (isFeral(actor)) state = t("Feral.");
  else if (st?.support) state = t("Purpose lost — friends' support holds back going feral.");
  else if (st?.due) state = st.slow ? t("Going feral in about {n} days.", { n: Math.max(0, Math.ceil((st.due - w) / DAY)) })
    : t("Purpose lost — going feral in {n} min.", { n: Math.max(0, Math.ceil((st.due - w) / MIN)) });
  else state = t("Has a Purpose — sane.");
  return { state, gm: game.user.isGM, lost: !!st?.lost && !isFeral(actor), feral: isFeral(actor), support: !!st?.support, alert: !!st?.lost || isFeral(actor) };
}

export function registerMind() {
  game.settings.register(F, "insanityRolls", {
    name: "Insanity rolls (p. 613)",
    hint: "When a player character gets a mental hindrance during play (not in the creator), the GM gets a secret INT roll (each Psychosis 1 MFD step easier); a critical success — a GM decision: the character goes insane.",
    scope: "world", config: true, type: Boolean, default: true
  });
  registerConfirmAction("insanity", playInsanity);
  registerConfirmAction("ghoul-feral", playFeral);
  Hooks.on("createItem", (item, options) => {
    const actor = item.parent;
    if (!game.users.activeGM?.isSelf || actor?.type !== "character" || !actor.hasPlayerOwner || !setting("insanityRolls")) return;
    if (item.flags?.[F]?.creator || options?.foeCreator || !mentalKey(item)) return;
    insanityRoll(actor, item).catch(err => console.error(`${F} | insanity`, err));
  });
}
