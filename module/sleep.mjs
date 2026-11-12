/**
 * Sen i niewyspanie na karcie (logika: sleep-data.mjs). Flaga aktora foe-rpg.sleep.
 *   - Odpoczynek (przycisk „Odpocznij”) ze snem na leżąco ≥ potrzeby rasy zeruje licznik; przeskok czasu dłuższy niż
 *     potrzeba snu też (postacie śpią w tym czasie), chyba że MG wybrał „pomiń”.
 *   - Upływ czasu (aktywny MG): kara INT/END (cecha „Niewyspanie”), rzuty END co godzinę po granicy (porażka — zasypia;
 *     budzi go rana na godzinę albo pełny sen), wyczerpanie po 48 h ponad granicę — decyzja MG (END ½, porażka: śmierć).
 *   - Kawa, Daturana: wydłużają granicę o rzut z opisu.
 * Opcja świata sleepRules (domyślnie włączona).
 */
import { t } from "./i18n.mjs";
import { attrTest, passed } from "./attr-test.mjs";
import { deadly, registerConfirmAction } from "./confirm.mjs";
import { toggleStatus } from "./conditions.mjs";
import { isGhoul, isAlicorn } from "./body.mjs";
import {
  freshSleep, awakeHours, overHours, sleepPenalty, checksDue, slept, stimFormula, limitHours, needHours, crashHours, NO_SLEEP_RADS, EXHAUSTION_HOURS
} from "./sleep-data.mjs";

const F = "foe-rpg";
const H = 3600;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const setting = (key, fallback = true) => { try { return game.settings.get(F, key) ?? fallback; } catch { return fallback; } };
const now = () => Number(game.time?.worldTime) || 0;
const ownersAndGM = actor => game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
const race = actor => actor?.system?.race;
const asleepStatus = () => (CONFIG.statusEffects?.some(s => s.id === "sleep") ? "sleep" : "unconscious");

export const sleepOn = actor => actor?.type === "character" && setting("sleepRules");
export const sleepState = actor => actor?.flags?.[F]?.sleep ?? null;
const save = (actor, st) => actor.setFlag(F, "sleep", st);

function card(actor, lines, { warn = "" } = {}) {
  if (!lines.length && !warn) return null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: ownersAndGM(actor),
    content: `<div class="foe-card wounds"><div class="fc-tag"><span>PIPBUCK // ${esc(t("SLEEP"))}</span><span>${esc(actor.name)}</span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}
      ${warn ? `<div class="fc-meta"><b class="warn">${esc(warn)}</b></div>` : ""}</div>`
  });
}

/** Ghul albo alikorn z co najmniej 100 radami w ciągu ostatnich dwóch dni — nie potrzebuje snu. */
function radSleeper(actor) {
  if (!isGhoul(actor) && !isAlicorn(actor)) return false;
  const log = actor.flags?.[F]?.radlog;
  return (Number(log?.today) || 0) + (Number(log?.prev) || 0) >= NO_SLEEP_RADS;
}

/** Cecha „Niewyspanie”: −n do INT i END (usuwana przy n = 0). */
async function setPenalty(actor, n) {
  const feat = actor.items.find(i => i.type === "feature" && i.flags?.[F]?.sleepPenalty);
  const cur = feat ? -(Number(feat.system.effects?.find(e => e.target === "int")?.value) || 0) : 0;
  if (cur === n) return false;
  if (!n) { if (feat) await actor.deleteEmbeddedDocuments("Item", [feat.id]); return true; }
  const effects = ["int", "end"].map(a => ({ type: "tempAttr", target: a, value: -n, when: "" }));
  if (feat) await feat.update({ "system.effects": effects });
  else await actor.createEmbeddedDocuments("Item", [{
    name: t("Sleep deprivation"), type: "feature", img: `systems/${F}/icons/feature.svg`, flags: { [F]: { sleepPenalty: true } },
    system: { kind: "other", active: true, effects, description: `<p>${esc(t("Pp. 479–480: −1 to INT and END for every 2 hours awake past the race's limit. Gone after a full sleep."))}</p>` }
  }]);
  return true;
}

/** Pełny sen zakończony w chwili end (h godzin). Zwraca linię na kartę albo "". */
export async function recordSleep(actor, hours, end = now()) {
  if (!sleepOn(actor)) return "";
  const r = slept(sleepState(actor), end, hours, race(actor));
  if (!r.full) return t("Too short to count as sleep ({n} h of {need} h in a row).", { n: hours, need: needHours(race(actor)) });
  const was = sleepState(actor)?.asleep;
  await save(actor, r.st);
  await setPenalty(actor, 0);
  if (was && actor.statuses?.has?.(asleepStatus())) await toggleStatus(actor, asleepStatus(), false);
  return t("Slept: the sleep counter starts again.");
}

/** Używka z opisu („cannot sleep for 2d4 hours”): wydłuża granicę. Zwraca linię albo "". */
export async function stimulant(actor, text) {
  const f = stimFormula(text);
  if (!f || !sleepOn(actor)) return "";
  const roll = await new Roll(f).evaluate();
  const st = sleepState(actor) ?? freshSleep(now());
  await save(actor, { ...st, extra: (Number(st.extra) || 0) + roll.total });
  return t("Can't sleep and keeps going without rolls: +{n} h ({f}).", { n: roll.total, f });
}

/**
 * Podpowiedź z podróży: przeskok kończący się w chwili to liczy sen (slept) albo nie (podróż krótsza niż doba — w marszu
 * kucyk nie leży). Pamiętana tylko u MG, do rozliczenia tego przeskoku.
 */
let HINT = null;
export const travelSleepHint = (to, slept) => { HINT = { to, slept }; };
const hintFor = to => (HINT && HINT.to === to ? HINT.slept : null);

/** Upływ czasu (aktywny MG). dt — sekundy od poprzedniego. */
export async function sleepTick(actor, w = now(), dt = 0) {
  if (!sleepOn(actor) || actor.system?.dead || actor.statuses?.has?.("dead")) return;
  let st = sleepState(actor);
  if (!st) return save(actor, freshSleep(w));
  // długi upływ czasu naraz (przeskok bez pytań) — postać w tym czasie spała
  if (dt >= needHours(race(actor)) * H && !st.asleep && hintFor(w) !== false) { await recordSleep(actor, dt / H, w); return; }
  if (radSleeper(actor)) {
    if (awakeHours(st, w) > 1 || st.asleep) { await save(actor, freshSleep(w)); await setPenalty(actor, 0); }
    return;
  }
  // zasnął z wyczerpania: budzi się po pełnym śnie
  if (st.asleep) {
    if (w - st.asleep.at >= st.asleep.need * H) {
      await save(actor, freshSleep(w));
      await setPenalty(actor, 0);
      await toggleStatus(actor, st.asleep.out ? "unconscious" : asleepStatus(), false);
      await card(actor, [t("{name} wakes up after {n} h of sleep — rested.", { name: actor.name, n: st.asleep.need })]);
    }
    return;
  }
  await setPenalty(actor, sleepPenalty(st, w, race(actor)));
  for (const c of checksDue(st, w, race(actor))) {
    st = { ...st, checked: c.at };
    await save(actor, st);
    if (c.kind === "exhaust") {
      await deadly(actor, "sleep-exhaust", {}, {
        title: t("{name}: 48 hours awake past the limit — exhaustion.", { name: actor.name }),
        text: t("Handbook p. 480: END ½ — critical success: another hour; success: passes out; failure: death.")
      });
      return;
    }
    const res = await attrTest(actor, "end", t("Staying awake (END), {h} h on the hooves", { h: Math.floor(awakeHours(st, c.at)) }), "1",
      { notes: [t("failure — falls asleep mid-action (p. 479)"), t("hourly roll: MFD 1 (the handbook gives none)")], check: { kind: "sleep" } });
    if (!passed(res)) return fallAsleep(actor, st, c.at);
  }
}

async function fallAsleep(actor, st, at) {
  const need = crashHours(race(actor));
  await save(actor, { ...st, asleep: { at, need } });
  await toggleStatus(actor, asleepStatus(), true);
  return card(actor, [t("{name} falls asleep mid-action. A wound wakes them for an hour; otherwise they sleep {n} h.", { name: actor.name, n: need })]);
}

async function playExhaust(actor) {
  const st = sleepState(actor);
  if (!st || st.asleep || overHours(st, now(), race(actor)) < EXHAUSTION_HOURS) return card(actor, [t("{name} has slept in the meantime — nothing happens.", { name: actor.name })]);
  const res = await attrTest(actor, "end", t("Exhaustion (END ½)"), "1/2", { notes: [t("critical success — another hour; success — passes out; failure — death (p. 480)")] });
  if (res === "crit-success") return card(actor, [t("{name} holds on for another hour.", { name: actor.name })]);
  if (passed(res)) {
    await save(actor, { ...st, asleep: { at: now(), need: crashHours(race(actor)), out: true } });
    await toggleStatus(actor, "unconscious", true);
    return card(actor, [t("{name} passes out from exhaustion and sleeps {n} h.", { name: actor.name, n: crashHours(race(actor)) })]);
  }
  await toggleStatus(actor, "dead", true);
  return card(actor, [], { warn: t("{name} dies of exhaustion.", { name: actor.name }) });
}

/** Udany przerzut kartą szczęścia rzutu „nie zasnąć”: jednak nie śpi. */
export async function sleepReroll(actor, res) {
  const st = sleepState(actor);
  if (!passed(res) || !st?.asleep || st.asleep.out) return null;
  await save(actor, { ...st, asleep: null });
  await toggleStatus(actor, asleepStatus(), false);
  return card(actor, [t("Luck card: {name} stays awake after all.", { name: actor.name })]);
}

// ---------- przeskok czasu ----------
/** Zamrożenie na czas decyzji MG: licznik przesuwa się o dt (nic się nie dzieje). */
export function frozenSleep(st, dt) {
  if (!st) return null;
  return { ...st, since: (Number(st.since) || 0) + dt, checked: st.checked ? st.checked + dt : st.checked ?? null, asleep: st.asleep ? { ...st.asleep, at: st.asleep.at + dt } : null };
}
/** Po decyzji MG: przeskok ≥ potrzeby snu — postacie spały; krótszy — liczy się czuwanie. food "skip" — zostaje zamrożone. */
export async function resolveSleep(actor, snap, food, from, to) {
  if (!sleepOn(actor) || food === "skip") return "";
  if (to - from >= needHours(race(actor)) * H && !snap?.asleep && hintFor(to) !== false) return recordSleep(actor, (to - from) / H, to);
  if (snap) await save(actor, snap);
  await sleepTick(actor, to, 0);
  return "";
}

/** Wiersz do sekcji zdrowia na karcie (albo null). */
export function sleepRow(actor) {
  if (!sleepOn(actor)) return null;
  const st = sleepState(actor);
  if (!st) return null;
  const w = now(), r = race(actor);
  if (st.asleep) return { name: t("Asleep"), desc: (n => st.asleep.out ? t("passed out from exhaustion: {n} h left", { n }) : t("fell asleep: {n} h left (a wound wakes them for an hour)", { n }))(Math.max(0, Math.ceil((st.asleep.at + st.asleep.need * H - w) / H))), alert: true };
  if (radSleeper(actor)) return null;
  const awake = awakeHours(st, w), limit = limitHours(r) + (Number(st.extra) || 0);
  if (awake < limit * 0.75) return null;
  const pen = sleepPenalty(st, w, r), over = overHours(st, w, r);
  const parts = [t("{a} h on the hooves (limit {l} h)", { a: Math.floor(awake), l: limit })];
  if (over > 0) parts.push(t("END roll every hour"));
  if (pen) parts.push(t("INT and END −{n}", { n: pen }));
  if (over >= EXHAUSTION_HOURS - 6) parts.push(t("exhaustion at {h} h past the limit", { h: EXHAUSTION_HOURS }));
  return { name: t("Lack of sleep"), desc: parts.join(" · "), alert: over > 0 };
}

export function registerSleep() {
  game.settings.register(F, "sleepRules", {
    name: "Sleep and sleep deprivation (pp. 479–480)",
    hint: "Ponies need 2 hours lying down every 48 hours, other races 8 hours a day. Past that: −1 INT and END per 2 hours, an END roll every hour (failure — falls asleep), and after 48 more hours exhaustion (a GM decision). Resting with sleep or a long time skip counts as sleep.",
    scope: "world", config: true, type: Boolean, default: true
  });
  registerConfirmAction("sleep-exhaust", playExhaust);
  // rana budzi śpiącego na godzinę (s. 479)
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    const st = sleepState(actor);
    if (!st?.asleep || st.asleep.out) return;
    const locs = changes.system?.locations ?? {};
    if (Object.entries(locs).some(([k, v]) => v?.wounds != null && Number(v.wounds) > (Number(actor.system.locations?.[k]?.wounds) || 0))) {
      foundry.utils.setProperty(changes, `flags.${F}.sleep.asleep`, null);
      foundry.utils.setProperty(changes, `flags.${F}.sleep.checked`, now());
      options.foeWake = true;
    }
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (!options?.foeWake || userId !== game.user.id) return;
    toggleStatus(actor, asleepStatus(), false).catch(() => {});
    card(actor, [t("{name} is woken by the wound — awake for an hour before the next END roll.", { name: actor.name })]);
  });
}
