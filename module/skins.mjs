/**
 * Wygląd karty postaci według drabinki warunków (bez Foundry — testowalne w Node). Szczeble od najwyższego:
 *   4. założony PipBuck (kategoria „PipBuck” w ekwipunku, nazwa z Pipbuck/Stealthbuck/Stealthfilly) — ekran PipBucka;
 *      odcień zależy od modelu (Golden — złoty, Stealthbuck — przygaszony, inne — kolor fosforu gracza),
 *   3. założone inne urządzenie z ekranem (PRA, EqueMapper, terminal przenośny) — monochromatyczny terminal,
 *   2. pochodzenie z rasy: Enklawa (pegaz Enklawy / EVC), zebra, gryf,
 *   1. domyślnie: papierowa karta postaci ze Stajni.
 * Gracz wybiera spośród wyglądów, do których postać ma prawo (swój szczebel i niższe; PipBuck tylko z PipBuckiem),
 * MG może wymusić dowolny. Flaga foe-rpg.skin: { choice, forced }.
 */
import { N_ } from "./i18n.mjs";
const F = "foe-rpg";

/** Wygląd: { id, rung, label (klucz tłumaczenia), dark (ciemny ekran) }. */
export const SKINS = Object.freeze([
  { id: "pipbuck", rung: 4, label: N_("PipBuck — player's phosphor colour"), dark: true },
  { id: "pipbuck-green", rung: 4, label: N_("PipBuck — green"), dark: true },
  { id: "pipbuck-amber", rung: 4, label: N_("PipBuck — amber"), dark: true },
  { id: "pipbuck-blue", rung: 4, label: N_("PipBuck — blue"), dark: true },
  { id: "pipbuck-white", rung: 4, label: N_("PipBuck — white"), dark: true },
  { id: "pipbuck-gold", rung: 4, label: N_("Golden PipBuck"), dark: true },
  { id: "stealth", rung: 4, label: N_("Stealthbuck — dimmed screen"), dark: true },
  { id: "terminal", rung: 3, label: N_("Terminal — amber"), dark: true },
  { id: "terminal-white", rung: 3, label: N_("Terminal — white"), dark: true },
  { id: "enclave", rung: 2, label: N_("Enclave — military terminal"), dark: true },
  { id: "zebra", rung: 2, label: N_("Zebra — notes and talismans"), dark: false },
  { id: "griffin", rung: 2, label: N_("Griffin — mercenary's notebook"), dark: true },
  { id: "paper", rung: 1, label: N_("Stable character sheet (paper)"), dark: false }
]);
export const skinById = id => SKINS.find(s => s.id === id) ?? null;
export const RUNGS = Object.freeze({ 4: N_("PipBuck worn"), 3: N_("Device with a screen worn"), 2: N_("Origin"), 1: N_("Basic") });

const PIPBUCK = /pip-?buck|stealthbuck|stealthfilly/i;
const SCREEN = /\bPRA\b|personal research assistant|equemapper|terminal,?\s*portable|portable terminal/i;
const worn = actor => [...(actor?.items ?? [])].filter(i => i.type === "gear" && i.system?.equipped);

/** Założone urządzenia: { pipbuck: item|null, screen: item|null }. */
export function devices(actor) {
  const items = worn(actor);
  return {
    pipbuck: items.find(i => i.system?.category === "pipbuck" && PIPBUCK.test(i.name)) ?? null,
    screen: items.find(i => SCREEN.test(i.name)) ?? null
  };
}

/** Pochodzenie z rasy (tekst na karcie, po angielsku albo po polsku): "enclave" | "zebra" | "griffin" | null. */
export function originOf(actor) {
  const r = String(actor?.system?.race ?? "");
  if (/enclave|enklaw|\bEVC\b/i.test(r)) return "enclave";
  if (/zebr/i.test(r)) return "zebra";
  if (/griff|gryf/i.test(r)) return "griffin";
  return null;
}

/** Domyślny odcień PipBucka z modelu. */
const pipbuckSkin = item => (/golden/i.test(item.name) ? "pipbuck-gold" : /stealth/i.test(item.name) ? "stealth" : "pipbuck");

/**
 * Drabinka dla postaci: { rung (najwyższy osiągnięty), auto (wygląd z drabinki), available (ids do wyboru przez gracza),
 * reason ({ key, name } — co zdecydowało) }.
 */
export function skinLadder(actor) {
  const { pipbuck, screen } = devices(actor);
  const origin = originOf(actor);
  const available = [];
  if (pipbuck) available.push(...SKINS.filter(s => s.rung === 4).map(s => s.id));
  if (pipbuck || screen) available.push("terminal", "terminal-white");
  if (origin) available.push(origin);
  available.push("paper");
  if (pipbuck) return { rung: 4, auto: pipbuckSkin(pipbuck), available, reason: { key: "pipbuck", name: pipbuck.name } };
  if (screen) return { rung: 3, auto: "terminal", available, reason: { key: "screen", name: screen.name } };
  if (origin) return { rung: 2, auto: origin, available, reason: { key: "origin", name: origin } };
  return { rung: 1, auto: "paper", available, reason: { key: "basic", name: "" } };
}

/** Wygląd karty: wymuszony przez MG, wybór gracza (o ile dostępny), inaczej z drabinki. */
export function skinOf(actor) {
  const f = actor?.flags?.[F]?.skin ?? {};
  if (f.forced && skinById(f.forced)) return f.forced;
  const l = skinLadder(actor);
  if (f.choice && l.available.includes(f.choice)) return f.choice;
  return l.auto;
}
