/**
 * Skażenie (Taint) — tabela XXXVI (s. 485–487) i „They Were Ponies, Once” (s. 610–612). Bez Foundry — testowalne w Node.
 *
 * Suwak: pozycje 0–8 — romby (0, 2, 4, 6, 8) i kreski (1, 3, 5, 7). Dawka przesuwa suwak o n kresek:
 *   drobna ekspozycja 1, kleks z sufitu 2–4, upadek w kałużę 6+. Przeskoczony etap = automatyczna porażka jego rzutu;
 *   rzuca się tylko na pozycji, na której suwak się zatrzymał.
 * Rzuty Szczęścia:
 *   2 (etap 1)  Luck ¼     — porażka: początek negatywnych zmian,
 *   4 (etap 2)  Luck 1/10  — tylko kto nie oblał; sukces: widoczne pozytywne zmiany,
 *   6 (etap 3)  Luck „krytyk” (liczy się tylko krytyczny sukces) — kto zdał oba; inaczej mutacje. 3 sukcesy — bez rzutu,
 *   7 (4. kreska) dokładnie 2 sukcesy: Luck 1/10 (porażka −1 sukces, krytyczna porażka — 0; krytyczny sukces — odporność
 *               na choroby); 3+ sukcesy: odporność i zaczątki cech alikorna; mniej niż 2: END ¼ (porażka — śmierć)
 *               i INT ¼ (utrzymanie rozumu) — abominacja (decyzja MG),
 *   8 (etap 4)  3+ sukcesy — przemiana w alikorna (albo piekielnego psa); mniej — Luck ¼ (decyzja MG): krytyczny sukces
 *               alikorn, sukces centaur / inne skażone stworzenie, porażka — powolna śmierć.
 * Liczenie: krytyczny sukces = 2 sukcesy (poza pozycjami 6 i 7 — tam 1), krytyczna porażka zeruje sukcesy.
 * Trzy sukcesy (albo trzy udane rzuty z rzędu) — droga alikorna: zamiast negatywnych skutków etapy alikorna 1–5
 * (s. 612), jeden etap na każdą kolejną dawkę; dojście do 5. rombu — od razu etap 5.
 * Oczyszczenie (Tenpony Tower): suwak na zero; sukcesy i zmiany w ciele zostają.
 */
import { N_ } from "./i18n.mjs";

export const TAINT_MAX = 8;
export const isDiamond = pos => pos % 2 === 0;

/** Opis pozycji suwaka (tabela XXXVI). */
export const TAINT_MARKS = Object.freeze([
  { pos: 0, label: N_("1st diamond"), desc: N_("No taint exposure.") },
  { pos: 1, label: N_("1st tick"), desc: N_("Low exposure: itching around the exposed areas.") },
  { pos: 2, label: N_("2nd diamond"), desc: N_("Stage 1: minor transformations (Luck ¼; failure — the first, hidden negative effects).") },
  { pos: 3, label: N_("2nd tick"), desc: N_("Significant exposure: the itching grows, discoloured varicose veins.") },
  { pos: 4, label: N_("3rd diamond"), desc: N_("Stage 2: visible transformations (Luck 1/10 for those who passed; success — positive changes).") },
  { pos: 5, label: N_("3rd tick"), desc: N_("Noticeable exposure: negative effects grow — growths under the skin, less appetite.") },
  { pos: 6, label: N_("4th diamond"), desc: N_("Stage 3: extreme transformations (Luck — critical success only — or mutations).") },
  { pos: 7, label: N_("4th tick"), desc: N_("Deadly exposure: Luck 1/10 with two successes; fewer — END ¼ or death, an abomination.") },
  { pos: 8, label: N_("5th diamond"), desc: N_("Stage 4: alicorn (3 successes) — or Luck ¼: a centaur or a slow death.") }
]);

/** Dawki z podręcznika (do okna MG). */
export const TAINT_DOSES = Object.freeze([
  { n: 1, label: N_("Minor exposure (a week of river water, tainted fish, a few drops on the skin)") },
  { n: 2, label: N_("A small globule from the ceiling") },
  { n: 3, label: N_("A globule from the ceiling") },
  { n: 4, label: N_("A large globule from the ceiling") },
  { n: 6, label: N_("Falling into a puddle of taint") }
]);

/** Etapy przemiany w alikorna / piekielnego psa (s. 612) z proponowanymi perkami misji. */
export const ALICORN_STAGES = Object.freeze([
  null,
  { stage: 1, alicorn: N_("Enhanced magical stamina: +1d4 strain."), hellhound: N_("Enhanced physical stamina: +1 END or STR."),
    perk: N_("Touched by Taint (1)"), perkDesc: N_("With advanced radiation poisoning (400+ rads) crippled limbs regenerate 1 wound per location per hour.") },
  { stage: 2, alicorn: N_("Less appetite: over 100 rads a day replaces food; crippled or maimed limbs regrow with radiation poisoning (200+ rads)."),
    perk: N_("Touched by Taint (2)"), perkDesc: N_("No attribute penalties from radiation; heals 1 wound per 30 minutes in radiation. Radiation still builds up and kills at 1000 rads.") },
  { stage: 3, alicorn: N_("Radiation is no longer harmful — it heals (as alicorns). A much longer natural lifespan."),
    perk: N_("Touched by Taint (3)"), perkDesc: N_("+2 STR, END and AGI and +5 ft of movement per action while basking in radiation; SATS regenerates 5 points faster per round per 100 rads absorbed; radiation can no longer kill.") },
  { stage: 4, alicorn: N_("Visible changes: size (D/W) +1. Alicorns: telepathic glands, the horn grows, wing muscles develop."), hellhound: N_("Visible changes: size (D/W) +1, yellowing skin, more muscle, longer teeth and claws."),
    perk: N_("You Got a Friend in Me!"), perkDesc: N_("A telepathic link with the Goddess in Unity: new dialogue options — and she can manipulate your thoughts and actions.") },
  { stage: 5, alicorn: N_("Full transformation into an alicorn: the Large and Channeler traits, more strain; Magic at least rank 50, Flight at least 25. Ponies without wings or horn gain them."),
    hellhound: N_("Full transformation into a hellhound: the Large trait, enlarged, terrifyingly sharp claws; a painful transformation."),
    perk: "", perkDesc: "" }
]);

/** Podpowiedzi mutacji dla MG (podręcznik: mutacje ze skażenia są losowe — „wymyśl je”; s. 485, 610–611). */
export const MUTATION_IDEAS = Object.freeze({
  radiation: [
    N_("Skeletonized wings: more durable but hideous and worse at flying (Flight penalty)."),
    N_("Eyes glowing faintly after more than 200 rads, like a glowing one."),
    N_("A ghoul's voice: a bonus when talking to non-feral ghouls."),
    N_("Digests meat without trouble, but feels a subtle urge to eat its own kind."),
    N_("Patches of skin peeling like a ghoul's."),
    N_("A raspy breath and a ghoulish stench (a CHA penalty unless hidden).")
  ],
  taint: [
    N_("Cancerous growths under the skin."),
    N_("Glowing pustules on the body."),
    N_("Chitinous spines along the back."),
    N_("Eye-tentacles."),
    N_("Part kangaroo: oversized hind legs and a tail."),
    N_("A slowly rearranging anatomy."),
    N_("Rainbow-shimmering patches of coat."),
    N_("Warped gender.")
  ]
});

export const freshTaint = () => ({ pos: 0, wins: 0, streak: 0, bad: false, alicorn: 0, immune: false, cleansed: 0 });
export const taintOf = raw => ({ ...freshTaint(), ...(raw && typeof raw === "object" ? raw : {}) });

/** Czego wymaga pozycja: { roll: { attr, step, crit? } } | { deadly: "abom" | "final" } | {} (bez rzutu). */
export function need(st, pos) {
  if (st.alicorn > 0) return {};
  switch (pos) {
    case 2: return { roll: { attr: "luck", step: "1/4" } };
    case 4: return st.bad ? {} : { roll: { attr: "luck", step: "1/10" } };
    case 6: return st.wins >= 3 || st.bad || st.wins < 2 ? {} : { roll: { attr: "luck", step: "1", crit: true } };
    case 7: return st.wins === 2 ? { roll: { attr: "luck", step: "1/10" } } : st.wins >= 3 ? {} : { deadly: "abom" };
    case 8: return { deadly: "final" };
  }
  return {};
}

const ok = r => r === "success" || r === "crit-success";

/**
 * Skutek jednej pozycji. res — wynik rzutu ("crit-success" | "success" | "fail" | "crit-fail"), "skip" (przeskoczona —
 * automatyczna porażka) albo null (bez rzutu). Zwraca { st, out: [kody] }.
 * Kody: itch, calm, neg, negGrow, pos, mutation, immune, vestigial, abom / abomAuto (END/INT — decyzja MG; abomAuto: etap
 * przeskoczony, END oblany automatycznie), final (Luck ¼ na 5. rombie — decyzja MG).
 */
export function step(prev, pos, res) {
  const st = { ...prev, pos };
  const out = [];
  if (st.alicorn > 0) return { st, out };
  const req = need(prev, pos);
  const skipped = res === "skip";
  if (skipped) res = req.roll ? "fail" : null;
  // rzut „krytyk” (pozycja 6): liczy się tylko krytyczny sukces
  if (req.roll?.crit && res === "success") res = "fail";
  const single = pos === 6 || pos === 7;
  if (req.roll && res) {
    if (res === "crit-success") { st.wins += single ? 1 : 2; st.streak += 1; }
    else if (res === "success") { st.wins += 1; st.streak += 1; }
    else if (res === "crit-fail") { st.wins = 0; st.streak = 0; if (pos !== 7) st.bad = true; }
    else { st.streak = 0; if (pos === 7) st.wins = Math.max(0, st.wins - 1); else st.bad = true; }
  }
  switch (pos) {
    case 1: out.push("itch"); break;
    case 2: out.push(ok(res) ? "calm" : "neg"); break;
    case 3: break;
    case 4: if (req.roll && ok(res)) out.push("pos"); else if (st.bad) out.push("negGrow"); break;
    case 5: if (st.bad) out.push("negGrow"); break;
    case 6: if (prev.wins >= 3) break; if (!(req.roll && ok(res))) out.push("mutation"); break;
    case 7:
      if (req.roll) { if (res === "crit-success") { st.immune = true; out.push("immune"); } }
      else if (prev.wins >= 3) { st.immune = true; out.push("immune", "vestigial"); }
      else out.push(skipped ? "abomAuto" : "abom");
      break;
    case 8: if (prev.wins < 3) out.push("final"); break;
  }
  return { st, out };
}

/**
 * Plan dawki: przesunięcie z pozycji st.pos o n. Zwraca listę pozycji do przejścia: [{ pos, skip }] (skip — przeskoczona).
 * Na drodze alikorna i u ras odpornych — tylko przesunięcie (bez rzutów).
 */
export function dosePlan(st, n) {
  const from = Math.max(0, Math.min(TAINT_MAX, Number(st.pos) || 0));
  const to = Math.max(from, Math.min(TAINT_MAX, from + Math.max(0, Math.round(Number(n) || 0))));
  const list = [];
  for (let p = from + 1; p <= to; p++) list.push({ pos: p, skip: p !== to });
  return { from, to, list };
}

/** Po dawce: czy zaczyna się droga alikorna albo postępuje (jeden etap na dawkę; 5. romb — etap 5). */
export function alicornAfter(before, st) {
  const out = { ...st };
  let changed = false;
  if (before.alicorn > 0) {
    out.alicorn = st.pos >= TAINT_MAX ? 5 : Math.min(5, before.alicorn + 1);
    changed = out.alicorn !== before.alicorn;
  } else if (st.wins >= 3 || st.streak >= 3) {
    out.alicorn = st.pos >= TAINT_MAX ? 5 : 1;
    changed = true;
  }
  return { st: out, changed };
}

/** Oczyszczenie (Tenpony Tower): suwak na zero, reszta zostaje. */
export const cleanse = st => ({ ...taintOf(st), pos: 0, acc: 0, cleansed: (Number(st?.cleansed) || 0) + 1 });

/** Rasa odporna na skażenie (alikorny, piekielne psy) — karta rasy w kreatorze. */
export const taintImmuneRace = race => /alicorn|alikorn|hellhound|piekieln/i.test(String(race ?? ""));
/** Pies (piekielny pies zamiast alikorna). */
export const isDogRace = race => /\bdog\b|diamond dog|sand dog|\bpies\b|psy\b|psów/i.test(String(race ?? ""));

// ---------- skażone jedzenie i woda (s. 485) ----------
/**
 * Skażenie na porcję (ułamek kreski). Podręcznik: jedna kreska to „picie wody z rzeki w Hoofington przez tydzień–dwa”
 * albo „kilka razy widocznie skażona ryba lub wodorosty”. Ułamki się sumują (st.acc); pełne kreski to zwykła dawka.
 */
export const TAINT_FOOD = Object.freeze([
  { v: 0, label: N_("none") },
  { v: 0.025, label: N_("tainted river water (≈ 40 portions — 10 days of drinking — per tick)") },
  { v: 0.05, label: N_("heavily tainted water (≈ 20 portions — 5 days of drinking — per tick)") },
  { v: 0.34, label: N_("visibly tainted fish or seaweed (a few portions ≈ 1 tick)") },
  { v: 0.5, label: N_("½ tick per portion (e.g. Hellhound Stew)") },
  { v: 1, label: N_("raw biomagical flux (1 tick per portion)") }
]);
/** Skażenie wody w osadzie (kreski na tydzień picia). */
export const TAINT_WATER = Object.freeze([
  { v: 0, label: N_("clean") },
  { v: 0.5, label: N_("slightly tainted (½ tick a week)") },
  { v: 1, label: N_("tainted, like the river in Hoofington (1 tick a week)") },
  { v: 2, label: N_("heavily tainted (2 ticks a week)") }
]);
const FRAC = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
/** Skażenie z opisu z katalogu: „Contains ½ taint level per serving”, „+½ Taint level per dose”. */
export function taintFromText(text) {
  const m = String(text ?? "").match(/([0-9]+(?:[.,][0-9]+)?|½|¼|¾)\s*taint level/i);
  if (!m) return 0;
  return FRAC[m[1]] ?? (Number(m[1].replace(",", ".")) || 0);
}
/** Skażenie na porcję: pole przedmiotu (flaga foe-rpg.taint), a bez niego — z opisu. */
export function itemTaint(item) {
  const f = item?.flags?.["foe-rpg"]?.taint;
  if (f !== undefined && f !== null && f !== "") return Math.max(0, Number(f) || 0);
  return taintFromText(item?.system?.description);
}
const r3 = x => Math.round(x * 1000) / 1000;
/** Dodaj x kresek do zebranego ułamka: { st (z nowym acc), n (pełne kreski do dawki) }. */
export function accumulate(st, x) {
  const sum = r3((Number(st?.acc) || 0) + Math.max(0, Number(x) || 0));
  const n = Math.floor(sum + 1e-9);
  return { st: { ...taintOf(st), acc: r3(sum - n) }, n };
}
/** Woda w osadzie: kreski za dany czas (sekundy). */
export const waterTaint = (perWeek, seconds) => Math.max(0, Number(perWeek) || 0) * Math.max(0, seconds) / (7 * 86400);
