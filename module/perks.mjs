/**
 * Perki i awansowanie postaci (podręcznik rozdz. 3, s. 125–149).
 *   - co poziom: punkty umiejętności = 10 + INT/2 (+ perki, np. Egghead), jeden perk, co 3 poziomy +1 obrażeń na ranę,
 *   - punkty wydaje się przed wyborem perka (mogą spełnić jego wymagania), niewydane przepadają; ranga maks. 100,
 *   - perk bierze się raz, chyba że opis mówi inaczej (Intense Training ×3, Tough Hide ×3 — co raz +4 do wymaganego poziomu…),
 *   - doświadczenie: tabela XII (wolna albo szybka progresja) — ustawienie świata.
 * Efekty, które da się policzyć, są zapisane w PERK_FX (typy z effects.mjs); reszta zostaje w opisie dla MG.
 */
import { ATTRS, SKILLS } from "./data.mjs";
import { shortFx } from "./effects.mjs";

const F = "foe-rpg";
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

// ---------- doświadczenie (tabela XII) ----------
export const XP_TABLES = {
  slow: [0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000, 55000, 66000, 78000, 91000, 105000,
    120000, 136000, 153000, 171000, 190000, 210000, 231000, 253000, 276000, 300000, 325000, 351000, 379000, 407000, 436000],
  fast: [0, 200, 550, 1050, 1700, 2500, 3450, 4550, 5800, 7200, 8750, 10450, 12300, 14300, 16450,
    18750, 21200, 23800, 26550, 29450, 32500, 35700, 39050, 42550, 46200, 50000, 53950, 58050, 62300, 66700]
};
export const MAX_LEVEL = 30;

export function xpProgression() {
  try { return game.settings.get(F, "xpProgression") || "slow"; } catch { return "slow"; }
}
/** Ile PD trzeba mieć na dany poziom (null — bez PD albo poza tabelą). */
export function xpFor(level, prog = xpProgression()) {
  const t = XP_TABLES[prog];
  return t && level >= 1 && level <= t.length ? t[level - 1] : null;
}

// ---------- efekty perków ----------
const fx = (type, target, value, when = "") => ({ type, target, value, when });
const RANK = (t, v) => fx("skillRank", t, v);
const ROLL = (t, v, when) => fx("skillRoll", t, v, when);
const AROLL = (t, v, when) => fx("attrRoll", t, v, when);
const DMG = (t, v, when) => fx("damage", t, v, when);
const ACC = (t, v, when) => fx("accuracy", t, v, when);

/**
 * Nazwa perka → { fx, rankFx: {rank: fx} (inne efekty kolejnych rang), choose, karma, floor, note }.
 * choose: { kind: "attr" | "skill" | "attrOf", n, label, value, type, options } — wybór gracza przy dodawaniu.
 * floor: podnosi atrybuty poniżej wartości (No Weaknesses, Almost Perfect).
 */
export const PERK_FX = {
  "Canterlot Gourmet": { fx: [AROLL("int,end", 5, "Opór przed uzależnieniem")] },
  "Clever Prancer": { fx: [fx("critSuccess", "attack", 5)], note: "tylko w lekkim pancerzu, ubraniu albo bez pancerza" },
  "Daddy’s/Momma’s Filly/Colt": { choose: { kind: "skill", n: 2, value: 5, type: "skillRank", label: "Dwie umiejętności rodzica (+5 do rangi)" } },
  "Gun Nut": { fx: [RANK("smallGuns,repair", 5)] },
  "High Ho Silver, Away!": { fx: [fx("speed", "all", 5)] },
  "Hind Leg Stance": { fx: [ROLL("science,repair", 5, "W postawie na tylnych nogach")] },
  "Horse Sense": { fx: [fx("xpPct", "all", 10)] },
  "Hunter": { fx: [DMG("all", 10, "Przeciw zwierzętom")] },
  "Intense Training": { choose: { kind: "attr", n: 1, value: 1, type: "attr", label: "Atrybut (+1 na stałe, maks. 10)" } },
  "Little Leaguer": { fx: [RANK("explosives,melee", 5)] },
  "Lunar Courtier": { fx: [AROLL("per", 10, "Percepcja wzrokowa w półmroku")] },
  "Retention": { fx: [AROLL("int", 10, "Przypominanie faktów")] },
  "Sleight of Hoof": { fx: [RANK("sneak,lockpick", 5)], rankFx: { 2: [fx("mfdStep", "sneak", 1, "Kradzież kieszonkowa na oczach ofiary")] } },
  "Survivalist": { fx: [RANK("survival", 10)] },
  "Egghead": { fx: [fx("skillPoints", "all", 3)] },
  "Foal at Heart": { fx: [fx("tempAttr", "cha", 2, "Wobec młodszych")] },
  "A Little Dash": { fx: [fx("speed", "all", 5)], note: "tylko w lekkim pancerzu albo bez pancerza; dotyczy też lotu i skradania" },
  "Rhyme Time": { fx: [ROLL("all", 5, "Mówiąc rymem (zerwany rym: −3)")] },
  "Scoundrel": { fx: [RANK("speech,mercantile", 5)], rankFx: { 2: [fx("mfdStep", "sneak", 1, "Kradzież")] } },
  "Steel Hooves": { fx: [DMG("unarmed", 5)] },
  "Bloody Mess": { fx: [DMG("all", 3)] },
  "Demolitions Pony": { fx: [DMG("explosives", 5)] },
  "Gunslinger": { fx: [ACC("smallGuns,energy", 10, "SATS, broń trzymana w pysku")] },
  "The Power of Metal": { fx: [DMG("unarmed", 5)] },
  "The Professional": { fx: [DMG("smallGuns", 5, "Krytyk z zaskoczenia (pistolety, SMG)")] },
  "Spell Synergy": { fx: [ACC("magic", 10, "Celowanie zaklęciem w SATS")] },
  "Tough Hide": { fx: [fx("dt", "all", 3)] },
  "Wonderbolt Wannabe": { fx: [fx("mfdStep", "flight", 1, "Manewr bez obrażeń")] },
  "Commando": { fx: [ACC("all", 10, "SATS, broń nie do trzymania w pysku")] },
  "Cowpony": { fx: [DMG("all", 5, "Dynamit, toporki, noże, rewolwery, broń dźwigniowa")] },
  "Grunt": { fx: [DMG("all", 5, "Standardowa broń wojskowa Equestrii")] },
  "Impartial Mediation": { fx: [ROLL("speech", 15, "Karma między −25 a +25")] },
  "Living Anatomy": { fx: [DMG("all", 3, "Przeciw koniowatym i ghulom")] },
  "Rad Resistance": { fx: [fx("radResist", "all", 20)] },
  "Size Matters": { fx: [DMG("all", 5, "Broń ważąca 15 lb lub więcej")] },
  "Sneering Imperialist": { fx: [DMG("all", 5, "Przeciw plemiennym i rabusiom"), ACC("all", 5, "SATS przeciw plemiennym i rabusiom")] },
  "The Stare": { fx: [ROLL("speech", 5, "Zastraszanie wzrokiem")] },
  "Strong Back": { fx: [fx("carry", "all", 50)] },
  "Tribal Wisdom": { fx: [AROLL("end", 10, "Opór przed trucizną")] },
  "Dressed for Success": { fx: [fx("tempAttr", "cha", 1, "Pokojowa rozmowa, w ubraniu albo lekkiej szytej bardzie")] },
  "MoA Agent": { fx: [ACC("all", 10, "Siodło bojowe, broń o przedziale zasięgu > 50 ft")] },
  "Stable Shot": { fx: [fx("critSuccess", "attack", 5)] },
  "Toss Targeter": { fx: [ACC("explosives,magic", 5, "Rzucanie (granaty, mikstury)")] },
  "Touched by Luna": { fx: [fx("tempAttr", "int,per", 2, "W nocy")] },
  "Awareness": { fx: [fx("tempAttr", "per", 2, "W bezruchu, bez bezpośredniego zagrożenia")] },
  "Ferrier": { fx: [ACC("all", 25, "SATS, strzał w nogi")] },
  "Pyromaniac": { fx: [DMG("all", 5, "Broń z efektem ognia")] },
  "Robotics Expert": { fx: [DMG("all", 5, "Przeciw robotom i cyborgom")] },
  "Sniper Pony": { fx: [ACC("all", 10, "SATS, strzał w głowę")] },
  "Violent Vigilante": { fx: [DMG("all", 10, "Przeciw gangom i przestępcom"), ACC("all", 5, "SATS przeciw gangom i przestępcom")] },
  "Center of Mass": { fx: [DMG("all", 5, "Strzał w tułów")] },
  "Purifier": { fx: [DMG("all", 5, "Przeciw stworzeniom skażenia")] },
  "Action Colt/Stallion/Filly/Mare": { fx: [fx("sats", "all", 15)] },
  "Clockwork Heart": { fx: [ROLL("speech", 10, "Wobec sztucznych inteligencji")] },
  "D. A. R. E. ing Do": { choose: { kind: "attrOf", n: 1, value: 20, type: "attrRoll", when: "Opór przed uzależnieniem", options: ["end", "int"], label: "Atrybut (+20 do oporu przed uzależnieniem)" } },
  "Tag!": { choose: { kind: "skill", n: 1, value: 15, type: "skillRank", label: "Czwarta umiejętność tag (+15 do rangi)" } },
  "Ghoulfriend": { note: "+1d10 obrażeń przeciw ghulom (dolicz ręcznie)" },
  "Ninjapony": { fx: [fx("critSuccess", "melee", 15)] },
  "The Power of Celestia": { fx: [fx("tempAttr", "str", 2, "W słońcu")] },
  "Laser Commander": { fx: [DMG("energy", 5), fx("critSuccess", "energy", 10)] },
  "Scent": { fx: [AROLL("per", 5, "Węch, bezwietrznie (z wiatrem +10)")] },
  "Karmic Balance": { karma: 0 },
  "Ray of Sunshine": { karma: 500 },
  "Road to Nightmare": { karma: -500 },
  "No Weaknesses": { floor: 5 },
  "Cooler Under Fire": { fx: [fx("satsRegen", "all", 10)] },
  "Cyberpony": { fx: [fx("dt", "all", 3), fx("fireDt", "all", 10), fx("radResist", "all", 10), AROLL("end", 10, "Opór przed trucizną")] },
  "Adamantium Bone Lacing": { fx: [fx("limbMult", "all", 2)] },
  "Bone Strengthening Brew": { fx: [fx("limbMult", "all", 2)] },
  "Implant Enhancement": { note: "ulepszenie jednego implantu — ustal z MG i dopisz efekt w implancie (zakładka Cechy)" },
  "Monster Hunter": { fx: [DMG("all", 10, "Przeciw mutantom większym od alikorna"), AROLL("end", 10, "Opór przed trucizną")] },
  "Zebra Augmented": { fx: [fx("dt", "all", 3), fx("fireDt", "all", 10), fx("radResist", "all", 10), AROLL("end", 10, "Opór przed trucizną")] },
  "Almost Perfect": { floor: 9 },
  "Burden to Bear": { fx: [fx("carry", "all", 50)] }
};

// ---------- wymagania ----------
const ATTR_ALIASES = { str: "str", strength: "str", per: "per", perception: "per", end: "end", endurance: "end", cha: "cha", charisma: "cha",
  int: "int", intelligence: "int", agi: "agi", agility: "agi", luck: "luck", lck: "luck" };
const SKILL_ALIASES = {
  "small guns": "smallGuns", small: "smallGuns", firearms: "smallGuns", "big guns": "bigGuns", big: "bigGuns", "battle saddles": "bigGuns",
  "energy weapons": "energy", energy: "energy", "melee weapons": "melee", melee: "melee", unarmed: "unarmed", explosives: "explosives",
  lockpicking: "lockpick", lockpick: "lockpick", repair: "repair", science: "science", medicine: "medicine", sneak: "sneak",
  survival: "survival", speechcraft: "speech", speech: "speech", mercantile: "mercantile", barter: "mercantile", magic: "magic",
  flight: "flight", dig: "dig"
};
const ATTR_SHORT = { str: "STR", per: "PER", end: "END", cha: "CHA", int: "INT", agi: "AGI", luck: "LCK" };

/** Stan postaci do sprawdzania wymagań (ranks można nadpisać — podgląd po rozdaniu punktów). */
export function reqView(actor, ranks = null) {
  const sys = actor.system;
  return {
    level: sys.level,
    attrs: Object.fromEntries(Object.entries(sys.attributes).map(([k, a]) => [k, a.base ?? a.total ?? a.value])),
    ranks: ranks ?? Object.fromEntries(Object.entries(sys.skills).map(([k, s]) => [k, s.known === false ? 0 : s.rank])),
    features: actor.items.filter(i => i.type === "feature").map(i => i.name.toLowerCase())
  };
}

function term(raw, num, view) {
  let t = raw.trim().replace(/^either\s+/i, "").replace(/\.$/, "");
  const m = t.match(/^(.*?)\s*(<|>|≥)?\s*(\d+)$/);
  let name = t, op = ">=", n = num;
  if (m) { name = m[1].trim(); op = m[2] === "<" ? "<" : ">="; n = Number(m[3]); }
  const key = name.toLowerCase();
  const perk = key.match(/^(.*?)\s+(perk|trait)$/);
  if (perk) {
    const has = view.features.some(f => f.startsWith(perk[1]));
    return { ok: has, unknown: false, text: `${name}` };
  }
  if (n === null || n === undefined) return { ok: false, unknown: true, text: t };
  if (ATTR_ALIASES[key]) {
    const v = view.attrs[ATTR_ALIASES[key]] ?? 0;
    return { ok: op === "<" ? v < n : v >= n, unknown: false, text: `${ATTR_SHORT[ATTR_ALIASES[key]]} ${op === "<" ? "<" : ""}${n}` };
  }
  if (SKILL_ALIASES[key]) {
    const k = SKILL_ALIASES[key];
    return { ok: (view.ranks[k] ?? 0) >= n, unknown: false, text: `${SKILLS[k].label.split(" / ").pop()} ${n}` };
  }
  return { ok: false, unknown: true, text: t };
}

/**
 * Sprawdza tekst wymagań, np. „AGI 5 or Telekinetic Precision, and either Big Guns or Small Guns 50”.
 * Zwraca { status: ok | fail | unknown, missing: [], check: [] } — „unknown” to warunki do oceny przez MG (rasa, odgrywanie…).
 */
export function checkRequirements(text, view) {
  const out = { status: "ok", missing: [], check: [] };
  const clauses = String(text ?? "").split(/;|,|\.\s+(?=[A-Z])/).map(s => s.trim().replace(/^and\s+/i, "")).filter(Boolean);
  for (const clause of clauses) {
    const alts = clause.split(/\s+or\s+/i);
    const lastNum = Number(clause.match(/(\d+)\s*\.?$/)?.[1] ?? NaN);
    let any = false, unknown = false, failText = [];
    for (const alt of alts) {
      const pieces = alt.split(/\s+and\s+|\s*&\s*/i);
      const altNum = Number(alt.match(/(\d+)\s*\.?$/)?.[1] ?? NaN);
      const num = Number.isFinite(altNum) ? altNum : Number.isFinite(lastNum) ? lastNum : null;
      const res = pieces.map(p => term(p, num, view));
      if (res.every(r => r.ok)) { any = true; break; }
      if (res.some(r => r.unknown) && !res.some(r => !r.ok && !r.unknown)) unknown = true;
      failText.push(res.filter(r => !r.ok).map(r => r.text).join(" i "));
    }
    if (any) continue;
    if (unknown) out.check.push(clause);
    else out.missing.push(failText.join(" albo "));
  }
  out.status = out.missing.length ? "fail" : out.check.length ? "unknown" : "ok";
  return out;
}

// ---------- katalog i przedmioty ----------
let cache = null;
export function loadPerks() {
  cache ??= fetch(`systems/${game.system.id}/data/perks.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(err => { cache = null; throw err; });
  return cache;
}

/** Przedmioty danego perka (z katalogu albo nadane wcześniej, np. przez kreator — po nazwie). */
export const perkItems = (actor, name) => actor.items.filter(i => i.type === "feature" && (
  (i.getFlag?.(F, "perk") ?? i.flags?.[F]?.perk)?.name === name || i.name === name || i.name.startsWith(`${name} (`)));
/** Ile razy postać ma już ten perk. */
export const perkRank = (actor, name) => perkItems(actor, name).length;
/** Wymagany poziom dla kolejnej rangi (Tough Hide: +4 za każdą). */
export const perkLevelFor = (e, rank) => e.level + (/^Tough Hide$/.test(e.name) ? 4 * (rank - 1) : 0);

/** Opis automatycznych efektów po polsku (do katalogu i karty). */
const DEFAULT_LABELS = () => ({
  ...ATTR_SHORT, ...Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label.split(" / ").pop()])),
  all: "wszystko", attack: "ataki", melee: "wręcz", ranged: "dystans"
});
export function autoSummary(name, labels = DEFAULT_LABELS()) {
  const d = PERK_FX[name];
  if (!d) return "";
  const parts = (d.fx ?? []).map(e => shortFx(e, labels));
  if (d.choose) parts.push(`wybór: ${d.choose.label}`);
  if (d.karma !== undefined) parts.push(`karma = ${d.karma}`);
  if (d.floor) parts.push(`atrybuty poniżej ${d.floor} rosną do ${d.floor}`);
  if (d.note) parts.push(d.note);
  return parts.join(" · ");
}

/** Status perka dla postaci: { status, missing, check, rank, max, level, levelOk }. */
export function perkStatus(actor, e, view = reqView(actor), level = actor.system.level) {
  const rank = perkRank(actor, e.name);
  const needLevel = perkLevelFor(e, rank + 1);
  const req = checkRequirements(e.requires, view);
  const levelOk = level >= needLevel;
  const maxed = rank >= (e.ranks || 1);
  const status = maxed ? "taken" : !levelOk || req.status === "fail" ? "fail" : req.status;
  const missing = [...(levelOk ? [] : [`poziom ${needLevel}`]), ...req.missing];
  return { status, missing, check: req.check, rank, max: e.ranks || 1, needLevel };
}

/** Wybór gracza dla perków typu Intense Training / Daddy’s Filly / Tag!. */
async function promptChoice(actor, e, c) {
  const sys = actor.system;
  const opts = c.kind === "skill"
    ? Object.entries(SKILLS).filter(([k]) => sys.skills[k]?.known !== false).map(([k, s]) => [k, `${s.label} (${sys.skills[k].rank})`])
    : (c.options ?? Object.keys(ATTRS)).map(k => [k, `${ATTRS[k]} (${sys.attributes[k].base ?? sys.attributes[k].value})`]);
  const selects = Array.from({ length: c.n }, (_, i) => `<label class="atk-row">${c.n > 1 ? `Wybór ${i + 1}` : "Wybór"} <select name="c${i}">${opts.map(([v, l], j) => `<option value="${v}" ${j === i ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`).join("");
  return DialogV2.wait({
    window: { title: `${e.name}: wybór` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog"><p>${esc(c.label)}</p>${selects}</div>`,
    buttons: [{ action: "ok", label: "Wybierz", icon: "fa-solid fa-check", default: true,
      callback: (ev, btn) => [...new Set(Array.from({ length: c.n }, (_, i) => btn.form.elements[`c${i}`].value))] }]
  });
}

/** Dane przedmiotu „cecha/perk” (bez wyborów). */
export function perkItemData(e, rank = 1, effects = null) {
  const d = PERK_FX[e.name] ?? {};
  // kolejna ranga: własne efekty z rankFx (Sleight of Hoof 2) albo te same co pierwsza (High Ho Silver ×2, Tough Hide ×3)
  const fxList = effects ?? (rank > 1 && d.rankFx?.[rank] ? d.rankFx[rank] : d.fx ?? []);
  const auto = autoSummary(e.name);
  return {
    name: rank > 1 ? `${e.name} (${rank})` : e.name, type: "feature", img: "systems/foe-rpg/icons/perk.svg",
    system: {
      kind: "perk", active: true, effects: fxList,
      description: `${auto ? `<p><b>Automatycznie:</b> ${esc(auto)}</p>` : ""}<p><b>Wymagania:</b> poziom ${e.level}${e.requires ? `; ${esc(e.requires)}` : ""}</p><p>${esc(e.desc)}</p>`
    },
    flags: { [F]: { perk: { name: e.name, rank } } }
  };
}

/**
 * Dodaje perk postaci: pyta o wybory, zmienia karmę/atrybuty dla perków jednorazowych, ostrzega o niespełnionych wymaganiach.
 * Zwraca utworzony przedmiot albo null.
 */
export async function addPerk(actor, e, { level = actor.system.level, view = null, quiet = false } = {}) {
  const st = perkStatus(actor, e, view ?? reqView(actor), level);
  if (st.status === "taken") return warn(`${actor.name} ma już ${e.name}${st.max > 1 ? ` (${st.rank}/${st.max})` : ""}.`);
  const rank = st.rank + 1;
  const d = PERK_FX[e.name] ?? {};
  let effects = null;
  if (d.choose) {
    const picked = await promptChoice(actor, e, d.choose);
    if (!picked) return null;
    const c = d.choose;
    if (c.kind === "attr" && picked.some(k => (actor.system.attributes[k].base ?? 0) >= 10)) ui.notifications.warn(`${e.name}: ten perk nie podnosi atrybutu powyżej 10.`);
    effects = [{ type: c.type, target: picked.join(","), value: c.value, when: c.when ?? "" }];
  }
  if (d.floor) {
    effects = Object.entries(actor.system.attributes).filter(([, a]) => (a.base ?? a.value) < d.floor)
      .map(([k, a]) => ({ type: "attr", target: k, value: d.floor - (a.base ?? a.value), when: "" }));
  }
  const data = perkItemData(e, rank, effects);
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  if (d.karma !== undefined) await actor.update({ "system.karma": d.karma });
  if (!quiet) {
    const w = [...st.missing, ...st.check.map(c => `sprawdź: ${c}`)];
    ui.notifications[st.status === "ok" ? "info" : "warn"](`${actor.name}: dodano perk ${data.name}${w.length ? ` (uwaga: ${w.join("; ")})` : ""}.`);
  }
  return item;
}

// ---------- awans ----------
/** Punkty umiejętności na poziom: 10 + INT/2 + perki (Egghead) + kucyk ziemski 1 − Touched by the Sun. */
export function skillPointsPerLevel(actor) {
  const sys = actor.system;
  const has = re => actor.items.some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));
  const parts = [["10 + INT/2", 10 + Math.floor(sys.attributes.int.total / 2)]];
  if (sys.fx?.skillPoints) parts.push(["perki", sys.fx.skillPoints]);
  if (/ziemsk|earth/i.test(sys.race ?? "")) parts.push(["Earth Pony Dedication", 1]);
  if (has(/touched by the sun/i)) parts.push(["Touched by the Sun", -1]);
  return { total: Math.max(0, parts.reduce((t, [, v]) => t + v, 0)), parts };
}

const STATUS_MARK = { ok: "✓", unknown: "?", fail: "✗" };

/** Okno awansu: punkty umiejętności, potem perk (wymagania liczone z nowymi rangami). */
export async function levelUp(actor) {
  const sys = actor.system;
  if (sys.level >= MAX_LEVEL) return warn(`${actor.name}: osiągnięto maksymalny poziom ${MAX_LEVEL}.`);
  const newLevel = sys.level + 1;
  const loophole = actor.items.some(i => i.type === "feature" && /eternity.s loophole/i.test(i.name)) && newLevel > 20;
  const pts = loophole ? { total: 0, parts: [["Eternity’s Loophole", 0]] } : skillPointsPerLevel(actor);
  let perks = [];
  try { perks = await loadPerks(); } catch { ui.notifications.warn("Nie udało się wczytać listy perków — awans bez wyboru perka."); }
  const known = Object.entries(SKILLS).filter(([k]) => sys.skills[k]?.known !== false);
  const baseRanks = Object.fromEntries(known.map(([k]) => [k, sys.skills[k].rank]));
  const xpNext = xpFor(newLevel);

  const rows = known.map(([k, s]) => `<tr data-k="${k}"><td class="l">${esc(s.label)}</td><td>${baseRanks[k]}</td>
    <td><input type="number" name="sk-${k}" value="0" min="0" max="${Math.max(0, 100 - baseRanks[k])}" ${baseRanks[k] >= 100 ? "disabled" : ""}></td><td class="nr">${baseRanks[k]}</td></tr>`).join("");
  const perkOpts = perks.filter(e => e.level <= newLevel).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const content = `
    <div class="foe-dialog lvl-up">
      <div class="lvl-head">Poziom <b>${sys.level}</b> → <b>${newLevel}</b>${xpNext !== null ? ` <small>(PD ${sys.xp}/${xpNext})</small>` : ""}</div>
      <div class="lvl-pts">Punkty umiejętności: <b class="left">${pts.total}</b> z ${pts.total} <small>(${pts.parts.map(([l, v]) => `${l}: ${v}`).join(", ")})</small></div>
      <div class="lvl-scroll"><table class="foe-table lvl-skills"><thead><tr><th class="l">Umiejętność</th><th>Ranga</th><th>+</th><th>Nowa</th></tr></thead><tbody>${rows}</tbody></table></div>
      <label class="atk-row">Perk <select name="perk">
        <option value="">— bez perka (np. zaklęcie, receptura albo wybiorę później) —</option>
        ${loophole ? "" : perkOpts.map(e => `<option value="${esc(e.name)}" data-i="${perks.indexOf(e)}">${esc(e.name)} (poz. ${e.level})</option>`).join("")}
      </select></label>
      <div class="lvl-perk"></div>
      <ul class="lvl-notes">
        ${newLevel % 3 === 0 ? "<li>+1 obrażeń na ranę (co 3 poziomy) — liczy się samo.</li>" : ""}
        ${loophole ? "<li>Eternity’s Loophole: po 20. poziomie bez perków i punktów umiejętności.</li>" : ""}
        <li>Niewydane punkty przepadają. Ranga nie przekracza 100.</li>
      </ul>
    </div>`;

  const ranksNow = form => {
    const r = { ...baseRanks };
    for (const [k] of known) r[k] = Math.min(100, baseRanks[k] + Math.max(0, Number(form.elements[`sk-${k}`]?.value) || 0));
    return r;
  };
  const spent = form => known.reduce((t, [k]) => t + Math.max(0, Number(form.elements[`sk-${k}`]?.value) || 0), 0);
  const render = (event, dialog) => {
    const root = dialog?.element ?? event?.target?.element ?? document.querySelector(".lvl-up")?.closest(".application");
    const form = root?.querySelector("form") ?? root;
    if (!form) return;
    const update = () => {
      const left = pts.total - spent(form);
      const leftEl = form.querySelector(".lvl-pts .left");
      leftEl.textContent = left;
      leftEl.classList.toggle("warn", left < 0);
      const ranks = ranksNow(form);
      for (const tr of form.querySelectorAll("tr[data-k]")) tr.querySelector(".nr").textContent = ranks[tr.dataset.k];
      const view = reqView(actor, ranks);
      view.level = newLevel;
      for (const o of form.querySelectorAll("select[name=perk] option[data-i]")) {
        const e = perks[Number(o.dataset.i)];
        const st = perkStatus(actor, e, view, newLevel);
        o.textContent = `${st.status === "taken" ? "■" : STATUS_MARK[st.status]} ${e.name} (poz. ${st.needLevel})${st.max > 1 ? ` [${st.rank}/${st.max}]` : ""}${st.missing.length ? ` — brak: ${st.missing.join(", ")}` : ""}`;
        o.disabled = st.status === "taken";
      }
      const sel = form.elements.perk.selectedOptions[0];
      const box = form.querySelector(".lvl-perk");
      if (sel?.dataset.i) {
        const e = perks[Number(sel.dataset.i)];
        const st = perkStatus(actor, e, view, newLevel);
        const auto = autoSummary(e.name);
        box.innerHTML = `<div><b>Wymagania:</b> ${e.requires ? esc(e.requires) : "brak"}${st.check.length ? ` <span class="warn">(sprawdź: ${esc(st.check.join("; "))})</span>` : ""}</div>
          ${auto ? `<div><b>Automatycznie:</b> ${esc(auto)}</div>` : ""}<div class="desc">${esc(e.desc)}</div>`;
      } else box.innerHTML = "";
      const btn = root.querySelector("[data-action=up]");
      if (btn) btn.disabled = left < 0;
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
  };

  const result = await DialogV2.wait({
    window: { title: `Awans: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog", "foe-levelup"], position: { width: 560 },
    content, render, rejectClose: false,
    buttons: [{ action: "up", label: `Awansuj na poziom ${newLevel}`, icon: "fa-solid fa-arrow-up", default: true,
      callback: (ev, btn) => {
        const f = btn.form;
        const alloc = {};
        for (const [k] of known) { const v = Math.max(0, Math.min(100 - baseRanks[k], Number(f.elements[`sk-${k}`]?.value) || 0)); if (v) alloc[k] = v; }
        return { alloc, perk: f.elements.perk.value, ranks: ranksNow(f), left: pts.total - spent(f) };
      } }]
  });
  if (!result) return null;
  if (result.left < 0) return warn("Rozdano więcej punktów, niż przysługuje — awans anulowany.");

  const update = { "system.level": newLevel };
  for (const [k, v] of Object.entries(result.alloc)) update[`system.skills.${k}.points`] = (sys.skills[k].points || 0) + v;
  await actor.update(update);
  let perkItem = null;
  if (result.perk) {
    const e = perks.find(p => p.name === result.perk);
    if (e) {
      const view = reqView(actor);
      perkItem = await addPerk(actor, e, { level: newLevel, view });
    }
  }
  const log = [...(actor.getFlag(F, "levelLog") ?? []), { level: newLevel, alloc: result.alloc, perkId: perkItem?.id ?? null, perk: perkItem?.name ?? null }];
  await actor.setFlag(F, "levelLog", log);

  const flightNote = sys.flier && Math.floor((result.ranks.flight ?? 0) / 10) > Math.floor((baseRanks.flight ?? 0) / 10) ? "Nowy manewr lotu do wyboru (ranga Flight / 10)." : "";
  const lines = Object.entries(result.alloc).map(([k, v]) => `${SKILLS[k].label.split(" / ").pop()} +${v} → ${actor.system.skills[k].rank}`);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
    <div class="foe-card spell success">
      <div class="fc-tag"><span>PIPBUCK // AWANS</span><span>poziom ${newLevel}</span></div>
      <h3>${esc(actor.name)}</h3>
      <div class="fc-calc">Poziom ${newLevel}</div>
      <div class="fc-meta">${lines.length ? esc(lines.join(" · ")) : "Bez nowych punktów umiejętności."}${result.left > 0 ? ` <span class="warn">(przepadło ${result.left})</span>` : ""}</div>
      <div class="fc-meta">Perk: <b>${perkItem ? esc(perkItem.name) : "—"}</b>${newLevel % 3 === 0 ? " · +1 obrażeń na ranę" : ""}</div>
      ${flightNote ? `<div class="fc-meta">${flightNote}</div>` : ""}
    </div>`
  });
}

/** Cofa ostatni awans zapisany w dzienniku (punkty, perk, poziom). */
export async function undoLevelUp(actor) {
  const log = [...(actor.getFlag(F, "levelLog") ?? [])];
  const last = log.pop();
  if (!last) return warn("Brak zapisanych awansów do cofnięcia.");
  const ok = await DialogV2.confirm({
    window: { title: "Cofnij awans" },
    content: `<p>Cofnąć awans na poziom <b>${last.level}</b>${last.perk ? ` (perk <b>${esc(last.perk)}</b>)` : ""} i zabrać rozdane punkty umiejętności?</p>`
  });
  if (!ok) return null;
  const sys = actor.system;
  const update = { "system.level": Math.max(1, last.level - 1) };
  for (const [k, v] of Object.entries(last.alloc ?? {})) update[`system.skills.${k}.points`] = Math.max(0, (sys.skills[k].points || 0) - v);
  await actor.update(update);
  if (last.perkId && actor.items.get(last.perkId)) await actor.deleteEmbeddedDocuments("Item", [last.perkId]);
  await actor.setFlag(F, "levelLog", log);
  ui.notifications.info(`${actor.name}: cofnięto awans na poziom ${last.level}.`);
  return true;
}

/** Przyznaje PD (z premią Horse Sense) i informuje, gdy postać może awansować. */
export async function awardXp(actor, amount) {
  const pct = actor.system.fx?.xpPct ?? 0;
  const gain = Math.floor(amount * (100 + pct) / 100);
  const xp = Math.max(0, (actor.system.xp || 0) + gain);
  await actor.update({ "system.xp": xp });
  const next = xpFor(actor.system.level + 1);
  const ready = next !== null && xp >= next;
  ui.notifications.info(`${actor.name}: +${gain} PD${pct ? ` (w tym ${pct}% z perków)` : ""} → ${xp}${ready ? " — można awansować!" : "."}`);
  return gain;
}

export async function promptAwardXp(actor) {
  const n = await DialogV2.wait({
    window: { title: `Doświadczenie: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 360 }, rejectClose: false,
    content: `<div class="foe-dialog"><label class="atk-row">Ile PD dodać (ujemne odejmują) <input type="number" name="xp" value="100" step="10" autofocus></label></div>`,
    buttons: [{ action: "ok", label: "Dodaj PD", icon: "fa-solid fa-star", default: true, callback: (ev, btn) => Number(btn.form.elements.xp.value) || 0 }]
  });
  if (!n) return null;
  return awardXp(actor, n);
}

export function registerPerkSettings() {
  game.settings.register(F, "xpProgression", {
    name: "Tempo awansu (PD)",
    hint: "Tabela XII: wolna albo szybka progresja doświadczenia. „Bez PD” — MG daje awanse ręcznie (np. po sesji).",
    scope: "world", config: true, type: String, default: "slow",
    choices: { slow: "Wolna (1000, 3000, 6000…)", fast: "Szybka (200, 550, 1050…)", none: "Bez PD — awans z decyzji MG" },
    onChange: () => { for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render(); }
  });
}
