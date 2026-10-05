import { clearFlag } from "./flags.mjs";
import { rollTest, locationName } from "./rolls.mjs";
import { hitTableFor, tableLocations, effectiveDT, woundsFrom, isMetalArmor } from "./combat.mjs";
import { spendActions } from "./tracker.mjs";

/**
 * Stany z efektów specjalnych broni (s. 200–202), zapisane we flagach aktora `foe-rpg.conditions`:
 *   burning   { rounds }            — ogień: 3d12 na każdą lokację na koniec rundy
 *   shocked   { dice }              — elektryczność: raz na koniec rundy 3d12 (maszyny 6d12)
 *   poisoned  { type }              — trucizna radskorpiona: 1 rana na rundę w głowę lub tułów do utraty przytomności
 *   paralyzed { ok, bad, locked }   — trucizna mantykory: paraliż, rzuty END ½ (3 sukcesy z rzędu znoszą)
 * Ikony tokenów to standardowe statusy Foundry.
 */
export const CONDITIONS = {
  burning: { label: "Płonie", status: "burning" },
  shocked: { label: "Porażenie prądem", status: "shock" },
  poisoned: { label: "Zatruty (radskorpion)", status: "poison" },
  paralyzed: { label: "Sparaliżowany (mantykora)", status: "paralysis" }
};

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

export async function toggleStatus(actor, id, active) {
  if (!CONFIG.statusEffects?.some(s => s.id === id)) return;
  if (!!actor.statuses?.has(id) === active) return;
  await actor.toggleStatusEffect?.(id, { active, overlay: id === "dead" });
}

export const conditionsOf = actor => Object.fromEntries(Object.entries(actor?.getFlag?.("foe-rpg", "conditions") ?? {}).filter(([, v]) => v));

export async function setCondition(actor, key, data) {
  await actor.setFlag("foe-rpg", `conditions.${key}`, data);
  await toggleStatus(actor, CONDITIONS[key].status, true);
}

export async function clearCondition(actor, key) {
  await clearFlag(actor, `conditions.${key}`);
  await toggleStatus(actor, CONDITIONS[key].status, false);
}

/** DT przy obrażeniach z ognia (bez pancerza) albo prądu (tylko pancerz niemetalowy). */
function ongoingDT(actor, loc, mode) {
  const L = actor.system.locations[loc];
  if (mode === "fire") return L.naturalDt + (L.fireDt ?? 0);   // Cyberpony, Zebra Augmented: +10 DT od ognia
  let best = 0;
  for (const i of actor.items) {
    if (i.type !== "armor" || !i.system.equipped || !i.system.cover?.[loc] || isMetalArmor(i.system)) continue;
    best = Math.max(best, (i.system.dt || 0) - (i.system.wear?.[loc] || 0));
  }
  return L.naturalDt + best;
}

/** Obrażenia na każdą lokację celu (jeden rzut). Zwraca linie do karty czatu. */
async function damageAllLocations(actor, formula, mode) {
  const r = await new Roll(formula).evaluate();
  const sys = actor.system;
  const table = hitTableFor(sys.race);
  const update = {};
  const lines = [];
  for (const k of tableLocations(table)) {
    const dt = ongoingDT(actor, k, mode);
    const after = Math.max(0, r.total - effectiveDT(dt));
    const w = woundsFrom(after, sys.dmgPerWound);
    if (w) update[`system.locations.${k}.wounds`] = sys.locations[k].wounds + w;
    lines.push(`${locationName(k, table)}: ${r.total} − DT ${dt} → ${w}`);
  }
  if (Object.keys(update).length) await actor.update(update);
  return { roll: r, lines };
}

async function afterWounds(actor, notes) {
  if (actor.system.dead) { await toggleStatus(actor, "dead", true); notes.push("MARTWY"); }
  else if (actor.system.unconsciousRisk) notes.push("traci przytomność: przy każdej akcji rzut END ¾");
}

/** Efekty końca rundy dla jednego aktora. Zwraca true, jeśli coś się stało. */
export async function endOfRound(actor) {
  const c = conditionsOf(actor);
  if (!Object.keys(c).length) return false;
  const blocks = [];
  const rolls = [];

  if (c.burning) {
    const { roll, lines } = await damageAllLocations(actor, "3d12", "fire");
    rolls.push(roll);
    const left = (c.burning.rounds ?? 1) - 1;
    if (left > 0) await actor.setFlag("foe-rpg", "conditions.burning.rounds", left);
    else await clearCondition(actor, "burning");
    blocks.push({ title: `Ogień: 3d12 = ${roll.total}`, lines, note: left > 0 ? `płonie jeszcze ${left} ${left === 1 ? "rundę" : "rundy"}` : "ogień zgasł" });
  }
  if (c.shocked) {
    const { roll, lines } = await damageAllLocations(actor, c.shocked.dice || "3d12", "electric");
    rolls.push(roll);
    await clearCondition(actor, "shocked");
    blocks.push({ title: `Elektryczność: ${c.shocked.dice || "3d12"} = ${roll.total}`, lines, note: "PipBuck i pancerz wspomagany wyłączają się (2 akcje na ponowne uruchomienie)" });
  }
  if (c.poisoned) {
    const sys = actor.system;
    if (sys.unconsciousRisk) {
      await toggleStatus(actor, "unconscious", true);
      blocks.push({ title: "Trucizna radskorpiona", lines: [], note: "nieprzytomny — bez antidotum po godzinie rzut END ¾ o życie" });
    } else {
      const loc = sys.locations.head.wounds <= sys.locations.torso.wounds ? "head" : "torso";
      await actor.update({ [`system.locations.${loc}.wounds`]: sys.locations[loc].wounds + 1 });
      blocks.push({ title: "Trucizna radskorpiona", lines: [`${locationName(loc)}: +1 rana`], note: "antidotum albo antywenom przerywa działanie" });
    }
  }
  if (c.paralyzed) {
    blocks.push({ title: "Paraliż (mantykora)", lines: [], note: c.paralyzed.locked ? "sparaliżowany na 1d4 godziny (antidotum pomaga)" : "przy każdej akcji rzut END ½ — 3 sukcesy z rzędu znoszą paraliż" });
  }

  const notes = [];
  await afterWounds(actor, notes);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content: `
    <div class="foe-card wounds">
      <div class="fc-tag"><span>PIPBUCK // KONIEC RUNDY</span><span>${esc(actor.name)}</span></div>
      ${blocks.map(b => `<div class="dmg-res"><h4>${esc(b.title)}</h4>${b.lines.map(l => `<div>${esc(l)}</div>`).join("")}<div class="fc-meta">${esc(b.note)}</div></div>`).join("")}
      ${notes.length ? `<div class="fc-meta"><b class="warn">${esc(notes.join(" · "))}</b></div>` : ""}
    </div>`
  });
  return true;
}

/** Rzut testowy bez okna (np. END przeciw truciźnie); zwraca wynik karty: success / crit-success / fail / crit-fail. */
export async function quickTest(actor, label, baseTn, step) {
  const msg = await rollTest(actor, { label, baseTn, step, mod: 0, notes: [] });
  return msg?.getFlag?.("foe-rpg", "test")?.result ?? msg?.flags?.["foe-rpg"]?.test?.result ?? "fail";
}
const passed = r => r === "success" || r === "crit-success";

/** Gaszenie się: AGI MFD ½ (dwie akcje), sukces gasi ogień. */
export async function extinguish(actor) {
  await spendActions(actor, 2, "gaszenie ognia");
  const res = await quickTest(actor, "Gaszenie ognia (AGI, 2 akcje)", actor.system.attributes.agi.tn, "1/2");
  if (passed(res)) { await clearCondition(actor, "burning"); ui.notifications.info(`${actor.name}: ogień ugaszony.`); }
}

/** Rzut przeciw paraliżowi mantykory: 3 sukcesy z rzędu znoszą, 3 porażki z rzędu = 1d4 godziny (krytyki liczą się podwójnie). */
export async function resistParalysis(actor) {
  const c = conditionsOf(actor).paralyzed;
  if (!c) return;
  const res = await quickTest(actor, "Opór przed paraliżem (END)", actor.system.attributes.end.tn, "1/2");
  const step = res.startsWith("crit") ? 2 : 1;
  const next = passed(res) ? { ok: (c.ok ?? 0) + step, bad: 0 } : { ok: 0, bad: (c.bad ?? 0) + step };
  if (next.ok >= 3) {
    await clearCondition(actor, "paralyzed");
    return ui.notifications.info(`${actor.name}: paraliż ustąpi w następnej rundzie.`);
  }
  await actor.setFlag("foe-rpg", "conditions.paralyzed", { ...next, locked: next.bad >= 3 });
}

/** Pierwszy rzut przeciw truciźnie po trafieniu. */
export async function poisonCheck(actor, type) {
  if (type === "radscorpion") {
    const res = await quickTest(actor, "Odporność na truciznę radskorpiona (END)", actor.system.attributes.end.tn, "3/4");
    if (!passed(res)) await setCondition(actor, "poisoned", { type });
    return passed(res) ? "oparł się truciźnie" : "zatruty: 1 rana na rundę";
  }
  if (type === "manticore") {
    const res = await quickTest(actor, "Odporność na jad mantykory (END)", actor.system.attributes.end.tn, "1/2");
    if (!passed(res)) await setCondition(actor, "paralyzed", { ok: 0, bad: 1, locked: false });
    return passed(res) ? "oparł się jadowi" : "sparaliżowany";
  }
  return "trucizna — efekt według opisu broni (MG)";
}

/** Lista stanów do karty postaci. */
export function conditionRows(actor) {
  const c = conditionsOf(actor);
  return Object.entries(c).filter(([k]) => CONDITIONS[k]).map(([k, v]) => ({
    key: k,
    label: CONDITIONS[k].label,
    detail: k === "burning" ? `3d12 na każdą lokację na koniec rundy, zostało ${v.rounds ?? 1}`
      : k === "shocked" ? `${v.dice || "3d12"} na każdą lokację na koniec rundy`
      : k === "poisoned" ? "1 rana na rundę w głowę lub tułów aż do utraty przytomności"
      : v.locked ? "sparaliżowany na 1d4 godziny" : `rzut END ½ przy każdej akcji (sukcesy z rzędu: ${v.ok ?? 0}/3, porażki: ${v.bad ?? 0}/3)`,
    extinguish: k === "burning",
    resist: k === "paralyzed" && !v.locked
  }));
}
