/**
 * Pojazdy w grze: załoga, sterowanie, broń pokładowa, taranowanie, zderzenia i naprawa.
 * Zasady: vehicle-data.mjs (z podręcznika: tabela XLI, zderzenia Speed Lines, zaprzęg; reszta — zasady domowe).
 */
import { tint } from "./dice3d.mjs";
import { SKILLS, ATTRS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";
import { attackWithWeapon } from "./attack.mjs";
import { spendActions } from "./tracker.mjs";
import { fallFormula } from "./flight.mjs";
import { collisionFormula, ramBonusDice, CREW_ROLES, evasiveActive, vehicleAreas, buildVehicle } from "./vehicle-data.mjs";
import { weaponItem } from "./catalog-data.mjs";
import { t, tn, tfields } from "./i18n.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const resultOf = msg => msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
const okResult = r => r === "success" || r === "crit-success";
const kr = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} ${t("st.")}`;
const stepsLabel = v => tn(v, "{s} MFD step", "{s} MFD steps", { s: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}` });
const tokenUuid = actor => actor?.getActiveTokens?.()[0]?.document?.uuid ?? actor?.token?.uuid ?? null;

// ---------- załoga ----------

/** Załoga z aktorami (null, gdy aktora już nie ma). */
export const crewOf = vehicle => vehicle.system.crewList ?? [];
/** Kto steruje: pierwszy kierowca z postacią, inaczej „załoga bez imienia” (statystyki pojazdu). */
export const pilotOf = vehicle => crewOf(vehicle).find(c => c.role === "pilot" && c.actor)?.actor ?? vehicle;

export async function addCrew(vehicle, actor, role = null) {
  if (!actor || actor.type === "vehicle") return warn(t("Only a character or an NPC can be added to the crew."));
  const crew = foundry.utils.deepClone(vehicle.system.vehicle.crew ?? []);
  if (crew.some(c => c.uuid === actor.uuid)) return warn(t("{name} is already in the vehicle {v}.", { name: actor.name, v: vehicle.name }));
  const v = vehicle.system.vehicle;
  const n = r => crew.filter(c => c.role === r).length;
  role ??= !n("pilot") ? "pilot" : v.power === "pulled" && n("puller") < v.harness ? "puller" : n("gunner") < Math.max(0, v.crewMax - 1) ? "gunner" : "passenger";
  crew.push({ uuid: actor.uuid, name: actor.name, role });
  await vehicle.update({ "system.vehicle.crew": crew });
  ui.notifications.info(`${vehicle.name}: ${actor.name} — ${CREW_ROLES[role]}.`);
  return true;
}

export async function setCrewRole(vehicle, index, role) {
  const crew = foundry.utils.deepClone(vehicle.system.vehicle.crew ?? []);
  if (!crew[index] || !CREW_ROLES[role]) return;
  crew[index].role = role;
  return vehicle.update({ "system.vehicle.crew": crew });
}

export async function removeCrew(vehicle, index) {
  const crew = foundry.utils.deepClone(vehicle.system.vehicle.crew ?? []);
  crew.splice(index, 1);
  return vehicle.update({ "system.vehicle.crew": crew });
}

/** Postacie do wyboru jako wykonawca (strzelec, mechanik): załoga, zaznaczone tokeny, własna postać gracza. */
function candidates(vehicle, roles) {
  const out = new Map();
  for (const c of crewOf(vehicle)) if (c.actor && (!roles || roles.includes(c.role))) out.set(c.actor.uuid, { actor: c.actor, note: CREW_ROLES[c.role] });
  for (const tk of canvas?.tokens?.controlled ?? []) if (tk.actor && tk.actor.type !== "vehicle" && !out.has(tk.actor.uuid)) out.set(tk.actor.uuid, { actor: tk.actor, note: t("selected token") });
  const own = game.user?.character;
  if (own && !out.has(own.uuid)) out.set(own.uuid, { actor: own, note: t("your character") });
  return [...out.values()].filter(x => x.actor.isOwner);
}

/** Okienko wyboru postaci; „anon” = załoga bez imienia (statystyki pojazdu). */
async function pickActor(vehicle, list, title, anonLabel) {
  const opts = [...list.map((x, i) => ({ v: String(i), label: `${x.actor.name} (${x.note})` })), ...(anonLabel && vehicle.isOwner ? [{ v: "anon", label: anonLabel }] : [])];
  if (!opts.length) return warn(t("No character to choose: add one to the crew or select its token."));
  if (opts.length === 1) return opts[0].v === "anon" ? vehicle : list[0].actor;
  const own = list.findIndex(x => x.actor === game.user?.character);
  const def = own >= 0 ? String(own) : opts[0].v;
  const pick = await DialogV2.wait({
    window: { title }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 400 }, rejectClose: false,
    content: `<div class="foe-dialog"><label class="atk-row">${t("Who")} <select name="who">${opts.map(o => `<option value="${o.v}" ${o.v === def ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label></div>`,
    buttons: [{ action: "ok", label: t("Next"), icon: "fa-solid fa-check", default: true, callback: (ev, btn) => btn.form.elements.who.value }]
  });
  if (pick === null || pick === undefined) return null;
  return pick === "anon" ? vehicle : list[Number(pick)]?.actor ?? null;
}

/** Próg rzutu umiejętności albo atrybutu postaci. */
function rollBase(actor, key) {
  const sys = actor.system;
  if (SKILLS[key] && sys.skills?.[key]) {
    const sk = sys.skills[key];
    return { tn: sk.tn, label: SKILLS[key].label, ctx: { kind: "skill", skill: key, skillAttr: sk.attr }, manualMod: sk.mod, known: sk.known !== false };
  }
  const a = sys.attributes?.[key] ?? sys.attributes.agi;
  return { tn: a.tn, label: ATTRS[key] ?? "Agility", ctx: { kind: "attr", attr: ATTRS[key] ? key : "agi" }, manualMod: 0, known: true };
}

// ---------- sterowanie ----------

const PURPOSES = tfields({
  evasive: { label: "Evasive maneuver", step: "1", note: "success: attacks on the vehicle −1 MFD step until the end of the next round (critical: −2)" },
  chase: { label: "Chase / overtaking", step: "1", note: "opposed roll — the higher MFD level reached wins" },
  terrain: { label: "Rough terrain, tight passage", step: "3/4", note: "failure: the GM may call for a crash" },
  control: { label: "Regaining control", step: "1/2", note: "after a hit to the propulsion, an explosion or a critical failure" },
  other: { label: "Other maneuver", step: "1", note: "" }
}, ["label", "note"]);

/** Rzut sterowania pojazdem (zasada domowa: umiejętność/atrybut kierowcy + prowadzenie pojazdu + kary ze stref). */
export async function driveVehicle(vehicle, { purpose = "evasive" } = {}) {
  const sys = vehicle.system;
  if (sys.dead) return warn(t("{name} is a wreck.", { name: vehicle.name }));
  const pilot = pilotOf(vehicle);
  if (!pilot.isOwner) return warn(t("You can't steer for {name}.", { name: pilot.name }));
  const b = rollBase(pilot, sys.pilotSkill);
  if (!b.known) return warn(t("{name} doesn't have the {skill} skill — choose another driver or another steering skill.", { name: pilot.name, skill: b.label }));
  const size = sys.size;
  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info">
        <div>${t("Steering: {name}", { name: `<b>${esc(pilot.name)}</b>` })}${pilot === vehicle ? ` ${t("(vehicle crew)")}` : ""} · ${esc(b.label)} · ${t("speed {n} ft", { n: sys.speed })}${sys.vehicle.currentSpeed ? ` · ${t("moving {n} ft/round", { n: sys.vehicle.currentSpeed })}` : ""}</div>
        ${sys.speedNotes?.length ? `<div>${sys.speedNotes.map(esc).join(" · ")}</div>` : ""}
      </div>
      <label class="atk-row">${t("Maneuver")} <select name="purpose">${Object.entries(PURPOSES).map(([k, p]) => `<option value="${k}" ${k === purpose ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
      <div class="atk-info purpose-note"></div>
    </div>`;
  const readExtra = form => {
    const p = form.elements.purpose?.value ?? purpose;
    const notes = [];
    let steps = 0;
    if (sys.vehicle.handling) { steps += sys.vehicle.handling; notes.push(t("Vehicle handling {s}", { s: kr(sys.vehicle.handling) })); }
    if (sys.pilotSteps) { steps += sys.pilotSteps; notes.push(t("Damage (cabin, propulsion) {s}", { s: kr(sys.pilotSteps) })); }
    if (p === "evasive" && size.dodge) { steps += size.dodge; notes.push(t("Large vehicle — dodge penalty {s}", { s: kr(size.dodge) })); }
    return { steps, mod: 0, notes, data: { purpose: p } };
  };
  const onRender = (form, update) => {
    const sel = form.elements.purpose;
    const note = form.querySelector(".purpose-note");
    const sync = () => {
      const p = PURPOSES[sel.value];
      if (note) note.textContent = p.note;
      const radio = form.querySelector(`input[name=mfd][value="${p.step}"]`);
      if (radio) radio.checked = true;
      update();
    };
    sel?.addEventListener("change", sync);
    sync();
  };
  const rc = rollContext(pilot, b.ctx, { manualMod: b.manualMod });
  const r = await promptMfd(t("Steering: {name}", { name: vehicle.name }), b.tn, rc, { defaultStep: PURPOSES[purpose].step, extraHtml, readExtra, onRender });
  if (!r) return null;
  const { extra = {}, ...roll } = r;
  const p = PURPOSES[extra.purpose] ?? PURPOSES.other;
  await spendActions(pilot === vehicle ? vehicle : pilot, 1, t("steering"));
  const msg = await rollTest(pilot, { label: `${p.label}: ${vehicle.name} (${b.label})`, baseTn: b.tn, ...roll });
  const res = resultOf(msg);
  if (extra.purpose === "evasive" && okResult(res)) {
    const steps = res === "crit-success" ? 2 : 1;
    await vehicle.setFlag(F, "evasive", { combat: game.combat?.id ?? null, round: game.combat?.round ?? 0, steps });
    ui.notifications.info(`${t("{name}: evasive maneuver — attacks on the vehicle {s}", { name: vehicle.name, s: stepsLabel(-steps) })} ${game.combat ? t("until the end of the next round") : t("(works only in combat)")}.`);
  }
  if (res === "crit-fail") ui.notifications.warn(t("{name}: critical failure — the vehicle gets out of control (GM: a crash or a roll to regain control).", { name: vehicle.name }));
  return msg;
}

// ---------- broń pokładowa ----------

/** Strzał z broni pojazdu: strzela wybrany członek załogi (jego umiejętność i SATS), bez kar za ciężar broni. */
export async function fireVehicleWeapon(vehicle, item) {
  const sys = vehicle.system;
  if (sys.dead) return warn(t("{name} is a wreck.", { name: vehicle.name }));
  if (sys.gunsDown) return warn(t("{name}: armament destroyed — mounted weapons can't fire (repair the “Armament” area).", { name: vehicle.name }));
  const gunner = await pickActor(vehicle, candidates(vehicle, ["gunner", "pilot"]), t("Gunner: {name}", { name: item.name }), t("Vehicle crew ({name} statistics)", { name: vehicle.name }));
  if (!gunner) return null;
  return attackWithWeapon(gunner, item, { vehicle });
}

// ---------- zderzenia i taranowanie ----------

/** Karta obrażeń zderzenia z przyciskiem „Nanieś obrażenia” (jak upadek: bez DT pancerza, naturalne DT i pancerz pojazdu działają). */
async function collisionCard(speaker, { title, tag, formula, bonus = 0, roll, targets, loc = "torso", aoe = false, notes = [] }) {
  const meta = [...notes, t("A crash works like a fall: 1d20 per 20 ft of speed (Speed Lines). Ignores worn armor DT — natural DT and the vehicle's armor work.")];
  return ChatMessage.create({
    speaker,
    rolls: [roll],
    content: `
    <div class="foe-card damage">
      <div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>${esc(formula)}</span></div>
      <h3>${esc(title)}</h3>
      <div class="fc-main"><div class="fc-roll">${roll.total}<small>${t("DMG")}</small></div><div class="fc-outcome">${t("Crash")}</div><div class="fc-sum">${esc(roll.formula)}</div></div>
      ${bonus ? `<div class="fc-calc">${t("including +{n}d20 for the size advantage", { n: bonus })}</div>` : ""}
      <div class="fc-meta">${meta.map(m => `<div>${esc(m)}</div>`).join("")}</div>
      <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> ${t("Apply damage")}</button>
    </div>`,
    flags: { [F]: { damage: {
      specials: {}, shockWounds: 0, actorUuid: null, itemUuid: null, itemName: title, total: roll.total, pre: roll.total,
      critMult: 1, crit: false, aoe, loc, called: null, table: null, ignoreDT: 0, ignoreArmor: true, noDegrade: true, flatMult: true,
      targets: targets.filter(Boolean)
    } } }
  });
}

/** Taranowanie namierzonego celu: rzut sterowania (cel duży = łatwiej), potem zderzenie dla celu i dla taranującego. */
export async function ramWithVehicle(vehicle) {
  const sys = vehicle.system;
  if (sys.dead) return warn(t("{name} is a wreck.", { name: vehicle.name }));
  const targetTok = [...(game.user?.targets ?? [])][0];
  const target = targetTok?.actor;
  if (!target) return warn(t("Target what you want to ram (the T key on its token)."));
  const pilot = pilotOf(vehicle);
  if (!pilot.isOwner) return warn(t("You can't steer for {name}.", { name: pilot.name }));
  const b = rollBase(pilot, sys.pilotSkill);
  const tsys = target.system;
  const tSize = tsys.isVehicle ? tsys.size : null;
  const tDw = tsys.dmgPerWound ?? 10;
  const tEvasive = tsys.isVehicle ? evasiveActive(target.getFlag(F, "evasive"), game.combat) : 0;
  const speed0 = sys.vehicle.currentSpeed || sys.speed;
  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info"><div>${t("Ramming: {v} (steered by {p}) → target: {target}", { v: `<b>${esc(vehicle.name)}</b>`, p: esc(pilot.name), target: `<b>${esc(target.name)}</b>` })}</div>
        <div>${t("Damage: 1d20 per 20 ft of speed")}${ramBonusDice(sys.dmgPerWound, tDw) ? ` + ${t("{n}d20 for the size advantage", { n: ramBonusDice(sys.dmgPerWound, tDw) })}` : ""}; ${t("the rammer takes damage on the hull without the size bonus.")}</div></div>
      <label class="atk-row">${t("Speed (ft/round)")} <input type="number" name="speed" value="${speed0}" min="0" step="5"></label>
      <label class="atk-row">${t("Target's speed toward you (head-on)")} <input type="number" name="tspeed" value="0" min="0" step="5"></label>
    </div>`;
  const readExtra = form => {
    const el = form.elements;
    const notes = [];
    let steps = 0;
    if (sys.vehicle.handling) { steps += sys.vehicle.handling; notes.push(t("Handling {s}", { s: kr(sys.vehicle.handling) })); }
    if (sys.pilotSteps) { steps += sys.pilotSteps; notes.push(t("Vehicle damage {s}", { s: kr(sys.pilotSteps) })); }
    if (tSize?.steps) { steps += tSize.steps; notes.push(t("Large target {s}", { s: kr(tSize.steps) })); }
    if (tEvasive) { steps -= tEvasive; notes.push(t("Target in an evasive maneuver {s}", { s: kr(-tEvasive) })); }
    return { steps, mod: 0, notes, data: { speed: Number(el.speed.value) || 0, tspeed: Number(el.tspeed.value) || 0 } };
  };
  const rc = rollContext(pilot, b.ctx, { manualMod: b.manualMod });
  const r = await promptMfd(t("Ramming: {v} → {target}", { v: vehicle.name, target: target.name }), b.tn, rc, { defaultStep: "1", extraHtml, readExtra });
  if (!r) return null;
  const { extra = {}, ...roll } = r;
  await spendActions(pilot === vehicle ? vehicle : pilot, 1, t("ramming"));
  const msg = await rollTest(pilot, { label: t("Ramming: {v} → {target} ({skill})", { v: vehicle.name, target: target.name, skill: b.label }), baseTn: b.tn, ...roll });
  const res = resultOf(msg);
  if (!okResult(res)) {
    if (res === "crit-fail") ui.notifications.warn(t("{name}: a miss and a loss of control — the GM decides about a crash with the surroundings.", { name: vehicle.name }));
    return msg;
  }
  const speed = extra.speed + extra.tspeed;
  const base = collisionFormula(speed);
  if (!base) return warn(t("A speed of {n} ft is too little to deal damage (at least 20 ft is needed).", { n: speed }));
  const n = Math.floor(speed / 20);
  const bonus = ramBonusDice(sys.dmgPerWound, tDw);
  const crit = res === "crit-success";
  const formula = `${n + bonus}d20`;
  const hitRoll = tint(await new Roll(formula).evaluate(crit ? { maximize: true } : {}), "damage");
  const speaker = ChatMessage.getSpeaker({ actor: pilot });
  await collisionCard(speaker, {
    title: t("Ramming: {name}", { name: target.name }), tag: t("RAMMING"), formula, bonus, roll: hitRoll, targets: [targetTok.document?.uuid],
    loc: "torso", notes: [`${t("speed {n} ft", { n: speed })}${extra.tspeed ? ` ${t("(target {n} ft included)", { n: extra.tspeed })}` : ""}`, ...(crit ? [t("critical: maximum damage")] : [])]
  });
  const selfRoll = tint(await new Roll(base).evaluate(), "damage");
  await collisionCard(speaker, {
    title: t("Recoil: {name}", { name: vehicle.name }), tag: t("RAMMING"), formula: base, roll: selfRoll, targets: [tokenUuid(vehicle)], loc: "torso",
    notes: [t("the rammer takes damage on the front of the hull (house rule)")]
  });
  return msg;
}

/**
 * Zderzenie z przeszkodą albo katastrofa: obrażenia dla pojazdu (1d20 / 20 ft prędkości albo 1d20 / 10 ft upadku)
 * i dla załogi w środku (te same kości jako d10 — osłania ich pojazd; przy rozbitym kadłubie d20). Zasada domowa.
 */
export async function crashVehicle(vehicle) {
  const sys = vehicle.system;
  const sky = sys.vehicle.kind === "sky";
  const pick = await DialogV2.wait({
    window: { title: t("Crash: {name}", { name: vehicle.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <label class="atk-row">${t("col|Type")} <select name="mode"><option value="speed">${t("Crash (speed)")}</option>${sky ? `<option value="fall" ${sys.falling ? "selected" : ""}>${t("Fall from a height")}</option>` : ""}</select></label>
      <label class="atk-row">${t("Speed (ft/round)")} <input type="number" name="speed" value="${sys.vehicle.currentSpeed || sys.speed}" min="0" step="5"></label>
      ${sky ? `<label class="atk-row">${t("Height (ft)")} <input type="number" name="feet" value="${sys.altitude || 0}" min="0" step="5"></label>` : ""}
      <label class="atk-row atk-check"><input type="checkbox" name="crew" checked><span>${t("Damage to the crew")}</span><small>${t("the same dice as d10 (the vehicle shields them); with a damaged hull d20")}</small></label>
      <p class="hint">${t("Crash: 1d20 per 20 ft of speed (Speed Lines). Fall: 1d20 per 10 ft. Damage from a fall over 100 ft hits every area.")}</p></div>`,
    buttons: [{ action: "ok", label: t("btn|Roll"), icon: "fa-solid fa-car-burst", default: true, callback: (ev, btn) => {
      const el = btn.form.elements;
      return { mode: el.mode.value, speed: Number(el.speed.value) || 0, feet: Number(el.feet?.value) || 0, crew: el.crew.checked };
    } }]
  });
  if (!pick) return null;
  const fall = pick.mode === "fall";
  const formula = fall ? fallFormula(pick.feet) : collisionFormula(pick.speed);
  if (!formula) return warn(fall ? t("A fall from less than 10 ft does no damage.") : t("A speed below 20 ft deals no damage."));
  const speaker = ChatMessage.getSpeaker({ actor: vehicle });
  const roll = tint(await new Roll(formula).evaluate(), "damage");
  const everywhere = fall && pick.feet > 100;
  await collisionCard(speaker, {
    title: fall ? t("Disaster: {name}", { name: vehicle.name }) : t("Crash: {name}", { name: vehicle.name }), tag: fall ? t("DISASTER") : t("CRASH"), formula, roll,
    targets: [tokenUuid(vehicle)], loc: "torso", aoe: everywhere, notes: [fall ? t("fall from {n} ft", { n: pick.feet }) : t("speed {n} ft", { n: pick.speed })]
  });
  if (fall && sys.altitude) await vehicle.update({ "system.altitude": 0 });
  if (pick.crew) {
    const inside = crewOf(vehicle).filter(c => c.actor && c.role !== "puller");
    if (inside.length) {
      const exposed = sys.locations.torso.isCrippled || sys.areaState?.head === "lethal";
      const crewFormula = exposed ? formula : formula.replace(/d20$/, "d10");
      const crewRoll = tint(await new Roll(crewFormula).evaluate(), "damage");
      await collisionCard(speaker, {
        title: t("Crew: {name}", { name: vehicle.name }), tag: t("CRASH"), formula: crewFormula, roll: crewRoll,
        targets: inside.map(c => tokenUuid(c.actor)), loc: "torso", aoe: everywhere,
        notes: [t("inside: {list}", { list: inside.map(c => c.actor.name).join(", ") }), exposed ? t("hull or cabin smashed — no cover (d20)") : t("the vehicle shields them (d10)"),
          t("Characters without a token on the scene: target them (T) before clicking.")]
      });
    }
    const pullers = crewOf(vehicle).filter(c => c.actor && c.role === "puller");
    if (pullers.length && !fall) ui.notifications.info(t("Harness ({list}): the GM decides whether the ponies crashed too — they can use the “Fall” button on their sheets.", { list: pullers.map(c => c.actor.name).join(", ") }));
  }
  if (pick.speed && !fall) await vehicle.update({ "system.vehicle.currentSpeed": 0 });
  return true;
}

// ---------- naprawa ----------

/**
 * Naprawa strefy (zasada domowa): rzut Repair — sukces usuwa 1 ranę (krytyk 2), zużywa 1 złom (metal albo elektronika)
 * z ekwipunku mechanika albo pojazdu. Poza walką to około godzina pracy; w walce 2 akcje i tylko łatanie (MFD ½).
 */
export async function repairVehicle(vehicle) {
  const sys = vehicle.system;
  const damaged = vehicleAreas(sys.vehicle.kind).filter(a => sys.locations[a.loc].wounds > 0);
  if (!damaged.length) return ui.notifications.info(t("{name}: nothing to repair.", { name: vehicle.name }));
  const mech = await pickActor(vehicle, candidates(vehicle, null), t("Repair: {name}", { name: vehicle.name }), t("Vehicle crew ({name} statistics)", { name: vehicle.name }));
  if (!mech) return null;
  const b = rollBase(mech, "repair");
  const scrapOf = a => a.items.filter(i => i.type === "gear" && /scrap (metal|electronics)|złom/i.test(i.name) && (i.system.qty || 0) > 0);
  const scrap = [...scrapOf(mech), ...(mech === vehicle ? [] : scrapOf(vehicle))];
  const have = scrap.reduce((sum, i) => sum + (i.system.qty || 0), 0);
  const inCombat = !!game.combat?.started;
  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info"><div>${t("Mechanic: {name} · scrap: {n}", { name: `<b>${esc(mech.name)}</b>`, n: `<b>${have}</b>` })}${have ? "" : ` — ${t("none (Scrap Metal / Scrap Electronics); the GM may allow repairing with something else")}`}</div>
        <div>${t("Success: −1 wound in the area (critical −2).")} ${inCombat ? t("In combat: 2 actions, MFD ½.") : t("Out of combat: about an hour of work.")}</div></div>
      <label class="atk-row">${t("Area")} <select name="loc">${damaged.map(a => `<option value="${a.loc}">${esc(a.label)} (${tn(sys.locations[a.loc].wounds, "{n} wound", "{n} wounds")})</option>`).join("")}</select></label>
    </div>`;
  const readExtra = form => ({ steps: 0, mod: 0, notes: [], data: { loc: form.elements.loc.value } });
  const rc = rollContext(mech, b.ctx, { manualMod: b.manualMod });
  const r = await promptMfd(t("Repair: {name}", { name: vehicle.name }), b.tn, rc, { defaultStep: inCombat ? "1/2" : "1", extraHtml, readExtra });
  if (!r) return null;
  const { extra = {}, ...roll } = r;
  if (inCombat) await spendActions(mech, 2, t("repairing"));
  const area = damaged.find(a => a.loc === extra.loc) ?? damaged[0];
  const msg = await rollTest(mech, { label: t("Repair: {v} — {area} (Repair)", { v: vehicle.name, area: area.label }), baseTn: b.tn, ...roll });
  const res = resultOf(msg);
  if (!okResult(res)) return msg;
  const L = vehicle.system.locations[area.loc];
  const fixed = Math.min(L.wounds, res === "crit-success" ? 2 : 1);
  if (scrap.length) await scrap[0].update({ "system.qty": scrap[0].system.qty - 1 });
  await vehicle.update({ [`system.locations.${area.loc}.wounds`]: L.wounds - fixed });
  ui.notifications.info(`${vehicle.name}: ${area.label} −${tn(fixed, "{n} wound", "{n} wounds")}${scrap.length ? ` ${t("(used {item})", { item: scrap[0].name })}` : ""}.`);
  return msg;
}

// ---------- wzory pojazdów ----------

/** Tworzy pojazd ze wzoru (katalog → zakładka Pojazdy) w folderze „FoE Vehicles” / „Pojazdy FoE”. */
export async function importVehicle(e, catalog) {
  if (!game.user.can("ACTOR_CREATE")) return warn(t("Only the GM (or a player allowed to create actors) can add vehicles."));
  const { actor, items, missing } = buildVehicle(e, { catalog, weaponItem });
  let folder = game.folders?.find(f => f.type === "Actor" && (f.getFlag?.(F, "vehicles") || ["Pojazdy FoE", "FoE Vehicles"].includes(f.name))); // pl-ok: dawna nazwa folderu
  if (!folder && game.user.isGM) folder = await Folder.create({ name: t("FoE Vehicles"), type: "Actor", color: "#3a5a1f", flags: { [F]: { vehicles: true } } });
  actor.folder = folder?.id ?? null;
  const created = await Actor.implementation.create(actor);
  if (!created) return null;
  if (items.length) await created.createEmbeddedDocuments("Item", items);
  ui.notifications.info(missing.length ? t("Vehicles: added {name} (missing from the catalog: {list}). Drag it onto the scene and add the crew.", { name: created.name, list: missing.join(", ") }) : t("Vehicles: added {name}. Drag it onto the scene and add the crew.", { name: created.name }));
  created.sheet.render(true);
  return created;
}

// ---------- haki ----------

export function registerVehicleHooks() {
  // zmiana postaci z załogi (prędkość zaprzęgu, lot) odświeża pojazd
  Hooks.on("updateActor", actor => {
    if (actor.type === "vehicle") return;
    for (const v of game.actors?.filter(a => a.type === "vehicle" && (a.system.vehicle?.crew ?? []).some(c => c.uuid === actor.uuid)) ?? []) {
      v.reset();
      if (v.sheet?.rendered) v.sheet.render();
    }
  });
  // po wczytaniu świata: załoga mogła być przygotowana później niż pojazd
  Hooks.once("ready", () => {
    for (const v of game.actors?.filter(a => a.type === "vehicle") ?? []) v.reset();
  });
}

