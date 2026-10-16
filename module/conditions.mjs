import { tint } from "./dice3d.mjs";
import { clearFlag } from "./flags.mjs";
import { rollTest, locationName } from "./rolls.mjs";
import { hitTableFor, tableLocations, effectiveDT, woundsFrom, isMetalArmor } from "./combat.mjs";
import { spendActions } from "./tracker.mjs";
import { t, tn, tfields } from "./i18n.mjs";

/**
 * Stany z efektów specjalnych broni (s. 200–202), zapisane we flagach aktora `foe-rpg.conditions`:
 *   burning   { rounds }            — ogień: 3d12 na każdą lokację na koniec rundy
 *   shocked   { dice }              — elektryczność: raz na koniec rundy 3d12 (maszyny 6d12)
 *   poisoned  { type }              — trucizna radskorpiona: 1 rana na rundę w głowę lub tułów do utraty przytomności
 *   paralyzed { ok, bad, locked }   — trucizna mantykory: paraliż, rzuty END ½ (3 sukcesy z rzędu znoszą)
 * Ikony tokenów to standardowe statusy Foundry.
 */
export const CONDITIONS = tfields({
  burning: { label: "Burning", status: "burning" },
  shocked: { label: "Shocked", status: "shock" },
  poisoned: { label: "Poisoned (radscorpion)", status: "poison" },
  paralyzed: { label: "Paralyzed (manticore)", status: "paralysis" }
}, ["label"]);

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
  const r = tint(await new Roll(formula).evaluate(), "damage");
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
  if (actor.system.dead) { await toggleStatus(actor, "dead", true); notes.push(t("DEAD")); }
  else if (actor.system.unconsciousRisk) notes.push(t("losing consciousness: END ¾ roll on every action"));
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
    blocks.push({ title: t("Fire: 3d12 = {n}", { n: roll.total }), lines, note: left > 0 ? tn(left, "burns for {n} more round", "burns for {n} more rounds") : t("the fire went out") });
  }
  if (c.shocked) {
    const { roll, lines } = await damageAllLocations(actor, c.shocked.dice || "3d12", "electric");
    rolls.push(roll);
    await clearCondition(actor, "shocked");
    blocks.push({ title: t("Electricity: {dice} = {n}", { dice: c.shocked.dice || "3d12", n: roll.total }), lines, note: t("PipBuck and power armor shut down (2 actions to restart)") });
  }
  if (c.poisoned) {
    const sys = actor.system;
    if (sys.unconsciousRisk) {
      await toggleStatus(actor, "unconscious", true);
      blocks.push({ title: t("Radscorpion poison"), lines: [], note: t("unconscious — without an antidote, after an hour an END ¾ roll for their life") });
    } else {
      const loc = sys.locations.head.wounds <= sys.locations.torso.wounds ? "head" : "torso";
      await actor.update({ [`system.locations.${loc}.wounds`]: sys.locations[loc].wounds + 1 });
      blocks.push({ title: t("Radscorpion poison"), lines: [t("{loc}: +1 wound", { loc: locationName(loc) })], note: t("an antidote or antivenom stops it") });
    }
  }
  if (c.paralyzed) {
    blocks.push({ title: t("Paralysis (manticore)"), lines: [], note: c.paralyzed.locked ? t("paralyzed for 1d4 hours (an antidote helps)") : t("END ½ roll on every action — 3 successes in a row end the paralysis") });
  }

  const notes = [];
  await afterWounds(actor, notes);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content: `
    <div class="foe-card wounds">
      <div class="fc-tag"><span>${t("PIPBUCK // END OF ROUND")}</span><span>${esc(actor.name)}</span></div>
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
  await spendActions(actor, 2, t("putting out fire"));
  const res = await quickTest(actor, t("Putting out fire (AGI, 2 actions)"), actor.system.attributes.agi.tn, "1/2");
  if (passed(res)) { await clearCondition(actor, "burning"); ui.notifications.info(t("{name}: fire put out.", { name: actor.name })); }
}

/** Rzut przeciw paraliżowi mantykory: 3 sukcesy z rzędu znoszą, 3 porażki z rzędu = 1d4 godziny (krytyki liczą się podwójnie). */
export async function resistParalysis(actor) {
  const c = conditionsOf(actor).paralyzed;
  if (!c) return;
  const res = await quickTest(actor, t("Resisting paralysis (END)"), actor.system.attributes.end.tn, "1/2");
  const step = res.startsWith("crit") ? 2 : 1;
  const next = passed(res) ? { ok: (c.ok ?? 0) + step, bad: 0 } : { ok: 0, bad: (c.bad ?? 0) + step };
  if (next.ok >= 3) {
    await clearCondition(actor, "paralyzed");
    return ui.notifications.info(t("{name}: the paralysis wears off next round.", { name: actor.name }));
  }
  await actor.setFlag("foe-rpg", "conditions.paralyzed", { ...next, locked: next.bad >= 3 });
}

/** Pierwszy rzut przeciw truciźnie po trafieniu. */
export async function poisonCheck(actor, type) {
  if (type === "radscorpion") {
    const res = await quickTest(actor, t("Resisting radscorpion poison (END)"), actor.system.attributes.end.tn, "3/4");
    if (!passed(res)) await setCondition(actor, "poisoned", { type });
    return passed(res) ? t("resisted the poison") : t("poisoned: 1 wound per round");
  }
  if (type === "manticore") {
    const res = await quickTest(actor, t("Resisting manticore venom (END)"), actor.system.attributes.end.tn, "1/2");
    if (!passed(res)) await setCondition(actor, "paralyzed", { ok: 0, bad: 1, locked: false });
    return passed(res) ? t("resisted the venom") : t("paralyzed");
  }
  return t("poison — effect per the weapon's description (GM)");
}

/** Lista stanów do karty postaci. */
export function conditionRows(actor) {
  const c = conditionsOf(actor);
  return Object.entries(c).filter(([k]) => CONDITIONS[k]).map(([k, v]) => ({
    key: k,
    label: CONDITIONS[k].label,
    detail: k === "burning" ? t("3d12 to every location at the end of the round, {n} left", { n: v.rounds ?? 1 })
      : k === "shocked" ? t("{dice} to every location at the end of the round", { dice: v.dice || "3d12" })
      : k === "poisoned" ? t("1 wound per round to the head or torso until unconscious")
      : v.locked ? t("paralyzed for 1d4 hours") : t("END ½ roll on every action (successes in a row: {ok}/3, failures: {bad}/3)", { ok: v.ok ?? 0, bad: v.bad ?? 0 }),
    extinguish: k === "burning",
    resist: k === "paralyzed" && !v.locked
  }));
}
