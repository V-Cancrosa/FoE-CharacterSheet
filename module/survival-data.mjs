/**
 * Jedzenie, picie i promieniowanie w czasie — część bez Foundry (testowalna w Node). Zasady: podręcznik s. 477–484.
 *
 * Jedzenie (kategoria „Jedzenie i picie” w katalogu) — z opisu produktu (po angielsku albo częściowo po polsku):
 *   - posiłki: domyślnie 1, „counts as two meals” 2…, „does not count as a meal / provides no sustenance” 0;
 *     napoje (bez „Diet:”) 0, chyba że opis mówi inaczej (Milkshake, Weed Water),
 *   - nawodnienie: napoje i „provides hydration”, chyba że „dehydrating” (wtedy zabiera 6 h nawodnienia),
 *   - rady: „Rads: +5” / „Rady: +5”, „+10 Rads”, „Removes 10 rads”,
 *   - rany: bazowo 1 (podręcznik: „Sweet Roll… still recovers one wound”), „double/triple/quadruple wounds” 2/3/4,
 *     „Recovers 2 wounds”, „does not heal / recovers no wounds” 0,
 *   - dieta: „Diet: Herbivore / Carnivore / Omnivore / Any” — zjedzone wbrew diecie rasy nie syci i nie leczy.
 * Głód (s. 477, tabela XXXII): każdy dzień bez pełnego posiłku — −1 do losowego atrybutu (bez Szczęścia), ten sam
 * nie dwa dni z rzędu; po 3 tygodniach śmierć. Jedzenie niesycące — 8 h bez kar głodu; po tygodniu głodu jedzenie za
 * 2+ posiłki trzeba utrzymać (END ½, poza Oatmeal i Slop); 4+ posiłki co najmniej 4 h od siebie — +15 do rzutów END.
 * Ghule żywią się radami (5 na dzień), alikorny mogą nimi zastąpić posiłek.
 * Odwodnienie (s. 478–479, tabela XXXIII): każdy nawadniający produkt to 6 h (najwyżej doba naprzód); każde 6 h bez
 * picia — etap wyżej (kary narastają), 72 h — śmierć. Rekonwalescencja: połowa najwyższego etapu, aż postać wypije
 * przez pełną dobę (od etapu 6: 2k4+2 produktów na dobę przez tyle dób, ile była odwodniona).
 * Promieniowanie (s. 483–484, tabela XXXV): poziomy 0–7 w radach na minutę; silne napromieniowanie (ponad 400 radów
 * w krótkim czasie, nieusunięte przez 6 h) — END ¼; 1000 radów — END 1/10.
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

/** Nowy stan dnia: { day, meals, mealTimes, hungerDays, lastStarve }. */
export const freshState = (day, prev = {}) => ({ hungerDays: 0, lastStarve: null, ...prev, day, meals: 0, mealTimes: [] });

/**
 * Rozliczenie głodu od state.day do day (bez bieżącego). roll() — k6 (1–6) do tabeli głodu. Zwraca
 * { state, starve: [atrybuty], starvedToDeath, days }. needMeals — pełnych posiłków na dzień (1); fed — czy pierwszy
 * dzień jest „najedzony” mimo braku posiłków (ghule i alikorny: rady), kolejne pominięte dni — bez jedzenia.
 */
export function settleDays(state, day, { needMeals = 1, roll = () => 1, fed = null } = {}) {
  let s = { ...freshState(state?.day ?? day), ...(state ?? {}) };
  const out = { starve: [], starvedToDeath: false, days: 0 };
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
    const ok = i === 0 ? (fed ?? (s.meals >= needMeals)) : false;
    if (!ok) {
      s.hungerDays += 1;
      const a = pick(s.lastStarve);
      out.starve.push(a); s.lastStarve = a;
      if (s.hungerDays >= STARVE_DEATH) out.starvedToDeath = true;
    } else { s.hungerDays = 0; s.lastStarve = null; }
    out.days += 1;
  }
  s = { ...s, day, meals: 0, mealTimes: [] };
  return { state: s, ...out };
}

/** Posiłki co najmniej 4 h od siebie (s. 477): ile z listy czasów się liczy. */
export function spacedMeals(times = [], gap = 4 * 3600) {
  let n = 0, last = -Infinity;
  for (const x of [...times].map(Number).filter(Number.isFinite).sort((a, b) => a - b)) if (x - last >= gap) { n++; last = x; }
  return n;
}
/** „Więcej niż 3 posiłki dziennie” co najmniej 4 h od siebie — +15 do rzutów END do końca dnia. */
export const WELL_FED = 4;
/** Po tygodniu głodu jedzenie za 2+ posiłki trzeba utrzymać (END ½) — poza Oatmeal i Slop. */
export const mustKeepDown = (hungerDays, meals, name = "") => hungerDays > 7 && meals >= 2 && !/oatmeal|slop|owsiank|pomyj/i.test(name);

// ---------- odwodnienie (tabela XXXIII) ----------
export const H6 = 6 * 3600;
export const STAGE_MAX = 12;
/** Stan nawodnienia: { until (nawodniony do), base (etap startowy po nawrocie), max, rec, seen, out }. Nowy — doba zapasu. */
export const freshThirst = now => ({ until: (Number(now) || 0) + 4 * H6, base: 0, max: 0, rec: null, seen: 0, out: false });

/** Etap odwodnienia teraz (0 — nawodniony): każde pełne 6 h po „until” to etap wyżej; po nawrocie od etapu „base”. */
export function thirstStage(th, now) {
  if (!th || !Number.isFinite(Number(th.until))) return 0;
  const missed = Math.floor((now - Number(th.until)) / H6);
  if (missed < 1) return 0;
  return Math.min(STAGE_MAX, (Number(th.base) || 0) + missed);
}
/** Etap, którego kary działają: bieżący albo — w rekonwalescencji — połowa najwyższego. */
export const thirstLevel = (th, now) => Math.max(thirstStage(th, now), th?.rec ? Math.floor((Number(th.max) || 0) / 2) : 0);
/** Kiedy postać dojdzie do etapu `stage` (czas świata), jeśli nic nie wypije. */
export const stageAt = (th, stage) => Number(th.until) + Math.max(1, stage - (Number(th.base) || 0)) * H6;
/** Ile dób trwa rekonwalescencja: doba za każdą dobę odwodnienia (po pierwszych 24 h bez picia), w górę. */
export const recoveryDays = max => Math.max(1, Math.ceil((max - 4) / 4));

/**
 * Wypicie `items` nawadniających produktów. roll() — 2k4+2 dla rekonwalescencji od etapu 6. Zwraca { th, stage, kind }:
 * kind — „ok” (nawodniony), „reversed” (etap 1–2 cofnięty), „recovery” (zaczyna albo ponawia rekonwalescencję),
 * „recovering” (pije w trakcie).
 */
export function drink(th, now, items = 1, roll = () => 7) {
  const prev = { ...freshThirst(now), ...(th ?? {}) };
  const stage = thirstStage(prev, now);
  const until = Math.min(now + 4 * H6, Math.max(now, Number(prev.until) || now) + items * H6);
  const day = dayOf(now);
  if (!prev.rec && stage <= 2) return { th: { ...prev, until, base: 0, max: 0, rec: null, seen: 0, out: false }, stage, kind: stage ? "reversed" : "ok" };
  const lapsed = stage > (prev.rec ? Math.floor((Number(prev.max) || 0) / 2) : 2);
  if (lapsed) {
    const max = Math.max(Number(prev.max) || 0, stage);
    const rec = { need: max >= 6 ? Math.max(4, Number(roll()) || 4) : 4, days: max >= 6 ? recoveryDays(max) : 1, count: items, day, from: day };
    return { th: { ...prev, until, max, base: Math.floor(max / 2), rec, seen: 0, out: false }, stage, kind: "recovery" };
  }
  const rec = { ...prev.rec, count: (prev.rec.day === day ? Number(prev.rec.count) || 0 : 0) + items, day };
  return { th: { ...prev, until, rec, seen: 0, out: false }, stage, kind: "recovering" };
}

/** Produkt odwadniający: zabiera 6 h nawodnienia. */
export const dehydrate = (th, now) => ({ ...freshThirst(now), ...(th ?? {}), until: (Number(th?.until) || now) - H6 });

/**
 * Doba rekonwalescencji o północy (koniec dnia `day`): pełna doba z co najmniej `need` produktami — doba mniej; po
 * ostatniej — wyleczony. Zwraca { th, done, counted }.
 */
export function settleRecovery(th, day) {
  if (!th?.rec) return { th, done: false, counted: false };
  const rec = { ...th.rec };
  const count = rec.day === day ? Number(rec.count) || 0 : 0;
  const counted = rec.from < day && count >= rec.need;
  if (counted) rec.days -= 1;
  rec.count = 0; rec.day = day + 1;
  if (rec.days <= 0) return { th: { ...th, base: 0, max: 0, rec: null }, done: true, counted };
  return { th: { ...th, rec }, done: false, counted };
}

/** Kary etapu (łącznie z poprzednimi). optional — etapy 2 i 3 (w podręczniku opcjonalne). */
export function thirstEffects(level, { optional = true } = {}) {
  const fx = [];
  if (level >= 2 && optional) fx.push({ type: "basedStep", target: "cha", value: -1 });
  const weak = (level >= 3 && optional ? 1 : 0) + (level >= 5 ? 1 : 0);
  if (weak) for (const a of ["str", "end", "agi"]) fx.push({ type: "tempAttr", target: a, value: -weak });
  if (level >= 4) fx.push({ type: "initiative", target: "all", value: -10 });
  const aim = (level >= 7 ? 1 : 0) + (level >= 9 ? 1 : 0);
  if (aim) fx.push({ type: "mfdStep", target: "attack", value: -aim });
  return fx;
}
/** Koszt SATS (AP) większy o… (etap 4: +10, etap 8: +20). */
export const thirstSats = level => (level >= 8 ? 20 : level >= 4 ? 10 : 0);
/** Zdarzenia przy wejściu na etap: rany tułowia, utrata przytomności, zapaść. */
export const THIRST_EVENTS = Object.freeze({ 6: "wounds4", 10: "wounds6", 11: "faint", 12: "collapse" });

/** Rady z otoczenia za `seconds` przy `perMinute` radach na minutę i odporności `resist` %; carry — ułamek z poprzednich razy. */
export function ambientRads(perMinute, seconds, resist = 0, carry = 0) {
  const raw = Math.max(0, Number(perMinute) || 0) * Math.max(0, Number(seconds) || 0) / 60 * (1 - Math.min(100, Math.max(0, resist)) / 100) + (Number(carry) || 0);
  const whole = Math.floor(raw);
  return { rads: whole, carry: raw - whole };
}

/**
 * Poziomy promieniowania z tabeli XXXV (s. 484): rate — typowa dawka (rad/min), min — od ilu rad/min liczy się poziom.
 * Poziom 0 — ok. 4 rady na dobę; poziom 1 — ponad 25% odporności chroni całkowicie; licznik PipBucka rejestruje od poziomu 2.
 */
export const RAD_ZONES = Object.freeze([
  { level: 0, rate: 0.003, min: 0, label: "Negligible" },
  { level: 1, rate: 8, min: 5, label: "Residual" },
  { level: 2, rate: 20, min: 15, label: "Extremely low" },
  { level: 3, rate: 40, min: 30, label: "Low" },
  { level: 4, rate: 100, min: 80, label: "Medium" },
  { level: 5, rate: 200, min: 150, label: "High" },
  { level: 6, rate: 640, min: 500, label: "Extremely high" },
  { level: 7, rate: 1200, min: 1000, label: "Deadly" }
]);
/** Poziom (0–7) dla dawki w rad/min; null — brak promieniowania. */
export function radLevelOf(rate) {
  const r = Number(rate) || 0;
  if (r <= 0) return null;
  return [...RAD_ZONES].reverse().find(z => r >= z.min)?.level ?? 0;
}
/** Pochłaniana dawka po odporności: poziom 0–1 i ponad 25% odporności — nic. */
export const absorbedRate = (rate, resist = 0) => ((radLevelOf(rate) ?? 0) <= 1 && resist > 25 ? 0 : Math.max(0, Number(rate) || 0));
export const GEIGER_MIN_LEVEL = 2;

/**
 * Dziennik promieniowania (flaga radlog): rady dziś i wczoraj (ghule, alikorny), seria w krótkim czasie, silne
 * napromieniowanie i choroba popromienna. Zwraca nowy dziennik po zmianie radów z `before` na `after` w chwili `now`.
 */
export const SEVERE_RADS = 400;
export const SEVERE_WINDOW = 3600;
export const SEVERE_WAIT = H6;
export const POISON_DEATH = 24 * 3600;
export const LETHAL_RADS = 1000;
export function radLog(log, before, after, now) {
  const L = { day: dayOf(now), today: 0, prev: 0, burst: null, severe: null, poison: null, lethal: null, ...(log ?? {}) };
  const d = (Number(after) || 0) - (Number(before) || 0);
  const day = dayOf(now);
  if (L.day !== day) { L.prev = L.day === day - 1 ? L.today : 0; L.today = 0; L.day = day; }
  if (d > 0) {
    L.today += d;
    L.burst = L.burst && now - L.burst.start <= SEVERE_WINDOW ? { start: L.burst.start, n: L.burst.n + d } : { start: now, n: d };
    if (L.burst.n > SEVERE_RADS && !L.severe) L.severe = { at: now };
    if (before < LETHAL_RADS && after >= LETHAL_RADS) L.lethal = now;
  } else if (d < 0) {
    // usunięte promieniowanie: silne napromieniowanie mija, choroba popromienna leczona (s. 483)
    L.severe = null; L.poison = null; L.burst = null;
    if (after < LETHAL_RADS) L.lethal = null;
  }
  return L;
}
/** Rady pochłonięte w dniu `day` według dziennika. */
export const radsOnDay = (log, day) => (!log ? 0 : log.day === day ? Number(log.today) || 0 : log.day === day + 1 ? Number(log.prev) || 0 : 0);
/** Ghule: co najmniej 5 radów na dobę zamiast jedzenia; alikorny: rady mogą zastąpić posiłek. */
export const RADS_FOR_FOOD = 5;

// ---------- lokalne źródła promieniowania (kafelki i regiony) ----------
/** Odległość (px) między prostokątami { x, y, w, h }; 0 — nachodzą albo się stykają. */
export function rectGap(a, b) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Dawka od źródła punktowego (rad/min): pełna przy źródle (do jednego pola), dalej słabnie z kwadratem odległości
 * (2 pola — ¼, 3 pola — 1/9), poza zasięgiem 0. dFt, rangeFt, cellFt — w stopach.
 */
export function sourceDose(rate, dFt, rangeFt, cellFt = 5) {
  const r = Math.max(0, Number(rate) || 0), d = Math.max(0, Number(dFt) || 0), cell = Math.max(0.1, Number(cellFt) || 5);
  if (!r || d > Math.max(0, Number(rangeFt) || 0)) return 0;
  return d <= cell ? r : r * (cell / d) ** 2;
}

/**
 * Łączna dawka dla tokenu (rad/min): tło sceny + regiony, w których stoi, + źródła (kafelki) w zasięgu.
 * token — { x, y, w, h } (px), grid — { size (px), distance (ft na pole) }, regions — [{ rate, name }] (już te, w których
 * stoi), sources — [{ rect, rate, range (ft), name }]. Zwraca { total, parts: [{ kind, name, rate }] } (bez zaokrągleń —
 * poziom 0 to ułamki radu na minutę).
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
  return { total: parts.reduce((t, p) => t + p.rate, 0), parts };
}

/** Ile trzasków licznika Geigera przy danej dawce (0 — cisza). */
export const clickCount = rate => (rate > 0 ? Math.min(14, 2 + Math.round(Math.log2(1 + rate))) : 0);
