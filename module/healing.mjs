/**
 * Leczenie (podręcznik s. 179–182):
 *   - mikstura lecznicza: rany zależne od rangi Medicine podającego (0: 1, 1–24: 1d4, 25–49: 1+1d6, 50–74: 2+1d8,
 *     75–99: 3+1d10, 100: 4+1d12); odmładzająca ×2, przywracająca ×4 (mnoży się i kości, i stałą),
 *   - bandaż: Medicine ¾, potem 1 rana na lokację co 30 min przez 3 h,
 *   - talizmany: rzut Medicine/Magic, rany i rady na ładunek (lecznicze 3+1d8 / −200, odmładzające 6+4d8 / −400),
 *     talizman przywracający — pełne zdrowie,
 *   - w walce maks. 5 ran na lokację na rundę (reszta w następnej), okaleczeń mikstury nie leczą bez nastawienia,
 *   - naturalnie: 1 rana na lokację za 8 h odpoczynku (maks. 3 na dobę, pod opieką medyka 75+ — ×2);
 *     okaleczona lokacja — 1 na dobę.
 */
import { tint } from "./dice3d.mjs";
import { LOCATIONS } from "./data.mjs";
import { rollTest } from "./rolls.mjs";
import { clearCondition, conditionsOf } from "./conditions.mjs";
import { t, tn, tfields } from "./i18n.mjs";

const F = "foe-rpg";
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

export const HEAL_KINDS = tfields({
  bandage: { label: "Healing bandage" },
  potion: { label: "Healing potion", mult: 1 },
  rejuv: { label: "Rejuvenation potion", mult: 2, mends: true },
  restore: { label: "Restoration potion", mult: 4, mends: true },
  talisman: { label: "Healing talisman", formula: "3 + 1d8", rads: 200, med: "3/4", magic: "1/2" },
  rejuvTalisman: { label: "Rejuvenation talisman", formula: "6 + 4d8", rads: 400, med: "1/2", magic: "1/4", mends: true },
  restoreTalisman: { label: "Restoration talisman", full: true, mends: true }
}, ["label"]);

/** Formuła mikstury leczniczej według rangi Medicine podającego (figura 7). */
export function potionFormula(rank, mult = 1) {
  const [base, die] = rank <= 0 ? [1, 0] : rank < 25 ? [0, 4] : rank < 50 ? [1, 6] : rank < 75 ? [2, 8] : rank < 100 ? [3, 10] : [4, 12];
  const parts = [];
  if (die) parts.push(`${mult}d${die}`);
  if (base) parts.push(String(base * mult));
  return parts.join(" + ");
}

/** Rozdział ran do wyleczenia: najpierw najbardziej ranne lokacje bez okaleczenia (chyba że środek leczy okaleczenia). */
export function planHealing(sys, n, { mends = false, perLocation = Infinity } = {}) {
  const locs = Object.keys(LOCATIONS).filter(k => sys.locations[k]?.wounds > 0);
  const plan = Object.fromEntries(locs.map(k => [k, 0]));
  const cap = k => {
    const L = sys.locations[k];
    const max = Math.min(L.wounds, perLocation);
    if (mends || !L.isCrippled) return max;
    // okaleczonej lokacji mikstura nie wyleczy (s. 179) — zostaje do nastawienia
    return 0;
  };
  let left = n;
  while (left > 0) {
    const pick = locs.filter(k => plan[k] < cap(k)).sort((a, b) => (sys.locations[b].wounds - plan[b]) - (sys.locations[a].wounds - plan[a]))[0];
    if (!pick) break;
    plan[pick]++;
    left--;
  }
  return { plan, unused: left };
}

/** Okno rozdziału ran (gracz może poprawić automatyczny plan). */
async function promptDistribution(actor, n, opts) {
  const sys = actor.system;
  const { plan } = planHealing(sys, n, opts);
  const rows = Object.keys(LOCATIONS).filter(k => sys.locations[k]?.wounds > 0).map(k => {
    const L = sys.locations[k];
    return `<tr><td class="l">${esc(LOCATIONS[k])}${L.isCrippled ? ` <small class="warn">${t("loc|crippled")}</small>` : ""}</td><td>${L.wounds}</td>
      <td><input type="number" name="h-${k}" value="${plan[k] ?? 0}" min="0" max="${L.wounds}"></td></tr>`;
  }).join("");
  if (!rows) return {};
  return DialogV2.wait({
    window: { title: t("Healing: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog"><p>${tn(n, "To heal: {n} wound. Distribute it among locations:", "To heal: {n} wounds. Distribute them among locations:", { n: `<b>${n}</b>` })}</p>
      <table class="foe-table"><thead><tr><th class="l">${t("Location")}</th><th>${t("Wounds")}</th><th>${t("Heals")}</th></tr></thead><tbody>${rows}</tbody></table>
      ${opts.mends ? "" : `<p class="hint">${t("A potion won't heal a crippled location until the limb is set (Medicine ¾).")}</p>`}
      ${game.combat?.started ? `<p class="hint">${t("In combat: max. 5 wounds per location per round — the excess in the next round.")}</p>` : ""}</div>`,
    buttons: [{ action: "ok", label: t("Heal"), icon: "fa-solid fa-heart", default: true,
      callback: (ev, btn) => Object.fromEntries([...btn.form.querySelectorAll("input[name^=h-]")].map(i => [i.name.slice(2), Math.max(0, Number(i.value) || 0)])) }]
  });
}

/**
 * Leczy n ran postaci. quiet — bez okna (plan automatyczny). Zwraca { healed, text } albo null.
 */
export async function healWounds(actor, n, { source = "", quiet = false, mends = false } = {}) {
  const sys = actor.system;
  if (n <= 0) return { healed: 0, text: "" };
  const perLocation = game.combat?.started ? 5 : Infinity;
  const plan = quiet ? planHealing(sys, n, { mends, perLocation }).plan : await promptDistribution(actor, n, { mends });
  if (!plan) return null;
  const update = {};
  const parts = [];
  let total = 0;
  for (const [k, v] of Object.entries(plan)) {
    const h = Math.min(v, sys.locations[k]?.wounds ?? 0);
    if (!h) continue;
    update[`system.locations.${k}.wounds`] = sys.locations[k].wounds - h;
    parts.push(`${LOCATIONS[k]} −${h}`);
    total += h;
  }
  if (total) await actor.update(update);
  return { healed: total, text: parts.join(", ") || t("no wounds to heal"), source };
}

/** Cel leczenia: namierzony token (jeśli możesz go zmieniać), inaczej sam użytkownik. */
function healTarget(actor) {
  const tgt = [...(game.user?.targets ?? [])][0]?.actor;
  return tgt && tgt.isOwner ? tgt : actor;
}

const card = (actor, title, tag, lines) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${t("HEALING")}</span><span>${esc(tag)}</span></div>
    <h3>${esc(title)}</h3>${lines.map(l => `<div class="fc-meta">${l}</div>`).join("")}</div>`
});

/** Użycie przedmiotu leczącego (mikstura, bandaż, talizman) na sobie albo namierzonym celu. */
export async function useHealItem(actor, item) {
  const kind = HEAL_KINDS[item.system.heal];
  if (!kind) return warn(t("{name}: unknown how it heals — set the healing type on the item sheet.", { name: item.name }));
  const talisman = /talisman/i.test(item.system.heal);
  if (talisman ? (item.system.charges || 0) < 1 : (item.system.qty || 0) < 1) return warn(talisman ? t("{name}: no charges (charge it with a healing spell).", { name: item.name }) : t("{name}: you don't have any left.", { name: item.name }));
  const target = healTarget(actor);
  const med = actor.system.skills.medicine;
  const lines = [];
  if (target !== actor) lines.push(t("Target: {target} (given by {name})", { target: `<b>${esc(target.name)}</b>`, name: esc(actor.name) }));
  const res = m => m?.getFlag?.(F, "test")?.result ?? m?.flags?.[F]?.test?.result ?? "fail";
  const ok = r => r === "success" || r === "crit-success";

  if (kind.full) {
    const update = { "system.resources.rads.value": 0 };
    for (const k of Object.keys(LOCATIONS)) update[`system.locations.${k}.wounds`] = 0;
    await target.update(update);
    for (const k of ["poisoned", "paralyzed"]) if (conditionsOf(target)[k]) await clearCondition(target, k);
    await item.update({ "system.charges": 0, "system.qty": Math.max(0, (item.system.qty || 1) - 1) });
    return card(actor, item.name, kind.label, [...lines, t("Full health: all wounds, poisons and radiation removed (taint remains).")]);
  }

  if (item.system.heal === "bandage") {
    const msg = await rollTest(actor, { label: t("Healing bandage (Medicine)"), baseTn: med.tn, step: "3/4", mod: med.rollMod ?? 0, notes: [] });
    await item.update({ "system.qty": item.system.qty - 1 });
    if (!ok(res(msg))) return card(actor, item.name, kind.label, [...lines, t("Applied badly — the bandage is wasted.")]);
    const hours = await DialogV2.wait({
      window: { title: t("Healing bandage") }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 380 }, rejectClose: false,
      content: `<div class="foe-dialog"><label class="atk-row">${t("How long it worked (h, max. 3)")} <input type="number" name="h" value="3" min="0.5" max="3" step="0.5"></label>
        <p class="hint">${t("1 wound on every location every 30 minutes; doesn't heal crippling.")}</p></div>`,
      buttons: [{ action: "ok", label: t("Heal"), icon: "fa-solid fa-heart", default: true, callback: (ev, btn) => Math.min(3, Math.max(0.5, Number(btn.form.elements.h.value) || 3)) }]
    });
    if (!hours) return null;
    const per = Math.floor(hours * 2);
    const sys = target.system;
    const update = {};
    const parts = [];
    for (const k of Object.keys(LOCATIONS)) {
      const L = sys.locations[k];
      if (!L?.wounds || L.isCrippled) continue;
      const h = Math.min(per, L.wounds);
      update[`system.locations.${k}.wounds`] = L.wounds - h;
      parts.push(`${LOCATIONS[k]} −${h}`);
    }
    if (parts.length) await target.update(update);
    return card(actor, item.name, kind.label, [...lines, t("After {h} h: {list}.", { h: hours, list: parts.join(", ") || t("no wounds to heal (a bandage doesn't heal crippling)") })]);
  }

  let formula = kind.formula;
  if (talisman) {
    const useMagic = (actor.system.skills.magic?.known !== false) && (actor.system.skills.magic?.tn ?? 0) > med.tn;
    const sk = useMagic ? actor.system.skills.magic : med;
    const step = useMagic ? kind.magic : kind.med;
    const msg = await rollTest(actor, { label: `${kind.label} (${useMagic ? "Magic" : "Medicine"})`, baseTn: sk.tn, step, mod: sk.rollMod ?? 0, notes: [t("requires a magic source (e.g. a spark battery)")] });
    await item.update({ "system.charges": item.system.charges - 1 });
    if (!ok(res(msg))) return card(actor, item.name, kind.label, [...lines, t("Failed — a charge is used up ({n} left).", { n: item.system.charges })]);
  } else {
    formula = potionFormula(med.rank ?? 0, kind.mult);
    await item.update({ "system.qty": item.system.qty - 1 });
  }
  const roll = tint(await new Roll(formula).evaluate(), "heal");
  const healed = await healWounds(target, roll.total, { source: item.name, mends: !!kind.mends });
  if (!healed) return null;
  if (talisman && kind.rads) {
    const cur = target.system.resources.rads.value || 0;
    await target.update({ "system.resources.rads.value": Math.max(0, cur - kind.rads) });
    lines.push(t("Removes {n} rads.", { n: Math.min(cur, kind.rads) }));
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll],
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${t("HEALING")}</span><span>${esc(formula)}</span></div>
      <h3>${esc(item.name)}</h3>
      <div class="fc-calc">${t("Healed {a} of {b}", { a: healed.healed, b: roll.total })}</div>
      ${lines.map(l => `<div class="fc-meta">${l}</div>`).join("")}
      <div class="fc-meta">${esc(healed.text)}${talisman ? ` · ${t("charges: {n}", { n: item.system.charges })}` : ""}</div>
      ${talisman ? "" : `<div class="fc-meta">${kind.mends ? t("Works only on wounds from the “golden hour”; heals crippling too.") : t("Works only on wounds from the “golden hour”; crippling must be set first (Medicine ¾).")}</div>`}
    </div>`
  });
}

/** Odpoczynek: naturalne leczenie (s. 181). */
export async function rest(actor) {
  const pick = await DialogV2.wait({
    window: { title: t("Rest: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <label class="atk-row">${t("Hours of rest")} <input type="number" name="h" value="8" min="1" step="1"></label>
      <label class="atk-row atk-check"><input type="checkbox" name="medic"><span>${t("Under a medic's care")}</span><small>${t("Medicine 75+: healing ×2")}</small></label>
      <p class="hint">${t("1 wound per location for every 8 h (max. 3 per day, 6 with a medic). When something is crippled — 1 wound per location per day. Rest means calm: sleep, food, reading.")}</p></div>`,
    buttons: [{ action: "ok", label: t("btn|Rest"), icon: "fa-solid fa-bed", default: true,
      callback: (ev, btn) => ({ hours: Math.max(1, Number(btn.form.elements.h.value) || 8), medic: btn.form.elements.medic.checked }) }]
  });
  if (!pick) return null;
  const sys = actor.system;
  const crippled = Object.values(sys.locations).some(L => L.isCrippled && L.wounds > 0);
  const days = pick.hours / 24;
  let per = crippled ? Math.floor(days) : Math.min(Math.floor(pick.hours / 8), Math.ceil(days) * 3);
  if (pick.medic) per *= 2;
  const update = {};
  const parts = [];
  for (const k of Object.keys(LOCATIONS)) {
    const L = sys.locations[k];
    if (!L?.wounds || !per) continue;
    const h = Math.min(per, L.wounds);
    update[`system.locations.${k}.wounds`] = L.wounds - h;
    parts.push(`${LOCATIONS[k]} −${h}`);
  }
  if (parts.length) await actor.update(update);
  try { if (game.user.isGM) await game.time.advance(pick.hours * 3600); } catch { /* bez upływu czasu */ }
  return card(actor, actor.name, t("rest {n} h", { n: pick.hours }), [
    [crippled ? t("Crippling slows healing (1 per day).") : "", pick.medic ? t("Under a medic's care (×2).") : "", t("Healed per location: {n}.", { n: per })].filter(Boolean).join(" "),
    esc(parts.join(", ") || t("no wounds to heal"))
  ]);
}

/** Nastawienie kończyny (Medicine ¾) — pozwala potem leczyć okaleczoną lokację miksturami. */
export async function setLimb(actor) {
  const med = actor.system.skills.medicine;
  return rollTest(actor, { label: t("Setting a limb (Medicine)"), baseTn: med.tn, step: "3/4", mod: med.rollMod ?? 0, notes: [t("harder after the golden hour (GM)")] });
}
