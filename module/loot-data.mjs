/**
 * Łup z bestiariusza — czyste zasady (bez Foundry).
 *   - wpisy z pola „Łup” bestiariusza: „1d4 Radscorpion Poison Glands; Chitin Fragments, 20%”, „Frag Grenade 1d2, 50%”,
 *     „Healing Potion (1d2), 50%”, „1d10x10 caps”, „None; Self Destruct (Scrap Metal, 5%; …)”,
 *   - wpisy ogólne (Random ammo, Food Item, Random Drug, Pre-war Clothes, zabawka) losowane z tabel łupów,
 *   - stwory bez łupu w podręczniku: nasze domyślne (zwierzęta — mięso z katalogu, roboty — złom, frakcje — kapsle),
 *   - rzeczy przy NPC: broń z katalogu (bez naturalnej: kły, pazury, kopyta), pancerz, ekwipunek.
 */

/** Podział po „;” poza nawiasami. */
export function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of String(s ?? "")) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

/** Wpisy łupu: [{ raw, name, qty, chance, note }]. qty — formuła („1d4”, „1d10*10”) albo liczba jako tekst. */
export function parseLoot(text) {
  const out = [];
  for (const part of splitTop(text)) {
    const sd = part.match(/^self[- ]destruct\.?\s*\((.*)\)\s*\.?$/i);
    if (sd) { for (const e of parseLoot(sd[1])) out.push({ ...e, note: [e.note, "po samozniszczeniu"].filter(Boolean).join("; ") }); continue; }
    if (/^(none|self[- ]destruct)\.?$/i.test(part)) continue;
    let p = part.replace(/\s+/g, " ").trim();
    const notes = [];
    let chance = 100, qty = null;
    const cm = p.match(/,?\s*\(?(\d{1,3})\s*%(?:\s*chance)?\)?/i);
    if (cm) { chance = Math.min(100, Number(cm[1])); p = `${p.slice(0, cm.index)}${p.slice(cm.index + cm[0].length)}`.trim(); }
    p = p.replace(/\s*if present.*$/i, m => { notes.push(/pre-?encounter/i.test(m) ? "tylko jeśli go ma — MG rzuca przed spotkaniem" : "tylko jeśli go ma"); return ""; });
    p = p.replace(/,\s*containers required/i, () => { notes.push("potrzebne pojemniki"); return ""; });
    const lead = p.match(/^(\d+d\d+(?:\s*[x×*]\s*\d+)?|\d+)\s+(?=\D)/i);
    if (lead) { qty = lead[1]; p = p.slice(lead[0].length); }
    const paren = p.match(/\s*\((\d+d\d+)(?:\s+doses?)?\)/i);
    if (!qty && paren) { qty = paren[1]; p = `${p.slice(0, paren.index)}${p.slice(paren.index + paren[0].length)}`; }
    const tail = p.match(/\s+(\d+d\d+)$/i);
    if (!qty && tail) { qty = tail[1]; p = p.slice(0, tail.index); }
    const name = p.replace(/[,.\s]+$/, "").trim();
    if (!name) continue;
    out.push({ raw: part, name, qty: String(qty ?? "1").replace(/\s*[x×]\s*/i, "*"), chance, note: notes.join("; ") });
  }
  return out;
}

/** Wpisy ogólne → rodzaj losowania z tabel łupów (albo kapsle). */
export function genericKind(name) {
  const n = String(name ?? "").trim().toLowerCase();
  if (/^(bottle)?caps$/.test(n)) return "caps";
  if (/^(random )?(ammo|ammunition)$/.test(n)) return "ammo";
  if (/^(food item|(ir)?radiated food)$/.test(n)) return "food";
  if (/^random drugs?$/.test(n)) return "drug";
  if (/^pre-?war clothes/.test(n)) return "clothes";
  if (/random toy/.test(n)) return "toy";
  return null;
}

/** Nazwy z bestiariusza, które w katalogu nazywają się inaczej. */
const ALIASES = {
  "radscorpion poison gland": "Poison Gland (Radscorpion)",
  "manticore poison gland": "Poison Gland (Manticore)",
  "bloatsprite poison gland": "Poison Gland (Bloatsprite)",
  "mercenary barding": "Mercenary/Slaver Barding",
  "zebra spear": "Spear, Zebra",
  "magical energy cell": "ME-Cell",
  "phoenix talon": "Griffin Talon",
  "corrupted broadcaster module": "Broadcaster (Corrupted)",
  "griffin mercenary combat barding": "Talon Combat Barding",
  "griffin mercenary combat helmet": "Talon Combat Helmet"
};

const low = s => String(s ?? "").trim().toLowerCase();
const noParen = s => String(s ?? "").replace(/\s*\([^)]*\)/g, "").trim();
const singular = s => s.replace(/(ies)$/i, "y").replace(/(?<!s)s$/i, "");

/** Przedmiot z katalogu dla nazwy z łupu: { type: weapon|armor|gear, name } albo null. */
export function matchItem(name, catalog) {
  const lists = [["weapon", catalog?.weapons ?? []], ["armor", catalog?.armor ?? []], ["gear", catalog?.gear ?? []]];
  const byName = new Map();
  for (const [type, list] of lists) for (const e of list) if (!byName.has(low(e.name))) byName.set(low(e.name), { type, name: e.name });
  const tries = [name, noParen(name), singular(name), singular(noParen(name))];
  for (const t of tries) {
    const alias = ALIASES[low(singular(noParen(t)))] ?? ALIASES[low(t)];
    if (alias && byName.has(low(alias))) return byName.get(low(alias));
    if (byName.has(low(t))) return byName.get(low(t));
  }
  // nazwa z katalogu, po której jest tylko dopisek („Enclave Powered Armor (P-51f) with integrated …”)
  const n = low(name);
  let best = null;
  for (const [k, v] of byName) {
    if (k.length < 6 || !n.startsWith(k)) continue;
    if (!/^(\s*\(|\s+with\b|,)/.test(n.slice(k.length))) continue;
    if (!best || k.length > low(best.name).length) best = v;
  }
  return best;
}

/** Nasze domyślne łupy dla stworów bez łupu w podręczniku. */
export function defaultLoot(entry, catalog) {
  const kind = entry?.kind;
  const food = new Map((catalog?.gear ?? []).filter(g => g.category === "food").map(g => [low(g.name), g.name]));
  if (kind === "animal") {
    const words = String(entry?.name ?? "").replace(/\s*\(.*?\)/g, "").split(/\s+/);
    const bases = [entry?.name, entry?.group, words.slice(-2).join(" "), words.at(-1), words[0]].filter(Boolean).map(noParen);
    const meat = bases.map(b => food.get(low(`${b} Meat`))).find(Boolean);
    return meat ? [{ raw: "", name: meat, qty: "1d2", chance: 100, note: "", house: true }] : [];
  }
  if (kind === "robot") return [
    { raw: "", name: "Scrap Metal", qty: "1d2", chance: 50, note: "", house: true },
    { raw: "", name: "Scrap Electronics", qty: "1", chance: 25, note: "", house: true }
  ];
  if (kind === "faction" && !/^slave$/i.test(entry?.name ?? "")) return [{ raw: "", name: "Caps", qty: "1d10", chance: 50, note: "", house: true }];
  return [];
}

/** Czy przedmiot NPC to łup (a nie naturalna broń, cecha, zaklęcie). Zwraca wpis katalogu broni albo true/false. */
export function carriedLoot(item, catalog) {
  if (!item || ["feature", "spell"].includes(item.type)) return false;
  if (item.type === "armor" || item.type === "gear") return (Number(item.system?.qty ?? 1) || 0) > 0;
  if (item.type !== "weapon") return false;
  const n = low(noParen(item.name));
  const cat = (catalog?.weapons ?? []).find(w => low(noParen(w.name)) === n || low(w.name) === low(item.name));
  return cat && (Number(cat.value) || 0) > 0 ? cat : false;
}

/** Amunicja z katalogu pasująca do typu amunicji broni („10mm”, „MFC”, „.308” → „.308 cal”). */
export function ammoFor(ammoType, catalog) {
  const t = low(ammoType).replace(/\s+/g, " ");
  if (!t || t === "-" || t === "—") return null;
  const ammo = (catalog?.gear ?? []).filter(g => g.category === "ammo");
  return ammo.find(a => low(a.name) === t)?.name ?? ammo.find(a => low(a.name).startsWith(t) || t.startsWith(low(a.name)))?.name ?? null;
}

/** Losowanie z wagami: [{ name, weight, … }] → wpis. rand ∈ [0,1). */
export function weightedPick(list, rand = Math.random) {
  const total = list.reduce((t, x) => t + (Number(x.weight) || 1), 0);
  let r = rand() * total;
  for (const x of list) { r -= Number(x.weight) || 1; if (r < 0) return x; }
  return list.at(-1) ?? null;
}
