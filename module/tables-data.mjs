/**
 * Tabele losowe — czyste dane (bez Foundry): tabele z podręcznika (data/tables.json) i tabele łupów z katalogu.
 * Format wyników jak w Foundry v13+: { type: "text", name, description, img, weight, range, flags }.
 * Wskazówki dla czatu we flagach wyniku foe-rpg: creatures (bestiariusz), vehicle, item + itemType + qty, attr (głód), again.
 */
import { GEAR_CATEGORIES } from "./data.mjs";
import { t, tn, tdata } from "./i18n.mjs";

const F = "foe-rpg";
const I = `systems/${F}/icons/`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

/** Waga łupu: tanie przedmioty częściej (cena 0 → 20, 15 → 5, 100 → 2, 400+ → 1). */
export const lootWeight = value => Math.max(1, Math.round(20 / Math.sqrt(1 + Math.max(0, Number(value) || 0))));

/** Dane RollTable do utworzenia w świecie: zakresy liczone kolejno z wag. */
export function tableDoc(def, version = 1) {
  let at = 1;
  const results = def.results.map(r => {
    const w = Math.max(1, Math.round(Number(r.weight) || 1));
    const range = [at, at + w - 1];
    at += w;
    const hints = Object.fromEntries(Object.entries({
      creatures: r.creatures?.length ? r.creatures : null, vehicle: r.vehicle ?? null, item: r.item ?? null,
      itemType: r.itemType ?? (r.item ? "weapon" : null), qty: r.qty ?? null, attr: r.attr ?? null, again: r.again ?? null
    }).filter(([, v]) => v !== null && v !== undefined));
    return {
      type: "text", name: tdata(r, "name"), description: r.desc ? `<p>${esc(tdata(r, "desc"))}</p>` : "",
      img: r.img ?? def.img ?? "icons/svg/d20-black.svg", weight: w, range, drawn: false,
      flags: Object.keys(hints).length ? { [F]: hints } : {}
    };
  });
  const total = at - 1;
  return {
    name: tdata(def, "name"), img: def.img, description: def.description ? `<p>${esc(tdata(def, "description"))}</p>` : "",
    formula: def.formula || `1d${total}`, replacement: true, displayRoll: true,
    flags: { [F]: { tableId: def.id, version } }, results
  };
}

/** Tabele łupów z katalogu (nasze, nie z podręcznika): amunicja, chemia, jedzenie, różności, broń, pancerz. */
export function lootTables(catalog) {
  const gear = catalog?.gear ?? [], weapons = catalog?.weapons ?? [], armor = catalog?.armor ?? [];
  const val = e => Number(e.value) || 0;
  const gearRes = (list, qty) => list.map(e => ({
    name: e.name, desc: `${GEAR_CATEGORIES[e.category] ?? e.category} · ${tn(val(e), "{n} cap", "{n} caps")}`, weight: lootWeight(val(e)),
    item: e.name, itemType: "gear", qty: typeof qty === "function" ? qty(e) : qty
  }));
  const note = t("System table (not from the rulebook): items from the catalog, cheap ones more often than expensive ones. The chat button adds the drawn item to the character of the selected token.");
  const defs = [
    { id: "loot-ammo", name: t("Loot: ammo"), img: `${I}ammo.svg`,
      results: gearRes(gear.filter(e => e.category === "ammo" && val(e) <= 50), e => (val(e) <= 5 ? "2d10" : "1d6")) },
    { id: "loot-chems", name: t("Loot: chems, medicine and alcohol"), img: `${I}drug.svg`,
      results: gearRes(gear.filter(e => ["drug", "medical"].includes(e.category) && val(e) <= 1000), "1") },
    { id: "loot-food", name: t("Loot: food and drink"), img: `${I}food.svg`,
      results: gearRes(gear.filter(e => e.category === "food" && val(e) <= 200), "1") },
    { id: "loot-misc", name: t("Loot: odds and ends, scrap"), img: `${I}misc.svg`,
      results: gearRes(gear.filter(e => e.category === "misc" && val(e) <= 500), "1") },
    { id: "loot-weapons", name: t("Loot: weapons"), img: `${I}gun.svg`,
      results: weapons.filter(w => val(w) > 0 && val(w) <= 5000).map(w => ({
        name: w.name, desc: `${w.damage || "—"} · ${tn(val(w), "{n} cap", "{n} caps")}`, weight: lootWeight(val(w)), item: w.name, itemType: "weapon",
        qty: w.kind === "explosive" ? "1d3" : "1"
      })) },
    { id: "loot-armor", name: t("Loot: armor and clothing"), img: `${I}armor.svg`,
      results: armor.filter(a => !a.powered && val(a) > 0 && val(a) <= 5000).map(a => ({
        name: a.name, desc: `DT ${a.dt || 0} · ${tn(val(a), "{n} cap", "{n} caps")}`, weight: lootWeight(val(a)), item: a.name, itemType: "armor", qty: "1"
      })) }
  ];
  return defs.filter(d => d.results.length).map(d => ({ ...d, description: note }));
}

/** Wszystkie tabele systemu jako dane RollTable. */
export function allTableDocs(book, catalog) {
  const version = Number(book?.version) || 1;
  return [...(book?.tables ?? []), ...lootTables(catalog)].map(d => tableDoc(d, version));
}

/** Tekst wyniku bez znaczników (do dopasowania nazw w tabelach MG). */
export const plain = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

/**
 * Dopasowanie nazw z bestiariusza i katalogu do tekstu wyniku (tabele zrobione ręcznie przez MG).
 * Całe nazwy (granice słów), od najdłuższej; nazwa zawarta w dłuższym trafieniu odpada. Zwraca { creatures, items }.
 */
export function matchNames(text, { creatures = [], items = [] } = {}) {
  const orig = ` ${plain(text)} `;
  const low = orig.toLowerCase();
  const letter = /[a-z0-9ąćęłńóśźż]/i;
  const spans = [];
  // cała nazwa (granice słów), nie początek dłuższej nazwy własnej („10mm Pistol” nie daje „10mm”)
  // i nie wewnątrz już dopasowanej dłuższej nazwy („Giant Radscorpion” nie daje też „Radscorpion”)
  const take = name => {
    const n = String(name).toLowerCase();
    if (n.length < 3) return false;
    for (let i = low.indexOf(n); i >= 0; i = low.indexOf(n, i + 1)) {
      const end = i + n.length;
      if (letter.test(low[i - 1] ?? " ") || letter.test(low[end] ?? " ")) continue;
      if (/^ [A-ZĄĆĘŁŃÓŚŹŻ0-9]/.test(orig.slice(end, end + 2))) continue;
      if (spans.some(([a, b]) => i < b && end > a)) continue;
      spans.push([i, end]);
      return true;
    }
    return false;
  };
  const all = [...new Set(creatures)].map(n => ({ n, c: true })).concat(items.map(x => ({ n: x.name, x })))
    .sort((a, b) => b.n.length - a.n.length);
  const found = all.filter(e => take(e.n));
  return { creatures: found.filter(e => e.c).map(e => e.n), items: found.filter(e => e.x).map(e => e.x) };
}
