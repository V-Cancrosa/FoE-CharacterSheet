/**
 * Tokeny FoE:
 *   - domyślne ustawienia nowych postaci i NPC (połączenie, nastawienie, imię, paski SATS i „Do śmierci”, widzenie),
 *     bez nadpisywania tego, co podano przy tworzeniu albo ustawiono w domyślnym tokenie świata Foundry,
 *   - stany FoE w HUD tokena (ikony: icons/status, Font Awesome Free, CC BY 4.0); „Przeciążony”, „Lot”, „Okaleczony”,
 *     „Choroba popromienna” i „Wypalenie magii” zapalają się i gasną same, gdy zmienia się stan postaci,
 *   - światło PipBucka i rogu (zaklęcie Light) w HUD tokena,
 *   - celownik V.A.T.S. jako znacznik tury w walce,
 *   - widzenie ras (kucyk-nietoperz: echolokacja, 60 ft w ciemności),
 *   - przycisk MG w ustawieniach: zastosuj nazwy, paski i widzenie do istniejących aktorów i tokenów.
 */
import { t, N_, tfields } from "./i18n.mjs";
import { radLevel } from "./body.mjs";
import { PIP_HEX } from "./ui-theme.mjs";

const F = "foe-rpg";
const ICON = id => `systems/${F}/icons/status/${id}.svg`;
// CONST.TOKEN_DISPLAY_MODES / TOKEN_DISPOSITIONS (liczby, żeby dało się to sprawdzić poza Foundry)
const OWNER_HOVER = 20, HOVER = 30, OWNER = 40;
const HOSTILE = -1, FRIENDLY = 1;

// ---------- Domyślne ustawienia tokenów ----------
const BARS = { bar1: { attribute: "resources.sats" }, bar2: { attribute: "vitals" } };
export const TOKEN_DEFAULTS = {
  // postać gracza: imię po najechaniu dla wszystkich, paski — właściciel i MG
  character: { actorLink: true, disposition: FRIENDLY, displayName: HOVER, displayBars: OWNER, ...BARS, sight: { enabled: true } },
  // NPC: każdy token osobno (osobne rany), wrogi, imię i paski tylko dla MG
  npc: { actorLink: false, disposition: HOSTILE, displayName: OWNER_HOVER, displayBars: OWNER, ...BARS, sight: { enabled: true } }
};
// przy istniejących aktorach i tokenach nie ruszamy połączenia ani nastawienia (np. przyjazny kupiec)
const EXISTING_KEYS = ["displayName", "displayBars", "bar1", "bar2"];

/** Widzenie z rasy: kucyk-nietoperz „widzi” echolokacją na 60 ft w ciemności (s. 35). */
const BAT_SIGHT = { range: 60, visionMode: "darkvision" };
export const raceSight = race => (/\bbat\b|nietoperz/i.test(String(race ?? "")) ? BAT_SIGHT : null);

/**
 * Ustawienia tokena dla nowego aktora: tylko klucze, których nie podano w danych tworzenia (kopia, kompendium,
 * bestiariusz) ani w domyślnym tokenie świata (Konfiguracja → domyślny token).
 */
export function newTokenDefaults(type, data = {}, worldDefaults = {}) {
  const def = TOKEN_DEFAULTS[type];
  if (!def) return null;
  const given = data.prototypeToken ?? {};
  const out = {};
  for (const [k, v] of Object.entries(def)) {
    if (k in given || k in (worldDefaults ?? {})) continue;
    out[k] = foundry.utils.deepClone(v);
  }
  const eyes = raceSight(data.system?.race);
  if (eyes && !("sight" in given)) out.sight = { ...(out.sight ?? {}), enabled: true, ...eyes };
  return out;
}

/** Zmiany dla istniejącego aktora albo tokena (przycisk MG): imię, paski, widzenie włączone, widzenie rasy. */
export function existingTokenPatch(type, race) {
  const def = TOKEN_DEFAULTS[type];
  if (!def) return null;
  const out = Object.fromEntries(EXISTING_KEYS.map(k => [k, foundry.utils.deepClone(def[k])]));
  out.sight = { enabled: true, ...(raceSight(race) ?? {}) };
  return out;
}

/** Zmiana widzenia po zmianie rasy: { sight } do zapisania albo null (nie ruszamy ręcznych ustawień MG). */
export function raceSightChange(oldRace, newRace, sight = {}) {
  const was = raceSight(oldRace), now = raceSight(newRace);
  if (now && (sight.range ?? 0) < now.range) return { ...now, enabled: true };
  if (was && !now && sight.range === was.range && sight.visionMode === was.visionMode) return { range: 0, visionMode: "basic" };
  return null;
}

// ---------- Stany FoE ----------
export const FOE_STATUSES = tfields([
  { id: "dead", name: N_("Dead") },
  { id: "unconscious", name: N_("Unconscious") },
  { id: "prone", name: N_("Knocked down") },
  { id: "burning", name: N_("Burning") },
  { id: "shock", name: N_("Electrified") },
  { id: "poison", name: N_("Poisoned") },
  { id: "paralysis", name: N_("Paralyzed") },
  { id: "stun", name: N_("Stunned") },
  { id: "bleeding", name: N_("Bleeding") },
  { id: "blind", name: N_("Blinded") },
  { id: "deaf", name: N_("Deafened") },
  { id: "fear", name: N_("Afraid") },
  { id: "hidden", name: N_("Hidden (sneaking)") },
  { id: "invisible", name: N_("Invisible (stealth field)") },
  { id: "fly", name: N_("Flying") },
  { id: "burrow", name: N_("Underground") },
  { id: "cover", name: N_("In cover") },
  { id: "restrain", name: N_("Restrained") },
  { id: "crippled", name: N_("status|Crippled") },
  { id: "overloaded", name: N_("Overloaded") },
  { id: "irradiated", name: N_("Radiation sickness") },
  { id: "burnout", name: N_("Magic burnout") }
], ["name"]);

/** Stany, które zależą od karty: { id: czy powinien świecić }. */
export function autoStatuses(sys) {
  return {
    overloaded: (sys?.load?.level ?? 0) > 0,
    fly: !!sys?.canFly && (Number(sys?.altitude) || 0) > 0,
    crippled: Object.values(sys?.locations ?? {}).some(l => l?.isCrippled),
    irradiated: !!radLevel(Number(sys?.resources?.rads?.value) || 0),
    burnout: !!sys?.burnout
  };
}

/**
 * Które automatyczne stany przełączyć. Działa na zmianach (fałsz → prawda włącza, prawda → fałsz wyłącza), więc stan
 * włączony ręcznie przez MG (np. lecący potwór bez wysokości na karcie) zostaje, dopóki karta go nie zmieni.
 * prev — poprzednie wyliczenie (undefined po odświeżeniu strony: wtedy tylko włączamy).
 */
export function statusToggles(prev, next, has) {
  const out = [];
  for (const [id, want] of Object.entries(next)) {
    const was = prev?.[id];
    if (want && !has(id) && was !== true) out.push([id, true]);
    else if (!want && was === true && has(id)) out.push([id, false]);
  }
  return out;
}

const lastAuto = new Map();
const pending = new Map();
function syncStatuses(actor) {
  if (!actor || !TOKEN_DEFAULTS[actor.type] || !game.users.activeGM?.isSelf) return;
  const key = actor.uuid;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(async () => {
    pending.delete(key);
    const next = autoStatuses(actor.system);
    const todo = statusToggles(lastAuto.get(key), next, id => actor.statuses?.has(id));
    lastAuto.set(key, next);
    for (const [id, active] of todo) {
      try { await actor.toggleStatusEffect(id, { active }); } catch (err) { console.warn(`${F} | status ${id}`, err); }
    }
  }, 150));
}

// ---------- Światło PipBucka i rogu ----------
export const LIGHTS = {
  pipbuck: { bright: 10, dim: 20, alpha: 0.35 },   // latarka PipBucka (stałe sztuczne światło, s. 49)
  horn: { bright: 15, dim: 30, alpha: 0.45 }       // zaklęcie Light: 10–15 ft jasno, dwa razy tyle przyćmione
};
const HORN_COLOR = "#c9b2ff";

export function lightData(kind, color) {
  const l = LIGHTS[kind];
  return { bright: l.bright, dim: l.dim, color, alpha: l.alpha, angle: 360, luminosity: 0.5, animation: { type: null } };
}

/** Włącza albo wyłącza światło na tokenie; poprzednie ustawienia światła wracają po wyłączeniu. */
export async function toggleLight(token, kind) {
  const cur = token.getFlag(F, "light");
  if (cur?.kind === kind) return token.update({ light: cur.prev ?? {}, [`flags.${F}.light`]: null });
  const prev = cur?.prev ?? token.toObject().light;
  const color = kind === "pipbuck" ? (PIP_HEX[game.settings.get(F, "pipColor")] ?? PIP_HEX.green) : HORN_COLOR;
  return token.update({ light: lightData(kind, color), [`flags.${F}.light`]: { kind, prev } });
}

function decorateHud(hud, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const token = hud.object?.document;
  const actor = token?.actor;
  if (!root || !token?.isOwner || !TOKEN_DEFAULTS[actor?.type]) return;
  const col = root.querySelector(".col.left") ?? root.querySelector(".left");
  if (!col || col.querySelector(".foe-light")) return;
  const on = token.getFlag(F, "light")?.kind;
  const add = (kind, icon, tip) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `control-icon foe-light${on === kind ? " active" : ""}`;
    b.dataset.tooltip = tip;
    b.innerHTML = `<i class="${icon}"></i>`;
    b.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await toggleLight(token, kind);
      hud.render?.();
    });
    col.append(b);
  };
  add("pipbuck", "fa-solid fa-lightbulb", t("PipBuck light (10 ft bright, 20 ft dim)"));
  if (actor.system?.caster) add("horn", "fa-solid fa-wand-sparkles", t("Horn light — Light spell (15 ft bright, 30 ft dim)"));
}

// ---------- Konfiguracja Foundry ----------
/** Atrybuty do pasków tokena z modelu danych + „Do śmierci” (postać i NPC). */
function configureTrackable() {
  const TD = foundry.documents?.TokenDocument ?? globalThis.TokenDocument;
  const out = {};
  for (const [type, model] of Object.entries(CONFIG.Actor.dataModels ?? {})) {
    try {
      const r = TD._getTrackedAttributesFromSchema(model.schema);
      out[type] = { bar: r.bar.map(p => p.join(".")), value: r.value.map(p => p.join(".")) };
      if (TOKEN_DEFAULTS[type]) out[type].bar.push("vitals");
    } catch (err) {
      console.warn(`${F} | token bar attributes (${type})`, err);
      return;
    }
  }
  CONFIG.Actor.trackableAttributes = out;
}

export function configureTokens() {
  CONFIG.statusEffects = FOE_STATUSES.map(s => ({ id: s.id, name: s.name, img: ICON(s.id) }));
  if (CONFIG.Combat) CONFIG.Combat.fallbackTurnMarker = `systems/${F}/icons/vats-marker.svg`;
  configureTrackable();
}

// ---------- Przycisk MG: istniejący aktorzy i tokeny ----------
export async function applyToExisting() {
  if (!game.user.isGM) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("FoE token settings") },
    content: `<p>${t("For all characters and NPCs (their prototype tokens and tokens on every scene) I'll set: names — characters on hover for everyone, NPCs only for the GM; bars SATS and “To death” visible to the owner and the GM; vision on; bat ponies see 60 ft in the dark. Links to actors and dispositions stay as they are.")}</p>`
  });
  if (!ok) return;
  let actors = 0, tokens = 0;
  for (const a of game.actors) {
    const patch = existingTokenPatch(a.type, a.system?.race);
    if (!patch) continue;
    await a.update({ prototypeToken: patch });
    actors++;
  }
  for (const scene of game.scenes) {
    const updates = scene.tokens.map(td => {
      const patch = existingTokenPatch(td.actor?.type, td.actor?.system?.race);
      return patch ? { _id: td.id, ...patch } : null;
    }).filter(Boolean);
    if (!updates.length) continue;
    await scene.updateEmbeddedDocuments("Token", updates);
    tokens += updates.length;
  }
  ui.notifications.info(t("Token settings applied: {a} actors, {n} tokens on scenes.", { a: actors, n: tokens }));
}

export function registerTokenSettings() {
  const Base = foundry.applications.api.ApplicationV2;
  // przycisk w ustawieniach: zamiast okna od razu pytanie i zmiany
  class TokenDefaultsMenu extends Base {
    async render() { await applyToExisting(); return this; }
  }
  game.settings.registerMenu(F, "tokenDefaults", {
    name: "Token settings for existing actors",
    label: "Apply FoE token settings",
    hint: "New characters and NPCs get them by themselves. This button sets names, bars (SATS, “To death”) and vision on all existing actors and on tokens on every scene, once.",
    icon: "fa-solid fa-chess-pawn",
    type: TokenDefaultsMenu,
    restricted: true
  });
}

export function registerTokenHooks() {
  Hooks.on("preCreateActor", (actor, data) => {
    let world = {};
    try { world = game.settings.get("core", "defaultToken") ?? {}; } catch { /* brak ustawienia */ }
    const def = newTokenDefaults(actor.type, data, world);
    if (def && Object.keys(def).length) actor.updateSource({ prototypeToken: def });
  });
  // zmiana rasy: widzenie z rasy na prototypie i tokenach tego aktora
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    const race = foundry.utils.getProperty(changes, "system.race");
    if (race !== undefined && race !== actor.system.race) options.foeOldRace = actor.system.race ?? "";
  });
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    syncStatuses(actor);
    if (userId !== game.user.id || options.foeOldRace === undefined) return;
    const race = actor.system.race;
    const proto = raceSightChange(options.foeOldRace, race, actor.prototypeToken.sight);
    if (proto && !actor.isToken) await actor.update({ "prototypeToken.sight": proto });
    const docs = actor.isToken ? [actor.token] : game.scenes.contents.flatMap(s => s.tokens.filter(td => td.actorLink && td.actorId === actor.id));
    for (const td of docs) {
      const s = raceSightChange(options.foeOldRace, race, td.sight);
      if (s && td.isOwner) await td.update({ sight: s });
    }
  });
  // ciężar zmienia się z przedmiotami
  for (const h of ["createItem", "updateItem", "deleteItem"]) Hooks.on(h, item => { if (item.parent instanceof Actor) syncStatuses(item.parent); });
  Hooks.on("renderTokenHUD", decorateHud);
}
