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
 * Własne szczeble MG (ustawienie świata customSkins, edytor w skin-editor.mjs): reguła { id, name, base (wbudowany wygląd
 * pod spodem), ink, bg (kolory, opcjonalne), when (item | feature | race | name), match ("tekst|inny"), rung (1–5), bar }.
 * Reguła, która pasuje, dodaje wygląd "c-<id>" na swoim szczeblu; przy remisie wygrywa nad wbudowanym.
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
// ---------- własne szczeble MG ----------
let CUSTOM = [];
const HEX = /^#[0-9a-f]{6}$/i;
const CUSTOM_ID = /^c-[a-z0-9]{1,16}$/;
/** Luminancja koloru #rrggbb (0–1). */
export function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const ch = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}
/** Oczyszczona reguła (albo null). */
export function cleanRule(r) {
  if (!r || typeof r !== "object") return null;
  const id = `c-${String(r.id ?? "").replace(/^c-/, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)}`;
  const base = SKINS.some(s => s.id === r.base) ? r.base : "paper";
  const name = String(r.name ?? "").trim().slice(0, 60);
  if (!CUSTOM_ID.test(id) || !name) return null;
  return {
    id, name, base,
    ink: HEX.test(r.ink ?? "") ? r.ink.toLowerCase() : "", bg: HEX.test(r.bg ?? "") ? r.bg.toLowerCase() : "",
    when: ["item", "feature", "race", "name"].includes(r.when) ? r.when : "item",
    match: String(r.match ?? "").trim().slice(0, 200),
    rung: Math.min(5, Math.max(1, Math.round(Number(r.rung) || 2))),
    bar: String(r.bar ?? "").trim().slice(0, 60)
  };
}
/** Wczytaj reguły MG (z ustawienia świata). */
export function setCustomSkins(list) {
  const seen = new Set();
  CUSTOM = (Array.isArray(list) ? list : []).map(cleanRule).filter(r => r && !seen.has(r.id) && seen.add(r.id));
  return CUSTOM;
}
export const customSkins = () => CUSTOM;

/** Wygląd własny jako wpis jak w SKINS: label — nazwa MG (bez tłumaczenia), dark z koloru tła albo z bazy. */
function customEntry(r) {
  const b = SKINS.find(s => s.id === r.base);
  return { id: r.id, rung: r.rung, label: r.name, dark: r.bg ? luminance(r.bg) < 0.35 : !!b?.dark, custom: r };
}
export const skinById = id => SKINS.find(s => s.id === id) ?? (CUSTOM_ID.test(id ?? "") ? (r => r && customEntry(r))(CUSTOM.find(c => c.id === id)) : null) ?? null;
/** Wszystkie wyglądy: wbudowane i własne. */
export const allSkins = () => [...SKINS, ...CUSTOM.map(customEntry)];

/** Czy reguła MG pasuje do postaci. */
export function ruleMatches(r, actor) {
  const alts = r.match.split("|").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!alts.length) return false;
  const has = text => { const s = String(text ?? "").toLowerCase(); return alts.some(a => s.includes(a)); };
  const items = [...(actor?.items ?? [])];
  switch (r.when) {
    case "item": return items.some(i => i.system?.equipped && has(i.name));
    case "feature": return items.some(i => ["feature", "perk", "spell"].includes(i.type) && i.system?.active !== false && has(i.name));
    case "race": return has(actor?.system?.race);
    case "name": return has(actor?.name);
  }
  return false;
}

/**
 * Jak pomalować okno: { base (klasa skin-…), vars ({ "--pip": … } — tylko dla własnych), tag (napis na czacie|null) }.
 */
export function skinPaint(id) {
  const e = skinById(id);
  if (!e?.custom) return { base: e ? id : "paper", vars: {}, tag: null };
  const r = e.custom, vars = {};
  if (r.ink) vars["--pip"] = r.ink;
  if (r.bg) {
    vars["--pip-bg"] = r.bg;
    vars["--pip-bg-hi"] = `color-mix(in srgb, ${r.bg} ${e.dark ? 92 : 75}%, white)`;
    vars["--pip-void"] = `color-mix(in srgb, ${r.bg} 65%, black)`;
    vars["--pip-ink"] = e.dark ? "#000" : `color-mix(in srgb, ${r.bg} 82%, white)`;
  }
  return { base: r.base, vars, tag: (r.bar || r.name).split("·")[0].trim().toUpperCase() };
}
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
  // własne szczeble MG: pasujące dochodzą do wyboru; najwyższa reguła wygrywa, jeśli jej szczebel ≥ wbudowanego
  const custom = CUSTOM.filter(r => ruleMatches(r, actor));
  available.unshift(...custom.map(r => r.id));
  const builtin = armor ? 5 : pipbuck ? 4 : screen ? 3 : origin ? 2 : 1;
  const top = custom.reduce((best, r) => (!best || r.rung > best.rung ? r : best), null);
  if (top && top.rung >= builtin) return { rung: top.rung, auto: top.id, available, reason: { key: "custom", name: top.name } };
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
  if (s.pink) out.push("ov-pink");
  if (s.out) return [...out, "ov-out"];
  if (s.jolted) out.push("ov-static");
  if (s.burning) out.push("ov-burning");
  else if (s.poisoned) out.push("ov-poison");
  else if (s.paralyzed) out.push("ov-paralyzed");
  return out;
}

/** Wygląd z akcentem w kolorze magii (tylko ciemne ekrany — na jasnych pastelowy kolor byłby nieczytelny). */
export const accentOk = skin => !!skinById(skin)?.dark;
