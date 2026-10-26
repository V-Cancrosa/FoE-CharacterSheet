/**
 * Współpraca z modułami — każda część działa tylko z włączonym modułem, bez niego nic się nie dzieje:
 *   - Carousel Combat Tracker (combat-tracker-dock): wartości FoE przy portretach (SATS, karty szczęścia, rany, ruch)
 *     i podpis pod imieniem (rasa · poziom, NPC, pojazd),
 *   - Dice Tray (dice-calculator): tacka pod FoE — d100 na wierzchu, kości obrażeń z podręcznika, bez „zachowaj wyższy”.
 * Wygląd PipBucka dla obu: styles/ui.css (z włączonym motywem interfejsu).
 * Do tego lot: zmiana wysokości lotu (pegazy, pojazdy latające) przesuwa token w pionie o tę samą różnicę — moduł Levels
 * pokazuje wtedy lecącego kucyka na właściwej wysokości, a wymiana i terminale liczą odległość w pionie.
 */
import { t } from "./i18n.mjs";

const F = "foe-rpg";

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
      // „zachowaj wyższy / niższy” — FoE nie ma przewagi; przerzut daje karta szczęścia na karcie postaci
      showExtraButtons = false;
      get rows() {
        const dice = this.dice;
        return [Object.fromEntries(TRAY_DICE.filter(k => dice[k]).map(k => [k, dice[k]]))];
      }
    };
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

export function registerIntegrations() {
  registerCarousel();
  registerDiceTray();
  registerAltitudeSync();
}
