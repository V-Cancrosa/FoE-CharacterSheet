import { SKILLS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest, rollDamage, locationName } from "./rolls.mjs";
import {
  CALLED_SHOTS, HIT_TABLES, hitTableFor, tableLocations, locationMultiplier, combineMultipliers,
  rangeIncrement, rangeBands, wieldPenalty, burst, isAoe, isClose, reloadInfo, effectiveDT, woundsFrom,
  POISONS, disintegrates, radsFrom, isMetalArmor
} from "./combat.mjs";
import { setCondition, toggleStatus, poisonCheck, endOfRound } from "./conditions.mjs";
import { spendActions } from "./tracker.mjs";

const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const signed = n => (n > 0 ? `+${n}` : `${n}`).replace("-", "−");
const num = n => String(n).replace(".", ",");
const stepsLabel = v => `${signed(v)} ${Math.abs(v) === 1 ? "krok" : "kroki"} MFD`;
const warn = msg => { ui.notifications.warn(msg); return null; };
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : null);

// ======================================================================
// Atak bronią
// ======================================================================

/**
 * Atak: okno z SATS, warunkami, odległością, celem (strzał celowany / losowa lokacja), ciężarem broni;
 * zużywa amunicję (seria) albo sztukę granatu i AP w SATS, potem rzut d100 z kartą ataku.
 */
export async function attackWithWeapon(actor, item, { spell = null } = {}) {
  const sys = actor.system;
  const w = item.system;
  const sk = sys.skills[w.skill];
  if (!sk) return warn("Broń nie ma przypisanej umiejętności.");
  const str = sys.attributes.str.total;
  const close = isClose(w);
  const aoe = isAoe(w);

  // Amunicja: seria „/N” traci kości, gdy brakuje naboi (s. 187); granaty zużywają sztukę
  let b = { ok: true, use: 0, lacking: 0, formula: w.damage };
  if (w.consumable) {
    if ((Number(w.qty) || 0) < 1) return warn(`${item.name}: nie masz już ani jednej sztuki — dodaj je z katalogu.`);
    b.use = 1;
  } else if (w.ammo.max > 0) {
    b = burst(w.damage, w.shots, w.ammo.value);
    if (!b.ok) return warn(w.ammo.value <= 0 ? `${item.name}: brak amunicji — przeładuj.`
      : `${item.name}: za mało amunicji, żeby strzelić (${w.ammo.value}, seria ${w.shots}) — przeładuj.`);
  }

  const sats = sys.resources.sats;
  const cost = Number(w.satsCost) || 0;
  const canSats = sats.value >= cost;
  const inc = close ? 0 : rangeIncrement(w, str);
  const bands = rangeBands(inc);
  const heavy = wieldPenalty(w.weight, str);
  const targets = [...(game.user?.targets ?? [])];
  const target = targets[0]?.actor ?? null;
  const table = hitTableFor(target?.system?.race);
  const random = !!game.settings.get("foe-rpg", "randomHitLocations");

  const info = [
    targets.length ? `Cel: <b>${targets.map(t => esc(t.name)).join(", ")}</b>` : "Cel: <i>brak — namierz token (T), żeby obrażenia trafiły od razu do niego</i>",
    w.consumable ? `Sztuk: <b>${w.qty}</b>` : w.ammo.max > 0 ? `Amunicja: <b>${w.ammo.value}/${w.ammo.max}</b>${w.shots > 1 ? ` · seria ${w.shots}${b.lacking ? ` → brakuje ${b.lacking}: <b>${esc(b.formula)}</b>` : ""}` : ""}` : "",
    aoe ? "Broń obszarowa: przeciw celom normalnej wielkości podstawowe MFD ¾ (s. 451)." : "",
    w.specials?.silenced ? "Tłumik: wykrycie strzelca o krok trudniejsze (MFD ½)." : ""
  ].filter(Boolean).map(l => `<div>${l}</div>`).join("");

  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info">${info}</div>
      ${spell ? "" : `<label class="atk-row atk-check"><input type="checkbox" name="sats" ${canSats ? "" : "disabled"}>
        <span>SATS</span><small>${canSats ? `−${cost} AP (zostanie ${sats.value - cost}) · bez kar otoczenia i pośpiechu` : `za mało AP: ${sats.value}/${cost}`}</small></label>`}
      <label class="atk-row">Otoczenie i pośpiech <select name="env">
        <option value="0">bez kar</option>
        <option value="-1">−1 krok (dym, mgła, mrok, strzał z bliska)</option>
        <option value="-2">−2 kroki</option><option value="-3">−3 kroki</option><option value="-4">−4 kroki</option>
      </select></label>
      ${bands.length ? `<label class="atk-row">Odległość <select name="range">${bands.map(x => `<option value="${x.steps}">${x.label}${x.steps ? ` (${x.steps} kr.)` : ""}</option>`).join("")}</select></label>` : ""}
      ${aoe ? "" : `<label class="atk-row">Cel ataku <select name="loc">
        ${Object.entries(CALLED_SHOTS).map(([k, c]) => `<option value="${k}" ${!random && k === "torso" ? "selected" : ""}>${c.label}${c.steps ? ` (${c.steps} kr.)` : ""}</option>`).join("")}
        <option value="random" ${random ? "selected" : ""}>Losowo (k20 wg rasy)</option>
      </select></label>
      <label class="atk-row atk-table">Tabela trafień <select name="table">
        ${Object.entries(HIT_TABLES).map(([k, t]) => `<option value="${k}" ${k === table ? "selected" : ""}>${t.label}</option>`).join("")}
      </select></label>`}
      ${heavy ? `<label class="atk-row atk-check"><input type="checkbox" name="heavy" checked>
        <span>Za ciężka broń</span><small>${w.weight} lb > 2×STR (${2 * str}): −${heavy} kr.${close ? ", bez premii STR" : ""}</small></label>` : ""}
    </div>`;

  const readExtra = form => {
    const el = form.elements;
    const satsOn = !!el.sats?.checked;
    const envRaw = Number(el.env?.value) || 0;
    const env = satsOn ? 0 : envRaw;
    const rng = Number(el.range?.value) || 0;
    const loc = el.loc?.value ?? "torso";
    const called = loc === "random" ? 0 : CALLED_SHOTS[loc]?.steps ?? 0;
    const heavySteps = el.heavy?.checked ? -heavy : 0;
    const notes = [];
    if (satsOn) notes.push(`SATS −${cost} AP${envRaw ? " (kary otoczenia pominięte)" : ""}`);
    if (env) notes.push(`Otoczenie ${stepsLabel(env)}`);
    if (rng) notes.push(`Odległość ${el.range.selectedOptions[0]?.textContent.split(" (")[0]} ${stepsLabel(rng)}`);
    if (called) notes.push(`Strzał celowany: ${CALLED_SHOTS[loc].label} ${stepsLabel(called)}`);
    if (heavySteps) notes.push(`Za ciężka broń ${stepsLabel(heavySteps)}`);
    return { steps: env + rng + called + heavySteps, mod: 0, notes, data: { sats: satsOn, loc, table: el.table?.value ?? table } };
  };

  const onRender = (form, update) => {
    const el = form.elements;
    const tableRow = form.querySelector(".atk-table");
    const sync = () => {
      if (el.env) el.env.disabled = !!el.sats?.checked;
      if (tableRow) tableRow.hidden = el.loc?.value !== "random";
    };
    // efekty sytuacyjne z „SATS” w opisie zaznaczają się razem z SATS
    el.sats?.addEventListener("change", () => {
      for (const cb of form.querySelectorAll("input[name=sit]")) if (/SATS/i.test(cb.dataset.label ?? "")) cb.checked = el.sats.checked;
      sync();
      update();
    });
    el.loc?.addEventListener("change", sync);
    sync();
  };

  const rc = rollContext(actor, { kind: "attack", skill: w.skill, skillAttr: sk.attr }, { manualMod: sk.mod });
  const r = await promptMfd(`Atak: ${item.name}`, sk.tn, rc, { defaultStep: aoe ? "3/4" : "1", extraHtml, readExtra, onRender });
  if (!r) return null;
  const { extra: ex = {}, ...roll } = r;

  if (ex.sats) {
    const cur = actor.system.resources.sats.value;
    if (cur < cost) return warn(`Za mało AP w SATS (${cur}/${cost}).`);
    await actor.update({ "system.resources.sats.value": cur - cost });
  }
  if (!spell) await spendActions(actor, 1, ex.sats ? "SATS" : "atak");
  if (w.consumable) await item.update({ "system.qty": Math.max(0, (Number(item.system.qty) || 0) - 1) });
  else if (w.ammo.max > 0) await item.update({ "system.ammo.value": Math.max(0, item.system.ammo.value - b.use) });

  const attack = {
    sats: !!ex.sats, satsCost: cost, random: ex.loc === "random", called: ex.loc === "random" ? null : ex.loc ?? "torso",
    table: ex.table ?? table, melee: close, aoe, formula: b.formula, lacking: b.lacking, used: b.use, consumable: !!w.consumable,
    targets: targets.map(t => t.document?.uuid).filter(Boolean), overglow: spell?.layers ?? 0
  };
  if (spell) return rollTest(actor, { label: `Celowanie: ${item.name} (Magic)`, baseTn: sk.tn, ...roll, itemUuid: item.uuid, attack });
  return rollTest(actor, { label: `Atak: ${item.name} (${SKILLS[w.skill]?.label ?? w.skill})`, baseTn: sk.tn, ...roll, itemUuid: item.uuid, attack });
}

// ======================================================================
// Przeładowanie (s. 451)
// ======================================================================

export async function reloadWeapon(actor, item) {
  const w = item.system;
  if (!(w.ammo.max > 0)) return warn(`${item.name} nie ma magazynka do przeładowania.`);
  const missing = w.ammo.max - w.ammo.value;
  if (missing <= 0) return ui.notifications.info(`${item.name}: magazynek jest pełny.`);
  const ri = reloadInfo(w.reload, { energy: w.skill === "energy" });
  const sats = actor.system.resources.sats;

  // Amunicja z ekwipunku: przedmiot z tym samym typem amunicji albo nazwą
  const type = String(w.ammoType ?? "").trim().toLowerCase();
  const stock = type ? actor.items.filter(i => i.type === "gear"
    && [i.system.ammoType, i.name].some(v => String(v ?? "").trim().toLowerCase() === type)) : [];
  const available = stock.reduce((t, i) => t + Math.max(0, Number(i.system.qty) || 0), 0);
  const tracked = stock.length > 0;

  const actionText = { full: "cały magazynek", half: "pół magazynka", breech: "1d4+1 naboi" }[ri.action];
  const content = `
    <div class="foe-dialog">
      <div class="atk-info">
        <div>Magazynek: <b>${w.ammo.value}/${w.ammo.max}</b> · przeładowanie: <b>${esc(ri.label || "—")}</b></div>
        <div>${tracked ? `Amunicja „${esc(w.ammoType)}” w ekwipunku: <b>${available}</b>`
          : w.ammoType ? `Brak amunicji „${esc(w.ammoType)}” w ekwipunku — załaduję bez odejmowania (dodaj ją z katalogu, żeby się liczyła).`
          : "Broń bez typu amunicji — załaduję bez odejmowania."}</div>
      </div>
      <ul class="rl-opts">
        <li><b>Akcją:</b> ${actionText}</li>
        <li><b>W SATS:</b> pełny magazynek za ${ri.ap} AP (masz ${sats.value})</li>
      </ul>
    </div>`;
  const choice = await DialogV2.wait({
    window: { title: `Przeładowanie: ${item.name}` },
    classes: ["foe-rpg", "foe-roll-dialog"],
    position: { width: 420 },
    content,
    rejectClose: false,
    buttons: [
      { action: "action", label: "Akcją", icon: "fa-solid fa-rotate", default: true },
      { action: "sats", label: `SATS −${ri.ap} AP`, icon: "fa-solid fa-crosshairs", disabled: sats.value < ri.ap }
    ]
  });
  if (!choice) return null;

  let amount = missing;
  let note = "";
  if (choice === "sats") {
    const cur = actor.system.resources.sats.value;
    if (cur < ri.ap) return warn(`Za mało AP w SATS (${cur}/${ri.ap}).`);
    await actor.update({ "system.resources.sats.value": cur - ri.ap });
  } else {
    await spendActions(actor, 1, "przeładowanie");
  }
  if (choice === "sats") {
    // pełny magazynek
  } else if (ri.action === "half") {
    amount = Math.min(missing, Math.ceil(w.ammo.max / 2));
  } else if (ri.action === "breech") {
    const r = await new Roll("1d4 + 1").evaluate();
    amount = Math.min(missing, r.total);
    note = ` (1d4+1 = ${r.total})`;
  }
  if (tracked) amount = Math.min(amount, available);
  if (amount <= 0) return warn(`Brak amunicji „${w.ammoType}” w ekwipunku.`);

  let left = amount;
  for (const s of stock) {
    if (!left) break;
    const q = Math.max(0, Number(s.system.qty) || 0);
    const take = Math.min(q, left);
    if (take) { await s.update({ "system.qty": q - take }); left -= take; }
  }
  await item.update({ "system.ammo.value": w.ammo.value + amount });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
    <div class="foe-card reload">
      <div class="fc-tag"><span>PIPBUCK // PRZEŁADOWANIE</span><span>${choice === "sats" ? `SATS −${ri.ap} AP` : "1 akcja"}</span></div>
      <h3>${esc(item.name)}</h3>
      <div class="fc-calc">Załadowano ${amount}${note}${w.ammoType ? ` × ${esc(w.ammoType)}` : ""} → <b>${w.ammo.value + amount}/${w.ammo.max}</b></div>
      ${tracked ? `<div class="fc-meta">W ekwipunku zostało: ${available - amount}</div>` : ""}
    </div>`
  });
}

// ======================================================================
// Nanoszenie obrażeń: DT, rany, okaleczenia, degradacja pancerza (s. 460–463)
// ======================================================================

const LOC_OF = { heart: "torso", eye: "head" };
const locOf = v => LOC_OF[v] ?? v;
const calledOf = v => (LOC_OF[v] ? v : null);

/** Cele: z karty ataku → namierzone → zaznaczone tokeny. */
async function resolveTargets(uuids = []) {
  const fromCard = (await Promise.all(uuids.map(u => fromUuid(u).catch(() => null)))).filter(t => t?.actor);
  if (fromCard.length) return fromCard;
  const targeted = [...(game.user?.targets ?? [])].map(t => t.document).filter(t => t?.actor);
  if (targeted.length) return targeted;
  return (canvas?.tokens?.controlled ?? []).map(t => t.document).filter(t => t?.actor);
}

/** Wynik trafienia jednego celu: obrażenia na lokację po DT i rany. */
export function computeHit(sys, { pre, mult, where, locs, dt = null, ignore = 0, ignoreAll = false, bonusWounds = 0, armorless = false }) {
  const list = where === "all" ? locs : [locOf(where)];
  const dmg = Math.floor(pre * mult);
  const bonus = where === "all" ? 0 : Math.max(0, bonusWounds);
  return list.filter(k => sys.locations[k]).map(k => {
    const L = sys.locations[k];
    const dtBase = where === "all" || dt === null || dt === "" ? (armorless ? L.naturalDt : L.dtTotal) : Number(dt) || 0;
    const eff = ignoreAll ? 0 : effectiveDT(dtBase, ignore);
    const after = Math.max(0, dmg - eff);
    const wounds = woundsFrom(after, sys.dmgPerWound) + bonus;
    return { loc: k, dmg, dt: dtBase, eff, after, wounds, armorDt: L.armorDt, before: L.wounds, now: L.wounds + wounds };
  });
}

function statusText(loc, wounds, endT) {
  if (wounds > 0 && wounds >= endT) return loc === "head" || loc === "torso" ? "ŚMIERĆ" : "KOŃCZYNA UTRACONA";
  if (wounds > 0 && wounds * 2 >= endT) return "OKALECZONA";
  return "";
}

export async function applyDamage(message) {
  const d = message.getFlag("foe-rpg", "damage");
  if (!d) return null;
  const tokens = await resolveTargets(d.targets);
  if (!tokens.length) return warn("Brak celu: namierz token klawiszem T (albo go zaznacz) i kliknij jeszcze raz.");
  const allowed = tokens.filter(t => t.actor.isOwner);
  const denied = tokens.filter(t => !t.actor.isOwner);
  if (!allowed.length) return warn(`Nie możesz zmieniać ${tokens.map(t => t.name).join(", ")} — poproś MG, żeby kliknął „Nanieś obrażenia” na tej karcie.`);
  if (denied.length) ui.notifications.info(`Pominięto (brak uprawnień): ${denied.map(t => t.name).join(", ")}.`);

  const degradeDefault = !d.noDegrade && !!game.settings.get("foe-rpg", "armorDegradation");
  // Upadek ignoruje DT pancerza — zostaje naturalne DT z cech (s. 579)
  const dtOf = (sys, v) => (d.ignoreArmor ? sys.locations[locOf(v)]?.naturalDt : sys.locations[locOf(v)]?.dtTotal) ?? 0;
  const sp = d.specials ?? {};
  const rows = allowed.map((t, i) => {
    const sys = t.actor.system;
    const table = d.table && HIT_TABLES[d.table] ? d.table : hitTableFor(sys.race);
    const locs = tableLocations(table);
    const opts = locs.map(k => ({ v: k, label: locationName(k, table) }));
    if (d.called === "heart") opts.push({ v: "heart", label: "Serce (tułów, ×2)" });
    if (d.called === "eye") opts.push({ v: "eye", label: "Oko (głowa, ×1,5)" });
    opts.push({ v: "all", label: "Cały cel — wybuch (każda lokacja)" });
    const sel = d.aoe ? "all" : calledOf(d.called) ?? (d.loc && locs.includes(d.loc) ? d.loc : "torso");
    return { t, i, sys, table, locs, opts, sel };
  });

  const defMult = v => (d.aoe || d.flatMult || v === "all" ? 1 : combineMultipliers(d.critMult ?? 1, locationMultiplier(locOf(v), calledOf(v))));
  const content = `
    <div class="foe-dialog dmg-apply">
      <div class="atk-info"><div>${esc(d.itemName)}: <b>${d.pre}</b> obrażeń przed mnożnikami${d.crit ? " (krytyk)" : ""}${d.ignoreDT ? ` · ignoruje ${d.ignoreDT} DT` : ""}</div></div>
      ${rows.map(r => `
      <fieldset class="dmg-target" data-i="${r.i}">
        <legend>${esc(r.t.name)} <small>${r.sys.dmgPerWound} obr. = 1 rana · END ${r.sys.attributes.end.total}</small></legend>
        <label>Lokacja <select name="loc-${r.i}">${r.opts.map(o => `<option value="${o.v}" ${o.v === r.sel ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>
        <label>Mnożnik <input type="number" name="mult-${r.i}" value="${defMult(r.sel)}" step="0.5" min="0"></label>
        <label class="dt-row">DT <input type="number" name="dt-${r.i}" value="${r.sel === "all" ? "" : dtOf(r.sys, r.sel)}" ${r.sel === "all" ? "disabled placeholder=\"wg lokacji\"" : ""}></label>
        <label>Ignoruje DT <input type="number" name="ign-${r.i}" value="${d.ignoreDT ?? 0}" min="0"></label>
        <label class="atk-check"><input type="checkbox" name="all-${r.i}"> <span>Ignoruj całe DT</span></label>
        <div class="dmg-out" data-out="${r.i}"></div>
      </fieldset>`).join("")}
      ${specialHtml(sp)}
      <label class="atk-row atk-check"><input type="checkbox" name="degrade" ${degradeDefault ? "checked" : ""}>
        <span>Degradacja pancerza</span><small>przebity pancerz traci 1 DT na tej lokacji (zasada opcjonalna)</small></label>
    </div>`;

  const read = (form, r) => {
    const el = form.elements;
    const where = el[`loc-${r.i}`].value;
    return {
      pre: d.pre, where, locs: r.locs,
      mult: Math.max(0, Number(el[`mult-${r.i}`].value) || 0),
      dt: el[`dt-${r.i}`].value,
      ignore: Math.max(0, Number(el[`ign-${r.i}`].value) || 0),
      ignoreAll: !!el[`all-${r.i}`].checked,
      bonusWounds: d.shockWounds ?? 0,
      armorless: !!d.ignoreArmor
    };
  };
  const describe = (r, res) => res.map(x => {
    const st = statusText(x.loc, x.now, r.sys.attributes.end.total);
    return `<div><b>${esc(locationName(x.loc, r.table))}</b>: ${x.dmg} − DT ${x.eff} = ${x.after} → <b>${x.wounds} ${x.wounds === 1 ? "rana" : "ran"}</b> (${x.before}→${x.now}/${r.sys.attributes.end.total})${st ? ` <span class="warn">${st}</span>` : ""}</div>`;
  }).join("");

  const render = (event, dialog) => {
    const root = elementOf(dialog) ?? elementOf(event?.target);
    const form = root?.querySelector("form") ?? root;
    if (!form?.elements) return;
    const update = ev => {
      for (const r of rows) {
        const el = form.elements;
        // zmiana lokacji ustawia domyślny mnożnik i DT celu
        if (ev?.target?.name === `loc-${r.i}`) {
          const v = el[`loc-${r.i}`].value;
          el[`mult-${r.i}`].value = defMult(v);
          const dtIn = el[`dt-${r.i}`];
          dtIn.disabled = v === "all";
          dtIn.value = v === "all" ? "" : dtOf(r.sys, v);
          dtIn.placeholder = v === "all" ? "wg lokacji" : "";
        }
        const out = form.querySelector(`[data-out="${r.i}"]`);
        if (out) out.innerHTML = describe(r, computeHit(r.sys, read(form, r)));
      }
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
  };

  const result = await DialogV2.wait({
    window: { title: "Nanieś obrażenia" },
    classes: ["foe-rpg", "foe-roll-dialog"],
    position: { width: 480 },
    content,
    render,
    rejectClose: false,
    buttons: [{
      action: "apply", label: "Nanieś", icon: "fa-solid fa-heart-crack", default: true,
      callback: (event, button) => ({
        degrade: !!button.form.elements.degrade?.checked,
        special: readSpecial(button.form),
        hits: rows.map(r => ({ r, input: read(button.form, r) }))
      })
    }]
  });
  if (!result) return null;

  // Elektryczność przeciw maszynom: +6d12 od razu (s. 200)
  const special = result.special;
  let robotRoll = null;
  if (special.electric && special.robot) {
    robotRoll = await new Roll("6d12").evaluate();
    for (const h of result.hits) h.input.pre += robotRoll.total;
  }

  const lines = [];
  for (const { r, input } of result.hits) {
    const actor = r.t.actor;
    const sys = actor.system;
    const res = computeHit(sys, input);
    const update = {};
    for (const x of res) if (x.wounds) update[`system.locations.${x.loc}.wounds`] = x.now;

    // Degradacja: obrażenia większe od DT pancerza na lokacji → −1 DT każdego pancerza tam założonego (s. 460)
    const armorNotes = [];
    if (result.degrade) {
      const wear = new Map();
      for (const x of res) {
        const worn = actor.items.filter(i => i.type === "armor" && i.system.equipped && i.system.cover?.[x.loc]);
        if (!worn.length || x.dmg <= x.armorDt) continue;
        if (x.armorDt <= 0) { armorNotes.push(`${worn.map(i => i.name).join(", ")} (${locationName(x.loc)}): zniszczony`); continue; }
        for (const i of worn) {
          const w = wear.get(i.id) ?? { _id: i.id, [`system.wear.${x.loc}`]: 0 };
          w[`system.wear.${x.loc}`] = (i.system.wear?.[x.loc] ?? 0) + 1;
          wear.set(i.id, w);
        }
        armorNotes.push(`${worn.map(i => i.name).join(", ")}: −1 DT (${locationName(x.loc)})`);
      }
      if (wear.size) await actor.updateEmbeddedDocuments("Item", [...wear.values()]);
    }
    if (Object.keys(update).length) await actor.update(update);

    const endT = sys.attributes.end.total;
    const total = actor.system.totalWounds;
    const fx = await applySpecials(actor, res, special, d, endT);
    armorNotes.push(...fx.armor);
    const dead = fx.dead;
    lines.push(`
      <div class="dmg-res">
        <h4>${esc(r.t.name)}</h4>
        ${describe(r, res)}
        ${armorNotes.length ? `<div class="fc-meta">Pancerz: ${armorNotes.map(esc).join(" · ")}</div>` : ""}
        ${fx.notes.length ? `<div class="fc-special">${fx.notes.map(n => `<span>${esc(n)}</span>`).join("")}</div>` : ""}
        <div class="fc-meta">Rany łącznie: ${total}/${4 * endT}${dead ? ` · <b class="warn">${esc(dead)}</b>` : actor.system.unconsciousRisk ? " · <b class=\"warn\">traci przytomność: przy każdej akcji rzut END MFD ¾</b>" : ""}</div>
      </div>`);
  }

  return ChatMessage.create({
    speaker: message.speaker,
    rolls: robotRoll ? [robotRoll] : [],
    content: `
    <div class="foe-card wounds">
      ${robotRoll ? `<div class="fc-meta">Elektryczność przeciw maszynie: +6d12 = ${robotRoll.total}</div>` : ""}
      <div class="fc-tag"><span>PIPBUCK // RANY</span><span>${esc(d.itemName)}</span></div>
      ${lines.join("")}
    </div>`
  });
}

// ======================================================================
// Specjalne efekty broni przy nanoszeniu (s. 200–202)
// ======================================================================

function specialHtml(sp) {
  const row = (name, label, desc, checked = true) =>
    `<label class="atk-row atk-check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span>${label}</span><small>${desc}</small></label>`;
  const parts = [];
  if (sp.fire) parts.push(row("sp-fire", "Podpal cel (ogień)", "1d4 rundy po 3d12 na każdą lokację na koniec rundy; pancerz metalowy chroni, jeśli atak go nie przebił"));
  if (sp.electric) {
    parts.push(row("sp-electric", "Porażenie prądem", "na koniec rundy 3d12 na każdą lokację (pancerz metalowy nie chroni); wyłącza PipBucka i pancerz wspomagany"));
    parts.push(row("sp-robot", "Cel to robot / maszyna", "+6d12 teraz i 6d12 na koniec rundy", false));
  }
  if (sp.rads) parts.push(row("sp-rads", "Promieniowanie", "25 radów za każde 10 obrażeń po DT (minus odporność celu)"));
  if (sp.disintegrate) parts.push(row("sp-dis", "Dezintegracja", sp.disintegrate === "crit" ? "krytyk zawsze dezintegruje; inaczej: rany okaleczające lokację albo zabójcze" : "rany okaleczające nietkniętą lokację albo trafienie zabójcze zamieniają cel w popiół"));
  if (sp.shock) parts.push(row("sp-shock", "Nie zabija (shock)", "zamiast śmierci — utrata przytomności"));
  if (sp.knockdown) parts.push(row("sp-knock", "Przewraca", "co najmniej 1 rana przewraca cel"));
  if (sp.poison) parts.push(`<label class="atk-row">Trucizna <select name="sp-poison">${Object.entries(POISONS).map(([k, v]) => `<option value="${k}" ${k === sp.poison ? "selected" : ""}>${v}</option>`).join("")}</select></label>`);
  return parts.length ? `<div class="dlg-attack dmg-special"><div class="atk-info">Efekty specjalne broni</div>${parts.join("")}</div>` : "";
}

function readSpecial(form) {
  const el = form.elements;
  return {
    fire: !!el["sp-fire"]?.checked, electric: !!el["sp-electric"]?.checked, robot: !!el["sp-robot"]?.checked,
    rads: !!el["sp-rads"]?.checked, dis: !!el["sp-dis"]?.checked, shock: !!el["sp-shock"]?.checked,
    knock: !!el["sp-knock"]?.checked, poison: el["sp-poison"]?.value ?? ""
  };
}

/** Skutki specjalne po naniesieniu ran na jeden cel. Zwraca { notes, armor, dead } (dead = tekst stanu albo ""). */
async function applySpecials(actor, res, special, d, endT) {
  const notes = [], armor = [];
  const sp = d.specials ?? {};
  const hurt = res.some(x => x.after > 0 || x.wounds > 0);
  const wounded = res.some(x => x.wounds > 0);
  let dead = "";

  if (special.dis && !special.shock && res.some(x => disintegrates({ mode: sp.disintegrate, wounds: x.wounds, now: x.now, endT, crit: !!d.crit }))) {
    await toggleStatus(actor, "dead", true);
    notes.push("DEZINTEGRACJA — cel zamienia się w popiół lub świecącą kałużę");
    dead = "ZDEZINTEGROWANY";
  } else if (actor.system.dead) {
    if (special.shock) {
      await toggleStatus(actor, "unconscious", true);
      notes.push("rany zabójcze, ale broń nie zabija — nieprzytomny");
      dead = "NIEPRZYTOMNY";
    } else {
      await toggleStatus(actor, "dead", true);
      dead = "MARTWY";
    }
  }
  if (special.rads) {
    const dmg = d.aoe ? Math.max(0, ...res.map(x => x.after)) : res.reduce((t, x) => t + x.after, 0);
    const rads = radsFrom(dmg, actor.system.radResistTotal ?? 0);
    if (rads) {
      await actor.update({ "system.resources.rads.value": (actor.system.resources.rads.value || 0) + rads });
      notes.push(`+${rads} radów`);
    }
  }
  if (dead && dead !== "NIEPRZYTOMNY") return { notes, armor, dead };

  if (special.fire) {
    // pancerz metalowy chroni przed podpaleniem, jeśli atak go nie przebił
    const stopped = res.every(x => x.dmg <= x.armorDt && actor.items.some(i => i.type === "armor" && i.system.equipped && i.system.cover?.[x.loc] && isMetalArmor(i.system)));
    if (stopped) armor.push("metalowy pancerz zatrzymał ogień");
    else {
      const r = await new Roll("1d4").evaluate();
      await setCondition(actor, "burning", { rounds: r.total });
      notes.push(`PŁONIE przez ${r.total} ${r.total === 1 ? "rundę" : "rundy"} (gaszenie: AGI ½, 2 akcje)`);
    }
  }
  if (special.electric) {
    await setCondition(actor, "shocked", { dice: special.robot ? "6d12" : "3d12" });
    notes.push(`porażenie: ${special.robot ? "6d12" : "3d12"} na każdą lokację na koniec rundy`);
  }
  if (special.knock && wounded) {
    await toggleStatus(actor, "prone", true);
    notes.push("przewrócony (wstanie: AGI ¾)");
  }
  if (special.poison && hurt) notes.push(await poisonCheck(actor, special.poison));
  return { notes, armor, dead };
}

// ======================================================================
// Haki: przyciski na czacie i odnawianie SATS
// ======================================================================

export function registerCombatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelector("[data-action=foeDamage]")?.addEventListener("click", async ev => {
      ev.preventDefault();
      const test = message.getFlag("foe-rpg", "test");
      const item = test?.itemUuid ? await fromUuid(test.itemUuid) : null;
      if (!item) return ui.notifications.warn("Nie znaleziono tej broni.");
      if (!item.isOwner) return ui.notifications.warn("Nie jesteś właścicielem tej broni.");
      const crit = html.querySelector(".foe-card")?.classList.contains("crit-success");
      await rollDamage(item.parent ?? item.actor, item, { crit, attack: test.attack ?? null });
    });

    html.querySelector("[data-action=foeApply]")?.addEventListener("click", ev => {
      ev.preventDefault();
      applyDamage(message);
    });

    const btn = html.querySelector("[data-action=foeLuckReroll]");
    btn?.addEventListener("click", async ev => {
      ev.preventDefault();
      const test = message.getFlag("foe-rpg", "test");
      const actor = test ? await fromUuid(test.actorUuid) : null;
      if (!actor?.isOwner) return ui.notifications.warn("Nie jesteś właścicielem tej postaci.");
      const cards = actor.system.resources.luck.value;
      if (cards <= 0) return ui.notifications.warn("Brak kart szczęścia.");
      await actor.update({ "system.resources.luck.value": cards - 1 });
      btn.disabled = true;
      await rollTest(actor, { ...test, rerolls: (test.rerolls ?? 0) + 1 });
    });
  });

  // SATS odnawia się o 5 AP na rundę walki (s. 442) — liczy jeden aktywny MG
  Hooks.on("updateCombat", async (combat, changed, options) => {
    if (!("round" in changed) || !game.users.activeGM?.isSelf) return;
    const forward = options?.direction ? options.direction > 0 : changed.round > (combat.previous?.round ?? changed.round);
    if (!forward || changed.round < 2) return;
    const seen = new Set();
    for (const c of combat.combatants) {
      const actor = c.actor;
      if (!actor || seen.has(actor.uuid)) continue;
      seen.add(actor.uuid);
      // stany z efektów broni: ogień, prąd, trucizna (koniec poprzedniej rundy)
      try { await endOfRound(actor); } catch (err) { console.error("foe-rpg | koniec rundy", err); }
      const s = actor.system.resources?.sats;
      if (!s || s.value >= s.max) continue;
      await actor.update({ "system.resources.sats.value": Math.min(s.max, s.value + 5) });
    }
  });
}

