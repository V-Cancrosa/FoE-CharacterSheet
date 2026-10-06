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

const F = "foe-rpg";
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

export const HEAL_KINDS = {
  bandage: { label: "Bandaż leczniczy" },
  potion: { label: "Mikstura lecznicza", mult: 1 },
  rejuv: { label: "Mikstura odmładzająca", mult: 2, mends: true },
  restore: { label: "Mikstura przywracająca", mult: 4, mends: true },
  talisman: { label: "Talizman leczniczy", formula: "3 + 1d8", rads: 200, med: "3/4", magic: "1/2" },
  rejuvTalisman: { label: "Talizman odmładzający", formula: "6 + 4d8", rads: 400, med: "1/2", magic: "1/4", mends: true },
  restoreTalisman: { label: "Talizman przywracający", full: true, mends: true }
};

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
    return `<tr><td class="l">${esc(LOCATIONS[k])}${L.isCrippled ? ` <small class="warn">okaleczona</small>` : ""}</td><td>${L.wounds}</td>
      <td><input type="number" name="h-${k}" value="${plan[k] ?? 0}" min="0" max="${L.wounds}"></td></tr>`;
  }).join("");
  if (!rows) return {};
  return DialogV2.wait({
    window: { title: `Leczenie: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog"><p>Do wyleczenia: <b>${n}</b> ${n === 1 ? "rana" : "ran"}. Rozdziel między lokacje:</p>
      <table class="foe-table"><thead><tr><th class="l">Lokacja</th><th>Rany</th><th>Leczy</th></tr></thead><tbody>${rows}</tbody></table>
      ${opts.mends ? "" : `<p class="hint">Okaleczonej lokacji mikstura nie wyleczy, dopóki kończyna nie zostanie nastawiona (Medicine ¾).</p>`}
      ${game.combat?.started ? `<p class="hint">W walce: maks. 5 ran na lokację na rundę — nadmiar w następnej rundzie.</p>` : ""}</div>`,
    buttons: [{ action: "ok", label: "Lecz", icon: "fa-solid fa-heart", default: true,
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
  return { healed: total, text: parts.join(", ") || "brak ran do wyleczenia", source };
}

/** Cel leczenia: namierzony token (jeśli możesz go zmieniać), inaczej sam użytkownik. */
function healTarget(actor) {
  const t = [...(game.user?.targets ?? [])][0]?.actor;
  return t && t.isOwner ? t : actor;
}

const card = (actor, title, tag, lines) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // LECZENIE</span><span>${esc(tag)}</span></div>
    <h3>${esc(title)}</h3>${lines.map(l => `<div class="fc-meta">${l}</div>`).join("")}</div>`
});

/** Użycie przedmiotu leczącego (mikstura, bandaż, talizman) na sobie albo namierzonym celu. */
export async function useHealItem(actor, item) {
  const kind = HEAL_KINDS[item.system.heal];
  if (!kind) return warn(`${item.name}: nie wiadomo, jak leczy — ustaw rodzaj leczenia na karcie przedmiotu.`);
  const talisman = /talisman/i.test(item.system.heal);
  if (talisman ? (item.system.charges || 0) < 1 : (item.system.qty || 0) < 1) return warn(`${item.name}: ${talisman ? "brak ładunków (naładuj zaklęciem leczącym)" : "nie masz już ani jednej sztuki"}.`);
  const target = healTarget(actor);
  const med = actor.system.skills.medicine;
  const lines = [];
  if (target !== actor) lines.push(`Cel: <b>${esc(target.name)}</b> (podaje ${esc(actor.name)})`);
  const res = m => m?.getFlag?.(F, "test")?.result ?? m?.flags?.[F]?.test?.result ?? "fail";
  const ok = r => r === "success" || r === "crit-success";

  if (kind.full) {
    const update = { "system.resources.rads.value": 0 };
    for (const k of Object.keys(LOCATIONS)) update[`system.locations.${k}.wounds`] = 0;
    await target.update(update);
    for (const k of ["poisoned", "paralyzed"]) if (conditionsOf(target)[k]) await clearCondition(target, k);
    await item.update({ "system.charges": 0, "system.qty": Math.max(0, (item.system.qty || 1) - 1) });
    return card(actor, item.name, kind.label, [...lines, "Pełne zdrowie: wszystkie rany, trucizny i promieniowanie usunięte (skażenie zostaje)."]);
  }

  if (item.system.heal === "bandage") {
    const msg = await rollTest(actor, { label: `Bandaż leczniczy (Medicine)`, baseTn: med.tn, step: "3/4", mod: med.rollMod ?? 0, notes: [] });
    await item.update({ "system.qty": item.system.qty - 1 });
    if (!ok(res(msg))) return card(actor, item.name, kind.label, [...lines, "Źle założony — bandaż zmarnowany."]);
    const hours = await DialogV2.wait({
      window: { title: "Bandaż leczniczy" }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 380 }, rejectClose: false,
      content: `<div class="foe-dialog"><label class="atk-row">Ile czasu działał (h, maks. 3) <input type="number" name="h" value="3" min="0.5" max="3" step="0.5"></label>
        <p class="hint">1 rana na każdej lokacji co 30 minut; nie leczy okaleczeń.</p></div>`,
      buttons: [{ action: "ok", label: "Lecz", icon: "fa-solid fa-heart", default: true, callback: (ev, btn) => Math.min(3, Math.max(0.5, Number(btn.form.elements.h.value) || 3)) }]
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
    return card(actor, item.name, kind.label, [...lines, `Po ${hours} h: ${parts.join(", ") || "brak ran do wyleczenia (okaleczeń bandaż nie leczy)"}.`]);
  }

  let formula = kind.formula;
  if (talisman) {
    const useMagic = (actor.system.skills.magic?.known !== false) && (actor.system.skills.magic?.tn ?? 0) > med.tn;
    const sk = useMagic ? actor.system.skills.magic : med;
    const step = useMagic ? kind.magic : kind.med;
    const msg = await rollTest(actor, { label: `${kind.label} (${useMagic ? "Magic" : "Medicine"})`, baseTn: sk.tn, step, mod: sk.rollMod ?? 0, notes: ["wymaga źródła magii (np. bateria iskrowa)"] });
    await item.update({ "system.charges": item.system.charges - 1 });
    if (!ok(res(msg))) return card(actor, item.name, kind.label, [...lines, `Nie udało się — ładunek zużyty (zostało ${item.system.charges}).`]);
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
    lines.push(`Usuwa ${Math.min(cur, kind.rads)} radów.`);
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll],
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // LECZENIE</span><span>${esc(formula)}</span></div>
      <h3>${esc(item.name)}</h3>
      <div class="fc-calc">Wyleczono ${healed.healed} z ${roll.total}</div>
      ${lines.map(l => `<div class="fc-meta">${l}</div>`).join("")}
      <div class="fc-meta">${esc(healed.text)}${talisman ? ` · ładunki: ${item.system.charges}` : ""}</div>
      ${talisman ? "" : `<div class="fc-meta">Działa tylko na rany ze „złotej godziny”; ${kind.mends ? "leczy też okaleczenia." : "okaleczenia trzeba najpierw nastawić (Medicine ¾)."}</div>`}
    </div>`
  });
}

/** Odpoczynek: naturalne leczenie (s. 181). */
export async function rest(actor) {
  const pick = await DialogV2.wait({
    window: { title: `Odpoczynek: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <label class="atk-row">Godziny odpoczynku <input type="number" name="h" value="8" min="1" step="1"></label>
      <label class="atk-row atk-check"><input type="checkbox" name="medic"><span>Pod opieką medyka</span><small>Medicine 75+: leczenie ×2</small></label>
      <p class="hint">1 rana na lokację za każde 8 h (maks. 3 na dobę, z medykiem 6). Gdy coś jest okaleczone — 1 rana na lokację na dobę. Odpoczynek to spokój: sen, jedzenie, czytanie.</p></div>`,
    buttons: [{ action: "ok", label: "Odpocznij", icon: "fa-solid fa-bed", default: true,
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
  return card(actor, actor.name, `odpoczynek ${pick.hours} h`, [
    `${crippled ? "Okaleczenia spowalniają gojenie (1 na dobę). " : ""}${pick.medic ? "Pod opieką medyka (×2). " : ""}Wyleczono na lokację: ${per}.`,
    esc(parts.join(", ") || "brak ran do wyleczenia")
  ]);
}

/** Nastawienie kończyny (Medicine ¾) — pozwala potem leczyć okaleczoną lokację miksturami. */
export async function setLimb(actor) {
  const med = actor.system.skills.medicine;
  return rollTest(actor, { label: "Nastawienie kończyny (Medicine)", baseTn: med.tn, step: "3/4", mod: med.rollMod ?? 0, notes: ["po złotej godzinie trudniej (MG)"] });
}
