/**
 * Kalendarz Equestrii — część bez Foundry (testowalna w Node).
 *
 * Dwie ery naraz:
 *   - PA (po Apokalipsie): rok 0 PA to rok Ostatniego Dnia, gdy spadły megazaklęcia zebr; Littlepip wychodzi ze Stajni
 *     około 200 PA (kanon FoE nie podaje dokładnej daty wojny),
 *   - E (rachuba Equestrii): lata od wygnania Nightmare Moon — jedyna rachuba z serialu („najdłuższy dzień
 *     tysięcznego roku”, 1. sezon to rok 1000 E). Ostatni Dzień domyślnie w 1040 E (założenie; MG zmienia w ustawieniach).
 * Miesiące i dni tygodnia zwykłe (365 dni, lata przestępne jak w kalendarzu gregoriańskim), do tego święta z serialu
 * i rocznica Ostatniego Dnia (23 października — data Wielkiej Wojny z serii Fallout; MG może ją przesunąć w kalendarzu).
 * Czas świata 0 to 1 stycznia roku startu kampanii (domyślnie 200 PA), 00:00, poniedziałek.
 *
 * scCalendar() składa konfigurację dla Simple Calendar Reborn (configureCalendar): lata jako „200 PA · 1240 E”
 * przez nazwy lat (YN), więc obie ery widać wszędzie, gdzie moduł pokazuje datę.
 */
import { t, N_, isPL } from "./i18n.mjs";

export const DEFAULT_START = 200;
export const DEFAULT_LAST_DAY = 1040;
/** Nazwy lat w Simple Calendar: od 300 lat przed Apokalipsą do 1000 PA. */
export const NAMES_BEFORE = 300;
export const NAMES_AFTER = 1000;
const DAY = 86400;

export const MONTHS = [
  { name: N_("January"), abbr: N_("mon|Jan"), days: 31 }, { name: N_("February"), abbr: N_("mon|Feb"), days: 28, leap: 29 },
  { name: N_("March"), abbr: N_("mon|Mar"), days: 31 }, { name: N_("April"), abbr: N_("mon|Apr"), days: 30 },
  { name: N_("May"), abbr: N_("mon|May"), days: 31 }, { name: N_("June"), abbr: N_("mon|Jun"), days: 30 },
  { name: N_("July"), abbr: N_("mon|Jul"), days: 31 }, { name: N_("August"), abbr: N_("mon|Aug"), days: 31 },
  { name: N_("September"), abbr: N_("mon|Sep"), days: 30 }, { name: N_("October"), abbr: N_("mon|Oct"), days: 31 },
  { name: N_("November"), abbr: N_("mon|Nov"), days: 30 }, { name: N_("December"), abbr: N_("mon|Dec"), days: 31 }
];
/** Tydzień od poniedziałku. */
export const WEEKDAYS = [
  { name: N_("Monday"), abbr: N_("day|Mo") }, { name: N_("Tuesday"), abbr: N_("day|Tu") }, { name: N_("Wednesday"), abbr: N_("day|We") },
  { name: N_("Thursday"), abbr: N_("day|Th") }, { name: N_("Friday"), abbr: N_("day|Fr") }, { name: N_("Saturday"), abbr: N_("day|Sa") },
  { name: N_("Sunday"), abbr: N_("day|Su") }
];
/** Pory roku: początek (miesiąc i dzień od 0), wschód i zachód słońca (sekundy od północy). */
export const SEASONS = [
  { name: N_("Spring"), icon: "spring", color: "#46b946", month: 2, day: 19, sunrise: 6 * 3600, sunset: 18 * 3600 },
  { name: N_("Summer"), icon: "summer", color: "#e0c40b", month: 5, day: 20, sunrise: 4.5 * 3600, sunset: 20.5 * 3600 },
  { name: N_("Autumn"), icon: "fall", color: "#ff8e47", month: 8, day: 21, sunrise: 6 * 3600, sunset: 18 * 3600 },
  { name: N_("Winter"), icon: "winter", color: "#479dff", month: 11, day: 20, sunrise: 7.5 * 3600, sunset: 16 * 3600 }
];

/**
 * Święta (miesiąc i dzień od 0). since — od którego roku PA (null — od początku nazw lat); once — tylko w tym roku.
 * Nazwy z serialu MLP: Friendship is Magic; po polsku z angielską nazwą w nawiasie.
 */
export const HOLIDAYS = [
  { key: "heartsHooves", month: 1, day: 13, name: N_("Hearts and Hooves Day"),
    text: N_("A day of love and friendship: ponies give each other cards, flowers and sweets.") },
  { key: "winterWrapUp", month: 2, day: 19, name: N_("Winter Wrap Up"),
    text: N_("Without magic, everypony clears away the winter and wakes the spring — the first day of spring.") },
  { key: "summerSun", month: 5, day: 20, name: N_("Summer Sun Celebration"),
    text: N_("The longest day of the year: a festival of the sun raised at dawn — since Luna's return, of both princesses.") },
  { key: "runningLeaves", month: 8, day: 21, name: N_("Running of the Leaves"),
    text: N_("Earth ponies race through the forest and shake the leaves off the trees — the start of autumn.") },
  { key: "lastDay", month: 9, day: 22, once: 0, name: N_("The Last Day"),
    text: N_("The zebra megaspells strike Equestria and the war ends in the Apocalypse. Year 0 PA.") },
  { key: "lastDayAnniversary", month: 9, day: 22, since: 1, name: N_("Anniversary of the Last Day"),
    text: N_("The day the megaspells fell. In the Wasteland some remember it, some curse it, some have never heard of it.") },
  { key: "nightmareNight", month: 9, day: 30, name: N_("Nightmare Night"),
    text: N_("Costumes, candy and scary stories; foals leave candy for Nightmare Moon — since Luna's return, a night in her honour.") },
  { key: "hearthsWarming", month: 11, day: 23, name: N_("Hearth's Warming Eve"),
    text: N_("The founding of Equestria: the three tribes united against the windigos. A pageant, gifts and a warm hearth.") }
];

export const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const yearDays = y => (isLeap(y) ? 366 : 365);
const monthDays = (m, y) => (m === 1 && isLeap(y) ? 29 : MONTHS[m].days);

/** Data z czasu świata (sekundy): { year (PA), month, day (od 0), hour, minute, second, weekday (0 — poniedziałek) }. */
export function dateOf(worldTime, startYear = DEFAULT_START) {
  const time = Number(worldTime) || 0;
  const total = Math.floor(time / DAY);
  let rest = time - total * DAY;
  let days = total, year = Math.trunc(Number(startYear) || 0);
  // pełne cykle 400 lat (146097 dni) — szybko także dla dalekich dat
  const cycles = Math.floor(days / 146097);
  days -= cycles * 146097; year += cycles * 400;
  while (days >= yearDays(year)) { days -= yearDays(year); year++; }
  let month = 0;
  while (days >= monthDays(month, year)) { days -= monthDays(month, year); month++; }
  const hour = Math.floor(rest / 3600); rest -= hour * 3600;
  const minute = Math.floor(rest / 60);
  return { year, month, day: days, hour, minute, second: Math.floor(rest - minute * 60), weekday: ((total % 7) + 7) % 7 };
}

/** Czas świata (sekundy) z daty { year (PA), month, day (od 0), hour, minute, second }. */
export function timeOf({ year, month = 0, day = 0, hour = 0, minute = 0, second = 0 }, startYear = DEFAULT_START) {
  let days = 0;
  const s = Math.trunc(Number(startYear) || 0);
  for (let y = s; y < year; y++) days += yearDays(y);
  for (let y = year; y < s; y++) days -= yearDays(y);
  for (let m = 0; m < month; m++) days += monthDays(m, year);
  return (days + day) * DAY + hour * 3600 + minute * 60 + second;
}

/** Rok w rachubie Equestrii. */
export const equestrianYear = (pa, lastDay = DEFAULT_LAST_DAY) => Math.trunc(pa) + Math.trunc(Number(lastDay) || 0);

/** Nazwa roku z obiema erami: „200 PA · 1240 E”, przed Apokalipsą „1035 E (przed Apokalipsą)”. */
export function yearName(pa, lastDay = DEFAULT_LAST_DAY) {
  const e = equestrianYear(pa, lastDay);
  return pa >= 0 ? t("{pa} PA · {e} E", { pa, e }) : t("{e} E (before the Apocalypse)", { e });
}

/** Data jak w kalendarzu: „October 23, 200 PA · 1240 E”, po polsku „23 paź, 200 PA · 1240 E”. */
export function dateText(d, lastDay = DEFAULT_LAST_DAY) {
  const y = yearName(d.year, lastDay);
  return isPL() ? `${d.day + 1} ${t(MONTHS[d.month].abbr)}, ${y}` : `${t(MONTHS[d.month].name)} ${d.day + 1}, ${y}`;
}
export const timeText = d => `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`;

/** Święta w danym dniu (z uwzględnieniem since/once). */
export function holidaysOn(d) {
  return HOLIDAYS.filter(h => h.month === d.month && h.day === d.day
    && (h.once === undefined || h.once === d.year) && (h.since === undefined || d.year >= h.since));
}

/** Formaty dat Simple Calendar (YN — nazwa roku z obiema erami). */
export function scFormats() {
  return isPL()
    ? { date: "D MMM, YN", time: "HH:mm", monthYear: "MMMM YN", chatTime: "D MMM, YN HH:mm" }
    : { date: "MMMM D, YN", time: "HH:mm", monthYear: "MMMM YN", chatTime: "MMM D, YN HH:mm" };
}

/**
 * Konfiguracja kalendarza dla Simple Calendar Reborn (api.configureCalendar). current — obecny kalendarz modułu
 * (api.getCurrentCalendar()): z niego zostają ustawienia ogólne (z id) i tempo zegara, których FoE nie zmienia.
 */
export function scCalendar({ startYear = DEFAULT_START, lastDay = DEFAULT_LAST_DAY, current = {} } = {}) {
  const first = -NAMES_BEFORE;
  const names = [];
  for (let y = first; y <= NAMES_AFTER; y++) names.push(yearName(y, lastDay));
  return {
    name: t("Equestria (Fallout: Equestria)"),
    general: { ...(current.general ?? {}), gameWorldTimeIntegration: current.general?.gameWorldTimeIntegration ?? "mixed", dateFormat: scFormats() },
    leapYear: { rule: "gregorian", customMod: 0 },
    months: MONTHS.map((m, i) => ({
      name: t(m.name), abbreviation: t(m.abbr), numericRepresentation: i + 1, numericRepresentationOffset: 0,
      numberOfDays: m.days, numberOfLeapYearDays: m.leap ?? m.days, intercalary: false, intercalaryInclude: false, startingWeekday: null
    })),
    weekdays: WEEKDAYS.map((w, i) => ({ name: t(w.name), abbreviation: t(w.abbr), numericRepresentation: i + 1 })),
    seasons: SEASONS.map(s => ({ name: t(s.name), startingMonth: s.month, startingDay: s.day, color: s.color, icon: s.icon, sunriseTime: s.sunrise, sunsetTime: s.sunset })),
    moons: [{
      name: t("Moon"), cycleLength: 29.53059, color: "#ffffff", cycleDayAdjust: 0.5,
      firstNewMoon: { yearReset: "none", yearX: 0, year: Math.trunc(startYear), month: 0, day: 5 },
      phases: [
        [N_("New Moon"), 1, "new", true], [N_("Waxing Crescent"), 6.38265, "waxing-crescent", false], [N_("First Quarter"), 1, "first-quarter", true],
        [N_("Waxing Gibbous"), 6.38265, "waxing-gibbous", false], [N_("Full Moon"), 1, "full", true], [N_("Waning Gibbous"), 6.38265, "waning-gibbous", false],
        [N_("Last Quarter"), 1, "last-quarter", true], [N_("Waning Crescent"), 6.38265, "waning-crescent", false]
      ].map(([name, length, icon, singleDay]) => ({ name: t(name), length, icon, singleDay }))
    }],
    noteCategories: [...(current.noteCategories ?? []).filter(c => c?.name !== t("Holiday")), { name: t("Holiday"), textColor: "#FFFFFF", color: "#148e94" }],
    time: { gameTimeRatio: 1, unifyGameAndClockPause: false, updateFrequency: 1, ...(current.time ?? {}), hoursInDay: 24, minutesInHour: 60, secondsInMinute: 60 },
    year: {
      numericRepresentation: Math.trunc(startYear),
      prefix: "", postfix: "PA", showWeekdayHeadings: true,
      firstWeekday: 0, yearZero: Math.trunc(startYear),
      yearNames: names, yearNamingRule: "default", yearNamesStart: first
    }
  };
}
