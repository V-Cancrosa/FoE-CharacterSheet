/**
 * Sen i niewyspanie (s. 479–480). Bez Foundry — testowalne w Node.
 *   - Kucyki (i zebry): drzemki na stojąco liczą się same (podróż); co 48 h potrzebują 2 godzin snu na leżąco z rzędu.
 *   - Inne rasy: 8 godzin snu na 24.
 *   - Po przekroczeniu granicy (48 h / 24 h): rzut END co godzinę — porażka: zasypia w trakcie działania (budzi ją rana —
 *     na godzinę — albo pełny sen: kucyki 3 h, inne rasy 8 h). Trudność godzinnego rzutu podręcznik pomija — system: MFD 1.
 *   - Za każde 2 h ponad granicę: −1 INT i END (kumuluje się).
 *   - Pełne 48 h ponad granicę: END ½ co godzinę — krytyczny sukces: kolejna godzina, sukces: utrata przytomności,
 *     porażka: śmierć.
 *   - Ghule i alikorny nie potrzebują snu, jeśli w ciągu 48 h dostały co najmniej 100 radów.
 *   - Kawa, Daturana itp. („cannot sleep for XdY hours”): wydłużają granicę bez rzutów, do następnego snu.
 * Stan (flaga foe-rpg.sleep): { since — koniec ostatniego pełnego snu (s), extra — godziny od używek, checked — ostatni
 * godzinny rzut (s), asleep — { at, need } gdy postać zasnęła z wyczerpania }.
 */
const H = 3600;
const sinceOf = (st, now) => (Number.isFinite(Number(st?.since)) && st?.since !== null ? Number(st.since) : now);

/** Rasa koniowata (kucyki, zebry, alikorny): 48 h i 2 h snu; inne: 24 h i 8 h. */
export const isEquine = race => !/griff|gryf|\bdog\b|diamond|\bpies\b|psy\b|psów|changeling|podmie|hellhound|piekieln|dragon|smok|buffalo|bizon|minotaur|human|człowiek|yak|jak\b/i.test(String(race ?? ""));
export const limitHours = race => (isEquine(race) ? 48 : 24);
/** Ile godzin snu z rzędu resetuje licznik. */
export const needHours = race => (isEquine(race) ? 2 : 8);
/** Ile śpi, gdy zaśnie z wyczerpania (s. 479: „full necessary three hours”; inne rasy — 8). */
export const crashHours = race => (isEquine(race) ? 3 : 8);
export const EXHAUSTION_HOURS = 48;
export const NO_SLEEP_RADS = 100;

export const freshSleep = now => ({ since: now, extra: 0, checked: null, asleep: null });

/** Godziny na nogach od ostatniego pełnego snu. */
export const awakeHours = (st, now) => Math.max(0, (now - sinceOf(st, now)) / H);
/** Godziny ponad granicę (z używkami). */
export const overHours = (st, now, race) => Math.max(0, awakeHours(st, now) - limitHours(race) - (Number(st?.extra) || 0));
/** Kara do INT i END: −1 za każde pełne 2 h ponad granicę. */
export const sleepPenalty = (st, now, race) => Math.floor(overHours(st, now, race) / 2);

/**
 * Rzuty do wykonania za czas do now: lista { at, kind: "stay" (END MFD 1) | "exhaust" (END ½) }, po jednym na każdą pełną
 * godzinę ponad granicę od ostatniego rzutu. Najwyżej max (resztę dorobi następny upływ czasu).
 */
export function checksDue(st, now, race, max = 6) {
  if (!st || st.asleep) return [];
  const start = sinceOf(st, now) + (limitHours(race) + (Number(st.extra) || 0)) * H;
  const from = Math.max(start, Number(st.checked) || 0);
  const out = [];
  for (let at = from + H; at <= now && out.length < max; at += H) {
    out.push({ at, kind: (at - start) / H >= EXHAUSTION_HOURS ? "exhaust" : "stay" });
  }
  return out;
}

/** Sen: hours godzin zakończony w chwili end. Pełny (≥ potrzeby rasy) zeruje licznik; krótszy nic nie zmienia. */
export function slept(st, end, hours, race) {
  if (hours < needHours(race)) return { st: { ...(st ?? freshSleep(end)) }, full: false };
  return { st: freshSleep(end), full: true };
}

/** Używka: „cannot sleep for 2d4 hours” → formuła rzutu albo null. */
export function stimFormula(text) {
  const m = String(text ?? "").match(/cannot sleep for\s+(\d+d\d+|\d+)\s*hours?/i);
  return m ? m[1] : null;
}
