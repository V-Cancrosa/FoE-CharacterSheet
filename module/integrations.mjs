/**
 * Współpraca z modułami — każda część działa tylko z włączonym modułem, bez niego nic się nie dzieje:
 *   - Carousel Combat Tracker (combat-tracker-dock): wartości FoE przy portretach (SATS, karty szczęścia, rany, ruch)
 *     i podpis pod imieniem (rasa · poziom, NPC, pojazd),
 *   - Dice Tray (dice-calculator): tacka pod FoE — d100 na wierzchu, potem kości obrażeń z podręcznika,
 *   - Monk's Active Tile Triggers (monks-active-tiles): akcje kafelków „FoE: promieniowanie” i „FoE: pułapka” (obrażenia
 *     z kartą „Nanieś obrażenia”) — wbudowane „Hurt/Heal” odejmowałoby SATS (główny pasek tokena), a nie zadawało ran.
 * Wygląd PipBucka dla obu: styles/modules.css (z włączonym motywem interfejsu), wczytywany tu poza warstwami CSS.
 * Do tego lot: zmiana wysokości lotu (pegazy, pojazdy latające) przesuwa token w pionie o tę samą różnicę — moduł Levels
 * pokazuje wtedy lecącego kucyka na właściwej wysokości, a wymiana i terminale liczą odległość w pionie.
 */
import { t } from "./i18n.mjs";
import { tint } from "./dice3d.mjs";
import { radLevel } from "./body.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

// ======================================================================
// Carousel Combat Tracker
// ======================================================================

/** Wartości przy portretach (ścieżki względem actor.system; czego aktor nie ma, tego Carousel nie pokazuje). */
export function carouselAttributes() {
  return [
    { attr: "resources.sats.value", icon: "fa-solid fa-bolt", units: "SATS" },
    { attr: "resources.luck.value", icon: "fa-solid fa-clover", units: t("Luck") },
    { attr: "totalWounds", icon: "fa-solid fa-droplet", units: t("Wounds") },
    { attr: "speed", icon: "fa-solid fa-person-running", units: "ft" }
  ];
}

/** Podpis pod imieniem: „Pegaz · Poziom 3”, „Bawół · NPC”, „Pojazd”. */
export function carouselDescription(actor) {
  const s = actor?.system;
  if (!s) return null;
  if (actor.type === "character") return [s.race, `${t("Level")} ${s.level ?? 1}`].filter(Boolean).join(" · ");
  if (actor.type === "npc") return [s.race, "NPC"].filter(Boolean).join(" · ");
  if (actor.type === "vehicle") return t("Vehicle");
  return null;
}

function registerCarousel() {
  Hooks.once("combat-tracker-dock-init", config => {
    const defaults = config.defaultAttributesConfig;
    if (typeof defaults === "function") config.defaultAttributesConfig = () => ({ ...defaults(), [F]: carouselAttributes() });
    // podpis bierze się z klasy portretu (Carousel tworzy ją z CONFIG.combatTrackerDock.CombatantPortrait)
    const Base = config.CombatantPortrait;
    if (typeof Base !== "function") return;
    config.CombatantPortrait = class FoeCombatantPortrait extends Base {
      getDescription() {
        try { return carouselDescription(this.actor) ?? super.getDescription(); } catch { return super.getDescription(); }
      }
    };
  });
}

// ======================================================================
// Dice Tray
// ======================================================================

/** Kości na tacce: d100 (testy) na początku, potem kości obrażeń z podręcznika (najczęściej d12, d4, d20, d8, d10, d6). */
export const TRAY_DICE = ["d100", "d4", "d6", "d8", "d10", "d12", "d20"];

function registerDiceTray() {
  Hooks.once("dice-calculator.keymaps", (maps, Template) => {
    if (typeof Template !== "function") return;
    maps[F] = class FoeDiceMap extends Template {
      get rows() {
        const dice = this.dice;
        return [Object.fromEntries(TRAY_DICE.filter(k => dice[k]).map(k => [k, dice[k]]))];
      }
    };
  });
}

// ======================================================================
// Monk's Active Tile Triggers
// ======================================================================

/**
 * Promieniowanie z kafelka: rzut formuły pomniejszony o odporność (jak przy broni z promieniowaniem).
 * Zwraca { roll, rolled, rads, resist, total, level, levelUp } albo null (aktor bez licznika radów).
 */
export async function addRadiation(actor, formula) {
  const sys = actor?.system;
  if (!sys?.resources?.rads) return null;
  const roll = tint(await new Roll(String(formula || "0")).evaluate(), "trap");
  const rolled = Math.max(0, Math.round(Number(roll.total) || 0));
  const resist = Math.min(100, Math.max(0, Number(sys.radResistTotal) || 0));
  const rads = Math.round(rolled * (1 - resist / 100));
  const before = Number(sys.resources.rads.value) || 0;
  const total = before + rads;
  if (rads) await actor.update({ "system.resources.rads.value": total });
  const level = radLevel(total);
  return { roll, rolled, rads, resist, total, level, levelUp: !!level && level !== radLevel(before) };
}

/** Pułapka z kafelka: rzut obrażeń i karta z „Nanieś obrażenia” dla tokenów na kafelku (area — każda lokacja). */
export async function trapDamage({ formula, label, area = false, tokens = [] }) {
  const roll = tint(await new Roll(String(formula || "0")).evaluate(), "trap");
  const total = Math.max(0, Math.round(Number(roll.total) || 0));
  const name = String(label ?? "").trim() || t("Trap");
  const caught = tokens.map(x => x?.name).filter(Boolean).join(", ") || "—";
  return ChatMessage.create({
    speaker: { alias: name },
    rolls: [roll],
    content: `
    <div class="foe-card damage">
      <div class="fc-tag"><span>${t("PIPBUCK // TRAP")}</span><span>${esc(roll.formula)}</span></div>
      <h3>${esc(name)}</h3>
      <div class="fc-main"><div class="fc-roll">${total}<small>${t("DMG")}</small></div><div class="fc-outcome">${area ? t("Explosion") : t("Hit")}</div><div class="fc-sum">${esc(roll.formula)}</div></div>
      <div class="fc-meta"><div>${esc(area ? t("Explosion: each exposed location separately.") : t("One hit: pick the location in the damage window."))}</div><div>${esc(t("Caught: {names}", { names: caught }))}</div></div>
      <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> ${t("Apply damage")}</button>
    </div>`,
    flags: { [F]: { damage: {
      specials: {}, shockWounds: 0, actorUuid: null, itemUuid: null, itemName: name, total, pre: total,
      critMult: 1, crit: false, aoe: !!area, loc: null, called: null, table: null, ignoreDT: 0, targets: tokens.map(x => x?.uuid).filter(Boolean)
    } } }
  });
}

/** Akcje FoE w formacie Monk's Active Tile Triggers (app — klasa MonksActiveTiles z jej zdarzenia). */
export function tileActions(app) {
  const who = { id: "entity", name: "MonksActiveTiles.ctrl.select-entity", type: "select", subtype: "entity",
    options: { show: ["token", "within", "players", "previous", "tagger"] },
    restrict: entity => entity instanceof (foundry.canvas?.placeables?.Token ?? Object) };
  const tokensOf = async args => ((await app.getEntities?.(args)) ?? []).filter(e => e?.actor);
  const summary = async (label, action, details) =>
    `<span class="action-style">${esc(label)}</span> <span class="entity-style">${await app.entityName?.(action.data?.entity || "token") ?? ""}</span>, <span class="details-style">"${esc(details)}"</span>`;
  return {
    radiation: {
      name: t("FoE: radiation"),
      ctrls: [
        who,
        { id: "formula", name: t("Rads (a number or dice, e.g. 2d10)"), type: "text", required: true },
        { id: "chat", name: "MonksActiveTiles.ctrl.chatmessage", type: "checkbox", defvalue: true }
      ],
      fn: async (args = {}) => {
        const tokens = await tokensOf(args);
        const lines = [], rolls = [];
        for (const tok of tokens) {
          const r = await addRadiation(tok.actor, args.action?.data?.formula);
          if (!r) continue;
          rolls.push(r.roll);
          lines.push(`<div><b>${esc(tok.name)}</b>: ${esc(t("+{n} rads", { n: r.rads }))}${r.resist ? ` ${esc(t("(rolled {r}, resistance {p}%)", { r: r.rolled, p: r.resist }))}` : ""} → ${r.total}${r.levelUp ? ` · <b>${esc(r.level.label)}</b>` : ""}</div>`);
        }
        if (args.action?.data?.chat !== false && lines.length) {
          await ChatMessage.create({
            speaker: { alias: t("Radiation") }, rolls,
            content: `<div class="foe-card reload"><div class="fc-tag"><span>${t("PIPBUCK // RADIATION")}</span><span>${esc(args.action?.data?.formula ?? "")}</span></div>
              <h3>${t("Geiger counter crackles")}</h3><div class="fc-calc">${lines.join("")}</div></div>`
          });
        }
        return { tokens, entities: tokens };
      },
      content: async (trigger, action) => summary(t("FoE: radiation"), action, action.data?.formula ?? "")
    },
    trap: {
      name: t("FoE: trap (damage)"),
      ctrls: [
        who,
        { id: "formula", name: t("Damage (dice, e.g. 3d12)"), type: "text", required: true },
        { id: "label", name: t("Trap name on the card"), type: "text" },
        { id: "area", name: t("Explosion — every exposed location"), type: "checkbox" }
      ],
      fn: async (args = {}) => {
        const tokens = await tokensOf(args);
        const d = args.action?.data ?? {};
        if (tokens.length) await trapDamage({ formula: d.formula, label: d.label, area: !!d.area, tokens });
        return { tokens, entities: tokens };
      },
      content: async (trigger, action) => summary(t("FoE: trap (damage)"), action, action.data?.formula ?? "")
    }
  };
}

function registerTileActions() {
  Hooks.on("setupTileActions", app => {
    try {
      app.registerTileGroup?.(F, "Fallout: Equestria");
      // registerTileAction przyjmuje tylko moduły (sprawdza game.modules.get) — system dopisuje swoje akcje wprost
      if (!app.triggerActions) return;
      for (const [name, action] of Object.entries(tileActions(app))) {
        const key = `${F}.${name}`;
        if (!app.triggerActions[key]) app.triggerActions[key] = { ...action, group: F };
      }
    } catch (err) { console.warn(`${F} | Monk's Active Tile Triggers`, err); }
  });
}

// ======================================================================
// Lot: wysokość lotu przesuwa token
// ======================================================================

const altitudeMovesToken = () => { try { return game.settings.get(F, "altitudeMovesToken") !== false; } catch { return true; } };

/** Różnica wysokości lotu z danych zmiany (null — wysokość się nie zmienia). */
export function altitudeDelta(actor, changes) {
  const next = foundry.utils.getProperty(changes ?? {}, "system.altitude") ?? changes?.["system.altitude"];
  if (next === undefined || next === null) return null;
  const delta = (Number(next) || 0) - (Number(actor?.system?.altitude) || 0);
  return delta || null;
}

function registerAltitudeSync() {
  game.settings.register(F, "altitudeMovesToken", {
    name: "Flight altitude moves the token",
    hint: "When a pegasus or a flying vehicle changes its flight altitude (sheet, flight, landing, fall), its token goes up or down by the same number of feet. With the Levels module it shows at the right height; handing over items and terminals count the vertical distance too.",
    scope: "world", config: true, type: Boolean, default: true
  });
  // różnica liczona przed zapisem (potem stara wysokość już przepada), przesunięcie — po zapisie, u tego, kto zmienił
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id) return;
    const delta = altitudeDelta(actor, changes);
    if (delta) options.foeAltitude = delta;
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    const delta = Number(options?.foeAltitude) || 0;
    if (userId !== game.user.id || !delta || !altitudeMovesToken()) return;
    const tokens = actor.isToken ? [actor.token].filter(Boolean) : (actor.getActiveTokens?.(false, true) ?? []);
    for (const doc of tokens) {
      if (!doc?.isOwner) continue;
      doc.update({ elevation: (Number(doc.elevation) || 0) + delta }).catch(err => console.warn(`${F} | flight altitude → token`, err));
    }
  });
}

/**
 * Style dla modułów (styles/modules.css) zwykłym <link>: Foundry v13 wkłada style z system.json do warstwy „system”,
 * a style modułów do późniejszej „modules”, więc nadpisanie z system.json zawsze przegrywa. Plik spoza warstw wygrywa.
 */
function loadModuleStyles() {
  if (document.getElementById("foe-module-styles")) return;
  const link = document.createElement("link");
  link.id = "foe-module-styles";
  link.rel = "stylesheet";
  link.href = `systems/${F}/styles/modules.css?v=${encodeURIComponent(game.system?.version ?? "")}`;
  document.head.append(link);
}

export function registerIntegrations() {
  loadModuleStyles();
  registerCarousel();
  registerDiceTray();
  registerTileActions();
  registerAltitudeSync();
}
