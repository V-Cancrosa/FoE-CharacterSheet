/**
 * Jedzenie, picie i promieniowanie z upływem czasu świata (zasady i obliczenia: survival-data.mjs, kary: body.mjs).
 *   - „Zjedz” / „Wypij” przy produktach z kategorii „Jedzenie i picie”: posiłki, nawodnienie, rady (Iron Stomach — połowa,
 *     odporność na promieniowanie), leczenie ran (bez okaleczeń) i dieta rasy; posiłek zdejmuje karę głodu,
 *   - głód (s. 477, tabela XXXII): o północy aktywny MG rozlicza postacie graczy — dzień bez pełnego posiłku to −1 do
 *     losowego atrybutu w cesze „Głód”, po 3 tygodniach śmierć; jedzenie niesycące — 8 h bez kar; po tygodniu głodu
 *     jedzenie za 2+ posiłki trzeba utrzymać (END ½); 4 posiłki co 4 h — +15 do rzutów END; ghule żywią się radami,
 *   - odwodnienie (s. 478–479, tabela XXXIII): co 6 h bez picia etap wyżej; aktywny MG pilnuje etapów (rany tułowia,
 *     utrata przytomności, zapaść i śmierć), rekonwalescencję liczy północ,
 *   - promieniowanie (s. 483–484, tabela XXXV): poziomy 0–7 w radach na minutę — tło sceny, regiony i źródła (kafelki;
 *     pełna dawka przy źródle, dalej słabnie z kwadratem odległości); postacie graczy na aktywnej scenie dostają sumę
 *     z upływem czasu (minus odporność); licznik Geigera w zakładce walki (PipBuck rejestruje od poziomu 2) i trzaski;
 *     silne napromieniowanie (ponad 400 radów w godzinę, nieusunięte przez 6 h) — END ¼, 1000 radów — END 1/10.
 */
import { t, tn, N_ } from "./i18n.mjs";
import { ATTRS } from "./data.mjs";
import { healWounds } from "./healing.mjs";
import { toggleStatus } from "./conditions.mjs";
import { isGhoul, isAlicorn, dehydrationLevel } from "./body.mjs";
import { deadly, registerConfirmAction } from "./confirm.mjs";
import { ruleLink } from "./rules.mjs";
import { attrTest } from "./attr-test.mjs";
import { addMutation, taintReroll, addTaint, settlementWater, sceneTaintWater } from "./taint.mjs";
import { itemTaint, TAINT_WATER } from "./taint-data.mjs";
import { sleepTick, frozenSleep, resolveSleep, sleepRow, stimulant, sleepReroll } from "./sleep.mjs";
import { feralTick, slowFeral } from "./mind.mjs";
import { needsPipbuck } from "./skin-apply.mjs";
import {
  foodInfo, dietOf, fitsDiet, foodRads, dayOf, freshState, settleDays, ambientRads, exposure, clickCount, STARVE_DEATH,
  spacedMeals, WELL_FED, mustKeepDown, whenParts, midnights, skipNeeds, pickSupplies, H6, freshThirst, thirstStage, stageAt, drink, dehydrate, settleRecovery, thirstEffects,
  thirstSats, THIRST_EVENTS, RAD_ZONES, radLevelOf, absorbedRate, GEIGER_MIN_LEVEL, radLog, radsOnDay, RADS_FOR_FOOD,
  SEVERE_WAIT, POISON_DEATH
} from "./survival-data.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const setting = (key, fallback = true) => { try { return game.settings.get(F, key) ?? fallback; } catch { return fallback; } };
const now = () => Number(game.time?.worldTime) || 0;
const today = () => dayOf(now());
const flagOf = (actor, key) => actor?.flags?.[F]?.[key] ?? null;
const stateOf = actor => flagOf(actor, "survival");
const traitNames = actor => (actor?.items ?? []).filter(i => i.type === "feature" && i.system?.active !== false).map(i => i.name);
const ownersAndGM = actor => game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
const DIET = { herbivore: N_("diet|herbivore"), omnivore: N_("diet|omnivore"), carnivore: N_("diet|carnivore") };
const rnd = () => CONFIG.Dice?.randomUniform?.() ?? Math.random();
const d6 = () => Math.ceil(rnd() * 6) || 1;
const d4 = () => Math.ceil(rnd() * 4) || 1;
const passed = r => r === "success" || r === "crit-success";
const isDead = actor => !!actor?.system?.dead || !!actor?.statuses?.has?.("dead");
/** Czy postać pije (odwodnienie włączone; ghule nie piją). */
const thirstOn = actor => actor?.type === "character" && !!setting("survivalDehydration") && !isGhoul(actor);

/** Postacie, których głód i pragnienie liczy system: postacie graczy (nie martwe). */
const tracked = () => (game.actors?.filter?.(a => a.type === "character" && a.hasPlayerOwner && !isDead(a)) ?? []);

/** Dawka do odczytu: „20 rad/min”, „6 rad/h”, „4 rady/dobę”. */
export function rateText(rate) {
  const r = Math.max(0, Number(rate) || 0);
  const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  if (r && r < 0.1) return t("{n} rads/day", { n: round(r * 1440, 0) });
  if (r && r < 1) return t("{n} rads/h", { n: round(r * 60) });
  return t("{n} rads/min", { n: r < 10 ? round(r) : Math.round(r) });
}

/** Skutki porażki automatycznych rzutów (do karty rzutu). */
const CHECK_STAKES = {
  lethal: N_("failure — death (p. 483)"),
  severe: N_("failure — a mutation, critical failure — radiation poisoning (p. 483)"),
  faint: N_("failure — passes out (p. 478)"),
  keep: N_("failure — the food comes back up (p. 477)")
};

/**
 * Rzut na END z cechami postaci (stałe modyfikatory i kroki MFD, np. +15 dobrze najedzonego). Kary tymczasowe do END
 * (choroba popromienna, odwodnienie, głód) są już w progu — karta pokazuje wyliczenie. check — { kind, … }: znacznik
 * automatycznego rzutu; udany przerzut kartą szczęścia cofa jego skutek (onReroll).
 */
async function endTest(actor, label, stepKey, check = null) {
  return attrTest(actor, "end", label, stepKey, { notes: check ? [t(CHECK_STAKES[check.kind])] : [], check });
}

/** Karta PipBucka dla gracza i MG. */
export function survivalCard(actor, lines, opts) { return card(actor, lines, opts); }
function card(actor, lines, { warn = "", rolls = [], tag = t("SURVIVAL") } = {}) {
  if (!lines.length && !warn) return null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: ownersAndGM(actor), rolls,
    content: `<div class="foe-card wounds"><div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>${esc(actor.name)}</span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}
      ${warn ? `<div class="fc-meta"><b class="warn">${esc(warn)}</b></div>` : ""}
    </div>`
  });
}

// ---------- kara głodu (cecha „Głód”) ----------
const PENALTY = {
  starvation: { name: () => t("Starvation"), desc: () => t("Table XXXII (p. 477): every day without a full meal is −1 temporarily to a random attribute. Remove this feature when the character eats (a nourishing meal); non-nourishing food lets you ignore the penalties for 8 hours.") }
};

async function addPenalty(actor, kind, attrs) {
  if (!attrs.length) return;
  const feat = actor.items.find(i => i.type === "feature" && i.flags?.[F]?.[kind]);
  const effects = foundry.utils.deepClone(feat?.system?.effects ?? []);
  for (const a of attrs) {
    const e = effects.find(x => x.type === "tempAttr" && x.target === a);
    if (e) e.value = (Number(e.value) || 0) - 1;
    else effects.push({ type: "tempAttr", target: a, value: -1, when: "" });
  }
  if (feat) await feat.update({ "system.effects": effects });
  else await actor.createEmbeddedDocuments("Item", [{
    name: PENALTY[kind].name(), type: "feature", img: `systems/${F}/icons/food.svg`, flags: { [F]: { [kind]: true } },
    system: { kind: "other", active: true, effects, description: `<p>${PENALTY[kind].desc()}</p>` }
  }]);
}

async function clearPenalty(actor, kind) {
  const feats = actor.items.filter(i => i.type === "feature" && i.flags?.[F]?.[kind]);
  if (feats.length) await actor.deleteEmbeddedDocuments("Item", feats.map(i => i.id));
  return feats.length > 0;
}
const starving = actor => (actor?.items ?? []).some(i => i.type === "feature" && i.flags?.[F]?.starvation);

// ---------- rozliczenie dnia (północ) ----------
/** Rozlicz dni od ostatniego rozliczenia do dziś: głód i doba rekonwalescencji po odwodnieniu (karta dla gracza i MG). */
export async function settleActor(actor, day = today()) {
  const hunger = setting("survivalHunger");
  const st = stateOf(actor);
  if (!st || day < st.day) return actor.setFlag(F, "survival", freshState(day, st ?? {}));
  if (day === st.day) return null;
  const lines = [];

  const th = flagOf(actor, "thirst");
  if (th?.rec && thirstOn(actor)) {
    const r = settleRecovery(th, st.day);
    await actor.setFlag(F, "thirst", r.th);
    if (r.done) lines.push(t("Dehydration: recovered — the penalties are gone."));
    else if (r.counted) lines.push(t("Dehydration: a day of recovery done ({n} left).", { n: tn(r.th.rec.days, "{n} day", "{n} days") }));
  }

  if (!hunger) {
    await actor.setFlag(F, "survival", freshState(day, st));
    return card(actor, lines);
  }
  // ghule: co najmniej 5 radów na dobę zamiast jedzenia; alikorny mogą nimi zastąpić posiłek (s. 477)
  const ghoul = isGhoul(actor);
  const rads = radsOnDay(flagOf(actor, "radlog"), st.day);
  const byRads = (ghoul || isAlicorn(actor)) && rads >= RADS_FOR_FOOD;
  const res = settleDays(st, day, { roll: d6, fed: ghoul ? byRads : byRads || null });
  await actor.setFlag(F, "survival", res.state);
  if (byRads && await clearPenalty(actor, "starvation")) lines.push(t("Radiation fed {name} ({n} rads that day): the starvation penalties are gone.", { name: actor.name, n: rads }));
  let warn = "";
  if (res.starve.length) {
    await addPenalty(actor, "starvation", res.starve);
    const n = tn(res.starve.length, "{n} day", "{n} days");
    const list = res.starve.map(a => ATTRS[a]).join(", ");
    lines.push(ghoul ? t("Hunger (ghoul): {n} with fewer than {r} rads — {list} −1 (feature “Starvation”).", { n, r: RADS_FOR_FOOD, list })
      : t("Hunger: {n} without a full meal — {list} −1 (feature “Starvation”).", { n, list }));
    lines.push(t("Days in a row without food: {h}.", { h: res.state.hungerDays }));
    if (res.starvedToDeath) await askStarveDeath(actor);
  }
  return card(actor, lines, { warn });
}

const askStarveDeath = actor => deadly(actor, "starve-death", {}, {
  title: t("{name} has starved for {n} days.", { name: actor.name, n: STARVE_DEATH }),
  text: t("Handbook p. 477: after 3 weeks of starvation the character dies.")
});
async function playStarveDeath(actor) {
  await toggleStatus(actor, "dead", true);
  return card(actor, [], { warn: t("{name} dies of starvation ({n} days without food).", { name: actor.name, n: STARVE_DEATH }) });
}

/** Dzisiejszy stan do karty postaci: „dziś: posiłki 1/1 · nawodniony 18 h”. */
export function survivalNote(actor) {
  if (actor?.type !== "character") return "";
  const hunger = setting("survivalHunger"), thirst = thirstOn(actor);
  if (!hunger && !thirst) return "";
  const st = stateOf(actor);
  const fresh = !st || st.day !== today();
  const parts = [];
  if (hunger) {
    if (isGhoul(actor)) parts.push(t("rads {a}/{b}", { a: radsOnDay(flagOf(actor, "radlog"), today()), b: RADS_FOR_FOOD }));
    else parts.push(t("meals {a}/{b}", { a: fresh ? 0 : st.meals, b: 1 }));
    if (st?.hungerDays) parts.push(t("without food: {n}", { n: tn(st.hungerDays, "{n} day", "{n} days") }));
  }
  if (thirst) {
    const th = flagOf(actor, "thirst"), w = now();
    const stage = thirstStage(th, w);
    if (stage) parts.push(t("dehydration: stage {n}/12", { n: stage }));
    else if (th && th.until > w) parts.push(t("hydrated for {h} h", { h: Math.floor((th.until - w) / 3600) }));
    else if (th) parts.push(t("thirsty — stage 1 in {h} h", { h: Math.max(0, Math.ceil((th.until + H6 - w) / 3600)) }));
    if (th?.rec) parts.push(t("recovery: drinks {a}/{b} today, {n} left", { a: th.rec.day === today() ? th.rec.count : 0, b: th.rec.need, n: tn(th.rec.days, "{n} day", "{n} days") }));
  }
  const last = [hunger && st?.lastMeal != null ? t("meal {when}", { when: whenText(st.lastMeal) }) : "", thirst && flagOf(actor, "thirst")?.last != null ? t("drink {when}", { when: whenText(flagOf(actor, "thirst").last) }) : ""].filter(Boolean);
  if (last.length) parts.push(t("last: {list}", { list: last.join(", ") }));
  return [t("today:"), ...parts].join(" · ").replace(": · ", ": ");
}

/** „dziś 08:00”, „wczoraj 21:30”, „3 dni temu”, „—”. */
export function whenText(time, w = now()) {
  const p = whenParts(time, w);
  if (!p) return "—";
  if (p.day === -1) return t("tomorrow {time}", { time: p.hhmm });
  if (p.day < -1) return tn(-p.day, "in {n} day", "in {n} days");
  if (p.day === 0) return t("today {time}", { time: p.hhmm });
  if (p.day === 1) return t("yesterday {time}", { time: p.hhmm });
  return tn(p.day, "{n} day ago", "{n} days ago");
}

// ---------- picie (odwodnienie, tabela XXXIII) ----------
/**
 * Nawodnienie postaci: `items` produktów (woda, napój, mikstura lecznicza). Zwraca linie do karty (bez karty).
 * potion — mikstura lecznicza: wystarcza też w ostatnich 6 h przed śmiercią (s. 479).
 */
export async function hydrate(actor, items = 1, { potion = false } = {}) {
  if (!thirstOn(actor)) return [];
  await settleActor(actor);
  const w = now();
  const before = flagOf(actor, "thirst");
  const r = drink(before, w, items, () => 2 + d4() + d4());
  const lines = [];
  const half = Math.floor((r.th.max || 0) / 2);
  if (r.kind === "ok") lines.push(t("Hydrated for {h} h.", { h: Math.floor((r.th.until - w) / 3600) }));
  else if (r.kind === "reversed") lines.push(t("Dehydration (stage {s}) reversed by the drink.", { s: r.stage }));
  else if (r.kind === "recovery") {
    lines.push(r.th.max >= 6
      ? t("Dehydration stage {s}: recovery — at least {need} drinks (2d4+2) a day for {n}; until then the penalties of stage {half}.", { s: r.stage, need: r.th.rec.need, n: tn(r.th.rec.days, "{n} day", "{n} days"), half })
      : t("Dehydration stage {s}: recovery — at least 4 drinks over a full day; until then the penalties of stage {half}.", { s: r.stage, half }));
    if (r.th.max >= 6) lines.push(t("From stage 6 the character needs medical care or supervision (Medicine or Survival MFD 1; ¾ to manage alone) — drinking too fast can kill."));
  } else lines.push(t("Recovery: {a}/{b} drinks today ({n} left).", { a: r.th.rec.count, b: r.th.rec.need, n: tn(r.th.rec.days, "{n} day", "{n} days") }));
  if (r.stage >= 11 && !potion) lines.push(t("Within 6 hours of death: water alone is not enough — healing magic is needed as well (a healing potion is enough)."));
  await actor.setFlag(F, "thirst", { ...r.th, last: w, deathAsked: false });
  if (before?.out && actor.statuses?.has?.("unconscious")) {
    await toggleStatus(actor, "unconscious", false);
    lines.push(t("{name} comes round.", { name: actor.name }));
  }
  if (await clearPenalty(actor, "thirst")) lines.push(t("The old “Dehydration” feature is removed (dehydration now works in stages)."));
  return lines;
}

async function dehydrateActor(actor) {
  if (!thirstOn(actor)) return [];
  await actor.setFlag(F, "thirst", dehydrate(flagOf(actor, "thirst"), now()));
  return [t("Dehydrating: −6 h of hydration (one more drink needed).")];
}

/** Opis etapu (od wejścia na etap; kary sumują się z poprzednimi). */
const STAGE_TEXT = {
  1: N_("Stage 1: dry mouth."),
  2: N_("Stage 2: dry throat — CHA and its skills 1 MFD step harder (optional). Up to here a drink reverses everything."),
  3: N_("Stage 3: weakening muscles — STR, END and AGI −1 (optional)."),
  4: N_("Stage 4 (24 h): slowed reflexes — SATS costs +10 AP, initiative −10."),
  5: N_("Stage 5: weakening muscles — another −1 to STR, END and AGI."),
  7: N_("Stage 7: hazy vision — all attack rolls 1 MFD step harder."),
  8: N_("Stage 8 (48 h): slowed reflexes — SATS costs another +10 AP, only one action per turn in combat."),
  9: N_("Stage 9: tunnel vision — attack rolls another MFD step harder.")
};

/** Zdarzenie etapu odwodnienia: co się stało i co zrobi „Rozegraj” (karta MG). */
const EVENT_TEXT = {
  wounds4: [N_("{name} reaches dehydration stage 6 (36 hours without water)."), N_("Organ damage: 1d4 wounds to the torso.")],
  wounds6: [N_("{name} reaches dehydration stage 10 (60 hours without water)."), N_("Organ damage: 1d6 wounds to the torso.")],
  faint: [N_("{name} reaches dehydration stage 11 (exhaustion)."), N_("END roll MFD ¾ — failure: passes out (only a drink brings them round).")],
  collapse: [N_("{name} reaches dehydration stage 12 (72 hours without water)."), N_("Collapse: unconscious; dies within an hour unless revived with water and medical attention.")]
};

/** Aktywny MG: etapy odwodnienia z upływem czasu (kary od razu; rany, utrata przytomności, zapaść i śmierć — decyzja MG). */
async function thirstTick(actor, w) {
  if (!thirstOn(actor)) return null;
  const th = flagOf(actor, "thirst");
  if (!th) {
    await actor.setFlag(F, "thirst", freshThirst(w));
    await clearPenalty(actor, "thirst");
    return null;
  }
  const stage = thirstStage(th, w);
  const seen = Number(th.seen) || 0;
  const dies = stage >= 12 && w >= stageAt(th, 12) + 3600 && !isDead(actor) && !th.deathAsked;
  if (stage === seen && !dies) return null;
  if (stage < seen) return actor.setFlag(F, "thirst", { ...th, seen: stage });
  await actor.setFlag(F, "thirst", { ...th, seen: stage, ...(dies ? { deathAsked: true } : {}) });
  const lines = [];
  for (let s = seen + 1; s <= stage; s++) {
    const ev = THIRST_EVENTS[s];
    if (ev) await deadly(actor, "thirst-event", { stage: s, ev }, { title: t(EVENT_TEXT[ev][0], { name: actor.name }), text: t(EVENT_TEXT[ev][1]) });
    else if (STAGE_TEXT[s]) lines.push(t(STAGE_TEXT[s]));
  }
  if (dies) await deadly(actor, "thirst-death", {}, {
    title: t("{name} has lain collapsed from dehydration for an hour.", { name: actor.name }),
    text: t("Handbook p. 478: the character dies (unless they were given water in the meantime).")
  });
  return card(actor, lines, { tag: t("DEHYDRATION") });
}

/** Rozegranie zdarzenia etapu (po decyzji MG albo od razu). */
async function playThirstEvent(actor, { stage, ev }) {
  const lines = [], rolls = [];
  let warn = "";
  const now0 = thirstStage(flagOf(actor, "thirst"), now());
  if (ev === "wounds4" || ev === "wounds6") {
    const roll = await new Roll(ev === "wounds4" ? "1d4" : "1d6").evaluate();
    rolls.push(roll);
    await actor.update({ "system.locations.torso.wounds": (Number(actor.system.locations?.torso?.wounds) || 0) + roll.total });
    lines.push(t("Stage {s}: organ damage — {n} wounds to the torso (only drink heals them; a healing potion removes 1 per potion).", { s: stage, n: roll.total }));
    if (actor.system.dead) { await toggleStatus(actor, "dead", true); warn = t("{name} dies of organ damage.", { name: actor.name }); }
  } else if (now0 < stage) {
    lines.push(t("{name} has had something to drink in the meantime — nothing happens.", { name: actor.name }));
  } else if (ev === "faint") {
    lines.push(t("Stage 11: exhaustion — END ¾ or pass out (only a drink brings them round)."));
    if (!actor.statuses?.has?.("unconscious") && !passed(await endTest(actor, t("Dehydration: staying conscious (END ¾)"), "3/4", { kind: "faint" }))) {
      await toggleStatus(actor, "unconscious", true);
      await actor.setFlag(F, "thirst.out", true);
      lines.push(t("{name} passes out.", { name: actor.name }));
    }
  } else if (ev === "collapse") {
    await toggleStatus(actor, "unconscious", true);
    await actor.setFlag(F, "thirst.out", true);
    warn = t("Stage 12 (72 h): {name} collapses and will die within an hour unless revived with water and medical attention (Medicine ¾; healing magic or a healing potion).", { name: actor.name });
  }
  return card(actor, lines, { warn, rolls, tag: t("DEHYDRATION") });
}
async function playThirstDeath(actor) {
  if (thirstStage(flagOf(actor, "thirst"), now()) < 12) return card(actor, [t("{name} has had something to drink in the meantime — nothing happens.", { name: actor.name })], { tag: t("DEHYDRATION") });
  await toggleStatus(actor, "dead", true);
  return card(actor, [], { warn: t("{name} dies of dehydration.", { name: actor.name }), tag: t("DEHYDRATION") });
}

// ---------- jedzenie ----------
export async function eatItem(actor, item) {
  if (!actor?.isOwner) return ui.notifications.warn(t("You don't own: {name}.", { name: actor?.name ?? "?" }));
  if ((Number(item.system.qty) || 0) < 1) return ui.notifications.warn(t("{name}: you don't have any left.", { name: item.name }));
  const info = foodInfo(item.system.description);
  const traits = traitNames(actor);
  const fits = !setting("survivalDiet") || fitsDiet(info, dietOf(actor.system.race, traits), traits.some(x => /^cannibal\b|^kanibal/i.test(x)));
  const ghoul = isGhoul(actor);
  const lines = [];

  // dzień: najpierw rozliczenie zaległych (np. MG był niezalogowany)
  await settleActor(actor);
  const st = { ...freshState(today()), ...(stateOf(actor) ?? {}) };
  if (st.day !== today()) Object.assign(st, freshState(today(), st));

  // po tygodniu głodu jedzenie za 2+ posiłki trzeba utrzymać (END ½; poza Oatmeal i Slop)
  const keep = setting("survivalHunger") && fits && !ghoul && mustKeepDown(st.hungerDays, info.meals, item.name);
  const kept = !keep || passed(await endTest(actor, t("Keeping food down after a week of starvation (END ½)"), "1/2", { kind: "keep", name: item.name, description: item.system.description }));
  await item.update({ "system.qty": Math.max(0, (Number(item.system.qty) || 0) - 1) });
  if (!kept) {
    lines.push(t("{name} can't keep it down — no nourishment, no healing.", { name: actor.name }));
    return eatCard(actor, item, info, lines);
  }
  return feed(actor, item, lines);
}

/** Skutki zjedzenia (bez zdejmowania sztuki): posiłki, picie, rady, leczenie, kary głodu. item — { name, system.description }. */
async function feed(actor, item, lines = []) {
  const info = foodInfo(item.system.description);
  const traits = traitNames(actor);
  const diet = dietOf(actor.system.race, traits);
  const cannibal = traits.some(x => /^cannibal\b|^kanibal/i.test(x));
  const fits = !setting("survivalDiet") || fitsDiet(info, diet, cannibal);
  const ghoul = isGhoul(actor);
  const w = now();
  const st = { ...freshState(today()), ...(stateOf(actor) ?? {}) };
  if (st.day !== today()) Object.assign(st, freshState(today(), st));

  const meals = fits && !ghoul ? info.meals : 0;
  if (ghoul && info.meals) lines.push(t("Ghouls live on radiation ({n} rads a day), not food.", { n: RADS_FOR_FOOD }));
  else if (!fits) lines.push(t("{name} gets no sustenance from it (diet: {diet}).", { name: actor.name, diet: t(DIET[diet]) }));
  if (meals) {
    st.meals += meals;
    st.mealTimes = [...(st.mealTimes ?? []), w];
    st.lastMeal = w;
    lines.push(t("Meals +{n} (today {a}/{b}).", { n: meals, a: st.meals, b: 1 }));
    if (spacedMeals(st.mealTimes) >= WELL_FED && st.wellFed !== today()) {
      st.wellFed = today();
      lines.push(t("Well fed (4 meals at least 4 hours apart): +15 to END rolls for the rest of the day."));
    }
  }
  // jedzenie niesycące (wbrew diecie albo „nie liczy się jako posiłek”): 8 h bez kar głodu
  if (!info.drink && !meals && !ghoul) {
    st.ignoreUntil = w + 8 * 3600;
    if (starving(actor)) lines.push(t("Non-nourishing food: the starvation penalties are ignored for the next 8 hours."));
  }
  await actor.setFlag(F, "survival", st);

  if (info.hydrate) lines.push(...await hydrate(actor, 1));
  if (info.dehydrating) lines.push(...await dehydrateActor(actor));

  const rads = foodRads(info.rads, { resist: actor.system.radResistTotal ?? 0, ironStomach: traits.some(x => /^iron stomach\b|^żelazny żołądek/i.test(x)) });
  if (rads) {
    const cur = Number(actor.system.resources?.rads?.value) || 0;
    const next = Math.max(0, cur + rads);
    await actor.update({ "system.resources.rads.value": next });
    lines.push(rads > 0 ? t("+{n} rads ({total} in total).", { n: rads, total: next }) : t("Removes {n} rads.", { n: cur - next }));
  }
  // skażone jedzenie i woda (ułamki kreski się sumują; pełna kreska — dawka z rzutami)
  const taintLine = await addTaint(actor, itemTaint(item), item.name);
  if (taintLine) lines.push(taintLine);
  if (fits && info.wounds) {
    const healed = await healWounds(actor, info.wounds, { quiet: true, source: item.name });
    if (healed?.healed) lines.push(t("Heals: {list}.", { list: healed.text }));
  }
  if (meals && await clearPenalty(actor, "starvation")) lines.push(t("A full meal: the starvation penalties are gone."));
  const stim = await stimulant(actor, item.system.description);
  if (stim) lines.push(stim);
  if (info.effects.length) lines.push(t("Effects (the GM applies them): {list}.", { list: info.effects.join("; ") }));
  return eatCard(actor, item, info, lines);
}

const eatCard = (actor, item, info, lines) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${info.drink ? t("DRINK") : t("FOOD")}</span><span><i class="fa-solid fa-utensils"></i></span></div>
    <h3>${esc(info.drink ? t("{name} drinks: {item}", { name: actor.name, item: item.name }) : t("{name} eats: {item}", { name: actor.name, item: item.name }))}</h3>
    ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}</div>`
});
/** Etykieta przycisku przy produkcie. */
export const eatLabel = item => (foodInfo(item?.system?.description).drink ? t("Drink") : t("Eat"));

/** Wiersze stanu do sekcji „Zdrowie, chemia i promieniowanie” na karcie: [{ name, desc, alert }]. */
export function survivalRows(actor) {
  if (actor?.type !== "character") return [];
  const rows = [];
  const w = now();
  const lvl = dehydrationLevel(actor, w);
  const th = flagOf(actor, "thirst");
  if (lvl) {
    const fx = thirstEffects(lvl, { optional: !!setting("dehydrationOptional") });
    const weak = fx.find(e => e.type === "tempAttr")?.value;
    const aim = fx.find(e => e.type === "mfdStep")?.value;
    const parts = [
      fx.some(e => e.type === "basedStep") ? t("CHA −1 MFD step") : "",
      weak ? t("STR, END, AGI {v}", { v: weak }) : "",
      lvl >= 4 ? t("initiative −10") : "",
      thirstSats(lvl) ? t("SATS +{n} AP", { n: thirstSats(lvl) }) : "",
      lvl >= 8 ? t("1 action per turn") : "",
      aim ? tn(-aim, "attacks {n} MFD step harder", "attacks {n} MFD steps harder") : ""
    ].filter(Boolean);
    const rec = th?.rec ? t("recovering: {a}/{b} drinks today, {n} left", { a: th.rec.day === today() ? th.rec.count : 0, b: th.rec.need, n: tn(th.rec.days, "{n} day", "{n} days") }) : "";
    rows.push({ ruleHtml: ruleLink("survival/dehydration"), name: t("Dehydration, stage {n}", { n: lvl }), desc: [parts.join(", "), rec].filter(Boolean).join(" · "), alert: lvl >= 6 });
  }
  const st = stateOf(actor);
  if (st?.ignoreUntil > w && starving(actor)) rows.push({ ruleHtml: ruleLink("survival/food"), name: t("Starvation ignored"), desc: t("for {h} h more (non-nourishing food)", { h: Math.ceil((st.ignoreUntil - w) / 3600) }) });
  if (st?.wellFed != null && st.wellFed === dayOf(w)) rows.push({ ruleHtml: ruleLink("survival/food"), name: t("Well fed"), desc: t("+15 to END rolls until midnight") });
  const log = flagOf(actor, "radlog");
  if (log?.severe && setting("radiationChecks")) rows.push({ ruleHtml: ruleLink("survival/radiation"), name: t("Severe radiation exposure"), desc: t("END ¼ roll in {h} h unless the rads are reduced (failure — a mutation)", { h: Math.max(0, Math.ceil((log.severe.at + SEVERE_WAIT - w) / 3600)) }), alert: true });
  const sr = sleepRow(actor);
  if (sr) rows.push({ ruleHtml: ruleLink("survival/sleep"), ...sr });
  if (log?.poison) rows.push({ ruleHtml: ruleLink("survival/radiation"), name: t("Radiation poisoning"), desc: t("penalties as at 800 rads; death in {h} h unless the rads are reduced (RadAway)", { h: Math.max(0, Math.ceil((log.poison.at + POISON_DEATH - w) / 3600)) }), alert: true });
  return rows;
}

// ---------- promieniowanie: tło sceny, regiony i źródła (kafelki) ----------
/** Dawka w rad/min z flagi `rads` (od 0.52); starsza flaga `radiation` była w rad/h. */
function rateOf(flags) {
  const f = flags?.[F];
  if (f?.rads && f.rads.rate !== undefined) return Math.max(0, Number(f.rads.rate) || 0);
  return Math.max(0, Number(f?.radiation) || 0) / 60;
}
export const sceneRads = scene => rateOf(scene?.flags);
/** Region z promieniowaniem: rady na minutę w środku. */
export const regionRads = region => rateOf(region?.flags);
/** Kafelek-źródło: { rate (rad/min przy źródle), range (ft) } albo null. */
export function tileSource(tile) {
  const f = tile?.flags?.[F];
  const r = f?.rads;
  const rate = r && r.rate !== undefined ? Math.max(0, Number(r.rate) || 0) : Math.max(0, Number(f?.radiation?.rate) || 0) / 60;
  const range = r?.range ?? f?.radiation?.range ?? 30;
  return rate ? { rate, range: Math.max(0, Number(range) || 0) } : null;
}
const carry = new Map();

/** Czy token stoi w regionie (Foundry śledzi to przy ruchu; zapasowo — test punktu środka). */
function inRegion(td, region) {
  if (td.regions instanceof Set) return td.regions.has(region);
  const size = td.parent?.grid?.size ?? 100;
  const c = { x: td.x + (td.width * size) / 2, y: td.y + (td.height * size) / 2, elevation: td.elevation ?? 0 };
  try { return !!(region.testPoint?.(c) ?? region.object?.testPoint?.(c, c.elevation)); } catch { return false; }
}

/** Dawka (rad/min) dla tokenu na jego scenie: { total, parts }. */
export function tokenExposure(td) {
  const scene = td?.parent;
  if (!scene) return { total: 0, parts: [] };
  const grid = { size: Number(scene.grid?.size) || 100, distance: Number(scene.grid?.distance) || 5 };
  const token = { x: Number(td.x) || 0, y: Number(td.y) || 0, w: (Number(td.width) || 1) * grid.size, h: (Number(td.height) || 1) * grid.size };
  const regions = [...(scene.regions ?? [])].filter(r => regionRads(r) && inRegion(td, r)).map(r => ({ rate: regionRads(r), name: r.name }));
  const sources = [...(scene.tiles ?? [])].map(tl => ({ tl, src: tileSource(tl) })).filter(x => x.src)
    .map(({ tl, src }) => ({ rect: { x: Number(tl.x) || 0, y: Number(tl.y) || 0, w: Number(tl.width) || 0, h: Number(tl.height) || 0 }, rate: src.rate, range: src.range, name: tl.texture?.src?.split("/").pop() ?? "" }));
  return exposure({ token, grid, ambient: sceneRads(scene), regions, sources });
}

/** Postacie graczy na aktywnej scenie z dawką (najwyższą z ich tokenów). */
function exposedOnActive() {
  const scene = game.scenes?.active;
  const out = new Map();
  for (const td of scene?.tokens ?? []) {
    const a = td.actor;
    if (a?.type !== "character" || !a.hasPlayerOwner || isDead(a)) continue;
    const e = tokenExposure(td);
    if (!out.has(a) || out.get(a).total < e.total) out.set(a, e);
  }
  return out;
}

async function irradiate(dt) {
  if (!(dt > 0)) return;
  for (const [a, e] of exposedOnActive()) {
    const resist = a.system.radResistTotal ?? 0;
    const rate = absorbedRate(e.total, resist);
    if (!rate) continue;
    const r = ambientRads(rate, dt, resist, carry.get(a.uuid) ?? 0);
    carry.set(a.uuid, r.carry);
    if (r.rads) await a.update({ "system.resources.rads.value": (Number(a.system.resources?.rads?.value) || 0) + r.rads });
  }
}

/** Aktywny MG: silne napromieniowanie (END ¼ po 6 h), choroba popromienna (śmierć po dobie), 1000 radów (END 1/10) — decyzja MG. */
export async function radiationTick(actor, w = now()) {
  if (!setting("radiationChecks") || isGhoul(actor) || isDead(actor)) return null;
  const log = flagOf(actor, "radlog");
  if (!log) return null;
  const lethal = log.lethal != null;
  const severe = !!log.severe && w >= log.severe.at + SEVERE_WAIT;
  const poisonDeath = !!log.poison && !log.poison.asked && w >= log.poison.at + POISON_DEATH;
  if (!lethal && !severe && !poisonDeath) return null;
  // najpierw zapis (żeby kolejny upływ czasu nie pytał drugi raz)
  await actor.setFlag(F, "radlog", { ...log, ...(lethal ? { lethal: null } : {}), ...(severe ? { severe: null, burst: null } : {}), ...(poisonDeath ? { poison: { ...log.poison, asked: true } } : {}) });
  if (lethal) await deadly(actor, "rad-lethal", {}, {
    title: t("{name} has absorbed 1000 rads.", { name: actor.name }),
    text: t("Handbook p. 483: END roll MFD 1/10 at once — failure: death.")
  });
  if (severe) await deadly(actor, "rad-severe", {}, {
    title: t("{name}: severe radiation exposure, not treated for 6 hours.", { name: actor.name }),
    text: t("Handbook p. 483: END roll MFD ¼ — failure: a mutation, critical failure: radiation poisoning.")
  });
  if (poisonDeath) await deadly(actor, "rad-poison-death", {}, {
    title: t("{name}: 24 hours of untreated radiation poisoning.", { name: actor.name }),
    text: t("Handbook p. 483: the character dies (unless the rads were reduced in the meantime).")
  });
  return null;
}

async function playLethal(actor) {
  if (passed(await endTest(actor, t("1000 rads: surviving (END 1/10)"), "1/10", { kind: "lethal" }))) {
    return card(actor, [t("{name} survives 1000 rads — for now (see “They Were Ponies, Once”; the GM decides what follows).", { name: actor.name })], { tag: t("RADIATION") });
  }
  if (await ghoulify(actor)) return null;
  await toggleStatus(actor, "dead", true);
  return card(actor, [], { warn: t("{name} dies of severe radiation poisoning.", { name: actor.name }), tag: t("RADIATION") });
}

/**
 * Zamiana w ghula (s. 611): postać, która umarłaby od promieniowania, rzuca END ¼ — sukces: dusza zostaje w ciele,
 * potem INT ½ (+25 z Fixation): krytyczna porażka — od razu dziki ghul, porażka — ghul, który w ciągu kilku dni zdziczeje,
 * sukces — ghul. Zwraca true, jeśli postać została ghulem (nie umiera). Opcja świata „ghoulification”.
 */
async function ghoulify(actor) {
  if (!setting("ghoulification") || isGhoul(actor) || isAlicorn(actor)) return false;
  const soul = await endTest(actor, t("Ghoulification: END ¼ (p. 611)"), "1/4");
  if (!passed(soul)) return false;
  const fix = (actor.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && /fixation|fiksacj/i.test(i.name));
  const mind = await attrTest(actor, "int", t("Ghoulification: INT ½ to keep the mind"), "1/2", { mod: fix ? 25 : 0, notes: [fix ? t("Fixation +25") : "", t("critical failure — feral at once; failure — goes feral over the next few days")].filter(Boolean) });
  const race = String(actor.system?.race ?? "");
  const feral = mind === "crit-fail", slow = mind === "fail";
  const desc = feral ? t("A feral ghoul: higher brain functions are gone — the GM takes over the character (p. 614).")
    : slow ? t("Survived as a ghoul, but will slowly go feral over the next few days (p. 611). Only a new Purpose might stop it — the GM decides.")
    : t("A sentient ghoul: radiation no longer harms, no need to eat, drink or sleep as before. Goes feral if their Purpose is lost (p. 614).");
  await actor.update({ "system.race": t("Ghoul (was: {race})", { race }) });
  await actor.setFlag(F, "radlog", { ...(flagOf(actor, "radlog") ?? {}), poison: null, lethal: null, severe: null });
  await actor.createEmbeddedDocuments("Item", [{ name: feral ? t("Feral ghoul") : slow ? t("Going feral") : t("Ghoul (from radiation)"), type: "feature",
    system: { kind: "other", active: true, effects: [], description: `<p>${esc(desc)}</p>` }, flags: { [F]: { ghoul: feral ? "feral" : slow ? "going" : "sentient" } } }]);
  if (slow) await slowFeral(actor);
  await card(actor, [t("{name} should have died of radiation — but the soul holds on: a ghoul.", { name: actor.name }), desc], { tag: t("RADIATION") });
  return true;
}
async function playSevere(actor) {
  const res = await endTest(actor, t("Severe radiation exposure (END ¼)"), "1/4", { kind: "severe" });
  const lines = [];
  if (res === "crit-fail") {
    await actor.setFlag(F, "radlog.poison", { at: now() });
    lines.push(t("Critical failure: radiation poisoning — penalties as at 800 rads; death within 24 hours unless the rads are reduced (RadAway or any treatment that lowers them)."));
  } else if (!passed(res)) {
    const idea = await addMutation(actor, "radiation");
    lines.push(t("Failure: a mutation — the Mutation hindrance is on the sheet; the GM describes it (“They Were Ponies, Once”, p. 610)."), t("Suggestion: {idea}", { idea }));
  }
  else lines.push(t("Severe radiation exposure: the END roll succeeded — nothing happens."));
  return card(actor, lines, { tag: t("RADIATION") });
}
async function playPoisonDeath(actor) {
  if (!flagOf(actor, "radlog")?.poison) return card(actor, [t("{name} was treated in time — the radiation poisoning is gone.", { name: actor.name })], { tag: t("RADIATION") });
  await actor.setFlag(F, "radlog.poison", null);
  if (await ghoulify(actor)) return null;
  await toggleStatus(actor, "dead", true);
  return card(actor, [], { warn: t("{name} dies of radiation poisoning (24 hours without treatment).", { name: actor.name }), tag: t("RADIATION") });
}

// ---------- upływ czasu (wołany przez timeskip.mjs, aktywny MG) ----------
/** Postacie, których potrzeby liczy system (postacie graczy, nie martwe). */
export const trackedActors = () => tracked();
/** Scena „wyżywienie zapewnione” (osada, gospoda): postacie z tokenem na niej jedzą i piją, ile trzeba. */
export const providedScene = scene => !!scene?.flags?.[F]?.provided;
/** Postacie z tokenem na aktywnej scenie z wyżywieniem. */
export function providedActors() {
  const scene = game.scenes?.active;
  if (!providedScene(scene)) return new Set();
  return new Set([...(scene.tokens ?? [])].map(td => td.actor).filter(a => a?.type === "character"));
}

/** Osada: posiłek tego dnia i picie, gdy zostało mniej niż 6 h nawodnienia (bez kart na czacie). */
async function provide(actor, w) {
  const st = stateOf(actor);
  if (setting("survivalHunger") && st && !isGhoul(actor) && (Number(st.meals) || 0) < 1) {
    await actor.setFlag(F, "survival", { ...st, meals: 1, mealTimes: [...(st.mealTimes ?? []), w], lastMeal: w });
    await clearPenalty(actor, "starvation");
  }
  const th = flagOf(actor, "thirst");
  if (thirstOn(actor) && th && Number(th.until) < w + H6) {
    const r = drink(th, w, 4, () => 2 + d4() + d4());
    if (r.th.rec) r.th.rec.count = Math.max(Number(r.th.rec.count) || 0, Number(r.th.rec.need) || 4);
    await actor.setFlag(F, "thirst", { ...r.th, last: w, deathAsked: false });
    if (th.out && actor.statuses?.has?.("unconscious")) await toggleStatus(actor, "unconscious", false);
  }
  // skażona woda w osadzie — raz na dzień gry
  await settlementWater(actor, sceneTaintWater(game.scenes?.active), 1, dayOf(w));
}

/** Zwykły upływ czasu (poniżej progu przeskoku): promieniowanie, osada, północ, etapy odwodnienia, rzuty promieniowania. */
export async function timeTick(worldTime, dt, { rads = true } = {}) {
  const day = dayOf(worldTime);
  if (rads) await irradiate(Number(dt) || 0);
  const fed = providedActors();
  for (const a of tracked()) {
    // błąd przy jednej postaci nie zatrzymuje pozostałych
    await guarded(a, async () => {
      if (fed.has(a)) await provide(a, worldTime);
      const st = stateOf(a);
      if (!st || st.day !== day) await settleActor(a, day);
      await thirstTick(a, worldTime);
      await radiationTick(a, worldTime);
      await sleepTick(a, worldTime, Number(dt) || 0);
      await feralTick(a, worldTime);
      // koniec 8 h bez kar głodu — przelicz kartę
      if (st?.ignoreUntil && st.ignoreUntil <= worldTime) await a.setFlag(F, "survival.ignoreUntil", null);
    }).catch(err => console.error(`${F} | survival: ${a.name}`, err));
  }
}

// ---------- przeskok czasu: podgląd, zamrożenie, decyzja MG ----------
/** Jedzenie i picie w ekwipunku postaci (do zapasów). */
function supplies(actor) {
  const traits = traitNames(actor);
  const diet = dietOf(actor.system.race, traits);
  const cannibal = traits.some(x => /^cannibal\b|^kanibal/i.test(x));
  return (actor.items ?? []).filter(i => i.type === "gear" && i.system?.category === "food" && (Number(i.system.qty) || 0) > 0).map(i => {
    const info = foodInfo(i.system.description);
    return { id: i.id, name: i.name, qty: Number(i.system.qty) || 0, info, fits: !setting("survivalDiet") || fitsDiet(info, diet, cannibal) };
  });
}

/** Dawka (rad/min po odporności) z najgorszego tokenu postaci na aktywnej scenie. */
function actorRate(actor) {
  let best = 0;
  for (const td of game.scenes?.active?.tokens ?? []) if (td.actor === actor) best = Math.max(best, tokenExposure(td).total);
  return absorbedRate(best, actor.system.radResistTotal ?? 0);
}

/**
 * Podgląd przeskoku from→to dla postaci (okno MG): kiedy ostatnio jadła i piła, czego potrzebuje, co weźmie z zapasów
 * i czego zabraknie (dni głodu, etap odwodnienia), dawka promieniowania i zaległe rzuty.
 */
export function skipInfo(actor, from, to) {
  const st = stateOf(actor), th = thirstOn(actor) ? flagOf(actor, "thirst") : null;
  const ghoul = isGhoul(actor);
  const needs = skipNeeds({ st, th, from, to, hunger: setting("survivalHunger"), ghoul });
  const pick = pickSupplies(supplies(actor), needs);
  const base = th ? Math.max(Number(th.until) || from, from) : 0;
  const stageAfter = th ? (pick.drinks ? thirstStage({ ...th, until: base + pick.drinks * H6, base: 0 }, to) : needs.stageWithout) : 0;
  const rate = actorRate(actor);
  const log = flagOf(actor, "radlog");
  const due = !!((log?.severe && log.severe.at + SEVERE_WAIT <= to) || (log?.poison && log.poison.at + POISON_DEATH <= to));
  return {
    uuid: actor.uuid, name: actor.name, ghoul, needs, pick, stageAfter, rate, rads: Math.floor(ambientRads(rate, to - from).rads), due,
    lastMeal: st?.lastMeal ?? (st?.mealTimes?.length ? Math.max(...st.mealTimes) : null), mealsToday: needs.mealsToday,
    lastDrink: th?.last ?? null, until: th ? Number(th.until) : null, stageNow: th ? thirstStage(th, from) : 0,
    provided: providedActors().has(actor),
    starveDays: Math.max(0, needs.meals - pick.meals),
    any: needs.meals > 0 || needs.drinks > 0 || rate > 0 || due
  };
}

/**
 * Zamrożenie: liczniki przesuwają się o czas przeskoku, jakby nie minął (głód, nawodnienie, rekonwalescencja,
 * 8 h bez kar głodu, terminy rzutów promieniowania). Bez decyzji MG nic złego się nie dzieje. Zwraca stan sprzed.
 */
export async function freezeSkip(actor, from, to) {
  const dt = to - from, days = midnights(from, to);
  const st = stateOf(actor), th = flagOf(actor, "thirst"), log = flagOf(actor, "radlog");
  const sl = flagOf(actor, "sleep");
  const snap = { st: st ? foundry.utils.deepClone(st) : null, th: th ? foundry.utils.deepClone(th) : null, sl: sl ? foundry.utils.deepClone(sl) : null };
  const upd = {};
  if (sl) upd[`flags.${F}.sleep`] = frozenSleep(sl, dt);
  if (st) upd[`flags.${F}.survival`] = {
    ...st, day: (Number(st.day) || dayOf(from)) + days,
    ignoreUntil: st.ignoreUntil ? st.ignoreUntil + dt : st.ignoreUntil ?? null,
    wellFed: st.wellFed != null && st.wellFed === st.day ? st.wellFed + days : st.wellFed ?? null
  };
  if (th) upd[`flags.${F}.thirst`] = { ...th, until: Number(th.until) + dt, ...(th.rec ? { rec: { ...th.rec, from: th.rec.from + days, day: th.rec.day + days } } : {}) };
  if (log) upd[`flags.${F}.radlog`] = {
    ...log, day: (Number(log.day) || dayOf(from)) + days,
    severe: log.severe ? { ...log.severe, at: log.severe.at + dt } : null, poison: log.poison ? { ...log.poison, at: log.poison.at + dt } : null
  };
  if (Object.keys(upd).length) await actor.update(upd);
  return snap;
}

/**
 * Decyzja MG dla postaci. choice — { food: "supplies" | "provided" | "count" | "skip", rads: "count" | "skip" }.
 * Cofa zamrożenie tego, co ma się liczyć, zjada zapasy, rozlicza dni głodu i etapy odwodnienia (śmiertelne skutki —
 * znów decyzja MG). Zwraca linie do karty.
 */
export async function resolveSkip(actor, snap, choice, { from, to }) {
  const dt = to - from, days = midnights(from, to);
  const lines = [];
  const ghoul = isGhoul(actor);
  let skipRads = 0;
  // promieniowanie
  if (choice.rads === "count") {
    const log = flagOf(actor, "radlog");
    if (log?.severe || log?.poison) await actor.setFlag(F, "radlog", {
      ...log, severe: log.severe ? { ...log.severe, at: log.severe.at - dt } : null, poison: log.poison ? { ...log.poison, at: log.poison.at - dt } : null
    });
    const rate = actorRate(actor);
    skipRads = rate ? ambientRads(rate, dt).rads : 0;
    if (skipRads) {
      const cur = Number(actor.system.resources?.rads?.value) || 0;
      await actor.update({ "system.resources.rads.value": cur + skipRads });
      lines.push(t("Radiation during the skip: +{n} rads ({total} in total).", { n: skipRads, total: cur + skipRads }));
    }
  }
  const food = choice.food ?? "skip";
  if (food !== "skip") {
    const st = stateOf(actor), st0 = snap?.st;
    let th = thirstOn(actor) ? flagOf(actor, "thirst") : null;
    if (th) th = { ...th, until: Number(th.until) - dt, ...(th.rec ? { rec: { ...th.rec, from: th.rec.from - days, day: th.rec.day - days } } : {}) };
    const firstFed = (st0 && st0.day === dayOf(from) ? Number(st0.meals) || 0 : 0) >= 1;
    let fed = null, fedDays = 0, ate = 0;
    const byRads = (ghoul || isAlicorn(actor)) && skipRads >= RADS_FOR_FOOD * Math.max(1, days);
    if (food === "supplies") {
      const needs = skipNeeds({ st: st0, th, from, to, hunger: setting("survivalHunger"), ghoul });
      const sup = supplies(actor);
      const pick = pickSupplies(sup, needs);
      for (const u of pick.use) {
        const it = actor.items.get?.(u.id) ?? actor.items.find?.(i => i.id === u.id);
        if (it) await it.update({ "system.qty": Math.max(0, (Number(it.system.qty) || 0) - u.n) });
      }
      if (pick.use.length) lines.push(t("From supplies: {list}.", { list: pick.use.map(u => `${u.name} ×${u.n}`).join(", ") }));
      const tx = pick.use.reduce((sum, u) => sum + itemTaint(actor.items.get?.(u.id) ?? actor.items.find?.(i => i.id === u.id)) * u.n, 0);
      const taintLine = await addTaint(actor, tx, t("supplies"));
      if (taintLine) lines.push(taintLine);
      const traits = traitNames(actor);
      const rads = foodRads(pick.rads, { resist: actor.system.radResistTotal ?? 0, ironStomach: traits.some(x => /^iron stomach\b|^żelazny żołądek/i.test(x)) });
      if (rads) {
        const cur = Number(actor.system.resources?.rads?.value) || 0;
        await actor.update({ "system.resources.rads.value": cur + rads });
        lines.push(t("+{n} rads ({total} in total).", { n: rads, total: cur + rads }));
      }
      if (pick.wounds) {
        const healed = await healWounds(actor, pick.wounds, { quiet: true, source: t("supplies") });
        if (healed?.healed) lines.push(t("Heals: {list}.", { list: healed.text }));
      }
      ate = pick.meals;
      fed = firstFed || ate > 0;
      fedDays = Math.max(0, ate - (firstFed ? 0 : 1));
      if (needs.meals > ate) lines.push(tn(needs.meals - ate, "Not enough food: {n} meal short.", "Not enough food: {n} meals short."));
      if (th && pick.drinks) {
        const r = drink(th, from, 1, () => 2 + d4() + d4());
        th = { ...r.th, until: Number(r.th.until) + (pick.drinks - 1) * H6, last: Math.min(to, Number(r.th.until) + (pick.drinks - 2) * H6) };
        if (th.rec && needs.recDays && pick.drinks >= needs.drinks) th = recoverDays(th, needs.recDays);
      }
      if (th && needs.drinks > pick.drinks) lines.push(tn(needs.drinks - pick.drinks, "Not enough to drink: {n} drink short.", "Not enough to drink: {n} drinks short."));
    } else if (food === "provided") {
      fed = true; fedDays = days; ate = days || 1;
      if (th) {
        const r = drink(th, from, 4, () => 2 + d4() + d4());
        th = r.th;
        if (th.rec) { let n = 0; for (let d = dayOf(from); d < dayOf(to); d++) if (th.rec.from < d) n++; if (n) th = recoverDays(th, n); }
        th = { ...th, until: to + 4 * H6, last: to };
      }
      lines.push(t("Food and water provided."));
      const waterLine = await settlementWater(actor, sceneTaintWater(game.scenes?.active), days, dayOf(to));
      if (waterLine) lines.push(waterLine);
    }
    if (ghoul || byRads) { fed = food === "provided" || byRads || (food !== "count" && fed); fedDays = fed ? days : 0; }
    // głód za dni przeskoku — na stanie sprzed przeskoku
    if (setting("survivalHunger") && st0 && days) {
      const res = settleDays(st0, dayOf(to), { roll: d6, fed, fedDays });
      if (ate || fed) await clearPenalty(actor, "starvation");
      if (res.starve.length) {
        await addPenalty(actor, "starvation", res.starve);
        lines.push(t("Hunger: {n} without a full meal — {list} −1 (feature “Starvation”).", { n: tn(res.starve.length, "{n} day", "{n} days"), list: res.starve.map(a => ATTRS[a]).join(", ") }));
      }
      // dzisiejsze posiłki: tylko zjedzone już po przeskoku (zamrożenie przeniosło wczorajsze)
      const cur = stateOf(actor) ?? st;
      const after = Math.max(0, (Number(cur?.meals) || 0) - (Number(st0.meals) || 0));
      const meals = food === "provided" ? Math.max(1, after) : after;
      await actor.setFlag(F, "survival", {
        ...cur, day: dayOf(to), meals, mealTimes: (cur?.mealTimes ?? []).filter(x => x >= dayOf(to) * 86400),
        hungerDays: res.state.hungerDays, lastStarve: res.state.lastStarve, wellFed: null,
        ignoreUntil: cur?.ignoreUntil ? cur.ignoreUntil - dt : null,
        lastMeal: food === "provided" ? to : ate ? Math.min(to, dayOf(to) * 86400 - 6 * 3600) : cur?.lastMeal ?? null
      });
      if (res.starvedToDeath) await askStarveDeath(actor);
    } else if (food === "provided" && st) {
      await actor.setFlag(F, "survival", { ...st, meals: Math.max(1, Number(st.meals) || 0), lastMeal: to, ignoreUntil: st.ignoreUntil ? st.ignoreUntil - dt : null });
      await clearPenalty(actor, "starvation");
    } else if (st?.ignoreUntil) await actor.setFlag(F, "survival.ignoreUntil", st.ignoreUntil - dt);
    if (th) {
      await actor.setFlag(F, "thirst", { ...th, deathAsked: false });
      if (th.out && thirstStage(th, now()) < 11 && actor.statuses?.has?.("unconscious")) { await toggleStatus(actor, "unconscious", false); await actor.setFlag(F, "thirst.out", false); }
    }
  }
  await thirstTick(actor, now());
  await radiationTick(actor, now());
  const sleepLine = await resolveSleep(actor, snap?.sl ?? null, food, from, to);
  if (sleepLine) lines.push(sleepLine);
  return lines;
}

/** Doby rekonwalescencji zaliczone hurtem (przeskok z piciem). */
function recoverDays(th, n) {
  const rec = { ...th.rec, days: th.rec.days - n };
  return rec.days <= 0 ? { ...th, base: 0, max: 0, rec: null } : { ...th, rec };
}

/** Jedno przetwarzanie postaci naraz (rzuty mogą czekać na okno, a czas płynie dalej). */
const busy = new Set();
async function guarded(actor, fn) {
  if (busy.has(actor.uuid)) return null;
  busy.add(actor.uuid);
  try { return await fn(); } finally { busy.delete(actor.uuid); }
}

// ---------- licznik Geigera ----------
const levelText = rate => t("level {n}", { n: radLevelOf(rate) ?? 0 });
const ZONE_LABEL = [N_("Negligible"), N_("Residual"), N_("Extremely low"), N_("Low"), N_("Medium"), N_("High"), N_("Extremely high"), N_("Deadly")];
function geigerText() {
  const scene = game.scenes?.active;
  const gm = game.user.isGM;
  // PipBuck nie rejestruje promieniowania poniżej poziomu 2 (s. 484) — gracz go nie widzi, MG tak
  const shows = rate => rate > 0 && (gm || (radLevelOf(rate) ?? 0) >= GEIGER_MIN_LEVEL);
  // opcja świata „tylko z PipBuckiem”: gracz widzi odczyt tylko postaci z PipBuckiem (i tło sceny, jeśli ma taką postać)
  const exp = [...exposedOnActive()].filter(([a, e]) => shows(e.total) && (gm || (a.isOwner && !needsPipbuck(a))));
  const reads = gm || !game.actors?.some?.(a => a.isOwner && a.type === "character") || game.actors.some(a => a.isOwner && a.type === "character" && !needsPipbuck(a));
  const amb = reads ? sceneRads(scene) : 0;
  if (!exp.length && !shows(amb)) return null;
  const who = exp.sort((x, y) => y[1].total - x[1].total).slice(0, gm ? 4 : 2)
    .map(([a, e]) => `${a.name} ${levelText(e.total)} (${rateText(e.total)})`);
  const title = exp.map(([a, e]) => `${a.name}: ${e.parts.map(p => p.kind === "scene" ? t("scene {n}", { n: rateText(p.rate) })
    : p.kind === "region" ? t("region {name} {n}", { name: p.name, n: rateText(p.rate) }) : t("source {ft} ft away {n}", { ft: p.ft, n: rateText(p.rate) })).join(" + ")}`);
  return {
    html: `<i class="fa-solid fa-radiation"></i> ${esc([shows(amb) ? t("scene {lvl} ({n})", { lvl: levelText(amb), n: rateText(amb) }) : "", ...who].filter(Boolean).join(" · "))}`,
    title: [t("Radiation on the active scene (Table XXXV, levels 0–7): characters get it as time passes, minus their radiation resistance. A PipBuck registers it from level 2."), ...title].join("\n")
  };
}

function geiger(root) {
  if (!root.querySelector(".foe-rads")) {
    const el = document.createElement("div");
    el.className = "foe-rads";
    (root.querySelector(".combat-tracker-header, header") ?? root).append(el);
  }
  refreshGeiger(root);
}

/** Odśwież licznik w zakładce walki (bez przerysowania całej zakładki). */
export function refreshGeiger(root = document) {
  const g = geigerText();
  for (const el of root.querySelectorAll?.(".foe-rads") ?? []) {
    el.style.display = g ? "" : "none";
    el.innerHTML = g?.html ?? "";
    el.title = g?.title ?? "";
  }
}
let geigerQueued = false;
const queueGeiger = () => {
  if (geigerQueued) return;
  geigerQueued = true;
  setTimeout(() => { geigerQueued = false; refreshGeiger(); }, 100);
};

/** Trzaski licznika Geigera po ruchu własnego tokenu w promieniowaniu od poziomu 2 (Web Audio, bez plików). */
let AC = null;
function clicks(rate) {
  if ((radLevelOf(rate) ?? 0) < GEIGER_MIN_LEVEL) return;
  const n = clickCount(rate);
  if (!n || !setting("geigerSound", true)) return;
  const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctx) return;
  AC ??= new Ctx();
  if (AC.state === "suspended") AC.resume().catch(() => null);
  let vol = 0.5;
  try { vol = Number(game.settings.get("core", "globalInterfaceVolume")); } catch { /* domyślna */ }
  const peak = Math.max(0.0002, Math.min(1, Number.isFinite(vol) ? vol : 0.5) * 0.25);
  let at = AC.currentTime + 0.02;
  const span = Math.max(0.25, 1.4 - rate / 200);   // im silniej, tym gęściej
  for (let i = 0; i < n; i++) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(2600 + Math.random() * 1600, at);
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.006);
    o.connect(g).connect(AC.destination);
    o.start(at);
    o.stop(at + 0.01);
    at += (span / n) * (0.3 + Math.random() * 1.4);
  }
}

// ---------- pola w oknach konfiguracji ----------
/**
 * Wstawia pole do okna konfiguracji obok znanego pola (ten sam kontener — wygląd i zapis jak reszta formularza):
 * zaraz za jego grupą albo (end) za ostatnią grupą tej samej zakładki, przed stopką z przyciskiem. Bez znanego pola —
 * na końcu jednej z zakładek, w ostateczności przed stopką formularza. Nigdy poza formularzem.
 */
function insertGroup(root, group, { fields = [], tabs = [], end = false } = {}) {
  for (const name of fields) {
    const el = root.querySelector(`[name="${name}"]`);
    const fg = el?.closest(".form-group, fieldset");
    if (!fg) continue;
    const tab = end ? el.closest(".tab") : null;
    const last = tab ? [...tab.querySelectorAll(":scope > .form-group, :scope > fieldset")].at(-1) : null;
    return (last ?? fg).after(group);
  }
  for (const sel of [...tabs.map(id => `.tab[data-tab="${id}"]`), "section.tab[data-tab]", ".tab[data-tab]"]) {
    const tab = root.querySelector(sel);
    if (tab) return tab.append(group);
  }
  const footer = root.querySelector(".form-footer");
  if (footer) return footer.before(group);
  return (root.querySelector(".window-content") ?? root).append(group);
}

/** Wybór poziomu z tabeli XXXV + dawka w rad/min (poziom wpisuje typową dawkę; własna — „inna”). */
function radsControl(name, rate) {
  const preset = RAD_ZONES.find(z => Math.abs(z.rate - rate) < 1e-9);
  const opts = [
    `<option value="0"${rate > 0 ? "" : " selected"}>${t("none")}</option>`,
    ...RAD_ZONES.map(z => `<option value="${z.rate}"${preset === z ? " selected" : ""}>${esc(t("Level {n} — {what} ({rate})", { n: z.level, what: t(ZONE_LABEL[z.level]), rate: rateText(z.rate) }))}</option>`),
    `<option value="custom"${rate > 0 && !preset ? " selected" : ""}>${esc(t("other (level {n})", { n: radLevelOf(rate) ?? 0 }))}</option>`
  ];
  return `<div class="form-fields"><select class="foe-rad-level">${opts.join("")}</select>
    <input type="number" name="${name}" value="${Math.round(rate * 1000) / 1000}" min="0" step="any" style="max-width:6em"> <span>${t("rads/min")}</span></div>`;
}
function wireRads(el) {
  const sel = el.querySelector(".foe-rad-level"), num = el.querySelector(".foe-rad-level ~ input[type=number]");
  if (!sel || !num) return;
  sel.addEventListener("change", () => { if (sel.value !== "custom") num.value = sel.value; });
  num.addEventListener("input", () => {
    const v = Number(num.value) || 0;
    const z = RAD_ZONES.find(x => Math.abs(x.rate - v) < 1e-9);
    sel.value = v > 0 ? (z ? String(z.rate) : "custom") : "0";
  });
}
const LEVELS_HINT = () => t("Table XXXV (p. 484): 0 — most of the wasteland (under 5 rads a day); 1 — 5–10 rads/min (over 25% resistance protects fully); 2 — 20/min (a PipBuck registers it from here); 3 — 40/min (most water sources); 4 — 100/min (waste dumps); 5 — 200/min (leaking spark generators); 6 — 640/min (an active spark reactor); 7 — over 1200/min (deadly in under a minute).");

function sceneField(app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-scene-rads")) return;
  const group = document.createElement("div");
  group.className = "form-group foe-scene-rads";
  group.innerHTML = `<label>${t("Radiation (Fallout: Equestria)")}</label>${radsControl(`flags.${F}.rads.rate`, sceneRads(doc))}
    <p class="hint">${t("Characters on this scene (when it is the active one) get this dose as world time passes, minus their radiation resistance.")} ${LEVELS_HINT()}</p>`;
  wireRads(group);
  insertGroup(root, group, { fields: ["weather", "environment.weather"], tabs: ["ambience", "environment", "basics"] });
  const fed = document.createElement("div");
  fed.className = "form-group foe-scene-provided";
  fed.innerHTML = `<label>${t("Food and water provided (Fallout: Equestria)")}</label>
    <div class="form-fields"><input type="checkbox" name="flags.${F}.provided"${providedScene(doc) ? " checked" : ""}></div>
    <p class="hint">${t("A settlement, inn or caravan: characters with a token on this scene (when it is the active one) eat and drink as much as they need, without using their supplies; a time skip here is settled without asking.")}</p>`;
  group.after(fed);
  const cur = sceneTaintWater(doc);
  const opts = TAINT_WATER.some(o => o.v === cur) ? TAINT_WATER : [...TAINT_WATER, { v: cur, label: String(cur) }];
  const water = document.createElement("div");
  water.className = "form-group foe-scene-taint";
  water.innerHTML = `<label>${t("Tainted water in the settlement (Fallout: Equestria)")}</label>
    <div class="form-fields"><select name="flags.${F}.taintWater" data-dtype="Number">${opts.map(o => `<option value="${o.v}"${o.v === cur ? " selected" : ""}>${esc(t(o.label))}</option>`).join("")}</select></div>
    <p class="hint">${t("With food and water provided: each day here adds taint (p. 485 — a week or two of drinking river water in Hoofington is one tick). Only alicorns and hellhounds are immune.")}</p>`;
  fed.after(water);
}

function tileField(app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-tile-rads")) return;
  const src = tileSource(doc);
  const fs = document.createElement("fieldset");
  fs.className = "foe-tile-rads";
  fs.innerHTML = `<legend>${t("Radiation source (Fallout: Equestria)")}</legend>
    <div class="form-group"><label>${t("At the source")}</label>${radsControl(`flags.${F}.rads.rate`, src?.rate ?? 0)}</div>
    <div class="form-group"><label>${t("Range")}</label>
      <div class="form-fields"><input type="number" name="flags.${F}.rads.range" value="${src?.range ?? 30}" min="0" step="5"> <span>ft</span></div></div>
    <p class="hint">${t("A token touching the tile (or within one square of it) gets the full dose; further away it fades with the square of the distance — 2 squares ¼, 3 squares 1/9 — and stops at the range. Characters get it as time passes, minus their radiation resistance. A hidden tile still emits. None — not a source.")} ${LEVELS_HINT()}</p>`;
  wireRads(fs);
  insertGroup(root, fs, { fields: ["alpha", "texture.tint", "texture.src"], tabs: ["appearance", "basic", "basics"], end: true });
  app.setPosition?.({ height: "auto" });
}

function regionField(app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-region-rads")) return;
  const group = document.createElement("div");
  group.className = "form-group foe-region-rads";
  group.innerHTML = `<label>${t("Radiation (Fallout: Equestria)")}</label>${radsControl(`flags.${F}.rads.rate`, regionRads(doc))}
    <p class="hint">${t("Characters standing inside this region get this dose as world time passes (minus their radiation resistance), on top of the scene's radiation.")} ${LEVELS_HINT()}</p>`;
  wireRads(group);
  insertGroup(root, group, { fields: ["displayMeasurements", "highlightMode", "locked", "visibility", "color"], tabs: ["appearance", "identity", "area"], end: true });
}

// ---------- ustawienia i haki ----------
const reprep = () => {
  for (const a of game.actors ?? []) a.prepareData();
  for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render();
};

export function registerSurvivalSettings() {
  game.settings.register(F, "survivalHunger", {
    name: "Hunger: a day without a full meal (p. 477)",
    hint: "At midnight of world time (the calendar) every player character who hasn't eaten a full meal that day gets −1 to a random attribute (feature “Starvation”); after 3 weeks of starvation the character dies. Eating a meal (the “Eat” button by food) removes the penalties. Ghouls need 5 rads a day instead; alicorns can replace a meal with them.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "survivalDehydration", {
    name: "Dehydration (p. 478, Table XXXIII)",
    hint: "Every hydrating item (water, drinks, a healing potion) covers 6 hours, at most a day ahead. Every 6 hours without one moves the character a stage down the table: penalties to CHA, STR, END, AGI, initiative, SATS and attacks, torso wounds at stages 6 and 10, passing out at 11, death at 12 (72 hours). Recovery from stage 3 — drinking for a full day (from stage 6: 2d4+2 items a day).",
    scope: "world", config: true, type: Boolean, default: true, onChange: reprep
  });
  game.settings.register(F, "dehydrationOptional", {
    name: "Dehydration: optional penalties of stages 2–3",
    hint: "The handbook marks them optional: stage 2 — CHA and its skills 1 MFD step harder, stage 3 — STR, END and AGI −1.",
    scope: "world", config: true, type: Boolean, default: true, onChange: reprep
  });
  game.settings.register(F, "survivalDiet", {
    name: "Food: the race's diet matters",
    hint: "Ponies, zebras, buffalo and donkeys don't get sustenance from meat (unless Cannibal or Omnivore), griffins, dogs and minotaurs eat everything. Off — any food feeds anyone.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "radiationChecks", {
    name: "Radiation: severe exposure and 1000 rads (p. 483)",
    hint: "Over 400 rads within an hour that aren't removed for 6 hours — END ¼ (failure: a mutation, critical failure: radiation poisoning, death in 24 hours without treatment). Reaching 1000 rads — END 1/10, failure: death. Rolled automatically (by the active GM).",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "ghoulification", {
    name: "Ghoulification (p. 611)",
    hint: "A character who would die of radiation rolls END ¼ — success: a ghoul (then INT ½, +25 with Fixation: failure — goes feral in a few days, critical failure — feral at once). Off — they just die.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "geigerSound", {
    name: "Geiger counter clicks",
    hint: "Clicks when your character's token moves within radiation of level 2 or more (a radiating tile, region or scene) — the stronger the dose, the more clicks.",
    scope: "client", config: true, type: Boolean, default: true
  });
}

/**
 * Przerzut kartą szczęścia automatycznego rzutu (endTest z check): lepszy wynik cofa skutek pierwszego rzutu.
 * Rzuty MG (1000 radów, silne napromieniowanie, utrata przytomności) poprawia aktywny MG; jedzenie — klient,
 * który przerzucał (właściciel postaci).
 */
export async function onReroll(message) {
  const test = message?.flags?.[F]?.test;
  const check = test?.check;
  if (!check || !(Number(test.rerolls) > 0)) return null;
  const res = test.result;
  const actor = await fromUuid(test.actorUuid).catch(() => null);
  if (!actor) return null;
  if (check.kind === "keep") {
    if (!(message.isAuthor ?? message.author?.isSelf) || !passed(res)) return null;
    const done = stateOf(actor)?.kept ?? [];
    if (done.includes(check.id)) return null;
    await actor.setFlag(F, "survival.kept", [...done.slice(-9), check.id]);
    return feed(actor, { name: check.name, system: { description: check.description } }, [t("Luck card: {name} keeps it down after all.", { name: actor.name })]);
  }
  if (!game.users.activeGM?.isSelf) return null;
  if (check.kind === "taint") return taintReroll(actor, check, res);
  if (check.kind === "sleep") return sleepReroll(actor, res);
  const lines = [];
  if (check.kind === "lethal" && passed(res) && actor.statuses?.has?.("dead")) {
    await toggleStatus(actor, "dead", false);
    lines.push(t("Luck card: {name} survives 1000 rads after all.", { name: actor.name }));
  } else if (check.kind === "faint" && passed(res) && flagOf(actor, "thirst")?.out) {
    await toggleStatus(actor, "unconscious", false);
    await actor.setFlag(F, "thirst.out", false);
    lines.push(t("Luck card: {name} stays conscious after all.", { name: actor.name }));
  } else if (check.kind === "severe" && res !== "crit-fail") {
    if (flagOf(actor, "radlog")?.poison) await actor.setFlag(F, "radlog.poison", null);
    lines.push(passed(res) ? t("Luck card: the severe exposure passes without effects — no mutation, no radiation poisoning.")
      : t("Luck card: only a mutation, no radiation poisoning."));
  }
  return card(actor, lines, { tag: t("LUCK") });
}

/** Zmiana radów: dziennik (rady dziś, seria w godzinę, silne napromieniowanie, 1000 radów) w tej samej zmianie. */
export function trackRads(actor, changes) {
  if (actor?.type !== "character") return;
  const key = "system.resources.rads.value";
  const flat = Object.hasOwn(changes, key);
  const after = flat ? changes[key] : foundry.utils.getProperty(changes, key);
  if (after === undefined) return;
  const before = Number(actor.system.resources?.rads?.value) || 0;
  const a = Number(after) || 0;
  if (a === before) return;
  const log = radLog(flagOf(actor, "radlog"), before, a, now());
  if (flat) changes[`flags.${F}.radlog`] = log;
  else foundry.utils.setProperty(changes, `flags.${F}.radlog`, log);
}

export function registerSurvivalHooks() {
  registerConfirmAction("thirst-event", playThirstEvent);
  registerConfirmAction("thirst-death", playThirstDeath);
  registerConfirmAction("rad-lethal", playLethal);
  registerConfirmAction("rad-severe", playSevere);
  registerConfirmAction("rad-poison-death", playPoisonDeath);
  registerConfirmAction("starve-death", playStarveDeath);
  Hooks.on("preUpdateActor", (actor, changes) => {
    try { trackRads(actor, changes); } catch (err) { console.warn(`${F} | rads log`, err); }
  });
  Hooks.on("createChatMessage", message => {
    onReroll(message).catch(err => console.error(`${F} | survival reroll`, err));
  });
  // 1000 radów: rzut od razu (aktywny MG)
  Hooks.on("updateActor", (actor, changes) => {
    if (!game.users.activeGM?.isSelf) return;
    const lethal = foundry.utils.getProperty(changes, `flags.${F}.radlog.lethal`);
    if (lethal != null) guarded(actor, () => radiationTick(actor, now())).catch(err => console.error(`${F} | radiation`, err));
  });
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (root) geiger(root);
  });
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.active && (foundry.utils.hasProperty(changes, `flags.${F}.radiation`) || foundry.utils.hasProperty(changes, `flags.${F}.rads`) || "active" in changes)) queueGeiger();
  });
  for (const h of ["createTile", "updateTile", "deleteTile", "createRegion", "updateRegion", "deleteRegion"]) Hooks.on(h, doc => { if (doc.parent?.active) queueGeiger(); });
  // ruch tokenu: licznik i trzaski u gracza tej postaci (u MG — przy zaznaczonym tokenie)
  Hooks.on("updateToken", (td, changes) => {
    if (!["x", "y", "elevation", "width", "height"].some(k => k in changes)) return;
    if (td.parent?.active) queueGeiger();
    const a = td.actor;
    const mine = game.user.isGM ? td.object?.controlled : a?.isOwner && a.type === "character";
    if (mine && (game.user.isGM || !needsPipbuck(a))) setTimeout(() => clicks(tokenExposure(td).total), 250);
  });
  Hooks.on("renderSceneConfig", (app, html) => {
    try { sceneField(app, html); } catch (err) { console.warn(`${F} | scene radiation`, err); }
  });
  Hooks.on("renderTileConfig", (app, html) => {
    try { tileField(app, html); } catch (err) { console.warn(`${F} | tile radiation`, err); }
  });
  Hooks.on("renderRegionConfig", (app, html) => {
    try { regionField(app, html); } catch (err) { console.warn(`${F} | region radiation`, err); }
  });
}
