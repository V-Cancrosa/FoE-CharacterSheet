/**
 * Jedzenie, picie i promieniowanie w czasie — część bez Foundry (testowalna w Node).
 *
 * Jedzenie (kategoria „Jedzenie i picie” w katalogu) — z opisu produktu (po angielsku albo częściowo po polsku):
 *   - posiłki: domyślnie 1, „counts as two meals” 2…, „does not count as a meal / provides no sustenance” 0;
 *     napoje (bez „Diet:”) 0, chyba że opis mówi inaczej (Milkshake, Weed Water),
 *   - nawodnienie: napoje i „provides hydration”, chyba że „dehydrating” (wtedy dzień wymaga dodatkowego picia),
 *   - rady: „Rads: +5” / „Rady: +5”, „+10 Rads”, „Removes 10 rads”,
 *   - rany: bazowo 1 (podręcznik: „Sweet Roll… still recovers one wound”), „double/triple/quadruple wounds” 2/3/4,
 *     „Recovers 2 wounds”, „does not heal / recovers no wounds” 0,
 *   - dieta: „Diet: Herbivore / Carnivore / Omnivore / Any” — zjedzone wbrew diecie rasy nie syci i nie leczy.
 * Głód (s. 477, tabela XXXII): każdy dzień bez pełnego posiłku — −1 do losowego atrybutu (bez Szczęścia), ten sam
 * nie dwa dni z rzędu; po 3 tygodniach śmierć. Pragnienie — zasada domowa: tak samo, ale śmierć po 3 dniach.
 */
export const DAY = 86400;
export const STARVE_ATTRS = ["str", "per", "end", "cha", "int", "agi"];
export const STARVE_DEATH = 21;
export const THIRST_DEATH = 3;
/** Najwięcej dni rozliczanych naraz (przeskok czasu). */
export const MAX_DAYS = 60;

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, double: 2, triple: 3, quadruple: 4 };
const n = w => (WORDS[String(w).toLowerCase()] ?? Number(w));
const text = s => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Co daje produkt: { drink, diet, meals, mealDiets, hydrate, dehydrating, rads, wounds, effects }. */
export function foodInfo(description) {
  const s = text(description);
  const dietM = s.match(/\bdiet(?:a)?:\s*(herbivore|carnivore|omnivore|any)/i);
  const drink = !dietM;
  const diet = dietM ? dietM[1].toLowerCase() : "any";

  let meals = drink ? 0 : 1;
  let mealDiets = null;
  const counts = s.match(/counts as (a|an|one|two|three|four|five|\d+) meals?(?: for an? (herbivore|carnivore|omnivore)(?: or (?:an? )?(herbivore|carnivore|omnivore))?)?/i);
  if (counts) {
    meals = n(counts[1]);
    if (counts[2]) mealDiets = [counts[2], counts[3]].filter(Boolean).map(x => x.toLowerCase());
  }
  if (/does not count as a meal|(?:provides|gives) no sustenance|does not provide sustenance/i.test(s)) meals = 0;

  const dehydrating = /dehydrating/i.test(s);
  const hydrate = !dehydrating && (drink || /(?<!de)hydrat(?:ion|ing)/i.test(s));

  let rads = 0;
  for (const m of s.matchAll(/\brad(?:s|y)?:\s*([+\-−]?\s*\d+)/gi)) rads += Number(m[1].replace(/[−\s]/g, x => (x === "−" ? "-" : "")));
  for (const m of s.matchAll(/([+\-−]\d+)\s*rads?\b/gi)) rads += Number(m[1].replace("−", "-"));
  for (const m of s.matchAll(/removes (\d+) rads/gi)) rads -= Number(m[1]);

  let wounds = 1;
  if (/does not heal|recovers no wounds|does not recover wounds|recovers no\b/i.test(s)) wounds = 0;
  const mult = s.match(/(?:recovers|restores) (double|triple|quadruple) wounds/i);
  if (mult) wounds = n(mult[1]);
  const exact = s.match(/(?:recovers|restores) (\d+|one|two|three) wounds?/i);
  if (exact) wounds = n(exact[1]);

  // krótkie efekty („-1 STR for 2 min”, „+5 Max AP for 30 seconds”) — do karty na czacie
  const effects = [...s.matchAll(/([+\-−]\d+[^.;]*?\bfor \d+(?:d\d+)? (?:sec(?:ond)?s?|min(?:ute)?s?|hours?)\b)/gi)].map(m => m[1].trim());
  return { drink, diet, meals, mealDiets, hydrate, dehydrating, rads, wounds, effects };
}

/**
 * Dieta postaci z rasy (tekst z karty, po angielsku albo po polsku) i cech: „herbivore” | „omnivore” | „carnivore”.
 * Kucyki, zebry, bawoły, osły — roślinożerne; gryfy, psy, minotaury — wszystkożerne. Cecha Omnivore — wszystkożerny,
 * Picky — bez diety wszystkożernej.
 */
export function dietOf(race = "", traits = []) {
  const r = String(race).toLowerCase();
  const names = traits.map(x => String(x).toLowerCase());
  let diet = /griff|gryf|dog|pies|psy|hound|minotaur|ogar/.test(r) ? "omnivore" : "herbivore";
  if (names.some(x => /^omnivore\b|^wszystkożern/.test(x))) diet = "omnivore";
  if (names.some(x => /^picky\b|^wybredn/.test(x)) && diet === "omnivore") diet = "herbivore";
  return diet;
}

/** Czy postać o diecie `diet` (i z cechą Cannibal) się tym naje. */
export function fitsDiet(info, diet, cannibal = false) {
  if (info.mealDiets) return info.mealDiets.includes(diet);
  const food = info.diet;
  if (food === "any" || diet === "omnivore") return true;
  if (cannibal && (food === "carnivore" || food === "omnivore")) return true;
  if (food === "herbivore") return diet === "herbivore";
  return diet === "carnivore";   // carnivore i omnivore — mięso
}

/** Rady z jedzenia po odporności (Iron Stomach — połowa). Ujemne (usuwanie) bez zmian. */
export function foodRads(rads, { resist = 0, ironStomach = false } = {}) {
  if (rads <= 0) return rads;
  const r = ironStomach ? rads / 2 : rads;
  return Math.round(r * (1 - Math.min(100, Math.max(0, resist)) / 100));
}

/** Dzień (indeks) z czasu świata — północ to wielokrotność doby. */
export const dayOf = worldTime => Math.floor((Number(worldTime) || 0) / DAY);

/** Nowy stan dnia: { day, meals, drinks, dehydrating, hungerDays, thirstDays, lastStarve, lastThirst }. */
export const freshState = (day, prev = {}) => ({
  hungerDays: 0, thirstDays: 0, lastStarve: null, lastThirst: null, ...prev, day, meals: 0, drinks: 0, dehydrating: 0
});

/**
 * Rozliczenie dni od state.day do day (bez bieżącego). roll() — k6 (1–6) do tabeli głodu. Zwraca
 * { state, starve: [atrybuty], thirst: [atrybuty], starvedToDeath, diedOfThirst, days }.
 * needMeals — pełnych posiłków na dzień (1); thirst — czy liczyć picie (zasada domowa).
 */
export function settleDays(state, day, { needMeals = 1, thirst = true, roll = () => 1 } = {}) {
  let s = { ...freshState(state?.day ?? day), ...(state ?? {}) };
  const out = { starve: [], thirst: [], starvedToDeath: false, diedOfThirst: false, days: 0 };
  if (!(day > s.day)) return { state: s, ...out };
  const days = Math.min(MAX_DAYS, day - s.day);
  const pick = last => {
    for (let i = 0; i < 20; i++) {
      const a = STARVE_ATTRS[(Math.max(1, Math.min(6, roll())) - 1)];
      if (a !== last) return a;
    }
    return STARVE_ATTRS.find(a => a !== last);
  };
  for (let i = 0; i < days; i++) {
    const meals = i === 0 ? s.meals : 0, drinks = i === 0 ? s.drinks : 0, dry = i === 0 ? s.dehydrating : 0;
    if (meals < needMeals) {
      s.hungerDays += 1;
      const a = pick(s.lastStarve);
      out.starve.push(a); s.lastStarve = a;
      if (s.hungerDays >= STARVE_DEATH) out.starvedToDeath = true;
    } else { s.hungerDays = 0; s.lastStarve = null; }
    if (thirst) {
      if (drinks < 1 + dry) {
        s.thirstDays += 1;
        const a = pick(s.lastThirst);
        out.thirst.push(a); s.lastThirst = a;
        if (s.thirstDays >= THIRST_DEATH) out.diedOfThirst = true;
      } else { s.thirstDays = 0; s.lastThirst = null; }
    }
    out.days += 1;
  }
  s = { ...s, day, meals: 0, drinks: 0, dehydrating: 0 };
  return { state: s, ...out };
}

/** Rady z otoczenia za `seconds` przy `perHour` radach na godzinę i odporności `resist` %; carry — ułamek z poprzednich razy. */
export function ambientRads(perHour, seconds, resist = 0, carry = 0) {
  const raw = Math.max(0, Number(perHour) || 0) * Math.max(0, Number(seconds) || 0) / 3600 * (1 - Math.min(100, Math.max(0, resist)) / 100) + (Number(carry) || 0);
  const whole = Math.floor(raw);
  return { rads: whole, carry: raw - whole };
}

// ---------- lokalne źródła promieniowania (kafelki i regiony) ----------
/** Odległość (px) między prostokątami { x, y, w, h }; 0 — nachodzą albo się stykają. */
export function rectGap(a, b) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Dawka od źródła punktowego (rad/h): pełna przy źródle (do jednego pola), dalej słabnie z kwadratem odległości
 * (2 pola — ¼, 3 pola — 1/9), poza zasięgiem 0. dFt, rangeFt, cellFt — w stopach.
 */
export function sourceDose(rate, dFt, rangeFt, cellFt = 5) {
  const r = Math.max(0, Number(rate) || 0), d = Math.max(0, Number(dFt) || 0), cell = Math.max(0.1, Number(cellFt) || 5);
  if (!r || d > Math.max(0, Number(rangeFt) || 0)) return 0;
  return d <= cell ? r : r * (cell / d) ** 2;
}

/**
 * Łączna dawka dla tokenu (rad/h): tło sceny + regiony, w których stoi, + źródła (kafelki) w zasięgu.
 * token — { x, y, w, h } (px), grid — { size (px), distance (ft na pole) }, regions — [{ rate, name }] (już te, w których
 * stoi), sources — [{ rect, rate, range (ft), name }]. Zwraca { total, parts: [{ kind, name, rate }] } (zaokrąglone do 0,1).
 */
export function exposure({ token, grid = {}, ambient = 0, regions = [], sources = [] }) {
  const size = Number(grid.size) || 100, per = Number(grid.distance) || 5;
  const parts = [];
  if (ambient > 0) parts.push({ kind: "scene", name: "", rate: Number(ambient) });
  for (const r of regions) if (r.rate > 0) parts.push({ kind: "region", name: r.name ?? "", rate: Number(r.rate) });
  for (const s of sources) {
    const dFt = (rectGap(token, s.rect) / size) * per;
    const rate = sourceDose(s.rate, dFt, s.range, per);
    if (rate > 0) parts.push({ kind: "source", name: s.name ?? "", rate, ft: Math.round(dFt * 10) / 10 });
  }
  const total = Math.round(parts.reduce((t, p) => t + p.rate, 0) * 10) / 10;
  return { total, parts: parts.map(p => ({ ...p, rate: Math.round(p.rate * 10) / 10 })) };
}

/** Ile trzasków licznika Geigera przy danej dawce (0 — cisza). */
export const clickCount = rate => (rate > 0 ? Math.min(14, 2 + Math.round(Math.log2(1 + rate))) : 0);
