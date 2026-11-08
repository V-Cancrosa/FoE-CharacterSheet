/**
 * Kalendarz Equestrii w grze (część bez Foundry: calendar-data.mjs).
 *   - data w zakładce walki pod pogodą: „October 23, 200 PA · 1240 E · 08:00” (+ święto tego dnia); odświeża się
 *     z upływem czasu świata bez przerysowania zakładki,
 *   - z modułem Simple Calendar Reborn: MG jednym przyciskiem (ustawienia FoE, a przy pierwszym uruchomieniu — pytanie)
 *     zmienia jego kalendarz na equestriański: miesiące i dni, pory roku ze wschodem i zachodem słońca, księżyc,
 *     lata w obu erach, święta z serialu i rocznica Ostatniego Dnia jako notatki; data wtedy pochodzi z modułu,
 *   - bez modułu data liczy się z czasu świata (0 = 1 stycznia roku startu kampanii).
 */
import { t } from "./i18n.mjs";
import {
  DEFAULT_START, DEFAULT_LAST_DAY, HOLIDAYS, NAMES_BEFORE,
  dateOf, dateText, timeText, holidaysOn, scCalendar
} from "./calendar-data.mjs";

const F = "foe-rpg";
const SC_IDS = ["foundryvtt-simple-calendar-reborn", "foundryvtt-simple-calendar"];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const get = (key, fallback) => { try { return game.settings.get(F, key) ?? fallback; } catch { return fallback; } };
const startYear = () => Math.trunc(Number(get("calendarStart", DEFAULT_START)) || 0);
const lastDay = () => Math.trunc(Number(get("calendarLastDay", DEFAULT_LAST_DAY)) || 0);

/** API Simple Calendar (Reborn albo oryginał), gdy moduł jest włączony i gotowy. */
export function scApi() {
  if (!SC_IDS.some(id => game.modules?.get?.(id)?.active)) return null;
  const api = globalThis.SimpleCalendar?.api;
  return api?.currentDateTime ? api : null;
}
const scInstalled = () => SC_IDS.some(id => game.modules?.get?.(id));

/** Bieżąca data: { date, time, holidays } — z Simple Calendar, gdy jest, inaczej z czasu świata. */
export function currentDate() {
  const api = scApi();
  if (api) {
    try {
      const shown = api.currentDateTimeDisplay?.();
      const cur = api.currentDateTime();
      if (shown?.date && cur) return { date: shown.date, time: shown.time ?? "", holidays: holidaysOn(cur), sc: true };
    } catch { /* moduł jeszcze się nie załadował — data z czasu świata */ }
  }
  const d = dateOf(game.time?.worldTime ?? 0, startYear());
  return { date: dateText(d, lastDay()), time: timeText(d), holidays: holidaysOn(d), sc: false };
}

const lineText = c => [c.date, c.time].filter(Boolean).join(" · ");
const lineTitle = c => [
  ...c.holidays.map(h => `${t(h.name)} — ${t(h.text)}`),
  c.sc ? "Simple Calendar" : t("Calendar from the world time — set the date with Simple Calendar Reborn")
].join("\n");

/** Odśwież napisy z datą (zakładka walki) bez przerysowania. */
function refreshDate() {
  const els = document.querySelectorAll(".foe-date");
  if (!els.length) return;
  const c = currentDate();
  for (const el of els) {
    el.querySelector(".foe-date-text").textContent = lineText(c);
    el.querySelector(".foe-date-holiday").textContent = c.holidays.map(h => t(h.name)).join(", ");
    el.title = lineTitle(c);
  }
}
let pending = false;
const scheduleRefresh = () => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; refreshDate(); });
};

// ---------- Simple Calendar: kalendarz equestriański ----------
const HOLIDAY_FLAG = "holiday";
/** Notatki-święta FoE już dodane do kalendarza (po kluczu). */
function existingHolidays() {
  const keys = new Set();
  for (const j of game.journal ?? []) {
    const k = j.flags?.[F]?.[HOLIDAY_FLAG];
    if (k) keys.add(k);
  }
  return keys;
}

/** Zastosuj kalendarz equestriański w Simple Calendar (MG). Zwraca liczbę dodanych świąt albo null. */
export async function applyToSimpleCalendar({ start = startYear(), last = lastDay(), setDate = true, holidays = true } = {}) {
  const api = scApi();
  if (!api || !game.user?.isGM) return null;
  await game.settings.set(F, "calendarStart", start);
  await game.settings.set(F, "calendarLastDay", last);
  const ok = await api.configureCalendar(scCalendar({ startYear: start, lastDay: last, current: api.getCurrentCalendar?.() ?? {} }));
  if (!ok) throw new Error(t("Simple Calendar refused the configuration."));
  if (setDate) api.setDate?.({ year: start, month: 0, day: 0, hour: 8, minute: 0, seconds: 0 });
  let added = 0;
  if (holidays && api.addNote) {
    const have = existingHolidays();
    const yearly = api.NoteRepeat?.Yearly ?? 3, never = api.NoteRepeat?.Never ?? 0;
    for (const h of HOLIDAYS) {
      if (have.has(h.key)) continue;
      const year = h.once ?? h.since ?? -NAMES_BEFORE;
      const date = { year, month: h.month, day: h.day, hour: 0, minute: 0, seconds: 0 };
      const je = await api.addNote(t(h.name), `<p>${esc(t(h.text))}</p>`, date, date, true, h.once === undefined ? yearly : never,
        [t("Holiday")], "active", null, ["default"]);
      if (je) { await je.setFlag(F, HOLIDAY_FLAG, h.key); added++; }
    }
  }
  scheduleRefresh();
  return added;
}

/** Okno MG: rok startu, Ostatni Dzień, data i święta → Simple Calendar. */
export async function promptApply() {
  if (!game.user?.isGM) return null;
  if (!scApi()) return ui.notifications.warn(t("Turn on the Simple Calendar Reborn module in this world first."));
  const content = `
    <div class="foe-dialog">
      <p>${t("Simple Calendar gets the Equestria calendar: months and weekdays, seasons with sunrise and sunset, the moon, holidays from the show and the anniversary of the Last Day, and years in both reckonings (e.g. 200 PA · 1240 E). Its current months, weekdays and seasons are replaced; notes stay.")}</p>
      <label class="mod-row">${t("Campaign start year (PA, after the Apocalypse)")} <input type="number" name="start" value="${startYear()}" step="1"></label>
      <label class="mod-row">${t("The Last Day in the Equestrian reckoning (E — years since Nightmare Moon's banishment)")} <input type="number" name="last" value="${lastDay()}" step="1"></label>
      <label class="atk-row atk-check"><input type="checkbox" name="setDate" checked> <span>${t("Set the date to 1 January of the start year, 8:00")}</span></label>
      <label class="atk-row atk-check"><input type="checkbox" name="holidays" checked> <span>${t("Add holidays as calendar notes (missing ones only)")}</span></label>
    </div>`;
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Equestria calendar") },
    classes: ["foe-rpg"],
    position: { width: 480 },
    content,
    rejectClose: false,
    buttons: [
      { action: "apply", label: t("Apply"), icon: "fa-solid fa-calendar-check", default: true,
        callback: (ev, button) => {
          const el = button.form.elements;
          return { start: Math.trunc(Number(el.start.value) || 0), last: Math.trunc(Number(el.last.value) || 0), setDate: el.setDate.checked, holidays: el.holidays.checked };
        } },
      { action: "cancel", label: t("Not now"), icon: "fa-solid fa-xmark" }
    ]
  });
  if (!res || res === "cancel") return null;
  try {
    const added = await applyToSimpleCalendar(res);
    ui.notifications.info(t("Equestria calendar applied; holidays added: {n}.", { n: added ?? 0 }));
    return added;
  } catch (err) {
    console.error(`${F} | calendar`, err);
    ui.notifications.error(t("Calendar: {msg}", { msg: err.message }));
    return null;
  }
}

export function registerCalendarSettings() {
  game.settings.register(F, "calendarStart", {
    name: "Calendar: campaign start year (PA)",
    hint: "Years after the Apocalypse (year 0 PA — the Last Day, when the megaspells fell; Littlepip leaves her Stable around 200 PA). Without Simple Calendar the date counts from 1 January of this year.",
    scope: "world", config: true, type: Number, default: DEFAULT_START, onChange: () => scheduleRefresh()
  });
  game.settings.register(F, "calendarLastDay", {
    name: "Calendar: the Last Day in the Equestrian reckoning",
    hint: "The year of the Last Day counted in years since Nightmare Moon's banishment (the show's first season is the year 1000). The canon doesn't give it — 1040 is an assumption. Shown as the second era, e.g. 200 PA · 1240 E.",
    scope: "world", config: true, type: Number, default: DEFAULT_LAST_DAY, onChange: () => scheduleRefresh()
  });
  game.settings.register(F, "calendarAsked", { scope: "world", config: false, type: Boolean, default: false });
  // przycisk w ustawieniach: od razu okno, bez osobnej aplikacji
  class CalendarMenu extends foundry.applications.api.ApplicationV2 {
    async render() { await promptApply(); return this; }
  }
  if (scInstalled()) {
    game.settings.registerMenu(F, "calendarApply", {
      name: "Equestria calendar in Simple Calendar",
      label: "Apply the Equestria calendar",
      hint: "Months and weekdays, seasons, the moon, both eras (PA and E) and holidays from the show in Simple Calendar Reborn.",
      icon: "fa-solid fa-calendar-days",
      type: CalendarMenu,
      restricted: true
    });
  }
}

export function registerCalendarHooks() {
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-date")) return;
    const c = currentDate();
    const box = document.createElement("div");
    box.className = "foe-date";
    box.title = lineTitle(c);
    box.innerHTML = `<i class="fa-solid fa-calendar-days"></i> <span class="foe-date-text">${esc(lineText(c))}</span> <span class="foe-date-holiday">${esc(c.holidays.map(h => t(h.name)).join(", "))}</span>`;
    if (game.user.isGM && scApi()) {
      box.classList.add("clickable");
      box.addEventListener("click", () => globalThis.SimpleCalendar?.api?.showCalendar?.());
    }
    const head = root.querySelector(".combat-tracker-header, header") ?? root;
    head.append(box);
  });
  Hooks.on("updateWorldTime", () => scheduleRefresh());
  Hooks.on("simple-calendar-date-time-change", () => scheduleRefresh());
  // pierwsze uruchomienie z modułem: MG raz dostaje pytanie
  Hooks.once("simple-calendar-ready", async () => {
    scheduleRefresh();
    const api = scApi();
    if (!api || !game.user?.isGM || get("calendarAsked", false)) return;
    if (api.isPrimaryGM && !api.isPrimaryGM()) return;
    await game.settings.set(F, "calendarAsked", true);
    await promptApply();
  });
}
