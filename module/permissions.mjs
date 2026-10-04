/**
 * Podział MG / gracze:
 *   - karty na czacie respektują tryb rzutu Foundry (publiczny, rzut MG, ślepy, tylko dla siebie);
 *     opcjonalnie rzuty MG za postacie bez gracza-właściciela są domyślnie ukryte,
 *   - PD i poziom zmienia MG; gracz awansuje sam dopiero po zebraniu PD do progu (chyba że MG pozwoli inaczej),
 *   - „Dodaj” w katalogu (za darmo) na karcie gracza — tylko MG; gracz kupuje za kapsle.
 * Ustawienia świata pozwalają oddać te rzeczy graczom.
 */
import { xpFor, xpProgression } from "./perks.mjs";

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
  if (prog === "none") return { ok: false, why: "Awans bez PD (kamienie milowe) przyznaje MG — poproś MG, żeby kliknął „Awans” na twojej karcie." };
  const next = xpFor(actor.system.level + 1, prog);
  if (next !== null && (actor.system.xp ?? 0) >= next) return { ok: true };
  return { ok: false, why: `Za mało PD do awansu: ${actor.system.xp ?? 0}/${next}. PD przyznaje MG.` };
}

/** Zakładki katalogu, z których gracz dodaje za darmo tylko za zgodą MG. */
export const FREE_ADD_TABS = ["weapons", "armor", "gear", "cyber", "perks", "ammo"];
export const canFreeAdd = tab => isGM() || get("playerFreeItems") || !FREE_ADD_TABS.includes(tab);

export function registerPermissionSettings() {
  game.settings.register(F, "playerAdvancement", {
    name: "Gracze sami przyznają PD i awansują",
    hint: "Wyłączone (zalecane): PD, poziom i cofanie awansu zmienia MG; gracz klika „Awans” sam, gdy zbierze PD do progu. Włączone: gracze mają pełną kontrolę.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "playerFreeItems", {
    name: "Gracze dodają z katalogu za darmo",
    hint: "Wyłączone (zalecane): gracz kupuje broń, pancerze i ekwipunek za kapsle; „Dodaj” za darmo (także implanty i perki) ma tylko MG. Zaklęcia, receptury i manewry gracz dodaje zawsze.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "npcRollsPrivate", {
    name: "Ukryte rzuty MG za przeciwników",
    hint: "Rzuty MG za postacie, których nie ma żaden gracz (potwory, NPC, pojazdy wrogów), trafiają na czat jako „rzut MG”, nawet przy publicznym trybie rzutu. Tryb rzutu zawsze zmienisz też przełącznikiem nad czatem.",
    scope: "world", config: true, type: Boolean, default: false
  });
}

/** Tryb rzutu dla karty systemu: wybrany nad czatem, a u MG za przeciwników — opcjonalnie ukryty. */
export function rollModeFor(msg, options = {}) {
  let mode = options.rollMode ?? game.settings.get("core", "rollMode");
  if (mode === "publicroll" || mode === "roll") {
    const actor = msg.speaker?.actor ? game.actors?.get(msg.speaker.actor) : null;
    const tokenActor = msg.speaker?.token ? game.scenes?.get(msg.speaker.scene)?.tokens?.get(msg.speaker.token)?.actor : null;
    const who = tokenActor ?? actor;
    if (isGM() && get("npcRollsPrivate") && who && !who.hasPlayerOwner) mode = "gmroll";
  }
  return mode;
}

export function registerPermissionHooks() {
  // Karty systemu (rzuty, obrażenia, awanse…) w trybie rzutu z Foundry
  Hooks.on("preCreateChatMessage", (msg, data, options, userId) => {
    if (userId !== game.user.id) return;
    if (!String(msg.content ?? "").includes("foe-card")) return;
    if (msg.whisper?.length || msg.blind) return;   // karta już prywatna
    const mode = rollModeFor(msg, options);
    if (!mode || mode === "publicroll" || mode === "roll") return;
    if (typeof msg.applyRollMode === "function") msg.applyRollMode(mode);
    else {
      const d = ChatMessage.applyRollMode({}, mode);
      msg.updateSource({ whisper: d.whisper ?? [], blind: !!d.blind });
    }
  });

  // PD i poziom zmienia MG (awans i przyznanie PD przekazują opcję foeAdvance)
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || canEditAdvancement() || options?.foeAdvance) return;
    const sys = changes.system;
    if (!sys) return;
    const blocked = [];
    for (const k of ["xp", "level"]) {
      if (k in sys && Number(sys[k]) !== Number(actor.system[k])) { delete sys[k]; blocked.push(k === "xp" ? "PD" : "poziom"); }
    }
    if (blocked.length) ui.notifications.warn(`${blocked.join(" i ")} zmienia MG (ustawienie świata „Gracze sami przyznają PD i awansują”).`);
  });
}
