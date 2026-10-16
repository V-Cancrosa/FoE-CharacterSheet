/**
 * Po aktualizacji systemu serwer Foundry trzyma opis systemu (system.json) wczytany przy starcie świata — nowe typy
 * aktorów (np. stół do gry) i nowe arkusze stylów działają dopiero po ponownym uruchomieniu świata, a przeglądarka
 * ładuje już nowy kod. MG dostaje wtedy wyraźny komunikat zamiast błędu walidacji.
 */
import { t } from "./i18n.mjs";

/** Typy z kodu systemu, których nie zna uruchomiony świat (np. ["Actor.casino"]). */
export function staleTypes() {
  const out = [];
  for (const doc of ["Actor", "Item"]) {
    const known = game.documentTypes?.[doc];
    if (!Array.isArray(known)) continue;
    for (const type of Object.keys(CONFIG[doc]?.dataModels ?? {})) if (!known.includes(type)) out.push(`${doc}.${type}`);
  }
  return out;
}

/** Komunikat: świat działa na starszej wersji systemu niż pliki na serwerze. */
export function restartMessage(newVersion = "") {
  return t("Fallout: Equestria was updated{to}, but this world is still running version {old}. Return to Setup (Settings tab → “Return to Setup”) and launch the world again — until then new features (e.g. the gaming table) won't work.", {
    to: newVersion ? ` ${t("to {v}", { v: newVersion })}` : "", old: game.system?.version ?? "?"
  });
}

/** Sprawdzenie przy starcie (tylko MG): brakujące typy albo nowsza wersja w plikach na serwerze. */
export function registerVersionCheck() {
  Hooks.once("ready", async () => {
    if (!game.user?.isGM) return;
    let disk = "";
    try {
      const r = await fetch(`systems/${game.system.id}/system.json?v=${Date.now()}`, { cache: "no-store" });
      if (r.ok) disk = String((await r.json())?.version ?? "");
    } catch { /* bez sieci — zostaje sprawdzenie typów */ }
    const newer = disk && foundry.utils.isNewerVersion(disk, game.system.version);
    const missing = staleTypes();
    if (!newer && !missing.length) return;
    console.warn(`foe-rpg | the world runs system ${game.system.version}, files on the server: ${disk || "?"}; unknown types: ${missing.join(", ") || "—"}`);
    ui.notifications.error(restartMessage(newer ? disk : ""), { permanent: true });
  });
}
