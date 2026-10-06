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

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const resultOf = msg => msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
const okResult = r => r === "success" || r === "crit-success";
const kr = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} kr.`;
const tokenUuid = actor => actor?.getActiveTokens?.()[0]?.document?.uuid ?? actor?.token?.uuid ?? null;

// ---------- załoga ----------

/** Załoga z aktorami (null, gdy aktora już nie ma). */
export const crewOf = vehicle => vehicle.system.crewList ?? [];
/** Kto steruje: pierwszy kierowca z postacią, inaczej „załoga bez imienia” (statystyki pojazdu). */
export const pilotOf = vehicle => crewOf(vehicle).find(c => c.role === "pilot" && c.actor)?.actor ?? vehicle;

export async function addCrew(vehicle, actor, role = null) {
  if (!actor || actor.type === "vehicle") return warn("Do załogi można dodać tylko postać albo NPC.");
  const crew = foundry.utils.deepClone(vehicle.system.vehicle.crew ?? []);
  if (crew.some(c => c.uuid === actor.uuid)) return warn(`${actor.name} już jest w pojeździe ${vehicle.name}.`);
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
  for (const t of canvas?.tokens?.controlled ?? []) if (t.actor && t.actor.type !== "vehicle" && !out.has(t.actor.uuid)) out.set(t.actor.uuid, { actor: t.actor, note: "zaznaczony token" });
  const own = game.user?.character;
  if (own && !out.has(own.uuid)) out.set(own.uuid, { actor: own, note: "twoja postać" });
  return [...out.values()].filter(x => x.actor.isOwner);
}

/** Okienko wyboru postaci; „anon” = załoga bez imienia (statystyki pojazdu). */
async function pickActor(vehicle, list, title, anonLabel) {
  const opts = [...list.map((x, i) => ({ v: String(i), label: `${x.actor.name} (${x.note})` })), ...(anonLabel && vehicle.isOwner ? [{ v: "anon", label: anonLabel }] : [])];
  if (!opts.length) return warn("Brak postaci do wyboru: dodaj ją do załogi albo zaznacz jej token.");
  if (opts.length === 1) return opts[0].v === "anon" ? vehicle : list[0].actor;
  const own = list.findIndex(x => x.actor === game.user?.character);
  const def = own >= 0 ? String(own) : opts[0].v;
  const pick = await DialogV2.wait({
    window: { title }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 400 }, rejectClose: false,
    content: `<div class="foe-dialog"><label class="atk-row">Kto <select name="who">${opts.map(o => `<option value="${o.v}" ${o.v === def ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label></div>`,
    buttons: [{ action: "ok", label: "Dalej", icon: "fa-solid fa-check", default: true, callback: (ev, btn) => btn.form.elements.who.value }]
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

const PURPOSES = {
  evasive: { label: "Manewr unikowy", step: "1", note: "sukces: ataki na pojazd −1 krok MFD do końca następnej rundy (krytyk: −2)" },
  chase: { label: "Pościg / wyprzedzanie", step: "1", note: "rzut przeciwstawny — wygrywa wyższy osiągnięty poziom MFD" },
  terrain: { label: "Trudny teren, ciasne przejście", step: "3/4", note: "porażka: MG może zarządzić zderzenie" },
  control: { label: "Odzyskanie panowania", step: "1/2", note: "po trafieniu w napęd, wybuchu albo krytycznej porażce" },
  other: { label: "Inny manewr", step: "1", note: "" }
};

/** Rzut sterowania pojazdem (zasada domowa: umiejętność/atrybut kierowcy + prowadzenie pojazdu + kary ze stref). */
export async function driveVehicle(vehicle, { purpose = "evasive" } = {}) {
  const sys = vehicle.system;
  if (sys.dead) return warn(`${vehicle.name} to wrak.`);
  const pilot = pilotOf(vehicle);
  if (!pilot.isOwner) return warn(`Nie możesz sterować za ${pilot.name}.`);
  const b = rollBase(pilot, sys.pilotSkill);
  if (!b.known) return warn(`${pilot.name} nie ma umiejętności ${b.label} — wybierz innego kierowcę albo inną umiejętność sterowania.`);
  const size = sys.size;
  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info">
        <div>Steruje: <b>${esc(pilot.name)}</b>${pilot === vehicle ? " (załoga pojazdu)" : ""} · ${esc(b.label)} · prędkość ${sys.speed} ft${sys.vehicle.currentSpeed ? ` · w ruchu ${sys.vehicle.currentSpeed} ft/rundę` : ""}</div>
        ${sys.speedNotes?.length ? `<div>${sys.speedNotes.map(esc).join(" · ")}</div>` : ""}
      </div>
      <label class="atk-row">Manewr <select name="purpose">${Object.entries(PURPOSES).map(([k, p]) => `<option value="${k}" ${k === purpose ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
      <div class="atk-info purpose-note"></div>
    </div>`;
  const readExtra = form => {
    const p = form.elements.purpose?.value ?? purpose;
    const notes = [];
    let steps = 0;
    if (sys.vehicle.handling) { steps += sys.vehicle.handling; notes.push(`Prowadzenie pojazdu ${kr(sys.vehicle.handling)}`); }
    if (sys.pilotSteps) { steps += sys.pilotSteps; notes.push(`Uszkodzenia (kabina, napęd) ${kr(sys.pilotSteps)}`); }
    if (p === "evasive" && size.dodge) { steps += size.dodge; notes.push(`Duży pojazd — kara do uników ${kr(size.dodge)}`); }
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
  const r = await promptMfd(`Sterowanie: ${vehicle.name}`, b.tn, rc, { defaultStep: PURPOSES[purpose].step, extraHtml, readExtra, onRender });
  if (!r) return null;
  const { extra = {}, ...roll } = r;
  const p = PURPOSES[extra.purpose] ?? PURPOSES.other;
  await spendActions(pilot === vehicle ? vehicle : pilot, 1, "sterowanie");
  const msg = await rollTest(pilot, { label: `${p.label}: ${vehicle.name} (${b.label})`, baseTn: b.tn, ...roll });
  const res = resultOf(msg);
  if (extra.purpose === "evasive" && okResult(res)) {
    const steps = res === "crit-success" ? 2 : 1;
    await vehicle.setFlag(F, "evasive", { combat: game.combat?.id ?? null, round: game.combat?.round ?? 0, steps });
    ui.notifications.info(`${vehicle.name}: manewr unikowy — ataki na pojazd −${steps} ${steps === 1 ? "krok" : "kroki"} MFD${game.combat ? " do końca następnej rundy" : " (działa tylko w walce)"}.`);
  }
  if (res === "crit-fail") ui.notifications.warn(`${vehicle.name}: krytyczna porażka — pojazd wymyka się spod kontroli (MG: zderzenie albo rzut na odzyskanie panowania).`);
  return msg;
}

// ---------- broń pokładowa ----------

/** Strzał z broni pojazdu: strzela wybrany członek załogi (jego umiejętność i SATS), bez kar za ciężar broni. */
export async function fireVehicleWeapon(vehicle, item) {
  const sys = vehicle.system;
  if (sys.dead) return warn(`${vehicle.name} to wrak.`);
  if (sys.gunsDown) return warn(`${vehicle.name}: uzbrojenie zniszczone — broń pokładowa nie strzela (napraw strefę „Uzbrojenie”).`);
  const gunner = await pickActor(vehicle, candidates(vehicle, ["gunner", "pilot"]), `Strzelec: ${item.name}`, `Załoga pojazdu (statystyki ${vehicle.name})`);
  if (!gunner) return null;
  return attackWithWeapon(gunner, item, { vehicle });
}

// ---------- zderzenia i taranowanie ----------

/** Karta obrażeń zderzenia z przyciskiem „Nanieś obrażenia” (jak upadek: bez DT pancerza, naturalne DT i pancerz pojazdu działają). */
async function collisionCard(speaker, { title, tag, formula, bonus = 0, roll, targets, loc = "torso", aoe = false, notes = [] }) {
  const meta = [...notes, "Zderzenie jak upadek: 1d20 za każde 20 ft prędkości (Speed Lines). Ignoruje DT pancerza noszonego — działa naturalne DT i pancerz pojazdu."];
  return ChatMessage.create({
    speaker,
    rolls: [roll],
    content: `
    <div class="foe-card damage">
      <div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>${esc(formula)}</span></div>
      <h3>${esc(title)}</h3>
      <div class="fc-main"><div class="fc-roll">${roll.total}<small>OBR.</small></div><div class="fc-outcome">Zderzenie</div><div class="fc-sum">${esc(roll.formula)}</div></div>
      ${bonus ? `<div class="fc-calc">w tym +${bonus}d20 za przewagę rozmiaru</div>` : ""}
      <div class="fc-meta">${meta.map(m => `<div>${esc(m)}</div>`).join("")}</div>
      <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> Nanieś obrażenia</button>
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
  if (sys.dead) return warn(`${vehicle.name} to wrak.`);
  const targetTok = [...(game.user?.targets ?? [])][0];
  const target = targetTok?.actor;
  if (!target) return warn("Namierz cel taranowania (klawisz T na jego tokenie).");
  const pilot = pilotOf(vehicle);
  if (!pilot.isOwner) return warn(`Nie możesz sterować za ${pilot.name}.`);
  const b = rollBase(pilot, sys.pilotSkill);
  const tsys = target.system;
  const tSize = tsys.isVehicle ? tsys.size : null;
  const tDw = tsys.dmgPerWound ?? 10;
  const tEvasive = tsys.isVehicle ? evasiveActive(target.getFlag(F, "evasive"), game.combat) : 0;
  const speed0 = sys.vehicle.currentSpeed || sys.speed;
  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info"><div>Taranuje: <b>${esc(vehicle.name)}</b> (steruje ${esc(pilot.name)}) → cel: <b>${esc(target.name)}</b></div>
        <div>Obrażenia: 1d20 za każde 20 ft prędkości${ramBonusDice(sys.dmgPerWound, tDw) ? ` + ${ramBonusDice(sys.dmgPerWound, tDw)}d20 za przewagę rozmiaru` : ""}; taranujący obrywa kadłubem bez premii za rozmiar.</div></div>
      <label class="atk-row">Prędkość (ft/rundę) <input type="number" name="speed" value="${speed0}" min="0" step="5"></label>
      <label class="atk-row">Prędkość celu naprzeciw (czołowo) <input type="number" name="tspeed" value="0" min="0" step="5"></label>
    </div>`;
  const readExtra = form => {
    const el = form.elements;
    const notes = [];
    let steps = 0;
    if (sys.vehicle.handling) { steps += sys.vehicle.handling; notes.push(`Prowadzenie ${kr(sys.vehicle.handling)}`); }
    if (sys.pilotSteps) { steps += sys.pilotSteps; notes.push(`Uszkodzenia pojazdu ${kr(sys.pilotSteps)}`); }
    if (tSize?.steps) { steps += tSize.steps; notes.push(`Duży cel ${kr(tSize.steps)}`); }
    if (tEvasive) { steps -= tEvasive; notes.push(`Cel w manewrze unikowym ${kr(-tEvasive)}`); }
    return { steps, mod: 0, notes, data: { speed: Number(el.speed.value) || 0, tspeed: Number(el.tspeed.value) || 0 } };
  };
  const rc = rollContext(pilot, b.ctx, { manualMod: b.manualMod });
  const r = await promptMfd(`Taranowanie: ${vehicle.name} → ${target.name}`, b.tn, rc, { defaultStep: "1", extraHtml, readExtra });
  if (!r) return null;
  const { extra = {}, ...roll } = r;
  await spendActions(pilot === vehicle ? vehicle : pilot, 1, "taranowanie");
  const msg = await rollTest(pilot, { label: `Taranowanie: ${vehicle.name} → ${target.name} (${b.label})`, baseTn: b.tn, ...roll });
  const res = resultOf(msg);
  if (!okResult(res)) {
    if (res === "crit-fail") ui.notifications.warn(`${vehicle.name}: chybienie i utrata panowania — MG decyduje o zderzeniu z otoczeniem.`);
    return msg;
  }
  const speed = extra.speed + extra.tspeed;
  const base = collisionFormula(speed);
  if (!base) return warn(`Prędkość ${speed} ft to za mało, by zadać obrażenia (potrzeba co najmniej 20 ft).`);
  const n = Math.floor(speed / 20);
  const bonus = ramBonusDice(sys.dmgPerWound, tDw);
  const crit = res === "crit-success";
  const formula = `${n + bonus}d20`;
  const hitRoll = tint(await new Roll(formula).evaluate(crit ? { maximize: true } : {}), "damage");
  const speaker = ChatMessage.getSpeaker({ actor: pilot });
  await collisionCard(speaker, {
    title: `Taranowanie: ${target.name}`, tag: "TARANOWANIE", formula, bonus, roll: hitRoll, targets: [targetTok.document?.uuid],
    loc: "torso", notes: [`prędkość ${speed} ft${extra.tspeed ? ` (w tym cel ${extra.tspeed} ft)` : ""}`, ...(crit ? ["krytyk: maksymalne obrażenia"] : [])]
  });
  const selfRoll = tint(await new Roll(base).evaluate(), "damage");
  await collisionCard(speaker, {
    title: `Odrzut: ${vehicle.name}`, tag: "TARANOWANIE", formula: base, roll: selfRoll, targets: [tokenUuid(vehicle)], loc: "torso",
    notes: ["taranujący obrywa przodem kadłuba (zasada domowa)"]
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
    window: { title: `Zderzenie: ${vehicle.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <label class="atk-row">Rodzaj <select name="mode"><option value="speed">Zderzenie (prędkość)</option>${sky ? `<option value="fall" ${sys.falling ? "selected" : ""}>Upadek z wysokości</option>` : ""}</select></label>
      <label class="atk-row">Prędkość (ft/rundę) <input type="number" name="speed" value="${sys.vehicle.currentSpeed || sys.speed}" min="0" step="5"></label>
      ${sky ? `<label class="atk-row">Wysokość (ft) <input type="number" name="feet" value="${sys.altitude || 0}" min="0" step="5"></label>` : ""}
      <label class="atk-row atk-check"><input type="checkbox" name="crew" checked><span>Obrażenia dla załogi</span><small>te same kości jako d10 (osłania ich pojazd); przy uszkodzonym kadłubie d20</small></label>
      <p class="hint">Zderzenie: 1d20 za każde 20 ft prędkości (Speed Lines). Upadek: 1d20 za każde 10 ft. Obrażenia ponad 100 ft upadku trafiają we wszystkie strefy.</p></div>`,
    buttons: [{ action: "ok", label: "Rzuć", icon: "fa-solid fa-car-burst", default: true, callback: (ev, btn) => {
      const el = btn.form.elements;
      return { mode: el.mode.value, speed: Number(el.speed.value) || 0, feet: Number(el.feet?.value) || 0, crew: el.crew.checked };
    } }]
  });
  if (!pick) return null;
  const fall = pick.mode === "fall";
  const formula = fall ? fallFormula(pick.feet) : collisionFormula(pick.speed);
  if (!formula) return warn(fall ? "Upadek z mniej niż 10 ft nie zadaje obrażeń." : "Prędkość poniżej 20 ft nie zadaje obrażeń.");
  const speaker = ChatMessage.getSpeaker({ actor: vehicle });
  const roll = tint(await new Roll(formula).evaluate(), "damage");
  const everywhere = fall && pick.feet > 100;
  await collisionCard(speaker, {
    title: `${fall ? "Katastrofa" : "Zderzenie"}: ${vehicle.name}`, tag: fall ? "KATASTROFA" : "ZDERZENIE", formula, roll,
    targets: [tokenUuid(vehicle)], loc: "torso", aoe: everywhere, notes: [fall ? `upadek z ${pick.feet} ft` : `prędkość ${pick.speed} ft`]
  });
  if (fall && sys.altitude) await vehicle.update({ "system.altitude": 0 });
  if (pick.crew) {
    const inside = crewOf(vehicle).filter(c => c.actor && c.role !== "puller");
    if (inside.length) {
      const exposed = sys.locations.torso.isCrippled || sys.areaState?.head === "lethal";
      const crewFormula = exposed ? formula : formula.replace(/d20$/, "d10");
      const crewRoll = tint(await new Roll(crewFormula).evaluate(), "damage");
      await collisionCard(speaker, {
        title: `Załoga: ${vehicle.name}`, tag: "ZDERZENIE", formula: crewFormula, roll: crewRoll,
        targets: inside.map(c => tokenUuid(c.actor)), loc: "torso", aoe: everywhere,
        notes: [`w środku: ${inside.map(c => c.actor.name).join(", ")}`, exposed ? "kadłub albo kabina rozbite — bez osłony (d20)" : "osłania ich pojazd (d10)",
          "Postacie bez tokenu na scenie: namierz je (T) przed kliknięciem."]
      });
    }
    const pullers = crewOf(vehicle).filter(c => c.actor && c.role === "puller");
    if (pullers.length && !fall) ui.notifications.info(`Zaprzęg (${pullers.map(c => c.actor.name).join(", ")}): MG decyduje, czy kucyki też uderzyły — mogą użyć przycisku „Upadek” na swoich kartach.`);
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
  if (!damaged.length) return ui.notifications.info(`${vehicle.name}: nic do naprawy.`);
  const mech = await pickActor(vehicle, candidates(vehicle, null), `Naprawa: ${vehicle.name}`, `Załoga pojazdu (statystyki ${vehicle.name})`);
  if (!mech) return null;
  const b = rollBase(mech, "repair");
  const scrapOf = a => a.items.filter(i => i.type === "gear" && /scrap (metal|electronics)|złom/i.test(i.name) && (i.system.qty || 0) > 0);
  const scrap = [...scrapOf(mech), ...(mech === vehicle ? [] : scrapOf(vehicle))];
  const have = scrap.reduce((t, i) => t + (i.system.qty || 0), 0);
  const inCombat = !!game.combat?.started;
  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info"><div>Mechanik: <b>${esc(mech.name)}</b> · złom: <b>${have}</b>${have ? "" : " — brak (Scrap Metal / Scrap Electronics); MG może pozwolić naprawiać czymś innym"}</div>
        <div>Sukces: −1 rana w strefie (krytyk −2). ${inCombat ? "W walce: 2 akcje, MFD ½." : "Poza walką: około godzina pracy."}</div></div>
      <label class="atk-row">Strefa <select name="loc">${damaged.map(a => `<option value="${a.loc}">${esc(a.label)} (${sys.locations[a.loc].wounds} ran)</option>`).join("")}</select></label>
    </div>`;
  const readExtra = form => ({ steps: 0, mod: 0, notes: [], data: { loc: form.elements.loc.value } });
  const rc = rollContext(mech, b.ctx, { manualMod: b.manualMod });
  const r = await promptMfd(`Naprawa: ${vehicle.name}`, b.tn, rc, { defaultStep: inCombat ? "1/2" : "1", extraHtml, readExtra });
  if (!r) return null;
  const { extra = {}, ...roll } = r;
  if (inCombat) await spendActions(mech, 2, "naprawa");
  const area = damaged.find(a => a.loc === extra.loc) ?? damaged[0];
  const msg = await rollTest(mech, { label: `Naprawa: ${vehicle.name} — ${area.label} (Repair)`, baseTn: b.tn, ...roll });
  const res = resultOf(msg);
  if (!okResult(res)) return msg;
  const L = vehicle.system.locations[area.loc];
  const fixed = Math.min(L.wounds, res === "crit-success" ? 2 : 1);
  if (scrap.length) await scrap[0].update({ "system.qty": scrap[0].system.qty - 1 });
  await vehicle.update({ [`system.locations.${area.loc}.wounds`]: L.wounds - fixed });
  ui.notifications.info(`${vehicle.name}: ${area.label} −${fixed} ${fixed === 1 ? "rana" : "rany"}${scrap.length ? ` (zużyto ${scrap[0].name})` : ""}.`);
  return msg;
}

// ---------- wzory pojazdów ----------

/** Tworzy pojazd ze wzoru (katalog → zakładka Pojazdy) w folderze „Pojazdy FoE”. */
export async function importVehicle(e, catalog) {
  if (!game.user.can("ACTOR_CREATE")) return warn("Tylko MG (albo gracz z uprawnieniem tworzenia aktorów) może dodawać pojazdy.");
  const { actor, items, missing } = buildVehicle(e, { catalog, weaponItem });
  let folder = game.folders?.find(f => f.type === "Actor" && f.name === "Pojazdy FoE");
  if (!folder && game.user.isGM) folder = await Folder.create({ name: "Pojazdy FoE", type: "Actor", color: "#3a5a1f" });
  actor.folder = folder?.id ?? null;
  const created = await Actor.implementation.create(actor);
  if (!created) return null;
  if (items.length) await created.createEmbeddedDocuments("Item", items);
  ui.notifications.info(`Pojazdy: dodano ${created.name}${missing.length ? ` (brak w katalogu: ${missing.join(", ")})` : ""}. Przeciągnij go na scenę i dodaj załogę.`);
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

