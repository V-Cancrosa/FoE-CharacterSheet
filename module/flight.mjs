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
import { MFD_STEPS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest, stepIndex } from "./rolls.mjs";
import { spendActions } from "./tracker.mjs";

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
  if (!actor.system.flier) w.push("postać nie ma umiejętności Flight");
  if (e.level > lim.maxLevel) w.push(`poziom ${e.level} wymaga rangi Flight ${RANK_FOR_LEVEL[e.level]} (masz ${lim.rank})`);
  if (e.level > 0 && cnt.total >= lim.total) w.push(`limit manewrów: ranga/10 = ${lim.total}`);
  if (e.kind === "passive" && e.level > 0 && cnt.passive[e.level] >= 1) w.push(`na poziomie ${e.level} można mieć jeden manewr pasywny`);
  else if (e.kind !== "passive" && lim.byLevel[e.level] !== undefined && cnt.per[e.level] >= lim.byLevel[e.level]) w.push(`limit poziomu ${e.level}: ${lim.byLevel[e.level]}`);
  if (e.requires) w.push(e.requires.replace(/^Requires/i, "wymaga"));
  return w;
}

/** Wykonanie manewru: rzut Flight na jego MFD; nieopanowany — nauka z karą 3 kroków (limit prób = poziom). */
export async function performManeuver(actor, item) {
  const sys = actor.system;
  const s = item.system;
  const fl = sys.skills.flight;
  if (!fl || fl.known === false) return warn(`${actor.name} nie lata (brak umiejętności Flight).`);
  if (s.kind === "passive") return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // LOT</span><span>pasywny</span></div><h3>${esc(item.name)}</h3><div class="fc-meta">Manewr pasywny działa zawsze — bez rzutu.</div>${s.description || ""}</div>`
  });
  if (!sys.canFly && !/push/i.test(item.name)) return warn(`${actor.name}: ${sys.flyNote || "nie może teraz latać"}.`);
  const lim = maneuverLimits(actor);
  if (s.level > lim.maxLevel) ui.notifications.warn(`${item.name}: poziom ${s.level} wymaga rangi Flight ${RANK_FOR_LEVEL[s.level]} (masz ${lim.rank}).`);
  const learning = !s.learned;
  // Stubborn Flyer: dwa razy więcej prób (s. 139)
  const attemptsMax = sys.level * (actor.items.some(i => i.type === "feature" && /stubborn flyer/i.test(i.name)) ? 2 : 1);
  if (learning && s.attempts >= attemptsMax) return warn(`${item.name}: wykorzystano ${s.attempts}/${attemptsMax} prób nauki — kolejna po awansie (każdy poziom to jedna próba więcej).`);

  const extraHtml = `<div class="dlg-attack"><div class="atk-info">
      <div>Manewr poziomu ${s.level} · MFD ${MFD_LABEL[s.mfd] ?? s.mfd}${s.actions ? ` · ${s.actions} ${s.actions === 1 ? "akcja" : "akcje"}` : " · bez akcji"}${s.tag === "dodge" ? " · unik powietrzny" : s.tag === "block" ? " · blok powietrzny" : ""}</div>
      ${learning ? `<div class="warn">Nauka: −3 kroki MFD, próba ${s.attempts + 1}/${attemptsMax} (co najmniej godzina ćwiczeń; bez kart szczęścia)</div>` : ""}
      ${sys.altitude ? `<div>Wysokość: ${sys.altitude} ft</div>` : ""}
    </div></div>`;
  const rc = rollContext(actor, { kind: "skill", skill: "flight", skillAttr: fl.attr }, { manualMod: fl.mod });
  const def = MFD_STEPS.some(x => x.key === s.mfd) ? s.mfd : "1";
  const r = await promptMfd(`${learning ? "Nauka" : "Manewr"}: ${item.name}`, fl.tn, rc, {
    defaultStep: def, extraHtml,
    readExtra: () => ({ steps: learning ? -3 : 0, mod: 0, notes: learning ? ["Nauka manewru −3 kr."] : [] })
  });
  if (!r) return null;
  const { extra, ...roll } = r;
  if (s.actions && !learning) {
    await spendActions(actor, Math.min(2, s.actions), `manewr ${item.name}`);
    if (s.actions > 2) ui.notifications.info(`${item.name}: ${s.actions} akcje — manewr trwa także w następnej rundzie.`);
  }
  const msg = await rollTest(actor, { label: `${learning ? "Nauka manewru" : "Manewr"}: ${item.name} (Flight)`, baseTn: fl.tn, ...roll });
  const res = msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
  const ok = res === "success" || res === "crit-success";
  if (learning) {
    const attempt = s.attempts + 1;
    await item.update({ "system.attempts": attempt, ...(ok ? { "system.learned": true } : {}) });
    ui.notifications[ok ? "info" : "warn"](ok ? `${actor.name}: manewr ${item.name} opanowany.` : `${item.name}: nie wyszło (próba ${attempt}/${attemptsMax}).`);
  } else if (ok && /second wind/i.test(item.name)) {
    await actor.update({ "system.resources.sats.value": sys.resources.sats.max });
    ui.notifications.info(`${actor.name}: Second Wind — AP odnowione (albo połowa lekkich ran; raz na walkę).`);
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
  ui.notifications.info(`${actor.name}: dodano manewry poziomu 0.${n ? ` Możesz wybrać w katalogu (Manewry lotu) ${n} kolejnych (ranga Flight / 10).` : ""}`);
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
      window: { title: `Upadek: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
      content: `<div class="foe-dialog">
        <label class="atk-row">Wysokość (ft) <input type="number" name="feet" value="${sys.altitude || 10}" min="0" step="5"></label>
        <label class="atk-row atk-check"><input type="checkbox" name="controlled"><span>Upadek kontrolowany</span><small>coś hamuje co ~10 ft: 1d10 zamiast 1d20</small></label>
        <p class="hint">1d20 na każde 10 ft; ignoruje DT pancerza (naturalne DT z cech działa). Powyżej 100 ft obrażenia trafiają w każdą lokację.</p></div>`,
      buttons: [{ action: "fall", label: "Rzuć", icon: "fa-solid fa-person-falling", default: true,
        callback: (ev, btn) => ({ feet: Number(btn.form.elements.feet.value) || 0, controlled: btn.form.elements.controlled.checked }) }]
    });
    if (!pick) return null;
    ({ feet, controlled } = pick);
  }
  const formula = fallFormula(feet, controlled);
  if (!formula) return warn("Upadek z mniej niż 10 ft nie zadaje obrażeń.");
  const roll = await new Roll(formula).evaluate();
  const everywhere = feet > 100;
  const hasWings = sys.skills.flight?.known !== false || /pegaz|pegas|gryf|griff|alikorn|alicorn/i.test(sys.race ?? "");
  let loc = null, locRoll = null;
  if (!everywhere) {
    locRoll = await new Roll(hasWings ? "1d8" : "1d6").evaluate();
    loc = (hasWings ? D8 : D6)[locRoll.total];
  }
  const LBL = { frLeg: "prawa przednia noga", flLeg: "lewa przednia noga", rrLeg: "prawa tylna noga", rlLeg: "lewa tylna noga", torso: "tułów", wings: "skrzydła", head: "głowa" };
  const token = actor.getActiveTokens?.()[0]?.document?.uuid ?? actor.token?.uuid;
  if (sys.altitude) await actor.update({ "system.altitude": 0 });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll, ...(locRoll ? [locRoll] : [])],
    content: `
    <div class="foe-card damage">
      <div class="fc-tag"><span>PIPBUCK // UPADEK</span><span>${feet} ft${controlled ? " · kontrolowany" : ""}</span></div>
      <h3>${esc(actor.name)}</h3>
      <div class="fc-main"><div class="fc-roll">${roll.total}<small>OBR.</small></div><div class="fc-outcome">Upadek</div><div class="fc-sum">${esc(formula)}</div></div>
      <div class="fc-hit"><div>${everywhere ? "Ponad 100 ft: <b>każda lokacja</b>" : `Pierwsze uderzenie (${hasWings ? "k8" : "k6"} = ${locRoll.total}): <b>${LBL[loc]}</b>`}</div></div>
      <div class="fc-meta">Ignoruje DT pancerza — liczy się tylko naturalne DT (cechy, perki).</div>
      <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> Nanieś obrażenia</button>
    </div>`,
    flags: { [F]: { damage: {
      specials: {}, shockWounds: 0, actorUuid: actor.uuid, itemUuid: null, itemName: `Upadek (${feet} ft)`, total: roll.total, pre: roll.total,
      critMult: 1, crit: false, aoe: everywhere, loc, called: null, table: null, ignoreDT: 0, ignoreArmor: true, noDegrade: true, flatMult: true,
      targets: token ? [token] : []
    } } }
  });
}
