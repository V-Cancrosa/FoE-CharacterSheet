/**
 * Języki systemu: angielski — podstawa, jak w podręczniku — i polski (tłumaczenie).
 *
 * Teksty w kodzie są po angielsku: t("Attack"), t("{name}: not enough caps.", { name }). Słownik lang/pl.mjs zamienia
 * je na polskie, gdy gracz gra po polsku (brak wpisu — zostaje angielski). Klucz z kontekstem, np. "bj|Hit", wyświetla
 * się po angielsku bez przedrostka („Hit”), a po polsku ma własne tłumaczenie („Dobierz”) — gdy to samo angielskie
 * słowo znaczy po polsku co innego.
 *
 * Język wybiera każdy gracz u siebie: opcja „Language (Fallout: Equestria)” — jak Foundry / English / Polski.
 * „Jak Foundry” bierze język z ustawień Foundry (Konfiguracja → Ogólne → Język). Zmiana wymaga odświeżenia strony.
 * Wiadomości na czacie i utworzone dokumenty zostają w języku tego, kto je utworzył (tak działa Foundry).
 */
import PL from "../lang/pl.mjs";

const F = "foe-rpg";
let localized = false;
let cached = null;

/** Język gracza: "en" albo "pl". */
export function lang() {
  if (cached) return cached;
  let pick = "auto";
  try { pick = game.settings.get(F, "language") ?? "auto"; } catch { /* opcja jeszcze niezarejestrowana */ }
  const core = String(globalThis.game?.i18n?.lang ?? "en").toLowerCase();
  const out = pick === "en" || pick === "pl" ? pick : core.startsWith("pl") ? "pl" : "en";
  // po wczytaniu tłumaczeń Foundry język już się nie zmieni (zmiana opcji odświeża stronę)
  if (localized) cached = out;
  return out;
}
export const isPL = () => lang() === "pl";

const CTX = /^[a-z][\w-]*\|/;
const fill = (s, data) => (data ? s.replace(/\{(\w+)\}/g, (m, k) => (data[k] === undefined || data[k] === null ? m : String(data[k]))) : s);

/** Tekst w języku gracza; {nazwa} — wstawki z `data`. */
export function t(text, data) {
  const key = String(text ?? "");
  let s = isPL() ? PL[key] : undefined;
  if (typeof s !== "string") s = key.replace(CTX, "");
  return fill(s, data);
}

/** Polska forma liczby: 0 — „1 kapsel”, 1 — „2 kapsle”, 2 — „5 kapsli”. */
export function plIndex(n) {
  const a = Math.abs(Math.trunc(Number(n) || 0)), d = a % 10, h = a % 100;
  if (a === 1) return 0;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 1;
  return 2;
}

/**
 * Liczba mnoga: tn(n, "{n} cap", "{n} caps"). Po polsku trzy formy ze słownika pod kluczem "{n} cap|{n} caps"
 * (np. ["{n} kapsel", "{n} kapsle", "{n} kapsli"]).
 */
export function tn(n, one, many, data = {}) {
  const d = { n, ...data };
  const en = Math.abs(Number(n)) === 1 ? one : many;
  if (!isPL()) return fill(en.replace(CTX, ""), d);
  const forms = PL[`${one}|${many}`];
  return fill(Array.isArray(forms) ? forms[plIndex(n)] : en.replace(CTX, ""), d);
}

/** Znacznik dla słownika: tekst zostaje po angielsku, a tłumaczy go t() przy wyświetleniu (stałe, etykiety). */
export const N_ = s => s;

/** Pole danych (data/*.json) w języku gracza: po polsku `obj[field + "_pl"]`, jeśli jest — inaczej angielskie `obj[field]`. */
export const tdata = (obj, field) => (isPL() && obj?.[`${field}_pl`]) || obj?.[field];

const getter = (out, k, v) => Object.defineProperty(out, k, { get: () => t(v), enumerable: true, configurable: true });

/**
 * Stała mapa etykiet tłumaczonych przy odczycie: LOCATIONS[k] daje tekst w języku gracza (angielski w kodzie).
 * Uwaga: rozłożenie ({ ...MAPA }) czyta etykiety od razu — w kodzie modułu (przy imporcie) tylko w funkcjach.
 */
export function tmap(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") getter(out, k, v);
    else out[k] = v;
  }
  return out;
}

/**
 * Jak tmap, ale dla obiektów i tablic z polami tekstowymi (np. { label, desc }) — tłumaczy tylko pola z `fields`
 * (także tablice napisów, np. notes: ["…", "…"]). Pola już tłumaczone przy odczycie (zagnieżdżone tmap/tfields) zostają.
 */
export function tfields(obj, fields = ["label", "desc"]) {
  const wrap = o => {
    if (Array.isArray(o)) return o.map(wrap);
    if (!o || typeof o !== "object" || typeof o === "function") return o;
    const out = {};
    for (const k of Object.keys(o)) {
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (d.get) { Object.defineProperty(out, k, d); continue; }
      const v = d.value;
      if (typeof v === "string" && fields.includes(k)) getter(out, k, v);
      else if (Array.isArray(v) && fields.includes(k) && v.every(x => typeof x === "string")) {
        Object.defineProperty(out, k, { get: () => v.map(x => t(x)), enumerable: true, configurable: true });
      } else out[k] = v && typeof v === "object" ? wrap(v) : v;
    }
    return out;
  };
  return wrap(obj);
}

/** Etykiety typów dokumentów (Foundry pokazuje je w oknie tworzenia i na listach). */
const TYPE_LABELS = {
  Actor: { character: N_("Character"), npc: N_("NPC"), vehicle: N_("Vehicle"), terminal: N_("Terminal"), casino: N_("Gaming table") },
  Item: { weapon: N_("Weapon"), armor: N_("Armor"), gear: N_("Item"), feature: N_("Feature"), spell: N_("Spell") }
};

export function registerLanguageSetting() {
  game.settings.register(F, "language", {
    name: "Language (Fallout: Equestria)",
    hint: "Language of the system on your screen: same as Foundry (Configure Settings → Core → Language), English (as in the rulebook) or Polish. Chat messages stay in the language of whoever posted them. The page reloads after the change.",
    scope: "client", config: true, type: String,
    choices: { auto: "Same as Foundry", en: "English", pl: "Polski" },
    default: "auto",
    requiresReload: true
  });
}

/**
 * Po wczytaniu tłumaczeń Foundry (i18nInit): nazwy i opisy ustawień systemu, etykiety kart i typy dokumentów w języku
 * gracza. Ustawienia rejestrujemy z angielskim tekstem — tu zamieniamy go na tłumaczenie.
 */
export function localizeRegistrations() {
  localized = true;
  cached = null;
  for (const s of game.settings?.settings?.values?.() ?? []) {
    if (s.namespace !== F) continue;
    if (s.name) s.name = t(s.name);
    if (s.hint) s.hint = t(s.hint);
    if (s.choices && typeof s.choices === "object") for (const k of Object.keys(s.choices)) s.choices[k] = t(s.choices[k]);
  }
  for (const m of game.settings?.menus?.values?.() ?? []) {
    if (m.namespace !== F) continue;
    for (const k of ["name", "label", "hint"]) if (m[k]) m[k] = t(m[k]);
  }
  const tr = game.i18n?.translations;
  if (tr) {
    tr.TYPES ??= {};
    for (const [doc, types] of Object.entries(TYPE_LABELS)) {
      tr.TYPES[doc] ??= {};
      for (const [k, v] of Object.entries(types)) tr.TYPES[doc][k] = t(v);
    }
  }
  for (const doc of ["Actor", "Item"]) {
    for (const sheets of Object.values(CONFIG[doc]?.sheetClasses ?? {})) {
      for (const s of Object.values(sheets ?? {})) if (String(s?.id ?? "").startsWith(`${F}.`) && s.label) s.label = t(s.label);
    }
  }
}

/** Pomocniki szablonów: {{t "Attack"}}, {{t "{n} caps" n=caps}}, {{tn caps "{n} cap" "{n} caps"}}. */
export function registerI18nHelpers() {
  const H = globalThis.Handlebars;
  if (!H) return;
  H.registerHelper("t", (text, options) => t(text, options?.hash));
  H.registerHelper("tn", (n, one, many, options) => tn(n, one, many, options?.hash));
}
