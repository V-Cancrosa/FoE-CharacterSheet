/**
 * Magia lotu: manewry pegazów, gryfów i alikornów (podręcznik s. 379–394) oraz upadek (s. 579).
 *   - poziomy manewrów: 0 (ranga < 25), 1 (25), 2 (50), 3 (75), 4 (100),
 *   - liczba znanych manewrów = ranga Flight / 10; poziom 0 i pasywne poziomu 0 są za darmo,
 *     poziom 2 — maks. AGI, poziom 3 — AGI/3, poziom 4 — jeden; jeden pasywny na poziom
 *     (Flight School Dropout: połowa i bez poziomu 4; Ace Flyer: +2 na poziomie 2, +1 na 3),
 *   - nauka: rzut Flight z karą 3 kroków MFD, liczba prób = poziom postaci; sukces = manewr opanowany,
 *   - wykonanie: rzut Flight na MFD manewru (pogoda i ciężar ponad 100 lb doliczają się same),
 *   - upadek: 1d20 na 10 ft (kontrolowany 1d10), ignoruje DT pancerza, lokacja k8 (ze skrzydłami) albo k6; > 100 ft — każda lokacja.
 */
import { tint } from "./dice3d.mjs";
import { MFD_STEPS, LOCATIONS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest, stepIndex } from "./rolls.mjs";
import { spendActions } from "./tracker.mjs";
import { t, tn } from "./i18n.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

export const RANK_FOR_LEVEL = { 0: 0, 1: 25, 2: 50, 3: 75, 4: 100 };
/** Manewry zmieniające pogodę i chmury (Cloudbuck, Cloud Cover, Toraindo…). */
const WEATHER_RE = /cloud|rain|fog|downdraft|breeze|dust storm|toraindo|rainboom|radboom|contrail|dry/i;
export const isWeatherManeuver = name => WEATHER_RE.test(name) && !/cloud (walking|computing)/i.test(name);
export const MFD_LABEL = { "2": "2", "1.5": "1½", "1": "1", "3/4": "¾", "1/2": "½", "1/4": "¼", "1/10": "1/10" };

let cache = null;
export function loadManeuvers() {
  cache ??= fetch(`systems/${game.system.id}/data/maneuvers.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(err => { cache = null; throw err; });
  return cache;
}

export function maneuverItemData(e) {
  const weather = isWeatherManeuver(e.name);
  return {
    name: e.name, type: "spell", img: `systems/foe-rpg/icons/${weather ? "cloud" : "wing"}.svg`,
    system: {
      tradition: "flight", level: e.level, mfd: e.mfd || "1", kind: e.kind || "active", tag: e.tag || "", actions: e.actions ?? 1,
      requires: e.requires || "", learned: e.level === 0 || e.kind === "passive", attempts: 0, cost: 0, learn: 0,
      description: e.desc.split("\n").map(p => `<p>${esc(p)}</p>`).join("")
    },
    flags: { [F]: { catalog: e.name } }
  };
}

const maneuvers = actor => actor.items.filter(i => i.type === "spell" && i.system.tradition === "flight");

/** Limity manewrów (s. 379): ogółem ranga/10, na poziomach 2–4 według AGI, jeden pasywny na poziom. */
export function maneuverLimits(actor) {
  const sys = actor.system;
  const rank = sys.skills.flight?.rank ?? 0;
  const agi = sys.attributes.agi.total;
  const has = re => actor.items.some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));
  const dropout = has(/flight school dropout/i);
  const ace = has(/ace flyer/i);
  const byLevel = { 2: agi, 3: Math.floor(agi / 3), 4: 1 };
  if (dropout) { byLevel[2] = Math.floor(byLevel[2] / 2); byLevel[3] = Math.floor(byLevel[3] / 2); byLevel[4] = 0; }
  if (ace) { byLevel[2] += 2; byLevel[3] += 1; }
  if (/alikorn|alicorn/i.test(sys.race ?? "")) byLevel[4] = 0;
  const maxLevel = [4, 3, 2, 1, 0].find(l => rank >= RANK_FOR_LEVEL[l]);
  return { rank, total: Math.floor(rank / 10), byLevel, maxLevel, dropout, ace };
}

/** Ile manewrów liczy się do limitów (poziom 0 i pasywne poziomu 0 są za darmo). */
export function maneuverCounts(actor) {
  const list = maneuvers(actor);
  const counted = list.filter(i => i.system.level > 0);
  const per = { 1: 0, 2: 0, 3: 0, 4: 0 }, passive = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const i of counted) (i.system.kind === "passive" ? passive : per)[i.system.level]++;
  return { total: counted.length, per, passive };
}

/** Ostrzeżenia przy dodawaniu manewru (decyzja należy do MG). */
export function maneuverWarnings(actor, e) {
  const lim = maneuverLimits(actor);
  const cnt = maneuverCounts(actor);
  const w = [];
  if (!actor.system.flier) w.push(t("the character has no Flight skill"));
  if (e.level > lim.maxLevel) w.push(t("level {n} requires Flight rank {r} (you have {have})", { n: e.level, r: RANK_FOR_LEVEL[e.level], have: lim.rank }));
  if (e.level > 0 && cnt.total >= lim.total) w.push(t("maneuver limit: rank/10 = {n}", { n: lim.total }));
  if (e.kind === "passive" && e.level > 0 && cnt.passive[e.level] >= 1) w.push(t("you can have one passive maneuver on level {n}", { n: e.level }));
  else if (e.kind !== "passive" && lim.byLevel[e.level] !== undefined && cnt.per[e.level] >= lim.byLevel[e.level]) w.push(t("level {n} limit: {max}", { n: e.level, max: lim.byLevel[e.level] }));
  if (e.requires) w.push(e.requires.replace(/^Requires/i, t("man|requires")));
  return w;
}

/** Wykonanie manewru: rzut Flight na jego MFD; nieopanowany — nauka z karą 3 kroków (limit prób = poziom). */
export async function performManeuver(actor, item) {
  const sys = actor.system;
  const s = item.system;
  const fl = sys.skills.flight;
  if (!fl || fl.known === false) return warn(t("{name} doesn't fly (no Flight skill).", { name: actor.name }));
  if (s.kind === "passive") return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${t("FLIGHT")}</span><span>${t("man|passive")}</span></div><h3>${esc(item.name)}</h3><div class="fc-meta">${t("A passive maneuver always works — no roll.")}</div>${s.description || ""}</div>`
  });
  if (!sys.canFly && !/push/i.test(item.name)) return warn(`${actor.name}: ${sys.flyNote || t("can't fly right now")}.`);
  const lim = maneuverLimits(actor);
  if (s.level > lim.maxLevel) ui.notifications.warn(`${item.name}: ${t("level {n} requires Flight rank {r} (you have {have})", { n: s.level, r: RANK_FOR_LEVEL[s.level], have: lim.rank })}.`);
  const learning = !s.learned;
  // Stubborn Flyer: dwa razy więcej prób (s. 139)
  const attemptsMax = sys.level * (actor.items.some(i => i.type === "feature" && /stubborn flyer/i.test(i.name)) ? 2 : 1);
  if (learning && s.attempts >= attemptsMax) return warn(t("{name}: {a}/{max} learning attempts used — the next one after a level-up (every level is one more attempt).", { name: item.name, a: s.attempts, max: attemptsMax }));

  const extraHtml = `<div class="dlg-attack"><div class="atk-info">
      <div>${t("Level {n} maneuver", { n: s.level })} · MFD ${MFD_LABEL[s.mfd] ?? s.mfd}${s.actions ? ` · ${tn(s.actions, "{n} action", "{n} actions")}` : ` · ${t("no action")}`}${s.tag === "dodge" ? ` · ${t("aerial dodge")}` : s.tag === "block" ? ` · ${t("aerial block")}` : ""}</div>
      ${learning ? `<div class="warn">${t("Learning: −3 MFD steps, attempt {a}/{max} (at least an hour of practice; no Luck cards)", { a: s.attempts + 1, max: attemptsMax })}</div>` : ""}
      ${sys.altitude ? `<div>${t("Altitude: {n} ft", { n: sys.altitude })}</div>` : ""}
    </div></div>`;
  const rc = rollContext(actor, { kind: "skill", skill: "flight", skillAttr: fl.attr }, { manualMod: fl.mod });
  const def = MFD_STEPS.some(x => x.key === s.mfd) ? s.mfd : "1";
  const r = await promptMfd(learning ? t("Learning: {name}", { name: item.name }) : t("Maneuver: {name}", { name: item.name }), fl.tn, rc, {
    defaultStep: def, extraHtml,
    readExtra: () => ({ steps: learning ? -3 : 0, mod: 0, notes: learning ? [t("Learning a maneuver −3 st.")] : [] })
  });
  if (!r) return null;
  const { extra, ...roll } = r;
  if (s.actions && !learning) {
    await spendActions(actor, Math.min(2, s.actions), t("maneuver {name}", { name: item.name }));
    if (s.actions > 2) ui.notifications.info(t("{name}: {n} actions — the maneuver continues into the next round.", { name: item.name, n: s.actions }));
  }
  const msg = await rollTest(actor, { label: learning ? t("Learning a maneuver: {name} (Flight)", { name: item.name }) : t("Maneuver: {name} (Flight)", { name: item.name }), baseTn: fl.tn, ...roll });
  const res = msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
  const ok = res === "success" || res === "crit-success";
  if (learning) {
    const attempt = s.attempts + 1;
    await item.update({ "system.attempts": attempt, ...(ok ? { "system.learned": true } : {}) });
    ui.notifications[ok ? "info" : "warn"](ok ? t("{name}: maneuver {m} mastered.", { name: actor.name, m: item.name }) : t("{name}: failed (attempt {a}/{max}).", { name: item.name, a: attempt, max: attemptsMax }));
  } else if (ok && /second wind/i.test(item.name)) {
    await actor.update({ "system.resources.sats.value": sys.resources.sats.max });
    ui.notifications.info(t("{name}: Second Wind — AP restored (or half of light wounds; once per combat).", { name: actor.name }));
  }
  return msg;
}

/** Dodaje manewry poziomu 0 (każdy lotnik zna je od początku). */
export async function grantStartingManeuvers(actor) {
  if (!actor.system.flier || maneuvers(actor).length) return;
  let list;
  try { list = await loadManeuvers(); } catch { return; }
  const items = list.filter(e => e.level === 0).map(maneuverItemData);
  await actor.createEmbeddedDocuments("Item", items);
  const n = maneuverLimits(actor).total;
  ui.notifications.info(t("{name}: level 0 maneuvers added.", { name: actor.name }) + (n ? ` ${t("You can pick {n} more in the catalog (Flight maneuvers) (Flight rank / 10).", { n })}` : ""));
}

// ---- upadek ----
const D8 = { 1: "frLeg", 2: "flLeg", 3: "rrLeg", 4: "rlLeg", 5: "torso", 6: "wings", 7: "wings", 8: "head" };
const D6 = { 1: "frLeg", 2: "flLeg", 3: "rrLeg", 4: "rlLeg", 5: "torso", 6: "head" };

/** Formuła obrażeń od upadku: 1d20 (kontrolowany 1d10) na każde pełne 10 ft. */
export function fallFormula(feet, controlled = false) {
  const n = Math.floor(Math.max(0, feet) / 10);
  return n ? `${n}d${controlled ? 10 : 20}` : "";
}

export async function rollFall(actor, { feet = null, controlled = null } = {}) {
  const sys = actor.system;
  if (feet === null) {
    const pick = await foundry.applications.api.DialogV2.wait({
      window: { title: t("Fall: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
      content: `<div class="foe-dialog">
        <label class="atk-row">${t("Height (ft)")} <input type="number" name="feet" value="${sys.altitude || 10}" min="0" step="5"></label>
        <label class="atk-row atk-check"><input type="checkbox" name="controlled"><span>${t("Controlled fall")}</span><small>${t("something slows you every ~10 ft: 1d10 instead of 1d20")}</small></label>
        <p class="hint">${t("1d20 per 10 ft; ignores armor DT (natural DT from features works). Above 100 ft the damage hits every location.")}</p></div>`,
      buttons: [{ action: "fall", label: t("btn|Roll"), icon: "fa-solid fa-person-falling", default: true,
        callback: (ev, btn) => ({ feet: Number(btn.form.elements.feet.value) || 0, controlled: btn.form.elements.controlled.checked }) }]
    });
    if (!pick) return null;
    ({ feet, controlled } = pick);
  }
  const formula = fallFormula(feet, controlled);
  if (!formula) return warn(t("A fall from less than 10 ft does no damage."));
  const roll = tint(await new Roll(formula).evaluate(), "damage");
  const everywhere = feet > 100;
  const hasWings = sys.skills.flight?.known !== false || /pegaz|pegas|gryf|griff|alikorn|alicorn/i.test(sys.race ?? "");
  let loc = null, locRoll = null;
  if (!everywhere) {
    locRoll = tint(await new Roll(hasWings ? "1d8" : "1d6").evaluate(), "hitloc");
    loc = (hasWings ? D8 : D6)[locRoll.total];
  }
  const token = actor.getActiveTokens?.()[0]?.document?.uuid ?? actor.token?.uuid;
  if (sys.altitude) await actor.update({ "system.altitude": 0 });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll, ...(locRoll ? [locRoll] : [])],
    content: `
    <div class="foe-card damage">
      <div class="fc-tag"><span>PIPBUCK // ${t("FALL")}</span><span>${feet} ft${controlled ? ` · ${t("controlled")}` : ""}</span></div>
      <h3>${esc(actor.name)}</h3>
      <div class="fc-main"><div class="fc-roll">${roll.total}<small>${t("DMG")}</small></div><div class="fc-outcome">${t("Fall")}</div><div class="fc-sum">${esc(formula)}</div></div>
      <div class="fc-hit"><div>${everywhere ? t("Over 100 ft: {all}", { all: `<b>${t("every location")}</b>` })
        : hasWings ? t("First impact (d8 = {n}): {loc}", { n: locRoll.total, loc: `<b>${esc(LOCATIONS[loc])}</b>` }) : t("First impact (d6 = {n}): {loc}", { n: locRoll.total, loc: `<b>${esc(LOCATIONS[loc])}</b>` })}</div></div>
      <div class="fc-meta">${t("Ignores armor DT — only natural DT counts (traits, perks).")}</div>
      <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> ${t("Apply damage")}</button>
    </div>`,
    flags: { [F]: { damage: {
      specials: {}, shockWounds: 0, actorUuid: actor.uuid, itemUuid: null, itemName: t("Fall ({n} ft)", { n: feet }), total: roll.total, pre: roll.total,
      critMult: 1, crit: false, aoe: everywhere, loc, called: null, table: null, ignoreDT: 0, ignoreArmor: true, noDegrade: true, flatMult: true,
      targets: token ? [token] : []
    } } }
  });
}
