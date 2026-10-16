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
import { canLevelUp, canAwardXp } from "./permissions.mjs";
import { t, N_, tfields } from "./i18n.mjs";

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
  const tbl = XP_TABLES[prog];
  return tbl && level >= 1 && level <= tbl.length ? tbl[level - 1] : null;
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
export const PERK_FX = tfields({
  "Canterlot Gourmet": { fx: [AROLL("int,end", 5, N_("Resisting addiction"))] },
  "Clever Prancer": { fx: [fx("critSuccess", "attack", 5)], note: "only in light armor, clothing or without armor" },
  "Daddy’s/Momma’s Filly/Colt": { choose: { kind: "skill", n: 2, value: 5, type: "skillRank", label: "Two of the parent's skills (+5 to rank)" } },
  "Gun Nut": { fx: [RANK("smallGuns,repair", 5)] },
  "High Ho Silver, Away!": { fx: [fx("speed", "all", 5)] },
  "Hind Leg Stance": { fx: [ROLL("science,repair", 5, N_("In a hind-leg stance"))] },
  "Horse Sense": { fx: [fx("xpPct", "all", 10)] },
  "Hunter": { fx: [DMG("all", 10, N_("Against animals"))] },
  "Intense Training": { choose: { kind: "attr", n: 1, value: 1, type: "attr", label: "Attribute (+1 permanently, max. 10)" } },
  "Little Leaguer": { fx: [RANK("explosives,melee", 5)] },
  "Lunar Courtier": { fx: [AROLL("per", 10, N_("Visual perception in dim light"))] },
  "Retention": { fx: [AROLL("int", 10, N_("Recalling facts"))] },
  "Sleight of Hoof": { fx: [RANK("sneak,lockpick", 5)], rankFx: { 2: [fx("mfdStep", "sneak", 1, N_("Pickpocketing in plain sight of the victim"))] } },
  "Survivalist": { fx: [RANK("survival", 10)] },
  "Egghead": { fx: [fx("skillPoints", "all", 3)] },
  "Foal at Heart": { fx: [fx("tempAttr", "cha", 2, N_("Toward younger ones"))] },
  "A Little Dash": { fx: [fx("speed", "all", 5)], note: "only in light armor or without armor; also applies to flight and sneaking" },
  "Rhyme Time": { fx: [ROLL("all", 5, N_("Speaking in rhyme (broken rhyme: −3)"))] },
  "Scoundrel": { fx: [RANK("speech,mercantile", 5)], rankFx: { 2: [fx("mfdStep", "sneak", 1, N_("Stealing"))] } },
  "Steel Hooves": { fx: [DMG("unarmed", 5)] },
  "Bloody Mess": { fx: [DMG("all", 3)] },
  "Demolitions Pony": { fx: [DMG("explosives", 5)] },
  "Gunslinger": { fx: [ACC("smallGuns,energy", 10, N_("SATS, mouth-held weapon"))] },
  "The Power of Metal": { fx: [DMG("unarmed", 5)] },
  "The Professional": { fx: [DMG("smallGuns", 5, N_("Sneak attack critical (pistols, SMGs)"))] },
  "Spell Synergy": { fx: [ACC("magic", 10, N_("Aiming a spell in SATS"))] },
  "Tough Hide": { fx: [fx("dt", "all", 3)] },
  "Wonderbolt Wannabe": { fx: [fx("mfdStep", "flight", 1, N_("A maneuver without damage"))] },
  "Commando": { fx: [ACC("all", 10, N_("SATS, weapon not held in the mouth"))] },
  "Cowpony": { fx: [DMG("all", 5, N_("Dynamite, hatchets, knives, revolvers, lever-action weapons"))] },
  "Grunt": { fx: [DMG("all", 5, N_("Standard Equestrian military weapons"))] },
  "Impartial Mediation": { fx: [ROLL("speech", 15, N_("Karma between −25 and +25"))] },
  "Living Anatomy": { fx: [DMG("all", 3, N_("Against equines and ghouls"))] },
  "Rad Resistance": { fx: [fx("radResist", "all", 20)] },
  "Size Matters": { fx: [DMG("all", 5, N_("Weapons weighing 15 lb or more"))] },
  "Sneering Imperialist": { fx: [DMG("all", 5, N_("Against tribals and raiders")), ACC("all", 5, N_("SATS against tribals and raiders"))] },
  "The Stare": { fx: [ROLL("speech", 5, N_("Intimidating with a stare"))] },
  "Strong Back": { fx: [fx("carry", "all", 50)] },
  "Tribal Wisdom": { fx: [AROLL("end", 10, N_("Resisting poison"))] },
  "Dressed for Success": { fx: [fx("tempAttr", "cha", 1, N_("Peaceful conversation, in clothing or light sewn barding"))] },
  "MoA Agent": { fx: [ACC("all", 10, N_("Battle saddle, weapon with a range increment > 50 ft"))] },
  "Stable Shot": { fx: [fx("critSuccess", "attack", 5)] },
  "Toss Targeter": { fx: [ACC("explosives,magic", 5, N_("Throwing (grenades, potions)"))] },
  "Touched by Luna": { fx: [fx("tempAttr", "int,per", 2, N_("At night"))] },
  "Awareness": { fx: [fx("tempAttr", "per", 2, N_("Standing still, with no immediate threat"))] },
  "Ferrier": { fx: [ACC("all", 25, N_("SATS, a shot to the legs"))] },
  "Pyromaniac": { fx: [DMG("all", 5, N_("Weapons with a fire effect"))] },
  "Robotics Expert": { fx: [DMG("all", 5, N_("Against robots and cyborgs"))] },
  "Sniper Pony": { fx: [ACC("all", 10, N_("SATS, a head shot"))] },
  "Violent Vigilante": { fx: [DMG("all", 10, N_("Against gangs and criminals")), ACC("all", 5, N_("SATS against gangs and criminals"))] },
  "Center of Mass": { fx: [DMG("all", 5, N_("A torso shot"))] },
  "Purifier": { fx: [DMG("all", 5, N_("Against taint creatures"))] },
  "Action Colt/Stallion/Filly/Mare": { fx: [fx("sats", "all", 15)] },
  "Clockwork Heart": { fx: [ROLL("speech", 10, N_("Toward artificial intelligences"))] },
  "D. A. R. E. ing Do": { choose: { kind: "attrOf", n: 1, value: 20, type: "attrRoll", when: N_("Resisting addiction"), options: ["end", "int"], label: "Attribute (+20 to resisting addiction)" } },
  "Tag!": { choose: { kind: "skill", n: 1, value: 15, type: "skillRank", label: "A fourth tag skill (+15 to rank)" } },
  "Ghoulfriend": { note: "+1d10 damage against ghouls (add it manually)" },
  "Ninjapony": { fx: [fx("critSuccess", "melee", 15)] },
  "The Power of Celestia": { fx: [fx("tempAttr", "str", 2, N_("In sunlight"))] },
  "Laser Commander": { fx: [DMG("energy", 5), fx("critSuccess", "energy", 10)] },
  "Scent": { fx: [AROLL("per", 5, N_("Smell, no wind (downwind +10)"))] },
  "Karmic Balance": { karma: 0 },
  "Ray of Sunshine": { karma: 500 },
  "Road to Nightmare": { karma: -500 },
  "No Weaknesses": { floor: 5 },
  "Cooler Under Fire": { fx: [fx("satsRegen", "all", 10)] },
  "Cyberpony": { fx: [fx("dt", "all", 3), fx("fireDt", "all", 10), fx("radResist", "all", 10), AROLL("end", 10, N_("Resisting poison"))] },
  "Adamantium Bone Lacing": { fx: [fx("limbMult", "all", 2)] },
  "Bone Strengthening Brew": { fx: [fx("limbMult", "all", 2)] },
  "Implant Enhancement": { note: "an upgrade of one implant — agree with the GM and add the effect in the implant (Traits tab)" },
  "Monster Hunter": { fx: [DMG("all", 10, N_("Against mutants larger than an alicorn")), AROLL("end", 10, N_("Resisting poison"))] },
  "Zebra Augmented": { fx: [fx("dt", "all", 3), fx("fireDt", "all", 10), fx("radResist", "all", 10), AROLL("end", 10, N_("Resisting poison"))] },
  "Almost Perfect": { floor: 9 },
  "Burden to Bear": { fx: [fx("carry", "all", 50)] }
}, ["when", "note", "label"]);

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
  const s = raw.trim().replace(/^either\s+/i, "").replace(/\.$/, "");
  const m = s.match(/^(.*?)\s*(<|>|≥)?\s*(\d+)$/);
  let name = s, op = ">=", n = num;
  if (m) { name = m[1].trim(); op = m[2] === "<" ? "<" : ">="; n = Number(m[3]); }
  const key = name.toLowerCase();
  const perk = key.match(/^(.*?)\s+(perk|trait)$/);
  if (perk) {
    const has = view.features.some(f => f.startsWith(perk[1]));
    return { ok: has, unknown: false, text: `${name}` };
  }
  if (n === null || n === undefined) return { ok: false, unknown: true, text: s };
  if (ATTR_ALIASES[key]) {
    const v = view.attrs[ATTR_ALIASES[key]] ?? 0;
    return { ok: op === "<" ? v < n : v >= n, unknown: false, text: `${ATTR_SHORT[ATTR_ALIASES[key]]} ${op === "<" ? "<" : ""}${n}` };
  }
  if (SKILL_ALIASES[key]) {
    const k = SKILL_ALIASES[key];
    return { ok: (view.ranks[k] ?? 0) >= n, unknown: false, text: `${SKILLS[k].label.split(" / ").pop()} ${n}` };
  }
  return { ok: false, unknown: true, text: s };
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
      failText.push(res.filter(r => !r.ok).map(r => r.text).join(` ${t("conj|and")} `));
    }
    if (any) continue;
    if (unknown) out.check.push(clause);
    else out.missing.push(failText.join(` ${t("conj|or")} `));
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

/** Opis automatycznych efektów w języku gracza (do katalogu i karty). */
const DEFAULT_LABELS = () => ({
  ...ATTR_SHORT, ...Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label.split(" / ").pop()])),
  all: t("fx|all"), attack: t("fx|attacks"), melee: t("fx|melee"), ranged: t("fx|ranged")
});
export function autoSummary(name, labels = DEFAULT_LABELS()) {
  const d = PERK_FX[name];
  if (!d) return "";
  const parts = (d.fx ?? []).map(e => shortFx(e, labels));
  if (d.choose) parts.push(t("choice: {c}", { c: d.choose.label }));
  if (d.karma !== undefined) parts.push(`karma = ${d.karma}`);
  if (d.floor) parts.push(t("attributes below {n} rise to {n}", { n: d.floor }));
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
  const missing = [...(levelOk ? [] : [t("level {n}", { n: needLevel })]), ...req.missing];
  return { status, missing, check: req.check, rank, max: e.ranks || 1, needLevel };
}

/** Wybór gracza dla perków typu Intense Training / Daddy’s Filly / Tag!. */
async function promptChoice(actor, e, c) {
  const sys = actor.system;
  const opts = c.kind === "skill"
    ? Object.entries(SKILLS).filter(([k]) => sys.skills[k]?.known !== false).map(([k, s]) => [k, `${s.label} (${sys.skills[k].rank})`])
    : (c.options ?? Object.keys(ATTRS)).map(k => [k, `${ATTRS[k]} (${sys.attributes[k].base ?? sys.attributes[k].value})`]);
  const selects = Array.from({ length: c.n }, (_, i) => `<label class="atk-row">${c.n > 1 ? t("Choice {n}", { n: i + 1 }) : t("Choice")} <select name="c${i}">${opts.map(([v, l], j) => `<option value="${v}" ${j === i ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`).join("");
  return DialogV2.wait({
    window: { title: t("{name}: choice", { name: e.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog"><p>${esc(c.label)}</p>${selects}</div>`,
    buttons: [{ action: "ok", label: t("Choose"), icon: "fa-solid fa-check", default: true,
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
      description: `${auto ? `<p><b>${t("Automatically:")}</b> ${esc(auto)}</p>` : ""}<p><b>${t("Requirements:")}</b> ${t("level {n}", { n: e.level })}${e.requires ? `; ${esc(e.requires)}` : ""}</p><p>${esc(e.desc)}</p>`
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
  if (st.status === "taken") return warn(t("{name} already has {perk}.", { name: actor.name, perk: `${e.name}${st.max > 1 ? ` (${st.rank}/${st.max})` : ""}` }));
  const rank = st.rank + 1;
  const d = PERK_FX[e.name] ?? {};
  let effects = null;
  if (d.choose) {
    const picked = await promptChoice(actor, e, d.choose);
    if (!picked) return null;
    const c = d.choose;
    if (c.kind === "attr" && picked.some(k => (actor.system.attributes[k].base ?? 0) >= 10)) ui.notifications.warn(t("{name}: this perk doesn't raise an attribute above 10.", { name: e.name }));
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
    const w = [...st.missing, ...st.check.map(c => t("check: {c}", { c }))];
    ui.notifications[st.status === "ok" ? "info" : "warn"](w.length ? t("{name}: perk {perk} added (note: {w}).", { name: actor.name, perk: data.name, w: w.join("; ") }) : t("{name}: perk {perk} added.", { name: actor.name, perk: data.name }));
  }
  return item;
}

// ---------- awans ----------
/** Punkty umiejętności na poziom: 10 + INT/2 + perki (Egghead) + kucyk ziemski 1 − Touched by the Sun. */
export function skillPointsPerLevel(actor) {
  const sys = actor.system;
  const has = re => actor.items.some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));
  const parts = [["10 + INT/2", 10 + Math.floor(sys.attributes.int.total / 2)]];
  if (sys.fx?.skillPoints) parts.push([t("perks"), sys.fx.skillPoints]);
  if (/ziemsk|earth/i.test(sys.race ?? "")) parts.push(["Earth Pony Dedication", 1]);
  if (has(/touched by the sun/i)) parts.push(["Touched by the Sun", -1]);
  return { total: Math.max(0, parts.reduce((sum, [, v]) => sum + v, 0)), parts };
}

const STATUS_MARK = { ok: "✓", unknown: "?", fail: "✗" };

/** Okno awansu: punkty umiejętności, potem perk (wymagania liczone z nowymi rangami). */
export async function levelUp(actor) {
  const can = canLevelUp(actor);
  if (!can.ok) return warn(can.why);
  const sys = actor.system;
  if (sys.level >= MAX_LEVEL) return warn(t("{name}: the maximum level {n} has been reached.", { name: actor.name, n: MAX_LEVEL }));
  const newLevel = sys.level + 1;
  const loophole = actor.items.some(i => i.type === "feature" && /eternity.s loophole/i.test(i.name)) && newLevel > 20;
  const pts = loophole ? { total: 0, parts: [["Eternity’s Loophole", 0]] } : skillPointsPerLevel(actor);
  let perks = [];
  try { perks = await loadPerks(); } catch { ui.notifications.warn(t("Couldn't load the perk list — level-up without choosing a perk.")); }
  const known = Object.entries(SKILLS).filter(([k]) => sys.skills[k]?.known !== false);
  const baseRanks = Object.fromEntries(known.map(([k]) => [k, sys.skills[k].rank]));
  const xpNext = xpFor(newLevel);

  const rows = known.map(([k, s]) => `<tr data-k="${k}"><td class="l">${esc(s.label)}</td><td>${baseRanks[k]}</td>
    <td><input type="number" name="sk-${k}" value="0" min="0" max="${Math.max(0, 100 - baseRanks[k])}" ${baseRanks[k] >= 100 ? "disabled" : ""}></td><td class="nr">${baseRanks[k]}</td></tr>`).join("");
  const perkOpts = perks.filter(e => e.level <= newLevel).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const content = `
    <div class="foe-dialog lvl-up">
      <div class="lvl-head">${t("Level {a} → {b}", { a: `<b>${sys.level}</b>`, b: `<b>${newLevel}</b>` })}${xpNext !== null ? ` <small>(${t("XP {v}/{max}", { v: sys.xp, max: xpNext })})</small>` : ""}</div>
      <div class="lvl-pts">${t("Skill points: {left} of {n}", { left: `<b class="left">${pts.total}</b>`, n: pts.total })} <small>(${pts.parts.map(([l, v]) => `${l}: ${v}`).join(", ")})</small></div>
      <div class="lvl-scroll"><table class="foe-table lvl-skills"><thead><tr><th class="l">${t("Skill")}</th><th>${t("Rank")}</th><th>+</th><th>${t("New")}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <label class="atk-row">Perk <select name="perk">
        <option value="">${t("— no perk (e.g. a spell, a recipe, or I'll choose later) —")}</option>
        ${loophole ? "" : perkOpts.map(e => `<option value="${esc(e.name)}" data-i="${perks.indexOf(e)}">${esc(e.name)} ${t("(lvl {n})", { n: e.level })}</option>`).join("")}
      </select></label>
      <div class="lvl-perk"></div>
      <ul class="lvl-notes">
        ${newLevel % 3 === 0 ? `<li>${t("+1 damage per wound (every 3 levels) — counted automatically.")}</li>` : ""}
        ${loophole ? `<li>${t("Eternity’s Loophole: after level 20 no perks and no skill points.")}</li>` : ""}
        <li>${t("Unspent points are lost. A rank doesn't exceed 100.")}</li>
      </ul>
    </div>`;

  const ranksNow = form => {
    const r = { ...baseRanks };
    for (const [k] of known) r[k] = Math.min(100, baseRanks[k] + Math.max(0, Number(form.elements[`sk-${k}`]?.value) || 0));
    return r;
  };
  const spent = form => known.reduce((sum, [k]) => sum + Math.max(0, Number(form.elements[`sk-${k}`]?.value) || 0), 0);
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
        o.textContent = `${st.status === "taken" ? "■" : STATUS_MARK[st.status]} ${e.name} ${t("(lvl {n})", { n: st.needLevel })}${st.max > 1 ? ` [${st.rank}/${st.max}]` : ""}${st.missing.length ? ` — ${t("missing: {list}", { list: st.missing.join(", ") })}` : ""}`;
        o.disabled = st.status === "taken";
      }
      const sel = form.elements.perk.selectedOptions[0];
      const box = form.querySelector(".lvl-perk");
      if (sel?.dataset.i) {
        const e = perks[Number(sel.dataset.i)];
        const st = perkStatus(actor, e, view, newLevel);
        const auto = autoSummary(e.name);
        box.innerHTML = `<div><b>${t("Requirements:")}</b> ${e.requires ? esc(e.requires) : t("none")}${st.check.length ? ` <span class="warn">(${t("check: {c}", { c: esc(st.check.join("; ")) })})</span>` : ""}</div>
          ${auto ? `<div><b>${t("Automatically:")}</b> ${esc(auto)}</div>` : ""}<div class="desc">${esc(e.desc)}</div>`;
      } else box.innerHTML = "";
      const btn = root.querySelector("[data-action=up]");
      if (btn) btn.disabled = left < 0;
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
  };

  const result = await DialogV2.wait({
    window: { title: t("Level up: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog", "foe-levelup"], position: { width: 560 },
    content, render, rejectClose: false,
    buttons: [{ action: "up", label: t("Level up to {n}", { n: newLevel }), icon: "fa-solid fa-arrow-up", default: true,
      callback: (ev, btn) => {
        const f = btn.form;
        const alloc = {};
        for (const [k] of known) { const v = Math.max(0, Math.min(100 - baseRanks[k], Number(f.elements[`sk-${k}`]?.value) || 0)); if (v) alloc[k] = v; }
        return { alloc, perk: f.elements.perk.value, ranks: ranksNow(f), left: pts.total - spent(f) };
      } }]
  });
  if (!result) return null;
  if (result.left < 0) return warn(t("More points were assigned than available — level-up cancelled."));

  const update = { "system.level": newLevel };
  for (const [k, v] of Object.entries(result.alloc)) update[`system.skills.${k}.points`] = (sys.skills[k].points || 0) + v;
  await actor.update(update, { foeAdvance: true });
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

  const flightNote = sys.flier && Math.floor((result.ranks.flight ?? 0) / 10) > Math.floor((baseRanks.flight ?? 0) / 10) ? t("A new flight maneuver to choose (Flight rank / 10).") : "";
  const lines = Object.entries(result.alloc).map(([k, v]) => `${SKILLS[k].label.split(" / ").pop()} +${v} → ${actor.system.skills[k].rank}`);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
    <div class="foe-card spell success">
      <div class="fc-tag"><span>PIPBUCK // ${t("LEVEL UP")}</span><span>${t("level {n}", { n: newLevel })}</span></div>
      <h3>${esc(actor.name)}</h3>
      <div class="fc-calc">${t("Level {n}", { n: newLevel })}</div>
      <div class="fc-meta">${lines.length ? esc(lines.join(" · ")) : t("No new skill points.")}${result.left > 0 ? ` <span class="warn">${t("({n} lost)", { n: result.left })}</span>` : ""}</div>
      <div class="fc-meta">Perk: <b>${perkItem ? esc(perkItem.name) : "—"}</b>${newLevel % 3 === 0 ? ` · ${t("+1 damage per wound")}` : ""}</div>
      ${flightNote ? `<div class="fc-meta">${flightNote}</div>` : ""}
    </div>`
  });
}

/** Cofa ostatni awans zapisany w dzienniku (punkty, perk, poziom). */
export async function undoLevelUp(actor) {
  if (!canAwardXp()) return warn(t("Only the GM can undo a level-up."));
  const log = [...(actor.getFlag(F, "levelLog") ?? [])];
  const last = log.pop();
  if (!last) return warn(t("No recorded level-ups to undo."));
  const ok = await DialogV2.confirm({
    window: { title: t("Undo level-up") },
    content: `<p>${last.perk ? t("Undo the level-up to level {n} (perk {perk}) and take back the assigned skill points?", { n: `<b>${last.level}</b>`, perk: `<b>${esc(last.perk)}</b>` }) : t("Undo the level-up to level {n} and take back the assigned skill points?", { n: `<b>${last.level}</b>` })}</p>`
  });
  if (!ok) return null;
  const sys = actor.system;
  const update = { "system.level": Math.max(1, last.level - 1) };
  for (const [k, v] of Object.entries(last.alloc ?? {})) update[`system.skills.${k}.points`] = Math.max(0, (sys.skills[k].points || 0) - v);
  await actor.update(update, { foeAdvance: true });
  if (last.perkId && actor.items.get(last.perkId)) await actor.deleteEmbeddedDocuments("Item", [last.perkId]);
  await actor.setFlag(F, "levelLog", log);
  ui.notifications.info(t("{name}: level-up to level {n} undone.", { name: actor.name, n: last.level }));
  return true;
}

/** Przyznaje PD (z premią Horse Sense) i informuje, gdy postać może awansować. */
export async function awardXp(actor, amount) {
  if (!canAwardXp()) return warn(t("The GM awards XP."));
  const pct = actor.system.fx?.xpPct ?? 0;
  const gain = Math.floor(amount * (100 + pct) / 100);
  const xp = Math.max(0, (actor.system.xp || 0) + gain);
  await actor.update({ "system.xp": xp }, { foeAdvance: true });
  const next = xpFor(actor.system.level + 1);
  const ready = next !== null && xp >= next;
  ui.notifications.info(`${t("{name}: +{n} XP", { name: actor.name, n: gain })}${pct ? ` ${t("(including {p}% from perks)", { p: pct })}` : ""} → ${xp}${ready ? ` — ${t("ready to level up!")}` : "."}`);
  return gain;
}

export async function promptAwardXp(actor) {
  if (!canAwardXp()) return warn(t("The GM awards XP."));
  const n = await DialogV2.wait({
    window: { title: t("Experience: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 360 }, rejectClose: false,
    content: `<div class="foe-dialog"><label class="atk-row">${t("How much XP to add (negative subtracts)")} <input type="number" name="xp" value="100" step="10" autofocus></label></div>`,
    buttons: [{ action: "ok", label: t("Add XP"), icon: "fa-solid fa-star", default: true, callback: (ev, btn) => Number(btn.form.elements.xp.value) || 0 }]
  });
  if (!n) return null;
  return awardXp(actor, n);
}

export function registerPerkSettings() {
  game.settings.register(F, "xpProgression", {
    name: "Advancement pace (XP)",
    hint: "Table XII: slow or fast experience progression. “No XP” — the GM grants level-ups manually (e.g. after a session).",
    scope: "world", config: true, type: String, default: "slow",
    choices: { slow: "Slow (1000, 3000, 6000…)", fast: "Fast (200, 550, 1050…)", none: "No XP — level-ups by GM decision" },
    onChange: () => { for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render(); }
  });
}
