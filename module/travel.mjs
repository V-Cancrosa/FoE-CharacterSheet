/**
 * Okno podróży dla MG (logika: travel-data.mjs). Przycisk „Podróż” w zakładce aktorów.
 * Drużyna (postacie graczy) z zaznaczeniem, kto liczy się do tempa (niesieni — nie), sposób (marsz, pośpiech, bieg,
 * lot, pojazd), dystans albo czas. „Policz” — karta z planem; „Wyrusz” — rzuty w drodze, karta i przesunięcie czasu
 * świata (jedzenie, picie, promieniowanie i sen rozlicza przeskok czasu; sen liczy się, gdy postój nocny wystarczył).
 * Spotkania losowe co 4 h (w drodze i na postoju) z tabeli „Spotkania losowe”: podróż staje w chwili spotkania,
 * karta ma przycisk „Kontynuuj podróż” na resztę trasy.
 */
import { t, N_ } from "./i18n.mjs";
import { trackedActors } from "./survival.mjs";
import { travelSleepHint } from "./sleep.mjs";
import { dateAt } from "./calendar.mjs";
import { currentWeather, weatherSummary } from "./weather.mjs";
import { MFD_STEPS } from "./data.mjs";
import {
  rateOf, partySpeed, plan, simulate, ENCOUNTER_EVERY, ENCOUNTER_CHANCE, movingPerDay, encounterAt, phaseAt, longestCamp, milesAfter
} from "./travel-data.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const { DialogV2 } = foundry.applications.api;

const MODE_LABEL = () => ({
  walk: t("Walking (healthy, unhurried pace)"), hurry: t("Hurried pace (×2; END every 2 h)"), run: t("All-out run (×4; END ¼ every hour)"),
  fly: t("Flight (×2; Flight ¾ every hour)"), vehicle: t("Vehicle (the pullers' speed)")
});
const ENC_LABEL = {
  none: N_("no encounters"), rare: N_("rare ({c}% every {n} h)"), normal: N_("normal ({c}% every {n} h)"),
  often: N_("frequent ({c}% every {n} h)"), danger: N_("very frequent ({c}% every {n} h)")
};
const encDefault = () => { try { return game.settings.get(F, "travelEncounters") || "normal"; } catch { return "normal"; } };
const hoursText = h => {
  const d = Math.floor(h / 24), r = Math.round((h - d * 24) * 10) / 10;
  return [d ? t("{n} d", { n: d }) : "", r || !d ? t("{n} h", { n: r }) : ""].filter(Boolean).join(" ");
};

function members() {
  const scene = game.scenes?.active;
  const onScene = new Set([...(scene?.tokens ?? [])].map(td => td.actor?.id));
  return trackedActors().map(a => ({
    id: a.id, name: a.name, speed: Number(a.system.speed) || 0, fly: Number(a.system.flySpeed) || 0, canFly: !!a.system.canFly,
    end: Number(a.system.attributes?.end?.tn) || 0, flight: Number(a.system.skills?.flight?.tn) || 0,
    pace: !onScene.size || onScene.has(a.id)
  }));
}

/** Odczyt formularza → wszystko, co potrzebne do planu. */
function read(form, list) {
  const e = form.elements;
  const mode = e.mode.value;
  const ms = list.map(m => ({ ...m, pace: !!form.querySelector(`input[name="pace-${m.id}"]`)?.checked }));
  const ps = partySpeed(ms, mode);
  const speed = mode === "vehicle" ? Number(e.vspeed.value) || 0 : ps.speed;
  const by = e.by.value;
  const p = plan({ speed, mode, miles: by === "miles" ? Number(e.miles.value) || 0 : null, hours: by === "hours" ? Number(e.hours.value) || 0 : null });
  const enc = Number(e.enc?.value) || 0;
  return { mode, ms, ps, speed, p, by, enc };
}

function preview(r) {
  const lines = [];
  if (r.mode !== "vehicle" && !r.ps.slowest) return `<b class="warn">${esc(t("Tick at least one character who moves on their own."))}</b>`;
  if (r.ps.grounded.length) lines.push(`<b class="warn">${esc(t("Can't fly: {list}", { list: r.ps.grounded.map(m => m.name).join(", ") }))}</b>`);
  if (!r.p.rate.hourly) return `<b class="warn">${esc(t("Speed 0 — the group can't move."))}</b>`;
  const rate = rateOf(r.speed);
  lines.push(esc(t("Pace: speed {s}{who} — {h} mi/h, {d} mi/day (Table XXXIV)", { s: r.speed, who: r.ps.slowest && r.mode !== "vehicle" ? ` (${r.ps.slowest.name})` : "", h: r.p.rate.hourly, d: rate.day })));
  lines.push(`<b>${esc(t("{mi} mi in {time}", { mi: r.p.miles, time: hoursText(r.p.total) }))}</b>`);
  if (["hurry", "run", "fly"].includes(r.mode)) lines.push(esc(t("Plus stops after failed rolls — rolled on departure.")));
  if (r.mode !== "walk" && r.mode !== "vehicle" && r.p.total > 12) lines.push(`<span class="warn">${esc(t("No night stops at this pace — consider splitting the trip into days."))}</span>`);
  return lines.map(l => `<div>${l}</div>`).join("");
}

const d100 = () => Math.floor(Math.random() * 100) + 1;
const d6 = () => Math.floor(Math.random() * 6) + 1;

export async function openTravel() {
  if (!game.user.isGM) return null;
  const list = members();
  if (!list.length) return ui.notifications.warn(t("No player characters to travel with."));
  const modes = MODE_LABEL();
  const content = `<div class="foe-dialog foe-travel">
    <div class="trv-party">${list.map(m => `<label class="atk-row atk-check"><input type="checkbox" name="pace-${m.id}" ${m.pace ? "checked" : ""}>
      <span>${esc(m.name)}</span><small>${esc(t("speed {s}{f}", { s: m.speed, f: m.canFly ? t(", flies") : "" }))}</small></label>`).join("")}</div>
    <p class="hint">${esc(t("Ticked — counts towards the pace (moving on their own). Untick those being carried or riding."))}</p>
    <label class="atk-row">${esc(t("How"))} <select name="mode">${Object.entries(modes).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></label>
    <label class="atk-row trv-vehicle" hidden>${esc(t("Vehicle speed (the slowest puller)"))} <input type="number" name="vspeed" min="0" step="5" value="${Math.min(...list.map(m => m.speed))}"></label>
    <label class="atk-row">${esc(t("Plan by"))} <select name="by"><option value="miles">${esc(t("distance"))}</option><option value="hours">${esc(t("time"))}</option></select></label>
    <label class="atk-row trv-miles">${esc(t("Distance (mi)"))} <input type="number" name="miles" min="0" step="1" value="20"></label>
    <label class="atk-row trv-hours" hidden>${esc(t("Time (h)"))} <input type="number" name="hours" min="0" step="0.5" value="8"></label>
    <label class="atk-row">${esc(t("Random encounters"))} <select name="enc">${Object.entries(ENCOUNTER_CHANCE).map(([k, v]) => `<option value="${v}" ${k === encDefault() ? "selected" : ""}>${esc(t(ENC_LABEL[k], { c: v, n: ENCOUNTER_EVERY }))}</option>`).join("")}</select></label>
    <div class="atk-info trv-preview"></div>
    <p class="hint">${esc(t("Departing moves world time: food, water, radiation and sleep are settled by the time skip (a trip of a day or more includes night camps — it counts as sleep; a shorter one doesn't)."))}</p></div>`;
  const choice = await DialogV2.wait({
    window: { title: t("Travel across the wasteland") }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 480 }, content, rejectClose: false,
    render: (ev, dlg) => {
      const form = dlg.element.querySelector("form") ?? dlg.element;
      const upd = () => {
        const e = form.elements;
        form.querySelector(".trv-vehicle").hidden = e.mode.value !== "vehicle";
        form.querySelector(".trv-miles").hidden = e.by.value !== "miles";
        form.querySelector(".trv-hours").hidden = e.by.value !== "hours";
        form.querySelector(".trv-preview").innerHTML = preview(read(form, list));
      };
      form.addEventListener("input", upd);
      form.addEventListener("change", upd);
      upd();
    },
    buttons: [
      { action: "calc", label: t("Plan only"), icon: "fa-solid fa-map", callback: (ev, btn) => ({ go: false, r: read(btn.form, list) }) },
      { action: "go", label: t("Set out"), icon: "fa-solid fa-person-hiking", default: true, callback: (ev, btn) => ({ go: true, r: read(btn.form, list) }) }
    ]
  });
  if (!choice) return null;
  const key = Object.entries(ENCOUNTER_CHANCE).find(([, v]) => v === choice.r.enc)?.[0];
  if (key) try { await game.settings.set(F, "travelEncounters", key); } catch { /* bez zapamiętania */ }
  return travel(choice.r, choice.go);
}

/**
 * Podróż: r — { mode, speed, p (plan), ms/ps (z okna) albo rollers (kontynuacja), by, enc (szansa spotkania) }.
 * Spotkanie losowe zatrzymuje podróż: czas idzie do chwili spotkania, karta z resztą trasy i przyciskiem „Kontynuuj”.
 */
export async function travel(r, go) {
  if (!r.p.rate.hourly || (r.mode !== "vehicle" && r.ps && !r.ps.slowest)) return ui.notifications.warn(t("The group can't move — check the speed and who counts towards the pace."));
  if (r.ps?.grounded?.length) return ui.notifications.warn(t("Can't fly: {list}", { list: r.ps.grounded.map(m => m.name).join(", ") }));
  const rollers = r.rollers ?? r.ms.filter(m => m.pace).map(m => ({ name: m.name, end: m.end, flight: m.flight }));
  // pogoda (FoE albo Weather Forging na oglądanej scenie) zmienia rzuty Flight jak w walce (s. 628)
  const weather = currentWeather();
  const wSteps = Number(weather.acc?.steps) || 0, wMod = Number(weather.acc?.mod) || 0;
  const flyF = f => { const i = MFD_STEPS.findIndex(s => s.f === f); return i < 0 ? f : MFD_STEPS[Math.max(0, Math.min(MFD_STEPS.length - 1, i - wSteps))].f; };
  const roll = (tn, f, kind) => (kind === "flight" ? d100() <= Math.floor(tn * flyF(f)) + wMod : d100() <= Math.floor(tn * f));
  const sim = go ? simulate(r.mode, r.p.moving, rollers, roll, d6) : { extra: 0, log: [] };
  const fullTotal = r.p.total + sim.extra;
  const mDay = movingPerDay(r.p, r.mode);
  const chance = Number(r.enc) || 0;
  const encAt = go ? encounterAt(fullTotal, chance, d100) : null;
  const total = encAt ?? fullTotal;
  // postoje po rzutach przed spotkaniem (przybliżenie: liczone w chwili rzutu)
  let extraBefore = 0;
  for (const l of sim.log) if (l.who.length && l.at < total) extraBefore += l.kind === "run" ? l.rest : l.kind === "flight" ? 0 : 1;
  const covered = encAt == null ? r.p.miles : milesAfter({ speed: r.speed, mode: r.mode, e: total, extraBefore, maxMiles: r.p.miles });
  const KIND = { hurry: s => t("END {s} (hurried pace)", { s }), run: s => t("END {s} (run)", { s }), flight: s => t("Flight {s}", { s }), flyEnd: s => t("END {s} (long flight)", { s }) };
  const logLines = sim.log.filter(l => l.at <= total && (l.who.length || l.kind !== "flight")).map(l => {
    const what = KIND[l.kind](l.step);
    if (!l.who.length) return t("Hour {h}: {what} — everyone passes.", { h: l.at, what });
    const cons = l.kind === "hurry" ? t("the group stops for an hour") : l.kind === "run" ? t("exhausted for {n} h", { n: l.rest }) : l.kind === "flyEnd" ? t("lands and rests for an hour") : t("the GM decides what happens");
    return t("Hour {h}: {what} — failed: {who} ({cons}).", { h: l.at, what, who: l.who.join(", "), cons });
  });
  const modes = MODE_LABEL();
  const camp = longestCamp(total, mDay);
  const lines = [
    t("{mode}: {mi} mi, pace {s} ({h} mi/h).", { mode: modes[r.mode], mi: r.p.miles, s: r.speed, h: r.p.rate.hourly }),
    t("On the road: {time}{extra}.", { time: hoursText(fullTotal), extra: sim.extra ? t(" (incl. {n} h of stops)", { n: sim.extra }) : "" }),
    go ? t("Random encounters: {c}% every {n} h.", { c: chance, n: ENCOUNTER_EVERY }) : "",
    r.mode === "fly" && (wSteps || wMod) ? t("Weather: {w} — {fx}.", { w: weather.label, fx: weatherSummary(weather) }) : "",
    t("Departure: {d}", { d: dateAt(game.time.worldTime) }),
    go ? (encAt != null ? t("Encounter: {d}", { d: dateAt((Number(game.time.worldTime) || 0) + Math.round(total * 3600)) })
      : t("Arrival: {d}", { d: dateAt((Number(game.time.worldTime) || 0) + Math.round(total * 3600)) }))
      : t("Arrival: {d}", { d: dateAt((Number(game.time.worldTime) || 0) + Math.round(fullTotal * 3600)) }),
    ...logLines,
    !go ? t("Plan only — world time unchanged.") : encAt != null ? "" : camp ? t("Night camps on the way — counts as sleep.") : t("Under a day on the road — no proper sleep.")
  ].filter(Boolean);
  let warn = "", buttons = "";
  const remaining = Math.max(0, Math.round((r.p.miles - covered) * 10) / 10);
  if (encAt != null) {
    const where = phaseAt(encAt, mDay) === "camp" ? t("at the night camp") : t("on the road");
    warn = t("Encounter after {time} — {where}! Covered {a} mi, {b} mi to go.", { time: hoursText(encAt), where, a: covered, b: remaining });
    buttons = `<div class="fc-confirm"><button type="button" class="foe-luck" data-action="foeTravelContinue"><i class="fa-solid fa-person-hiking"></i> ${esc(t("Continue the journey"))}</button></div>`;
  }
  const rest = encAt != null ? { mode: r.mode, speed: r.speed, rollers, enc: chance, by: "miles", miles: remaining, slowest: r.ps?.slowest?.name ?? r.slowest ?? "" } : null;
  await ChatMessage.create({
    speaker: { alias: t("Travel") },
    content: `<div class="foe-card wounds foe-travel-card"><div class="fc-tag"><span>PIPBUCK // ${esc(t("TRAVEL"))}</span><span><i class="fa-solid fa-map"></i></span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}
      ${warn ? `<div class="fc-meta"><b class="warn">${esc(warn)}</b></div>` : ""}${buttons}</div>`,
    flags: rest ? { [F]: { travel: { rest, state: "open" } } } : {}
  });
  if (!go || !total) return null;
  const to = (Number(game.time.worldTime) || 0) + Math.round(total * 3600);
  travelSleepHint(to, camp);
  await game.time.advance(Math.round(total * 3600));
  if (encAt != null) await drawEncounter(phaseAt(encAt, mDay));
  return { total, encAt, covered, remaining };
}

/** Wynik z tabeli „Spotkania losowe” (folder Tabele FoE); bez tabeli — podpowiedź dla MG. */
async function drawEncounter(phase) {
  const table = game.tables?.find(tb => tb.getFlag?.(F, "tableId") === "encounters");
  if (!table) {
    ui.notifications.warn(t("No “Random Encounters” table in the world — import it with the “FoE Tables” button in the Roll Tables tab."));
    return null;
  }
  return table.draw({ rollMode: game.settings.get("core", "rollMode") });
}

/** Przycisk „Kontynuuj podróż” na karcie (MG). */
export async function continueFrom(message) {
  const tr = message?.flags?.[F]?.travel;
  if (!game.user.isGM || !tr || tr.state !== "open") return null;
  await message.update({ [`flags.${F}.travel.state`]: "done", content: String(message.content ?? "").replace(/<div class="fc-confirm">[\s\S]*?<\/div>/, `<div class="fc-meta"><b>${esc(t("Journey continued."))}</b></div>`) });
  const x = tr.rest;
  const p = plan({ speed: x.speed, mode: x.mode, miles: x.miles });
  return travel({ mode: x.mode, speed: x.speed, p, rollers: x.rollers, enc: x.enc, by: "miles", slowest: x.slowest }, true);
}

export function registerTravel() {
  game.settings.register(F, "travelEncounters", { scope: "world", config: false, type: String, default: "normal" });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const tr = message.flags?.[F]?.travel;
    if (!tr) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const box = root?.querySelector?.(".foe-travel-card .fc-confirm");
    if (!box) return;
    if (!game.user.isGM || tr.state !== "open") { box.remove(); return; }
    box.querySelector("[data-action=foeTravelContinue]")?.addEventListener("click", async ev => {
      ev.preventDefault();
      for (const b of box.querySelectorAll("button")) b.disabled = true;
      try { await continueFrom(message); } catch (err) { console.error(`${F} | travel`, err); }
    });
  });
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user?.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-travel-open")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "foe-travel-open";
    btn.innerHTML = `<i class="fa-solid fa-map"></i> ${esc(t("Travel (Fallout: Equestria)"))}`;
    btn.addEventListener("click", ev => { ev.preventDefault(); openTravel(); });
    (root.querySelector(".header-actions, .directory-header") ?? root).append(btn);
  });
}
