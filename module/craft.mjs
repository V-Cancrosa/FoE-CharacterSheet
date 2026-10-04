/**
 * Warsztat (wytwarzanie amunicji i materiałów), naprawa broni i pancerzy. Zasady: craft-data.mjs.
 */
import { SKILLS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";
import { loadCatalog } from "./catalog.mjs";
import { gearItem } from "./catalog-data.mjs";
import { ammoGroup } from "./ammo-data.mjs";
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
  content: `<div class="foe-card reload"><div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>warsztat</span></div><h3>${esc(title)}</h3>
    ${lines.filter(Boolean).map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}</div>`
});

// ---------- ekwipunek w jednostkach ----------
const stacks = (actor, re) => actor.items.filter(i => i.type === "gear" && re.test(i.name) && (Number(i.system.qty) || 0) > 0);
export const available = (actor, re) => stacks(actor, re).reduce((t, i) => t + unitsOf(i), 0);
/** Wartość (kapsle) materiału: suma wartości sztuk (złom, ołów). */
const valueOf = (actor, re) => stacks(actor, re).reduce((t, i) => t + (Number(i.system.value) || 1) * (Number(i.system.qty) || 0), 0);

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
  if (mod) rc.mods.push({ label: notes[0] ?? "premia", value: mod }), rc.fixedMod += mod;
  const r = await promptMfd(label, sk.tn, rc, { defaultStep: mfd, extraHtml });
  if (!r) return null;
  const { extra, ...roll } = r;
  const msg = await rollTest(actor, { label: `${label} (${SKILLS[skill].label})`, baseTn: sk.tn, ...roll });
  return resultOf(msg);
}

// ---------- receptury warsztatu (s. 198–199) ----------
export const RECIPES = {
  bullets: { label: "Naboje (prasa do naboi)", skill: "repair", mfd: "1" },
  cells: { label: "Ogniwa energii", skill: "repair", mfd: "3/4" },
  recharge: { label: "Ładowanie zużytych ogniw", skill: "repair", mfd: "1" },
  propellant: { label: "Ładunki miotające", skill: "science", mfd: "3/4" },
  powder: { label: "Proch (z węgla)", skill: "science", mfd: "3/4" },
  fuel: { label: "Paliwo do miotacza ognia", skill: "science", mfd: "1/2" }
};

export async function openWorkshop(actor) {
  if (!actor.isOwner) return warn("Nie jesteś właścicielem tej postaci.");
  const cat = await loadCatalog();
  const calibers = cat.gear.filter(g => g.category === "ammo" && ammoGroup(g.ammoType) === "conventional" && casingFor(g.ammoType));
  const cells = cat.gear.filter(g => g.category === "ammo" && dustPerCell(g.ammoType));
  const press = available(actor, MATCH.press) > 0;
  const junk = feature(actor, /junk rounds/i);
  const inv = [
    ["łuski", available(actor, /brass casings|^hulls/i)], ["ładunki", available(actor, MATCH.propellant)], ["złom/ołów (wartość)", valueOf(actor, MATCH.metal)],
    ["pył klejnotów", available(actor, MATCH.dust)], ["proch", available(actor, MATCH.blackPowder)], ["topnik", available(actor, MATCH.flux)], ["węgiel", available(actor, MATCH.charcoal)]
  ].map(([l, n]) => `${l}: ${n}`).join(" · ");
  const opt = (arr, f) => arr.map(f).join("");
  const content = `<div class="foe-dialog craft-dlg">
    <div class="atk-info"><div>Prasa do naboi: <b>${press ? "jest" : "brak"}</b>${junk ? " · Junk Rounds: bez łusek, 2× mniej metalu (z warsztatem albo zestawem narzędzi i źródłem ciepła)" : ""}</div><div>${esc(inv)}</div></div>
    <label class="atk-row">Co robisz <select name="recipe">${opt(Object.entries(RECIPES), ([k, r]) => `<option value="${k}">${esc(r.label)}</option>`)}</select></label>
    <label class="atk-row" data-for="bullets">Kaliber <select name="caliber">${opt(calibers, g => `<option value="${esc(g.name)}">${esc(g.name)} (${g.value} kapsli)</option>`)}</select></label>
    <label class="atk-row" data-for="cells">Ogniwa <select name="cell">${opt(cells, g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`)}</select></label>
    <label class="atk-row" data-for="recharge">Zużyte <select name="drained">${opt(DRAINED, d => `<option value="${d.ammo}">${d.ammo} (zużyte: ${available(actor, d.re)})</option>`)}</select></label>
    <label class="atk-row" data-for="propellant">Zamiast topnika <select name="flux"><option value="flux">Flux</option><option value="dust">pył klejnotów</option><option value="abronco">Abronco Cleaner</option><option value="turpentine">Turpentine</option><option value="fuel">10 jedn. paliwa do miotacza</option></select></label>
    <label class="atk-row" data-for="powder">Odczynnik <select name="reagent"><option value="fertilizer">nawóz (MFD ¾)</option><option value="food">przedwojenne jedzenie (MFD ½)</option></select></label>
    <label class="atk-row" data-for="bullets cells recharge powder">Ile (naboi, ogniw albo kawałków węgla) <input type="number" name="n" value="20" min="1"></label>
    <p class="hint">Naboje: łuska, ładunek i metal o wartości ⅓ naboi; rzut Repair MFD 1 (krytyk ×2, porażka ½). Ogniwa: pył klejnotów (1 = 5 gem cells / 3 ogniwa / 1 MFC), metal ⅓ wartości, prasa, Repair ¾.
      Ładowanie: pył, Repair MFD 1 (do 50 ogniw na rzut; porażka niszczy połowę). Ładunki: proch + topnik, Science ¾ → 1d10×10. Proch: węgiel + nawóz albo jedzenie, 10 jedn. na kawałek węgla.
      Paliwo: alkohol (wódka +5) + Sugar Apple Bombs + Abronco Cleaner, Science ½ → 20 jedn. (krytyk 30).</p></div>`;
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
    window: { title: `Warsztat: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 520 }, rejectClose: false, content, render,
    buttons: [{ action: "ok", label: "Dalej", icon: "fa-solid fa-hammer", default: true, callback: (ev, btn) => {
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
    if (!press && !junk) return warn("Naboje wymagają prasy do naboi (Bullet Press) — albo perka Junk Rounds z warsztatem lub zestawem narzędzi.");
    const metal = Math.ceil(((ammo.value || 1) * p.n) / (junk && !press ? 6 : 3));
    const need = [[MATCH.propellant, p.n, "ładunków miotających"], ...(junk && !press ? [] : [[cas.re, p.n, `łusek (${cas.label})`]])];
    for (const [re, n, l] of need) if (available(actor, re) < n) return warn(`Za mało ${l}: ${available(actor, re)}/${n}.`);
    if (valueOf(actor, MATCH.metal) < metal) return warn(`Za mało metalu (Scrap Metal, Lead): wartość ${valueOf(actor, MATCH.metal)}/${metal}.`);
    const res = await skillRoll(actor, R.skill, R.mfd, `${R.label}: ${p.n} × ${ammo.name}`);
    if (!res) return null;
    const o = craftOutcome(res);
    for (const [re, n] of need) await consume(actor, re, n);
    await consumeValue(actor, MATCH.metal, metal);
    const made = Math.floor(p.n * o.mult);
    await addUnits(actor, ammo.name, made, cat);
    lines.push(`Zużyto: ${p.n} ładunków${junk && !press ? "" : `, ${p.n} łusek`}, metal za ${metal} kapsli`, `Wynik: ${made} × ${ammo.name}${o.note ? ` (${o.note})` : ""}`);
  } else if (p.recipe === "cells") {
    const ammo = cat.gear.find(g => g.name === p.cell);
    const per = dustPerCell(ammo.ammoType);
    if (!press) return warn("Ogniwa energii wymagają prasy do naboi (nawet z Junk Rounds).");
    const dust = Math.ceil(p.n * per);
    const metal = Math.ceil(((ammo.value || 1) * p.n) / 3);
    if (available(actor, MATCH.dust) < dust) return warn(`Za mało pyłu klejnotów: ${available(actor, MATCH.dust)}/${dust}.`);
    if (valueOf(actor, MATCH.metal) < metal) return warn(`Za mało metalu: wartość ${valueOf(actor, MATCH.metal)}/${metal}.`);
    const res = await skillRoll(actor, R.skill, R.mfd, `${R.label}: ${p.n} × ${ammo.name}`);
    if (!res) return null;
    const o = craftOutcome(res);
    await consume(actor, MATCH.dust, dust);
    await consumeValue(actor, MATCH.metal, metal);
    const made = Math.floor(p.n * o.mult);
    await addUnits(actor, ammo.name, made, cat);
    lines.push(`Zużyto: ${dust} pyłu, metal za ${metal} kapsli`, `Wynik: ${made} × ${ammo.name}${o.note ? ` (${o.note})` : ""}`);
  } else if (p.recipe === "recharge") {
    const d = DRAINED.find(x => x.ammo === p.drained);
    const per = dustPerCell(d.ammo);
    const n = Math.min(p.n, 50, available(actor, d.re));
    if (n <= 0) return warn("Brak zużytych ogniw tego rodzaju.");
    const dust = Math.ceil(n * per);
    if (available(actor, MATCH.dust) < dust) return warn(`Za mało pyłu klejnotów: ${available(actor, MATCH.dust)}/${dust}.`);
    const res = await skillRoll(actor, R.skill, R.mfd, `${R.label}: ${n} × ${d.ammo}`);
    if (!res) return null;
    await consume(actor, d.re, n);
    let made = n, usedDust = dust, note = "";
    if (res === "crit-success") { usedDust = Math.ceil(dust / 2); note = "krytyk: połowa pyłu"; }
    else if (res === "fail") { made = Math.floor(n / 2); note = `porażka: zniszczono ${n - made} ogniw`; }
    else if (res === "crit-fail") { made = 0; note = "krytyczna porażka: wszystko zniszczone"; }
    await consume(actor, MATCH.dust, usedDust);
    await addUnits(actor, d.ammo, made, cat);
    lines.push(`Zużyto: ${n} zużytych ogniw, ${usedDust} pyłu`, `Wynik: ${made} × ${d.ammo}${note ? ` (${note})` : ""}`);
  } else if (p.recipe === "propellant") {
    const FLUX = { flux: [MATCH.flux, 1, "Flux"], dust: [MATCH.dust, 1, "pył klejnotów"], abronco: [/abronco cleaner/i, 1, "Abronco Cleaner"], turpentine: [/turpentine/i, 1, "Turpentine"], fuel: [/^flamer fuel$/i, 10, "paliwo do miotacza"] }[p.flux];
    if (available(actor, MATCH.blackPowder) < 1) return warn("Brak prochu (Black Powder).");
    if (available(actor, FLUX[0]) < FLUX[1]) return warn(`Za mało: ${FLUX[2]} (${available(actor, FLUX[0])}/${FLUX[1]}).`);
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
    lines.push(`Zużyto: 1 jedn. prochu, ${FLUX[1]} × ${FLUX[2]}`, ok ? `Wynik: ${made} ładunków (${magical ? "magicznych" : "chemicznych"})` : "Nic nie wyszło — materiały stracone");
  } else if (p.recipe === "powder") {
    const food = p.reagent === "food";
    const reRe = food ? MATCH.prewarFood : MATCH.fertilizer;
    const reagentItems = stacks(actor, reRe);
    const wt = Number(reagentItems[0]?.system.weight) || (food ? 1 : 10);
    const needReagent = Math.ceil((p.n * 0.5) / wt);   // równa waga: węgiel 0,5 lb za kawałek
    if (available(actor, MATCH.charcoal) < p.n) return warn(`Za mało węgla: ${available(actor, MATCH.charcoal)}/${p.n}.`);
    if (available(actor, reRe) < needReagent) return warn(`Za mało: ${food ? "przedwojenne jedzenie" : "nawóz"} (${available(actor, reRe)}/${needReagent}).`);
    const res = await skillRoll(actor, R.skill, food ? "1/2" : "3/4", `${R.label}: ${p.n} × węgiel`);
    if (!res) return null;
    let made = 0, note = "";
    if (res === "success" || res === "crit-success") {
      made = 10 * p.n + (res === "crit-success" ? 10 : 0);
      await consume(actor, MATCH.charcoal, p.n); await consume(actor, reRe, needReagent);
      if (res === "crit-success") note = "krytyk: +10 jednostek";
    } else if (res === "fail") {
      await consume(actor, MATCH.charcoal, Math.ceil(p.n / 2)); await consume(actor, reRe, Math.ceil(needReagent / 2));
      note = "porażka: połowa materiałów stracona";
    } else {
      await consume(actor, MATCH.charcoal, p.n); await consume(actor, reRe, needReagent);
      note = "krytyczna porażka: nic";
    }
    await addUnits(actor, "Black Powder (10 oz. – 10 units)", made, cat);
    lines.push(`Wynik: ${made} jedn. prochu${note ? ` (${note})` : ""}`);
  } else if (p.recipe === "fuel") {
    const alc = stacks(actor, MATCH.alcohol);
    if (!alc.length) return warn("Potrzebny alkohol (najlepiej wódka: +5).");
    if (available(actor, MATCH.sugarBombs) < 1 || available(actor, MATCH.abronco) < 1) return warn("Potrzebne: pudełko Sugar Apple Bombs i Abronco Cleaner.");
    const vodka = alc.find(i => MATCH.vodka.test(i.name));
    const res = await skillRoll(actor, R.skill, R.mfd, R.label, vodka ? { mod: 5, notes: ["Wódka +5"] } : {});
    if (!res) return null;
    await consume(actor, vodka ? MATCH.vodka : MATCH.alcohol, 1);
    await consume(actor, MATCH.sugarBombs, 1); await consume(actor, MATCH.abronco, 1);
    const made = res === "crit-success" ? 30 : res === "success" ? 20 : 0;
    await addUnits(actor, "Flamer Fuel", made, cat);
    lines.push(made ? `Wynik: ${made} jedn. paliwa` : res === "crit-fail" ? "Krytyczna porażka: sprzęt uszkodzony albo zniszczony (MG)" : "Porażka: wyszło coś, czego nie chcesz jeść");
  }
  return card(actor, "WARSZTAT", R.label, lines);
}

// ---------- naprawa broni (tabela XXIX) ----------
export async function repairWeapon(actor, item) {
  const w = item.system;
  const c = weaponCondition(w);
  if (!c.total) return warn(`${item.name}: ta broń nie ulega degradacji.`);
  if (c.left >= c.total) return ui.notifications.info(`${item.name}: broń jest w pełni sprawna.`);
  const jury = feature(actor, /jury rigging/i);
  const donors = actor.items.filter(i => i.type === "weapon" && i.id !== item.id && donorFits(w, item.name, i.system, i.name, jury));
  if (!donors.length) return warn(`${item.name}: do naprawy potrzebna jest druga taka sama broń na części${jury ? " (z Jury Rigging — podobna broń)" : ""}.`);
  const sk = actor.system.skills.repair;
  const rank = (sk.rank ?? 0) + (sk.rollMod ?? 0);
  const plans = donors.map(d => ({ d, ...weaponRepairTarget(w, rank, d.system) }));
  const pick = await DialogV2.wait({
    window: { title: `Naprawa: ${item.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false,
    content: `<div class="foe-dialog"><div class="atk-info"><div>Stan: <b>${c.left}/${c.total}</b> kroków · ranga Repair z premiami <b>${rank}</b> → naprawisz do kroku <b>${plans[0].cap}</b> (tabela XXIX)</div>
      <div>Broń-dawca naprawia najwyżej do swojego stanu +1 i idzie na części.${jury ? " Jury Rigging: wystarczy podobna broń." : ""}</div></div>
      <label class="atk-row">Na części <select name="donor">${plans.map((x, i) => `<option value="${i}">${esc(x.d.name)} (stan ${x.donorLeft}/${weaponCondition(x.d.system).total}) → ${x.target}/${c.total}</option>`).join("")}</select></label></div>`,
    buttons: [{ action: "ok", label: "Napraw", icon: "fa-solid fa-screwdriver-wrench", default: true, callback: (ev, btn) => Number(btn.form.elements.donor.value) }]
  });
  if (pick === null || pick === undefined) return null;
  const plan = plans[pick];
  if (plan.gain <= 0) return warn(`Ta naprawa nic nie da (limit z rangi ${plan.cap}, dawca ${plan.donorLeft}+1).`);
  await item.update({ "system.wear": c.total - plan.target, "system.fired": 0 });
  await plan.d.delete();
  return card(actor, "NAPRAWA", item.name, [`Stan ${c.left}/${c.total} → ${plan.target}/${c.total}`, `Na części: ${plan.d.name}`]);
}

// ---------- naprawa pancerza (s. 460) ----------
export async function repairArmorItem(actor, armor) {
  const a = armor.system;
  const wear = Object.entries(a.wear ?? {}).filter(([, v]) => v > 0);
  if (!wear.length) return ui.notifications.info(`${armor.name}: pancerz nie jest uszkodzony.`);
  const sk = actor.system.skills.repair;
  const rank = sk.rank ?? 0;
  const jury = feature(actor, /jury rigging/i);
  const donors = actor.items.filter(i => i.type === "armor" && i.id !== armor.id && !i.system.equipped
    && (a.powered ? i.name === armor.name : jury || i.system.category === a.category || i.name === armor.name));
  const mat = armorMaterial(a);
  const matHave = mat ? available(actor, mat.re) : 0;
  const tools = mat ? mat.tools.filter(t => !available(actor, t.re)).map(t => t.label) : [];
  const total = wear.reduce((t, [, v]) => t + v, 0);
  const opts = [
    ...donors.map((d, i) => ({ v: `d${i}`, label: `Części z: ${d.name} (DT ${d.system.dt}) → +${armorDonorPoints(d.system.dt, rank)} DT na lokację` })),
    ...(mat && rank >= 25 && matHave ? [{ v: "mat", label: `Surowiec: ${mat.label} (masz ${matHave}) → 1 DT za jednostkę wagi` }] : [])
  ];
  if (!opts.length) return warn(a.powered ? `${armor.name}: pancerz wspomagany naprawia tylko talizman (klucz przy pancerzu) albo części z tego samego modelu.`
    : `${armor.name}: potrzebny inny pancerz na części albo surowiec (${mat?.label}; ranga Repair co najmniej 25).`);
  const pick = await DialogV2.wait({
    window: { title: `Naprawa: ${armor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 480 }, rejectClose: false,
    content: `<div class="foe-dialog"><div class="atk-info"><div>Uszkodzenia: ${wear.map(([k, v]) => `${esc(k)} −${v}`).join(", ")} · Repair ${rank}</div>
      ${tools.length ? `<div class="warn">Brakuje narzędzi: ${tools.map(esc).join(", ")} (podręcznik: zwykle potrzebne)</div>` : ""}</div>
      <label class="atk-row">Sposób <select name="how">${opts.map(o => `<option value="${o.v}">${esc(o.label)}</option>`).join("")}</select></label>
      <p class="hint">Czas: ${minutesPerDt(a)} minut na punkt DT. Pancerz-dawca przepada.</p></div>`,
    buttons: [{ action: "ok", label: "Napraw", icon: "fa-solid fa-screwdriver-wrench", default: true, callback: (ev, btn) => btn.form.elements.how.value }]
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
    used = `części z ${d.name}`;
  }
  await armor.update(upd);
  return card(actor, "NAPRAWA", armor.name, [`Przywrócono ${restored} DT (${used})`, `Czas: około ${restored * minutesPerDt(a)} minut`]);
}
