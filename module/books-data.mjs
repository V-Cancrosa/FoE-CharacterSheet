/**
 * Książki i magazyny (podręcznik s. 208–210) — czyste zasady.
 *   - książka (b): punkt umiejętności za każde przeczytanie, nowa do 1+1d4 razy; każdy kolejny właściciel o 1 raz mniej
 *     (1d4, 1d4−1…); używana jest warta połowę; wymaga rangi 25 w umiejętności; przeczytanie jednego wydania wyklucza
 *     kolejne egzemplarze tego samego tytułu,
 *   - magazyn (m): raz, bez wymagań (numery „zależne od wydania” liczą się osobno),
 *   - punkty: 1 + Bookworm (+1) + Studious (+1); Illiterate nie czyta,
 *   - korzyści spoza umiejętności (Egghead's Guide to Running, Daring Do and the Quest for the Sapphire Stone…)
 *     dopiero po skończeniu książki.
 */
import { SKILLS } from "./data.mjs";

const SKILL_WORDS = [
  ["energy weapons", "energy"], ["big guns", "bigGuns"], ["battle saddles", "bigGuns"], ["small guns", "smallGuns"], ["firearms", "smallGuns"],
  ["melee", "melee"], ["unarmed", "unarmed"], ["explosives", "explosives"], ["lockpicking", "lockpick"], ["survival", "survival"],
  ["mercantile", "mercantile"], ["speechcraft", "speech"], ["magic", "magic"], ["medicine", "medicine"], ["repair", "repair"],
  ["science", "science"], ["flight", "flight"], ["sneak", "sneak"], ["dig", "dig"]
];

export const isMagazine = name => /\(m\)\s*$/i.test(String(name ?? "").trim()) || /\(m\)/i.test(String(name ?? ""));

/** Opis z tabeli → { skills, any, varies, restrict, special, note }. */
export function parseBook(name, text) {
  const t = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/^.*?Umiejętność:\s*/i, "").toLowerCase();
  const n = String(name ?? "").toLowerCase();
  const out = { skills: [], any: /any skill/.test(t), varies: /varies by issue/.test(t), restrict: null, special: null, note: "" };
  for (const [w, k] of SKILL_WORDS) if (t.includes(w) && !out.skills.includes(k)) out.skills.push(k);
  if (/unicorn\/alicorn only/.test(t)) out.restrict = "unicorn";
  else if (/zebra only/.test(t)) out.restrict = "zebra";
  if (/egghead.s guide to running/.test(n)) { out.special = "running"; out.skills = []; out.note = "+5 ft ruchu (raz) po skończeniu"; }
  if (/sapphire stone/.test(n)) { out.special = "daring"; out.note = "+5 do rzutów AGI (raz) po skończeniu"; }
  if (/twilight sparkle.s notebook/.test(n)) { out.special = "notebook"; out.note = "na stałe o połowę krótsze wypalenie; może nauczyć zaklęć"; }
  if (/spellbook|grimoire|recipe scroll/.test(n) || /may teach/.test(t)) out.note ||= "może nauczyć zaklęć albo receptur (MG: dodaj z katalogu)";
  if (/black book/.test(n)) { out.special = "black"; out.note = "Czarna Księga — wpływ na psychikę czytelnika (MG)"; }
  if (out.any) out.skills = Object.keys(SKILLS);
  return out;
}

const feature = (actor, re) => (actor?.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));
export const isIlliterate = actor => feature(actor, /illiterate/i);

/** Punkty za jedno przeczytanie: 1 + Bookworm + Studious. */
export function readPoints(actor) {
  const parts = [["książka/magazyn", 1]];
  if (feature(actor, /bookworm/i)) parts.push(["Bookworm", 1]);
  if (feature(actor, /studious/i)) parts.push(["Studious", 1]);
  return { total: parts.reduce((t, p) => t + p[1], 0), parts };
}

/** Klucz tytułu w dzienniku czytelnika (magazyny z numerem „zależnym od wydania” osobno). */
export const titleKey = (name, issue = "") => `${String(name ?? "").trim()}${issue ? ` #${issue}` : ""}`;

/**
 * Stan lektury dla postaci: { magazine, entry (z dziennika), left, done, canRead, why[] }.
 * log — flaga postaci foe-rpg.booksRead { [tytuł]: { left, total, reads } }.
 */
export function readState(actor, item, { issue = "", skill = "" } = {}) {
  const info = parseBook(item.name, item.system?.description);
  const magazine = isMagazine(item.name);
  const log = actor?.flags?.["foe-rpg"]?.booksRead ?? {};
  const key = titleKey(item.name, magazine && info.varies ? issue : "");
  const entry = log[key] ?? null;
  const why = [];
  if (isIlliterate(actor)) why.push("postać nie umie czytać (Illiterate)");
  if (info.restrict === "unicorn" && !actor?.system?.caster) why.push("tylko dla jednorożców i alikornów");
  if (info.restrict === "zebra" && !actor?.system?.zebraMage) why.push("tylko dla zebr znających magię");
  const done = magazine ? !!entry : entry ? entry.left <= 0 : false;
  if (done) why.push(magazine ? "ten numer już przeczytany" : "to wydanie jest już przeczytane do końca");
  if (!magazine && skill && info.skills.includes(skill)) {
    const sk = actor?.system?.skills?.[skill];
    if (sk && sk.known === false) why.push("postać nie ma tej umiejętności");
    else if (sk && (sk.rank ?? 0) < 25) why.push(`książka wymaga rangi 25 (${SKILLS[skill]?.label.split(" / ").pop()}: ${sk.rank})`);
  }
  return { info, magazine, key, entry, left: magazine ? (entry ? 0 : 1) : entry?.left ?? null, done, canRead: !why.length, why };
}

/** Ile razy książka da punkty nowemu czytelnikowi: 1+1d4 minus liczba poprzednich właścicieli (min. 0). */
export const bookUses = (rollD4, previousReaders) => Math.max(0, 1 + rollD4 - previousReaders);
