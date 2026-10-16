/**
 * Podział MG / gracze:
 *   - karty na czacie respektują tryb rzutu Foundry (publiczny, rzut MG, ślepy, tylko dla siebie);
 *     opcjonalnie rzuty MG za postacie bez gracza-właściciela są domyślnie ukryte,
 *   - PD i poziom zmienia MG; gracz awansuje sam dopiero po zebraniu PD do progu (chyba że MG pozwoli inaczej),
 *   - „Dodaj” w katalogu (za darmo) na karcie gracza — tylko MG; gracz kupuje za kapsle.
 * Ustawienia świata pozwalają oddać te rzeczy graczom.
 */
import { xpFor, xpProgression } from "./perks.mjs";
import { t } from "./i18n.mjs";

const F = "foe-rpg";
const get = k => { try { return !!game.settings.get(F, k); } catch { return false; } };

export const playerAdvancement = () => get("playerAdvancement");
export const isGM = () => !!game.user?.isGM;
/** Przyznawanie PD i cofanie awansu. */
export const canAwardXp = () => isGM() || playerAdvancement();
/** Ręczna zmiana pól PD i poziomu na karcie. */
export const canEditAdvancement = () => isGM() || playerAdvancement();

/** Czy ten użytkownik może teraz awansować postać: MG zawsze; gracz po zebraniu PD do progu (albo gdy MG pozwala). */
export function canLevelUp(actor) {
  if (isGM() || playerAdvancement()) return { ok: true };
  const prog = xpProgression();
  if (prog === "none") return { ok: false, why: t("Level-ups without XP (milestones) are granted by the GM — ask the GM to click “Level up” on your sheet.") };
  const next = xpFor(actor.system.level + 1, prog);
  if (next !== null && (actor.system.xp ?? 0) >= next) return { ok: true };
  return { ok: false, why: t("Not enough XP to level up: {xp}/{next}. The GM awards XP.", { xp: actor.system.xp ?? 0, next }) };
}

/** Zakładki katalogu, z których gracz dodaje za darmo tylko za zgodą MG. */
export const FREE_ADD_TABS = ["weapons", "armor", "gear", "cyber", "perks", "ammo"];
export const canFreeAdd = tab => isGM() || get("playerFreeItems") || !FREE_ADD_TABS.includes(tab);

export function registerPermissionSettings() {
  game.settings.register(F, "playerAdvancement", {
    name: "Players award XP and level up themselves",
    hint: "Off (recommended): XP, level and undoing a level-up are changed by the GM; a player clicks “Level up” on their own once they have the XP for it. On: players have full control.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "playerFreeItems", {
    name: "Players add from the catalog for free",
    hint: "Off (recommended): a player buys weapons, armor and gear for caps; free “Add” (implants and perks too) is GM-only. Players can always add spells, recipes and maneuvers.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "npcRollsPrivate", {
    name: "Hidden GM rolls for opponents",
    hint: "GM rolls for characters no player owns (monsters, NPCs, enemy vehicles) go to chat as a “GM roll”, even in public roll mode. You can always change the roll mode with the switch above the chat too.",
    scope: "world", config: true, type: Boolean, default: false
  });
}

/** Tryby wiadomości: v14 „public/gm/blind/self/ic” (core.messageMode), v13 „publicroll/gmroll/blindroll/selfroll/roll” (core.rollMode). */
const LEGACY = { publicroll: "public", roll: "public", gmroll: "gm", blindroll: "blind", selfroll: "self" };
export const normMode = m => LEGACY[m] ?? m ?? "public";
function currentMode() {
  for (const key of ["messageMode", "rollMode"]) {
    try { const v = game.settings.get("core", key); if (v) return normMode(v); } catch { /* brak ustawienia w tej wersji */ }
  }
  return "public";
}

/** Tryb dla karty systemu: wybrany nad czatem, a u MG za przeciwników — opcjonalnie ukryty. Zwraca public | gm | blind | self | ic. */
export function rollModeFor(msg, options = {}) {
  let mode = normMode(options.messageMode ?? options.rollMode ?? currentMode());
  if (mode === "public" || mode === "ic") {
    const actor = msg.speaker?.actor ? game.actors?.get(msg.speaker.actor) : null;
    const tokenActor = msg.speaker?.token ? game.scenes?.get(msg.speaker.scene)?.tokens?.get(msg.speaker.token)?.actor : null;
    const who = tokenActor ?? actor;
    if (isGM() && get("npcRollsPrivate") && who && !who.hasPlayerOwner) mode = "gm";
  }
  return mode;
}

/** Odbiorcy dla trybu (to samo robi rdzeń; liczone tu, żeby działało w v13 i v14). */
export function modeRecipients(mode) {
  const gms = (game.users?.filter?.(u => u.isGM) ?? []).map(u => u.id);
  if (mode === "gm") return { whisper: [...new Set([...gms, game.user.id])], blind: false };
  if (mode === "blind") return { whisper: gms, blind: true };
  if (mode === "self") return { whisper: [game.user.id], blind: false };
  return null;
}

export function registerPermissionHooks() {
  // Karty systemu (rzuty, obrażenia, awanse…) w trybie rzutu z Foundry
  Hooks.on("preCreateChatMessage", (msg, data, options, userId) => {
    if (userId !== game.user.id) return;
    if (!String(msg.content ?? "").includes("foe-card")) return;
    if (msg.whisper?.length || msg.blind) return;   // karta już prywatna
    const r = modeRecipients(rollModeFor(msg, options));
    if (r) msg.updateSource(r);
  });

  // PD i poziom zmienia MG (awans i przyznanie PD przekazują opcję foeAdvance)
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || canEditAdvancement() || options?.foeAdvance) return;
    const sys = changes.system;
    if (!sys) return;
    const blocked = [];
    for (const k of ["xp", "level"]) {
      if (k in sys && Number(sys[k]) !== Number(actor.system[k])) { delete sys[k]; blocked.push(k === "xp" ? t("XP") : t("level")); }
    }
    if (blocked.length) ui.notifications.warn(t("{list}: the GM changes this (world setting “Players award XP and level up themselves”).", { list: blocked.join(` ${t("conj|and")} `) }));
  });
}
