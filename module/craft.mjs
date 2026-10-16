/**
 * Warsztat (wytwarzanie amunicji i materiałów), naprawa broni i pancerzy. Zasady: craft-data.mjs.
 */
import { SKILLS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";
import { loadCatalog } from "./catalog.mjs";
import { gearItem } from "./catalog-data.mjs";
import { ammoGroup } from "./ammo-data.mjs";
import { t, tn, tfields } from "./i18n.mjs";
import {
  unitsPer, unitsOf, stackFor, casingFor, dustPerCell, DRAINED, MATCH, craftOutcome,
  weaponCondition, weaponRepairTarget, donorFits, armorDonorPoints, armorMaterial, minutesPerDt
} from "./craft-data.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const resultOf = msg => msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
const feature = (actor, re) => actor.items.some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));
const card = (actor, tag, title, lines) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="foe-card reload"><div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>${t("workshop")}</span></div><h3>${esc(title)}</h3>
    ${lines.filter(Boolean).map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}</div>`
});

// ---------- ekwipunek w jednostkach ----------
const stacks = (actor, re) => actor.items.filter(i => i.type === "gear" && re.test(i.name) && (Number(i.system.qty) || 0) > 0);
export const available = (actor, re) => stacks(actor, re).reduce((sum, i) => sum + unitsOf(i), 0);
/** Wartość (kapsle) materiału: suma wartości sztuk (złom, ołów). */
const valueOf = (actor, re) => stacks(actor, re).reduce((sum, i) => sum + (Number(i.system.value) || 1) * (Number(i.system.qty) || 0), 0);

async function consume(actor, re, units) {
  let left = Math.ceil(units);
  for (const it of stacks(actor, re)) {
    if (left <= 0) break;
    const have = unitsOf(it);
    const take = Math.min(have, left);
    const st = stackFor(it.name, have - take);
    await it.update({ "system.qty": st.qty, "system.charges": st.charges });
    left -= take;
  }
  return Math.ceil(units) - left;
}
async function consumeValue(actor, re, value) {
  let left = Math.ceil(value);
  for (const it of stacks(actor, re)) {
    if (left <= 0) break;
    const per = Number(it.system.value) || 1;
    const n = Math.min(Number(it.system.qty) || 0, Math.ceil(left / per));
    await it.update({ "system.qty": (Number(it.system.qty) || 0) - n });
    left -= n * per;
  }
}
/** Dodaje jednostki produktu (łączy ze stosem tej samej nazwy; nowy z katalogu). */
async function addUnits(actor, name, units, catalog) {
  if (units <= 0) return;
  const same = actor.items.find(i => i.type === "gear" && i.name === name);
  if (same) {
    const st = stackFor(name, unitsOf(same) + units);
    return same.update({ "system.qty": st.qty, "system.charges": st.charges });
  }
  const entry = catalog?.gear?.find(g => g.name === name);
  const data = entry ? gearItem(entry, 1) : { name, type: "gear", system: { category: "misc" } };
  const st = stackFor(name, units);
  data.system = { ...data.system, qty: st.qty, charges: st.charges };
  return actor.createEmbeddedDocuments("Item", [data]);
}

/** Rzut umiejętności (Repair / Science) z oknem MFD; zwraca wynik albo null. */
async function skillRoll(actor, skill, mfd, label, { mod = 0, notes = [], extraHtml = "" } = {}) {
  const sk = actor.system.skills[skill];
  const rc = rollContext(actor, { kind: "skill", skill, skillAttr: sk.attr }, { manualMod: sk.mod });
  if (mod) rc.mods.push({ label: notes[0] ?? t("bonus"), value: mod }), rc.fixedMod += mod;
  const r = await promptMfd(label, sk.tn, rc, { defaultStep: mfd, extraHtml });
  if (!r) return null;
  const { extra, ...roll } = r;
  const msg = await rollTest(actor, { label: `${label} (${SKILLS[skill].label})`, baseTn: sk.tn, ...roll });
  return resultOf(msg);
}

// ---------- receptury warsztatu (s. 198–199) ----------
export const RECIPES = tfields({
  bullets: { label: "Cartridges (bullet press)", skill: "repair", mfd: "1" },
  cells: { label: "Energy cells", skill: "repair", mfd: "3/4" },
  recharge: { label: "Recharging drained cells", skill: "repair", mfd: "1" },
  propellant: { label: "Propellant charges", skill: "science", mfd: "3/4" },
  powder: { label: "Black powder (from charcoal)", skill: "science", mfd: "3/4" },
  fuel: { label: "Flamer fuel", skill: "science", mfd: "1/2" }
}, ["label"]);

export async function openWorkshop(actor) {
  if (!actor.isOwner) return warn(t("You don't own this character."));
  const cat = await loadCatalog();
  const calibers = cat.gear.filter(g => g.category === "ammo" && ammoGroup(g.ammoType) === "conventional" && casingFor(g.ammoType));
  const cells = cat.gear.filter(g => g.category === "ammo" && dustPerCell(g.ammoType));
  const press = available(actor, MATCH.press) > 0;
  const junk = feature(actor, /junk rounds/i);
  const inv = [
    [t("casings"), available(actor, /brass casings|^hulls/i)], [t("propellant"), available(actor, MATCH.propellant)], [t("scrap/lead (value)"), valueOf(actor, MATCH.metal)],
    [t("gem dust"), available(actor, MATCH.dust)], [t("powder"), available(actor, MATCH.blackPowder)], [t("flux"), available(actor, MATCH.flux)], [t("charcoal"), available(actor, MATCH.charcoal)]
  ].map(([l, n]) => `${l}: ${n}`).join(" · ");
  const opt = (arr, f) => arr.map(f).join("");
  const content = `<div class="foe-dialog craft-dlg">
    <div class="atk-info"><div>${t("Bullet press: {v}", { v: `<b>${press ? t("press|yes") : t("press|none")}</b>` })}${junk ? ` · ${t("Junk Rounds: no casings, 2× less metal (with a workshop or a tool kit and a heat source)")}` : ""}</div><div>${esc(inv)}</div></div>
    <label class="atk-row">${t("What are you making")} <select name="recipe">${opt(Object.entries(RECIPES), ([k, r]) => `<option value="${k}">${esc(r.label)}</option>`)}</select></label>
    <label class="atk-row" data-for="bullets">${t("Caliber")} <select name="caliber">${opt(calibers, g => `<option value="${esc(g.name)}">${esc(g.name)} (${tn(g.value, "{n} cap", "{n} caps")})</option>`)}</select></label>
    <label class="atk-row" data-for="cells">${t("Cells")} <select name="cell">${opt(cells, g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`)}</select></label>
    <label class="atk-row" data-for="recharge">${t("Drained")} <select name="drained">${opt(DRAINED, d => `<option value="${d.ammo}">${d.ammo} ${t("(drained: {n})", { n: available(actor, d.re) })}</option>`)}</select></label>
    <label class="atk-row" data-for="propellant">${t("Instead of flux")} <select name="flux"><option value="flux">Flux</option><option value="dust">${t("gem dust")}</option><option value="abronco">Abronco Cleaner</option><option value="turpentine">Turpentine</option><option value="fuel">${t("10 units of flamer fuel")}</option></select></label>
    <label class="atk-row" data-for="powder">${t("Reagent")} <select name="reagent"><option value="fertilizer">${t("fertilizer (MFD ¾)")}</option><option value="food">${t("prewar food (MFD ½)")}</option></select></label>
    <label class="atk-row" data-for="bullets cells recharge powder">${t("How many (rounds, cells or pieces of charcoal)")} <input type="number" name="n" value="20" min="1"></label>
    <p class="hint">${t("Cartridges: a casing, a charge and metal worth ⅓ of the rounds; Repair roll MFD 1 (critical ×2, failure ½). Cells: gem dust (1 = 5 gem cells / 3 energy cells / 1 MFC), metal worth ⅓ of the value, a press, Repair ¾. Recharging: dust, Repair MFD 1 (up to 50 cells per roll; failure destroys half). Charges: powder + flux, Science ¾ → 1d10×10. Powder: charcoal + fertilizer or food, 10 units per piece of charcoal. Fuel: alcohol (vodka +5) + Sugar Apple Bombs + Abronco Cleaner, Science ½ → 20 units (critical 30).")}</p></div>`;
  const render = (event, dialog) => {
    const root = dialog?.element ?? document;
    const form = root.querySelector("form") ?? root;
    const sync = () => {
      const r = form.elements.recipe.value;
      for (const l of form.querySelectorAll("[data-for]")) l.hidden = !l.dataset.for.split(" ").includes(r);
    };
    form.elements.recipe.addEventListener("change", sync);
    sync();
  };
  const pick = await DialogV2.wait({
    window: { title: t("Workshop: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 520 }, rejectClose: false, content, render,
    buttons: [{ action: "ok", label: t("Next"), icon: "fa-solid fa-hammer", default: true, callback: (ev, btn) => {
      const f = btn.form.elements;
      return { recipe: f.recipe.value, caliber: f.caliber?.value, cell: f.cell?.value, drained: f.drained?.value, flux: f.flux.value, reagent: f.reagent.value, n: Math.max(1, Math.floor(Number(f.n.value) || 1)) };
    } }]
  });
  if (!pick) return null;
  return craft(actor, pick, cat, { press, junk });
}

/** Wykonanie receptury: sprawdzenie materiałów, rzut, zużycie i produkt. */
export async function craft(actor, p, cat, { press, junk }) {
  const R = RECIPES[p.recipe];
  const lines = [];
  if (p.recipe === "bullets") {
    const ammo = cat.gear.find(g => g.name === p.caliber);
    const cas = casingFor(ammo.ammoType);
    if (!press && !junk) return warn(t("Cartridges need a Bullet Press — or the Junk Rounds perk with a workshop or a tool kit."));
    const metal = Math.ceil(((ammo.value || 1) * p.n) / (junk && !press ? 6 : 3));
    const need = [[MATCH.propellant, p.n, t("gen|propellant charges")], ...(junk && !press ? [] : [[cas.re, p.n, t("gen|casings ({c})", { c: cas.label })]])];
    for (const [re, n, l] of need) if (available(actor, re) < n) return warn(t("Not enough {what}: {a}/{n}.", { what: l, a: available(actor, re), n }));
    if (valueOf(actor, MATCH.metal) < metal) return warn(t("Not enough metal (Scrap Metal, Lead): value {a}/{b}.", { a: valueOf(actor, MATCH.metal), b: metal }));
    const res = await skillRoll(actor, R.skill, R.mfd, `${R.label}: ${p.n} × ${ammo.name}`);
    if (!res) return null;
    const o = craftOutcome(res);
    for (const [re, n] of need) await consume(actor, re, n);
    await consumeValue(actor, MATCH.metal, metal);
    const made = Math.floor(p.n * o.mult);
    await addUnits(actor, ammo.name, made, cat);
    lines.push(junk && !press ? t("Used: {n} charges, metal worth {m} caps", { n: p.n, m: metal }) : t("Used: {n} charges, {n} casings, metal worth {m} caps", { n: p.n, m: metal }), `${t("Result: {n} × {name}", { n: made, name: ammo.name })}${o.note ? ` (${o.note})` : ""}`);
  } else if (p.recipe === "cells") {
    const ammo = cat.gear.find(g => g.name === p.cell);
    const per = dustPerCell(ammo.ammoType);
    if (!press) return warn(t("Energy cells need a bullet press (even with Junk Rounds)."));
    const dust = Math.ceil(p.n * per);
    const metal = Math.ceil(((ammo.value || 1) * p.n) / 3);
    if (available(actor, MATCH.dust) < dust) return warn(t("Not enough gem dust: {a}/{b}.", { a: available(actor, MATCH.dust), b: dust }));
    if (valueOf(actor, MATCH.metal) < metal) return warn(t("Not enough metal: value {a}/{b}.", { a: valueOf(actor, MATCH.metal), b: metal }));
    const res = await skillRoll(actor, R.skill, R.mfd, `${R.label}: ${p.n} × ${ammo.name}`);
    if (!res) return null;
    const o = craftOutcome(res);
    await consume(actor, MATCH.dust, dust);
    await consumeValue(actor, MATCH.metal, metal);
    const made = Math.floor(p.n * o.mult);
    await addUnits(actor, ammo.name, made, cat);
    lines.push(t("Used: {d} dust, metal worth {m} caps", { d: dust, m: metal }), `${t("Result: {n} × {name}", { n: made, name: ammo.name })}${o.note ? ` (${o.note})` : ""}`);
  } else if (p.recipe === "recharge") {
    const d = DRAINED.find(x => x.ammo === p.drained);
    const per = dustPerCell(d.ammo);
    const n = Math.min(p.n, 50, available(actor, d.re));
    if (n <= 0) return warn(t("No drained cells of this type."));
    const dust = Math.ceil(n * per);
    if (available(actor, MATCH.dust) < dust) return warn(t("Not enough gem dust: {a}/{b}.", { a: available(actor, MATCH.dust), b: dust }));
    const res = await skillRoll(actor, R.skill, R.mfd, `${R.label}: ${n} × ${d.ammo}`);
    if (!res) return null;
    await consume(actor, d.re, n);
    let made = n, usedDust = dust, note = "";
    if (res === "crit-success") { usedDust = Math.ceil(dust / 2); note = t("critical: half the dust"); }
    else if (res === "fail") { made = Math.floor(n / 2); note = t("failure: {n} cells destroyed", { n: n - made }); }
    else if (res === "crit-fail") { made = 0; note = t("critical failure: everything destroyed"); }
    await consume(actor, MATCH.dust, usedDust);
    await addUnits(actor, d.ammo, made, cat);
    lines.push(t("Used: {n} drained cells, {d} dust", { n, d: usedDust }), `${t("Result: {n} × {name}", { n: made, name: d.ammo })}${note ? ` (${note})` : ""}`);
  } else if (p.recipe === "propellant") {
    const FLUX = { flux: [MATCH.flux, 1, "Flux"], dust: [MATCH.dust, 1, t("gem dust")], abronco: [/abronco cleaner/i, 1, "Abronco Cleaner"], turpentine: [/turpentine/i, 1, "Turpentine"], fuel: [/^flamer fuel$/i, 10, t("flamer fuel")] }[p.flux];
    if (available(actor, MATCH.blackPowder) < 1) return warn(t("No powder (Black Powder)."));
    if (available(actor, FLUX[0]) < FLUX[1]) return warn(t("Not enough: {what} ({a}/{b}).", { what: FLUX[2], a: available(actor, FLUX[0]), b: FLUX[1] }));
    const res = await skillRoll(actor, R.skill, R.mfd, R.label);
    if (!res) return null;
    await consume(actor, MATCH.blackPowder, 1);
    await consume(actor, FLUX[0], FLUX[1]);
    const ok = res === "success" || res === "crit-success";
    let made = 0;
    if (ok) { const r = await new Roll("1d10").evaluate(); made = r.total * 10; }
    const magical = ["flux", "dust"].includes(p.flux);
    const name = magical ? "Magical Propellant Charges (10)" : "Chemical Propellant Charges (10)";
    await addUnits(actor, name, made, cat);
    lines.push(t("Used: 1 unit of powder, {n} × {what}", { n: FLUX[1], what: FLUX[2] }), ok ? (magical ? t("Result: {n} charges (magical)", { n: made }) : t("Result: {n} charges (chemical)", { n: made })) : t("Nothing came out — materials lost"));
  } else if (p.recipe === "powder") {
    const food = p.reagent === "food";
    const reRe = food ? MATCH.prewarFood : MATCH.fertilizer;
    const reagentItems = stacks(actor, reRe);
    const wt = Number(reagentItems[0]?.system.weight) || (food ? 1 : 10);
    const needReagent = Math.ceil((p.n * 0.5) / wt);   // równa waga: węgiel 0,5 lb za kawałek
    if (available(actor, MATCH.charcoal) < p.n) return warn(t("Not enough charcoal: {a}/{n}.", { a: available(actor, MATCH.charcoal), n: p.n }));
    if (available(actor, reRe) < needReagent) return warn(t("Not enough: {what} ({a}/{b}).", { what: food ? t("prewar food") : t("fertilizer"), a: available(actor, reRe), b: needReagent }));
    const res = await skillRoll(actor, R.skill, food ? "1/2" : "3/4", `${R.label}: ${p.n} × ${t("charcoal")}`);
    if (!res) return null;
    let made = 0, note = "";
    if (res === "success" || res === "crit-success") {
      made = 10 * p.n + (res === "crit-success" ? 10 : 0);
      await consume(actor, MATCH.charcoal, p.n); await consume(actor, reRe, needReagent);
      if (res === "crit-success") note = t("critical: +10 units");
    } else if (res === "fail") {
      await consume(actor, MATCH.charcoal, Math.ceil(p.n / 2)); await consume(actor, reRe, Math.ceil(needReagent / 2));
      note = t("failure: half the materials lost");
    } else {
      await consume(actor, MATCH.charcoal, p.n); await consume(actor, reRe, needReagent);
      note = t("critical failure: nothing");
    }
    await addUnits(actor, "Black Powder (10 oz. – 10 units)", made, cat);
    lines.push(`${t("Result: {n} units of powder", { n: made })}${note ? ` (${note})` : ""}`);
  } else if (p.recipe === "fuel") {
    const alc = stacks(actor, MATCH.alcohol);
    if (!alc.length) return warn(t("You need alcohol (vodka is best: +5)."));
    if (available(actor, MATCH.sugarBombs) < 1 || available(actor, MATCH.abronco) < 1) return warn(t("You need: a box of Sugar Apple Bombs and Abronco Cleaner."));
    const vodka = alc.find(i => MATCH.vodka.test(i.name));
    const res = await skillRoll(actor, R.skill, R.mfd, R.label, vodka ? { mod: 5, notes: [t("Vodka +5")] } : {});
    if (!res) return null;
    await consume(actor, vodka ? MATCH.vodka : MATCH.alcohol, 1);
    await consume(actor, MATCH.sugarBombs, 1); await consume(actor, MATCH.abronco, 1);
    const made = res === "crit-success" ? 30 : res === "success" ? 20 : 0;
    await addUnits(actor, "Flamer Fuel", made, cat);
    lines.push(made ? t("Result: {n} units of fuel", { n: made }) : res === "crit-fail" ? t("Critical failure: equipment damaged or destroyed (GM)") : t("Failure: you made something you don't want to eat"));
  }
  return card(actor, t("WORKSHOP"), R.label, lines);
}

// ---------- naprawa broni (tabela XXIX) ----------
export async function repairWeapon(actor, item) {
  const w = item.system;
  const c = weaponCondition(w);
  if (!c.total) return warn(t("{name}: this weapon doesn't degrade.", { name: item.name }));
  if (c.left >= c.total) return ui.notifications.info(t("{name}: the weapon is in full working order.", { name: item.name }));
  const jury = feature(actor, /jury rigging/i);
  const donors = actor.items.filter(i => i.type === "weapon" && i.id !== item.id && donorFits(w, item.name, i.system, i.name, jury));
  if (!donors.length) return warn(jury ? t("{name}: repairing needs a second identical weapon for parts (with Jury Rigging — a similar weapon).", { name: item.name }) : t("{name}: repairing needs a second identical weapon for parts.", { name: item.name }));
  const sk = actor.system.skills.repair;
  const rank = (sk.rank ?? 0) + (sk.rollMod ?? 0);
  const plans = donors.map(d => ({ d, ...weaponRepairTarget(w, rank, d.system) }));
  const pick = await DialogV2.wait({
    window: { title: t("Repair: {name}", { name: item.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false,
    content: `<div class="foe-dialog"><div class="atk-info"><div>${t("Condition: {c} steps · Repair rank with bonuses {r} → you'll repair up to step {cap} (table XXIX)", { c: `<b>${c.left}/${c.total}</b>`, r: `<b>${rank}</b>`, cap: `<b>${plans[0].cap}</b>` })}</div>
      <div>${t("The donor weapon repairs at most up to its own condition +1 and is used for parts.")}${jury ? ` ${t("Jury Rigging: a similar weapon is enough.")}` : ""}</div></div>
      <label class="atk-row">${t("For parts")} <select name="donor">${plans.map((x, i) => `<option value="${i}">${esc(x.d.name)} ${t("(condition {a}/{b})", { a: x.donorLeft, b: weaponCondition(x.d.system).total })} → ${x.target}/${c.total}</option>`).join("")}</select></label></div>`,
    buttons: [{ action: "ok", label: t("btn|Fix"), icon: "fa-solid fa-screwdriver-wrench", default: true, callback: (ev, btn) => Number(btn.form.elements.donor.value) }]
  });
  if (pick === null || pick === undefined) return null;
  const plan = plans[pick];
  if (plan.gain <= 0) return warn(t("This repair won't do anything (rank limit {cap}, donor {d}+1).", { cap: plan.cap, d: plan.donorLeft }));
  await item.update({ "system.wear": c.total - plan.target, "system.fired": 0 });
  await plan.d.delete();
  return card(actor, t("REPAIR"), item.name, [t("Condition {a} → {b}", { a: `${c.left}/${c.total}`, b: `${plan.target}/${c.total}` }), t("For parts: {name}", { name: plan.d.name })]);
}

// ---------- naprawa pancerza (s. 460) ----------
export async function repairArmorItem(actor, armor) {
  const a = armor.system;
  const wear = Object.entries(a.wear ?? {}).filter(([, v]) => v > 0);
  if (!wear.length) return ui.notifications.info(t("{name}: the armor isn't damaged.", { name: armor.name }));
  const sk = actor.system.skills.repair;
  const rank = sk.rank ?? 0;
  const jury = feature(actor, /jury rigging/i);
  const donors = actor.items.filter(i => i.type === "armor" && i.id !== armor.id && !i.system.equipped
    && (a.powered ? i.name === armor.name : jury || i.system.category === a.category || i.name === armor.name));
  const mat = armorMaterial(a);
  const matHave = mat ? available(actor, mat.re) : 0;
  const tools = mat ? mat.tools.filter(tl => !available(actor, tl.re)).map(tl => tl.label) : [];
  const total = wear.reduce((sum, [, v]) => sum + v, 0);
  const opts = [
    ...donors.map((d, i) => ({ v: `d${i}`, label: t("Parts from: {name} (DT {dt}) → +{p} DT per location", { name: d.name, dt: d.system.dt, p: armorDonorPoints(d.system.dt, rank) }) })),
    ...(mat && rank >= 25 && matHave ? [{ v: "mat", label: t("Material: {m} (you have {n}) → 1 DT per unit of weight", { m: mat.label, n: matHave }) }] : [])
  ];
  if (!opts.length) return warn(a.powered ? t("{name}: power armor is repaired only by the talisman (the key on the armor) or parts from the same model.", { name: armor.name })
    : t("{name}: you need another armor for parts or material ({m}; Repair rank at least 25).", { name: armor.name, m: mat?.label }));
  const pick = await DialogV2.wait({
    window: { title: t("Repair: {name}", { name: armor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 480 }, rejectClose: false,
    content: `<div class="foe-dialog"><div class="atk-info"><div>${t("Damage: {list} · Repair {r}", { list: wear.map(([k, v]) => `${esc(k)} −${v}`).join(", "), r: rank })}</div>
      ${tools.length ? `<div class="warn">${t("Missing tools: {list} (rulebook: usually needed)", { list: tools.map(esc).join(", ") })}</div>` : ""}</div>
      <label class="atk-row">${t("Method")} <select name="how">${opts.map(o => `<option value="${o.v}">${esc(o.label)}</option>`).join("")}</select></label>
      <p class="hint">${t("Time: {n} minutes per DT point. The donor armor is lost.", { n: minutesPerDt(a) })}</p></div>`,
    buttons: [{ action: "ok", label: t("btn|Fix"), icon: "fa-solid fa-screwdriver-wrench", default: true, callback: (ev, btn) => btn.form.elements.how.value }]
  });
  if (!pick) return null;
  const upd = {};
  let restored = 0, used = "";
  if (pick === "mat") {
    let budget = matHave;
    for (const [k, v] of wear) { const r = Math.min(v, budget); if (!r) break; upd[`system.wear.${k}`] = v - r; budget -= r; restored += r; }
    await consume(actor, mat.re, restored);
    used = `${restored} × ${mat.label}`;
  } else {
    const d = donors[Number(pick.slice(1))];
    const pts = armorDonorPoints(d.system.dt, rank);
    for (const [k, v] of wear) { const r = Math.min(v, pts); upd[`system.wear.${k}`] = v - r; restored += r; }
    await d.delete();
    used = t("parts from {name}", { name: d.name });
  }
  await armor.update(upd);
  return card(actor, t("REPAIR"), armor.name, [t("Restored {n} DT ({how})", { n: restored, how: used }), t("Time: about {n} minutes", { n: restored * minutesPerDt(a) })]);
}
