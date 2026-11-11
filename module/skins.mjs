/**
 * Wygląd karty postaci według drabinki warunków (bez Foundry — testowalne w Node). Szczeble od najwyższego:
 *   5. założony pancerz wspomagany — wizjer hełmu (HUD); pancerz Enklawy (nazwa albo pochodzenie) — niebieski,
 *   4. założony PipBuck (kategoria „PipBuck” w ekwipunku, nazwa z Pipbuck/Stealthbuck/Stealthfilly) — ekran PipBucka;
 *      odcień zależy od modelu (Golden — złoty, Stealthbuck — przygaszony, inne — kolor fosforu gracza),
 *   3. założone inne urządzenie z ekranem (PRA, EqueMapper, terminal przenośny) — monochromatyczny terminal,
 *   2. pochodzenie i przynależność: organizacja z kreatora albo z cech (Stalowi Strażnicy, najeźdźcy, EVC) przed rasą
 *      (Enklawa, zebra, gryf, ghul, podmieniec),
 *   1. domyślnie: papierowa karta postaci ze Stajni.
 * Gracz wybiera spośród wyglądów, do których postać ma prawo (swój szczebel i niższe; PipBuck tylko z PipBuckiem),
 * MG może wymusić dowolny. Flaga foe-rpg.skin: { choice, forced }.
 */
import { N_ } from "./i18n.mjs";
const F = "foe-rpg";

/** Wygląd: { id, rung, label (klucz tłumaczenia), dark (ciemny ekran) }. */
export const SKINS = Object.freeze([
  { id: "power-armor", rung: 5, label: N_("Power armor — helmet HUD"), dark: true },
  { id: "power-armor-enclave", rung: 5, label: N_("Enclave power armor — HUD"), dark: true },
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
  { id: "rangers", rung: 2, label: N_("Steel Rangers — field codex"), dark: true },
  { id: "raider", rung: 2, label: N_("Raider — scrawled scraps"), dark: true },
  { id: "ghoul", rung: 2, label: N_("Ghoul — yellowed papers"), dark: false },
  { id: "changeling", rung: 2, label: N_("Changeling — chitin and green flame"), dark: true },
  { id: "paper", rung: 1, label: N_("Stable character sheet (paper)"), dark: false }
]);
export const skinById = id => SKINS.find(s => s.id === id) ?? null;
export const RUNGS = Object.freeze({ 5: N_("Power armor worn"), 4: N_("PipBuck worn"), 3: N_("Device with a screen worn"), 2: N_("Origin"), 1: N_("Basic") });

const PIPBUCK = /pip-?buck|stealthbuck|stealthfilly/i;
const SCREEN = /\bPRA\b|personal research assistant|equemapper|terminal,?\s*portable|portable terminal/i;
const worn = (actor, type = "gear") => [...(actor?.items ?? [])].filter(i => i.type === type && i.system?.equipped);

/** Założone urządzenia: { pipbuck: item|null, screen: item|null, armor: założony pancerz wspomagany|null }. */
export function devices(actor) {
  const items = worn(actor);
  return {
    pipbuck: items.find(i => i.system?.category === "pipbuck" && PIPBUCK.test(i.name)) ?? null,
    screen: items.find(i => SCREEN.test(i.name)) ?? null,
    armor: worn(actor, "armor").find(i => i.system?.powered) ?? null
  };
}

/** Pochodzenie z rasy (tekst na karcie, po angielsku albo po polsku). */
export function originOf(actor) {
  const r = String(actor?.system?.race ?? "");
  if (/enclave|enklaw|\bEVC\b/i.test(r)) return "enclave";
  if (/zebr/i.test(r)) return "zebra";
  if (/griff|gryf/i.test(r)) return "griffin";
  if (/ghoul|ghul/i.test(r)) return "ghoul";
  if (/changeling|podmie[nń]|odmie[nń]/i.test(r)) return "changeling";
  if (/steel ranger|stalow/i.test(r)) return "rangers";
  return null;
}

/** Organizacja z kreatora (cecha Organization) na wygląd. */
const ORG_SKIN = { knight: "rangers", scribe: "rangers", ajKnight: "rangers", ajScribe: "rangers", raider: "raider", evc: "enclave" };
/** Przynależność: organizacja wybrana w kreatorze albo cecha o nazwie organizacji. "rangers" | "raider" | "enclave" | null. */
export function affiliationOf(actor) {
  let org = null;
  try { org = JSON.parse(actor?.flags?.[F]?.creation ?? "{}")?.choices?.["t:organization"]?.org ?? null; } catch { /* stary zapis */ }
  if (ORG_SKIN[org]) return ORG_SKIN[org];
  for (const i of actor?.items ?? []) {
    if (i.type !== "feature" || i.system?.active === false) continue;
    if (/steel rangers?|applejack'?s rangers|stalow\w* stra[żz]/i.test(i.name)) return "rangers";
    if (/\braider|najeźdźc|najezdzc/i.test(i.name)) return "raider";
  }
  return null;
}

/** Domyślny odcień PipBucka z modelu. */
const pipbuckSkin = item => (/golden/i.test(item.name) ? "pipbuck-gold" : /stealth/i.test(item.name) ? "stealth" : "pipbuck");

/**
 * Drabinka dla postaci: { rung (najwyższy osiągnięty), auto (wygląd z drabinki), available (ids do wyboru przez gracza),
 * reason ({ key, name } — co zdecydowało) }.
 */
export function skinLadder(actor) {
  const { pipbuck, screen, armor } = devices(actor);
  const race = originOf(actor), aff = affiliationOf(actor);
  const origin = aff ?? race;
  const available = [];
  const enclaveArmor = armor && (/enclave|enklaw/i.test(armor.name) || origin === "enclave");
  if (armor) available.push(enclaveArmor ? "power-armor-enclave" : "power-armor", enclaveArmor ? "power-armor" : "power-armor-enclave");
  if (pipbuck) available.push(...SKINS.filter(s => s.rung === 4).map(s => s.id));
  if (pipbuck || screen) available.push("terminal", "terminal-white");
  for (const o of new Set([aff, race].filter(Boolean))) available.push(o);
  available.push("paper");
  if (armor) return { rung: 5, auto: enclaveArmor ? "power-armor-enclave" : "power-armor", available, reason: { key: "armor", name: armor.name } };
  if (pipbuck) return { rung: 4, auto: pipbuckSkin(pipbuck), available, reason: { key: "pipbuck", name: pipbuck.name } };
  if (screen) return { rung: 3, auto: "terminal", available, reason: { key: "screen", name: screen.name } };
  if (origin) return { rung: 2, auto: origin, available, reason: { key: aff ? "affiliation" : "origin", name: origin } };
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

/**
 * Nakładki stanu na dowolny wygląd (klasy ov-…). s — stan postaci, policzony w Foundry (skin-apply.mjs):
 *   { dead, out (nieprzytomny), jolted (porażony prądem — PipBuck i pancerz gasną), burning, poisoned, paralyzed,
 *     rads (pochłonięte), thirst (etap odwodnienia z karami), starving (głód z karami) }.
 * Śmierć wyklucza resztę; nieprzytomność wyklucza zakłócenia i ramki.
 */
export function overlaysOf(s = {}) {
  if (s.dead) return ["ov-dead"];
  const out = [];
  const rads = Number(s.rads) || 0;
  if (rads >= 200) out.push(`ov-rads-${rads >= 800 ? 3 : rads >= 400 ? 2 : 1}`);
  if ((Number(s.thirst) || 0) >= 3 || s.starving) out.push("ov-faint");
  if (s.out) return [...out, "ov-out"];
  if (s.jolted) out.push("ov-static");
  if (s.burning) out.push("ov-burning");
  else if (s.poisoned) out.push("ov-poison");
  else if (s.paralyzed) out.push("ov-paralyzed");
  return out;
}

/** Wygląd z akcentem w kolorze magii (tylko ciemne ekrany — na jasnych pastelowy kolor byłby nieczytelny). */
export const accentOk = skin => !!skinById(skin)?.dark;
