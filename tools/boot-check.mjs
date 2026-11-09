/**
 * Test startu systemu bez Foundry: wczytuje module/foe.mjs tak jak przeglądarka (to samo wejście, ta sama kolejność
 * importów), uruchamia haki init → i18nInit → setup na atrapie i sprawdza, czy karty postaci się zarejestrowały.
 * Łapie błędy, przez które system w ogóle nie startuje (np. pętla importów: „Cannot access 'F' before initialization”) —
 * wtedy Foundry pokazuje pustą kartę zastępczą. Uruchamia go wydanie (.github/workflows/release.yml) przed spakowaniem.
 *
 *   node tools/boot-check.mjs
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Atrapa: każda właściwość to wywoływalna, konstruowalna i dziedziczalna „pustka”. */
function deep(name = "mock") {
  const fn = function () {};
  return new Proxy(fn, {
    get(target, p) {
      if (p === "prototype") return target.prototype;
      if (p === Symbol.toPrimitive) return () => name;
      if (p === Symbol.iterator) return function* () {};
      if (p === "then") return undefined;
      if (!(p in target)) target[p] = deep(`${name}.${String(p)}`);
      return target[p];
    },
    apply() { return deep(`${name}()`); },
    construct() { return deep(`new ${name}`); }
  });
}

const g = globalThis;
g.foundry = deep("foundry");
Object.assign(g.foundry.utils, {
  escapeHTML: s => String(s),
  deepClone: v => structuredClone(v),
  mergeObject: (a, b) => Object.assign(a ?? {}, b),
  getProperty: (o, k) => String(k).split(".").reduce((v, x) => v?.[x], o),
  setProperty: (o, k, v) => { const ks = String(k).split("."); const last = ks.pop(); let x = o; for (const p of ks) x = x[p] ??= {}; x[last] = v; return true; },
  hasProperty: (o, k) => String(k).split(".").reduce((v, x) => v?.[x], o) !== undefined,
  randomID: () => Math.random().toString(36).slice(2, 18)
});
const sheets = [];
g.foundry.applications.apps.DocumentSheetConfig = { registerSheet: (cls, ns, sheet) => sheets.push(sheet?.name ?? "?"), unregisterSheet: () => {} };
g.DocumentSheetConfig = g.foundry.applications.apps.DocumentSheetConfig;
g.CONFIG = deep("CONFIG");
g.CONST = deep("CONST");
const hooks = {};
g.Hooks = { on: (k, f) => (hooks[k] ??= []).push(f), once: (k, f) => (hooks[k] ??= []).push(f), off: () => {}, callAll: () => {}, call: () => true };
const settings = new Map();
g.game = {
  settings: { register: (ns, k, cfg) => settings.set(k, cfg), registerMenu: () => {}, get: (ns, k) => settings.get(k)?.default, set: async () => {} },
  keybindings: { register: () => {} }, system: { id: "foe-rpg", version: "boot-check" }, i18n: { lang: "en", localize: k => k, format: k => k },
  user: { isGM: true, targets: new Set() }, users: [], messages: [], modules: new Map(), actors: [], scenes: [], packs: []
};
g.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
g.document = deep("document");
g.window = g;
g.HTMLElement ??= class {};
for (const n of ["Handlebars", "Actor", "Item", "ChatMessage", "Roll", "Combat", "Combatant", "TokenDocument", "Token", "JournalEntry",
  "Application", "FormApplication", "Dialog", "ActiveEffect", "Scene", "User", "Macro", "RollTable", "Folder", "Tile", "Wall",
  "PIXI", "canvas", "TextEditor", "Sequence", "Sequencer", "AudioHelper"]) if (!(n in g)) g[n] = deep(n);

let errors = 0;
try {
  await import(pathToFileURL(resolve(ROOT, "module/foe.mjs")).href);
} catch (err) {
  errors++;
  console.error(`BŁĄD wczytywania systemu (przeglądarka nie uruchomi systemu):\n${err.stack}`);
}
for (const h of ["init", "i18nInit", "setup"]) {
  for (const f of hooks[h] ?? []) {
    try { await f(); } catch (err) { errors++; console.error(`BŁĄD w haku „${h}”:\n${err.stack}`); }
  }
}
if (!sheets.includes("FoeActorSheet")) { errors++; console.error("BŁĄD: karta postaci (FoeActorSheet) się nie zarejestrowała."); }
console.log(`start systemu: ${errors ? `${errors} błędów` : "OK"} | karty: ${sheets.join(", ") || "brak"}`);
process.exit(errors ? 1 : 0);
