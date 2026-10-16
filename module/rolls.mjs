import { markCrit, tint } from "./dice3d.mjs";
import { MFD_STEPS, LOCATIONS } from "./data.mjs";
import { actorEffects, sumFx, hitsAttack } from "./effects.mjs";
import {
  CALLED_SHOTS, BIPED_LABELS, HIT_TABLES, hitLocation, locationMultiplier, combineMultipliers,
  damageFormula, isAoe, isClose, wieldPenalty, SPECIALS, POISONS
} from "./combat.mjs";
import { wieldLimit } from "./saddle.mjs";
import { loadedVariant, ammoIgnoreDT, shiftDice, dieOf } from "./ammo-data.mjs";
import { degradationOn } from "./craft-data.mjs";
import { t, tn, isPL } from "./i18n.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const signed = n => (n > 0 ? `+${n}` : `${n}`).replace("-", "−");
const num = n => (isPL() ? String(n).replace(".", ",") : String(n));
export const threshold = (baseTn, step, mod) => Math.floor(baseTn * step.f) + mod;
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : null);

export const stepIndex = key => Math.max(0, MFD_STEPS.findIndex(s => s.key === key));
// steps > 0 ułatwia (bliżej MFD 2), steps < 0 utrudnia (bliżej 1/10)
export const shiftStep = (i, steps) => Math.max(0, Math.min(MFD_STEPS.length - 1, i - steps));
const stepsLabel = v => tn(v, "{s} MFD step", "{s} MFD steps", { s: signed(v) });

/** Nazwa lokacji (u dwunożnych przednie nogi to ramiona). */
export function locationName(loc, table = null) {
  if (HIT_TABLES[table]?.biped && BIPED_LABELS[loc]) return BIPED_LABELS[loc];
  if (table === "vehicle") return { head: t("Cabin"), torso: t("Hull"), wings: t("Propulsion"), horn: t("Weapons") }[loc] ?? loc;
  return LOCATIONS[loc] ?? loc;
}

/**
 * Okno wyboru MFD i modyfikatora.
 * rc — wynik rollContext(): stałe modyfikatory z cech (mods/steps) i sytuacyjne (situational).
 * opts — dodatki dla ataków: defaultStep, extraHtml (pola nad listą MFD),
 *        readExtra(form) → { steps, mod, notes, data }, onRender(form, update).
 * Zwraca { step, chosen, mod, notes, crit, extra? } albo null.
 */
export async function promptMfd(title, baseTn, rc = {}, opts = {}) {
  const mods = rc.mods ?? [], steps = rc.steps ?? [], situational = rc.situational ?? [];
  const fixedMod = rc.fixedMod ?? 0, fixedSteps = rc.fixedSteps ?? 0;
  const defaultStep = opts.defaultStep ?? "1";

  const rows = MFD_STEPS.map((s, i) => `
    <label>
      <input type="radio" name="mfd" value="${s.key}" ${s.key === defaultStep ? "checked" : ""}>
      <span class="k">${s.name}</span><span class="d">${s.desc}</span>
      <span class="t" data-i="${i}"></span>
    </label>`).join("");
  const fixedList = [
    ...mods.map(m => `<li>${esc(m.label)} <b>${signed(m.value)}</b></li>`),
    ...steps.map(m => `<li>${esc(m.label)} <b>${stepsLabel(m.value)}</b></li>`)
  ].join("");
  const sitList = situational.map(g => `
    <label class="sit"><input type="checkbox" name="sit" value="${g.id}" data-label="${esc(g.label)}" ${g.on ? "checked" : ""}>
      <span>${esc(g.label)} <small>${esc(g.source)}</small></span>
      <b>${[g.mod ? signed(g.mod) : "", g.steps ? stepsLabel(g.steps) : ""].filter(Boolean).join(", ")}</b>
    </label>`).join("");
  const content = `
    <div class="foe-dialog">
      <div class="dlg-base">${t("Base target number (MFD 1):")} <b>${baseTn}</b></div>
      ${opts.extraHtml ?? ""}
      ${fixedList ? `<div class="dlg-fixed"><span>${t("Fixed modifiers (already included)")}</span><ul>${fixedList}</ul></div>` : ""}
      ${sitList ? `<div class="dlg-sit"><span>${t("Situational — tick them if they apply to this roll")}</span>${sitList}</div>` : ""}
      <div class="mfd-pick">${rows}</div>
      <label class="mod-row">${t("Extra modifier (+ easier, − harder)")} <input type="number" name="mod" value="0" step="1"></label>
    </div>`;

  const read = form => {
    const on = new Set([...form.querySelectorAll("input[name=sit]:checked")].map(i => i.value));
    const picked = situational.filter(g => on.has(g.id));
    const extra = Number(form.querySelector("input[name=mod]")?.value) || 0;
    const ex = opts.readExtra?.(form) ?? { steps: 0, mod: 0, notes: [], data: null };
    return {
      picked, extra, ex,
      mod: fixedMod + extra + picked.reduce((t, g) => t + g.mod, 0) + (ex.mod ?? 0),
      steps: fixedSteps + picked.reduce((t, g) => t + g.steps, 0) + (ex.steps ?? 0)
    };
  };

  // Progi przeliczają się na żywo przy zmianie modyfikatora i pól sytuacyjnych
  const render = (event, dialog) => {
    const root = elementOf(dialog) ?? elementOf(event?.target);
    const form = root?.querySelector("form") ?? root;
    if (!form) return;
    const update = () => {
      const r = read(form);
      for (const t of form.querySelectorAll(".mfd-pick .t")) {
        const j = shiftStep(Number(t.dataset.i), r.steps);
        t.textContent = `${j !== Number(t.dataset.i) ? `→ ${MFD_STEPS[j].name} ` : ""}≤ ${threshold(baseTn, MFD_STEPS[j], r.mod)}`;
      }
    };
    opts.onRender?.(form, update);
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
  };

  return foundry.applications.api.DialogV2.wait({
    window: { title },
    classes: ["foe-rpg", "foe-roll-dialog"],
    position: { width: opts.extraHtml ? 460 : 420 },
    content,
    render,
    rejectClose: false,
    buttons: [{
      action: "roll", label: t("Roll d100"), icon: "fa-solid fa-dice-d20", default: true,
      callback: (event, button) => {
        const form = button.form;
        const r = read(form);
        const chosen = form.elements.mfd.value;
        const step = MFD_STEPS[shiftStep(stepIndex(chosen), r.steps)].key;
        const notes = [
          ...mods.map(m => `${m.label} ${signed(m.value)}`),
          ...steps.map(m => `${m.label} ${stepsLabel(m.value)}`),
          ...r.picked.map(g => `${g.label} ${[g.mod ? signed(g.mod) : "", g.steps ? stepsLabel(g.steps) : ""].filter(Boolean).join(", ")}`),
          ...(r.ex.notes ?? []),
          ...(r.extra ? [t("Extra {v}", { v: signed(r.extra) })] : [])
        ];
        const out = { step, chosen, steps: r.steps, mod: r.mod, notes, crit: rc.crit ?? { success: 0, fail: 0 } };
        if (r.ex.data) out.extra = r.ex.data;
        return out;
      }
    }]
  });
}

/** Najtrudniejszy krok MFD, który rzut jeszcze zalicza (do rzutów przeciwstawnych). */
function achievedStep(total, baseTn, mod) {
  let best = null;
  for (const s of MFD_STEPS) if (total <= threshold(baseTn, s, mod)) best = s;
  return best;
}

/** Losowa lokacja trafienia (k20 wg tabeli rasy celu; u dwunożnych 20 = przerzut). */
async function rollHit(table, melee) {
  const rolls = [];
  for (let n = 0; n < 10; n++) {
    const r = tint(await new Roll("1d20").evaluate(), "hitloc");
    rolls.push(r);
    const h = hitLocation(table, r.total, { melee });
    if (h.loc) return { ...h, rerolls: n, rolls };
  }
  return { roll: 20, total: 20, loc: "torso", rerolls: 10, rolls };
}

/**
 * Wykonuje rzut d100 i tworzy kartę na czacie.
 * data: {label, baseTn, step, chosen?, mod, notes?, crit?, rerolls, itemUuid?, attack?}
 *   mod — suma wszystkich modyfikatorów; notes — ich opisy; crit — poszerzenie zakresów krytyków z cech;
 *   itemUuid — broń, dla której karta pokaże przycisk obrażeń;
 *   attack — dane ataku z okna broni (SATS, lokacja, seria, cele).
 */
export async function rollTest(actor, data) {
  const rerolls = data.rerolls ?? 0;
  const crit = data.crit ?? {};
  const critS = Math.min(50, 5 + 5 * rerolls + (crit.success ?? 0));
  const critF = 101 - Math.min(50, 5 + 5 * rerolls + (crit.fail ?? 0));   // 96 przy braku przerzutów
  const step = MFD_STEPS.find(s => s.key === data.step) ?? MFD_STEPS[2];
  const tn = threshold(data.baseTn, step, data.mod);

  const roll = await new Roll("1d100").evaluate();
  const r = roll.total;
  let outcome, cls;
  if (r <= critS) { outcome = t("Critical success"); cls = "crit-success"; }
  else if (r >= critF) { outcome = t("Critical failure"); cls = "crit-fail"; }
  else if (r <= tn) { outcome = t("Success"); cls = "success"; }
  else { outcome = t("Failure"); cls = "fail"; }

  markCrit(roll, cls);
  tint(roll, rerolls ? "luck" : data.attack?.sats ? "sats" : data.magic || /^(Zaklęcie|Celowanie)/.test(data.label ?? "") ? "magic" : "test");   // pl-ok: stare przerzuty   // efekt Dice So Nice na krytyk (jeśli moduł jest włączony)
  // Krytyczna porażka nie osiąga żadnego poziomu
  const ach = cls === "crit-fail" ? null : achievedStep(r, data.baseTn, data.mod);
  const failed = cls === "fail" || cls === "crit-fail";
  const canReroll = failed && critS < 50;

  // Atak: lokacja trafienia (strzał celowany albo losowa k20)
  const atk = data.attack ? { ...data.attack, hit: null } : null;
  const extraRolls = [];
  if (atk && !failed && !atk.aoe) {
    if (atk.random) {
      const h = await rollHit(atk.table, atk.melee);
      extraRolls.push(...h.rolls);
      atk.hit = { loc: h.loc, roll: h.roll, total: h.total, rerolls: h.rerolls, called: null };
    } else {
      const c = CALLED_SHOTS[atk.called] ?? CALLED_SHOTS.torso;
      // strefa potwora z bestiariusza (np. „Szczypce L”) — lokacja systemu bez mnożników strzału celowanego
      atk.hit = atk.area ? { loc: c.loc, called: null, area: atk.area } : { loc: c.loc, called: atk.called ?? "torso" };
    }
  }

  // Drabinka: wszystkie poziomy MFD z progami; zaznaczony wymagany (CEL) i osiągnięty (WYNIK)
  const ladder = MFD_STEPS.map(s => {
    const thr = threshold(data.baseTn, s, data.mod);
    const pass = r <= thr;
    const classes = [pass ? "pass" : "", s === step ? "target" : "", s === ach ? "achieved" : ""].join(" ");
    const tags = [s === step ? `<span class="badge">${t("TARGET")}</span>` : "", s === ach ? `<span class="badge">${t("RESULT")}</span>` : ""].join(" ");
    return `<tr class="${classes}"><td class="k" title="${s.desc}">${s.name}</td><td class="t">≤ ${thr}</td><td class="m">${pass ? "✓" : "×"}</td><td class="tg">${tags}</td></tr>`;
  }).join("");

  const chosenStep = data.chosen && data.chosen !== step.key ? MFD_STEPS.find(s => s.key === data.chosen) : null;
  const meta = [
    chosenStep ? t("Chosen MFD {a}, after the modifier steps: MFD {b}", { a: chosenStep.name, b: step.name }) : "",
    t("Crits: 1–{s} / {f}–100", { s: critS, f: critF }),
    rerolls ? t("Reroll #{n}", { n: rerolls }) : ""
  ].filter(Boolean).join(" · ");

  const atkLines = [];
  if (atk?.hit) {
    const h = atk.hit;
    const m = locationMultiplier(h.loc, h.called);
    const mult = m !== 1 ? ` · ${t("damage ×{m}", { m: num(m) })}` : "";
    atkLines.push(h.area ? `${t("Target:")} <b>${esc(h.area)}</b>${mult}` : h.called
      ? `${t("Target:")} <b>${esc(CALLED_SHOTS[h.called]?.label ?? locationName(h.loc))}</b>`
      : `${t("Hit:")} <b>${esc(atk.areaLabels?.[h.loc] ?? locationName(h.loc, atk.table))}</b> (${t("d20")}: ${h.roll}${atk.melee ? ` ${t("+1 melee")}` : ""}${h.rerolls ? `, ${t("rerolls: {n}", { n: h.rerolls })}` : ""})${mult}`);
  }
  if (atk?.aoe && !failed) atkLines.push(t("Explosion: the damage hits every exposed location (DT counted separately)."));
  const atkMeta = atk ? [
    atk.used ? (atk.consumable ? t("items used: {n}", { n: atk.used }) : t("ammo used: {n}", { n: atk.used })) : "",
    atk.lacking ? t("partial burst: {f}", { f: atk.formula }) : ""
  ].filter(Boolean).join(" · ") : "";

  const content = `
  <div class="foe-card test ${cls}">
    <div class="fc-tag"><span>PIPBUCK // ${atk ? (atk.sats ? "SATS" : t("ATTACK")) : t("TEST")}</span><span>d100</span></div>
    <h3>${esc(data.label)}</h3>
    <div class="fc-main">
      <div class="fc-roll">${r}<small>${t("ROLL")}</small></div>
      <div class="fc-outcome">${outcome}</div>
      <div class="fc-sum">${r} ${r <= tn ? "≤" : ">"} ${tn}</div>
    </div>
    <dl class="fc-mfd">
      <dt>${t("Target")}</dt><dd><b>MFD ${step.name}</b><span class="t">≤ ${tn}</span><span class="d">${step.desc}</span></dd>
      <dt>${t("Result")}</dt><dd>${ach ? `<b>MFD ${ach.name}</b><span class="t">≤ ${threshold(data.baseTn, ach, data.mod)}</span><span class="d">${ach.desc}</span>` : `<b>${t("none")}</b><span class="t"></span><span class="d">${t("no level")}</span>`}</dd>
    </dl>
    ${atkLines.length ? `<div class="fc-hit">${atkLines.map(l => `<div>${l}</div>`).join("")}</div>` : ""}
    <table class="fc-ladder"><tbody>${ladder}</tbody></table>
    <div class="fc-meta">
      ${data.notes?.length ? `<div>${t("Modifiers:")} ${data.notes.map(esc).join(" · ")}${data.mod ? ` ${t("(total {v})", { v: signed(data.mod) })}` : ""}</div>` : data.mod ? `<div>${t("Modifier {v}", { v: signed(data.mod) })}</div>` : ""}
      ${atkMeta ? `<div>${esc(atkMeta)}</div>` : ""}
      <div>${meta}</div>
      ${cls === "crit-fail" ? `<div>${t("A Luck card plus a Luck×10 roll can turn a critical failure into a regular one.")}</div>` : ""}
    </div>
    ${data.itemUuid && !failed ? `<button type="button" class="foe-luck" data-action="foeDamage"><i class="fa-solid fa-burst"></i> ${cls === "crit-success" ? t("Critical damage") : t("Roll damage")}</button>` : ""}
    ${canReroll ? `<button type="button" class="foe-luck" data-action="foeLuckReroll"><i class="fa-solid fa-clover"></i> ${t("Reroll with a Luck card")}</button>` : ""}
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll, ...extraRolls],
    sound: CONFIG.sounds.dice,
    flags: { "foe-rpg": { test: { ...data, attack: atk ?? undefined, actorUuid: actor.uuid, rerolls, result: cls } } }
  });
}

/**
 * Zaklęcie jako „broń” do rzutu obrażeń: INT i ranga Magic/10 w formule, overglow podwaja obrażenia za warstwę (s. 243).
 */
export function spellWeapon(s, actor, layers = 0) {
  const int = actor.system.attributes?.int?.total ?? 0;
  const m10 = Math.floor((actor.system.skills?.magic?.rank ?? 0) / 10);
  let f = String(s.damage || "0").replace(/MAGIC10/g, String(m10)).replace(/\bINT\b/g, String(int));
  if (layers > 0) f = `(${f}) * ${2 ** layers}`;
  return { skill: "magic", damage: f, crit: s.crit || "x1", ignoreDT: s.ignoreDT || 0, weight: 0, specials: {}, aoe: { enabled: false } };
}

/**
 * Jak liczyć krytyk z pola „Krytyk” broni:
 *   „x2”, „×1.5”    → mnożnik obrażeń (tak jak w tabelach podręcznika)
 *   puste lub „max” → maksymalne obrażenia z kości (zasada domowa ze starszych wersji)
 *   „+1d6”, „+5”    → dodatkowe obrażenia
 *   inny tekst      → tylko wyświetlany jako efekt krytyka (np. „krwawienie”)
 */
export function parseCrit(text) {
  const raw = String(text ?? "").trim();
  const spec = raw.toLowerCase().replace(",", ".");
  if (!spec || spec === "max") return { maximize: true, note: t("maximum dice damage") };
  const mult = spec.match(/^[x×*]\s*(\d+(?:\.\d+)?)$/);
  if (mult) return { multiplier: Number(mult[1]), note: Number(mult[1]) === 1 ? t("weapon without a critical bonus (×1)") : t("damage ×{m}", { m: num(mult[1]) }) };
  if (spec.startsWith("+") && Roll.validate(spec.slice(1))) return { extra: spec.slice(1).trim(), note: t("extra {v}", { v: raw }) };
  return { note: t("effect: {v}", { v: raw }) };
}

/** Rzucana mikstura zebr jako „broń” (obrażenia z receptury, bez krytyków i premii za STR). */
export function potionWeapon(s, actor) {
  const sk = actor.system.skills ?? {};
  const skill = sk.magic && sk.magic.known !== false && (sk.magic.tn ?? 0) >= (sk.explosives?.tn ?? 0) ? "magic" : "explosives";
  return { skill, damage: spellWeapon(s, actor).damage, crit: "x1", ignoreDT: 0, weight: 0, specials: {}, aoe: { enabled: false } };
}

/**
 * Rzut na obrażenia broni z kartą w stylu PipBucka.
 * crit — krytyczne trafienie; attack — dane z karty ataku (lokacja, SATS, niepełna seria, cele).
 * Kolejność z podręcznika (s. 462): obrażenia z premiami → mnożniki (sumowane) → DT → rany.
 * DT i rany liczy dopiero przycisk „Nanieś obrażenia”.
 */
export async function rollDamage(actor, item, { crit = false, attack = null } = {}) {
  const w = item.type === "spell" ? spellWeapon(item.system, actor, attack?.overglow ?? 0)
    : item.type === "gear" ? potionWeapon(item.system, actor) : item.system;
  const sys = actor.system;
  const rank = sys.skills?.[w.skill]?.rank ?? 0;
  const str = sys.attributes?.str?.total ?? 0;
  const aoe = isAoe(w);
  const close = isClose(w);
  const overWield = !attack?.vehicle && wieldPenalty(w.weight, str, wieldLimit(actor, w)) > 0;
  // amunicja specjalna (zasada opcjonalna, s. 202–203): ± kości, dodatkowe kości, maksymalne obrażenia, ogień
  const ammoV = item.type === "weapon" ? loadedVariant(w) : null;
  // degradacja (s. 458): −1 kość za każdy utracony krok
  const worn = item.type === "weapon" && degradationOn() ? Number(w.wear) || 0 : 0;
  const df = damageFormula({ ...w, damage: shiftDice(attack?.formula || w.damage, (ammoV?.dice ?? 0) - worn) }, { str, rank, overWield });
  if (worn) df.notes.push(tn(worn, "wear −{n} die", "wear −{n} dice"));
  let formula = df.formula;
  if (ammoV?.addDice) formula += ` + ${ammoV.addDice}`;

  const fx = actorEffects(actor);
  const fxDamage = sumFx(fx, "damage", e => hitsAttack(e.target, w.skill));
  if (fxDamage) formula += ` + ${fxDamage}`;
  const sitDamage = fx.filter(e => e.type === "damage" && e.when && hitsAttack(e.target, w.skill))
    .map(e => `${e.source}: ${signed(Number(e.value) || 0)} (${e.when})`);

  // Krytyk: mnożnik broni; wręcz w SATS podwójny (s. 442); broń obszarowa nie ma krytyków (s. 456)
  const c = crit && !aoe ? parseCrit(w.crit) : {};
  if (c.extra) formula = `${formula} + ${c.extra}`;
  let roll;
  try {
    roll = tint(await new Roll(formula, actor.getRollData?.() ?? {}).evaluate({ maximize: !!c.maximize || !!ammoV?.maxDamage }), item.type === "spell" ? "magic" : "damage");
  } catch (err) {
    ui.notifications.error(t("Invalid damage formula “{f}” — fix it in the weapon ({e}).", { f: formula, e: err.message }));
    return null;
  }
  const rolled = ammoV?.noDamage ? 0 : roll.total;
  const pre = aoe ? Math.floor(rolled * df.pct) + df.flat : rolled;
  const satsDouble = !!(crit && !aoe && attack?.sats && close);
  const critMult = crit && !aoe ? (c.multiplier ?? 1) * (satsDouble ? 2 : 1) : 1;
  const hit = attack?.hit ?? null;
  const locMult = hit?.loc && !aoe ? locationMultiplier(hit.loc, hit.called) : 1;
  const mult = combineMultipliers(critMult, locMult);
  const total = Math.floor(pre * mult);

  const dice = roll.dice.flatMap(d => d.results.filter(x => x.active !== false).map(x => `<span>${x.result}</span>`)).join("");
  const multParts = [critMult !== 1 ? t("critical ×{m}", { m: num(critMult) }) : "", locMult !== 1 ? `${locationName(hit.loc)} ×${num(locMult)}` : ""].filter(Boolean).join(" + ");
  const calc = [
    t("roll {n}", { n: rolled }),
    aoe ? `× ${Math.round(df.pct * 100)}%${df.flat ? ` + ${df.flat}` : ""} = ${pre}` : "",
    mult !== 1 ? `× ${num(mult)} (${multParts}) = ${total}` : ""
  ].filter(Boolean).join(" ");
  const critNote = aoe
    ? t("area weapons don't deal criticals — a perfect hit (optional: ignores the DT of targets in the first radius)")
    : `${c.note ?? ""}${satsDouble ? ` · ${t("melee in SATS ×2")}` : ""}`;
  const targets = attack?.targets?.length ? attack.targets : [...(game.user?.targets ?? [])].map(t => t.document?.uuid).filter(Boolean);
  // Specjalne efekty broni (s. 200–202): ogień/dezintegracja „crit” działają tylko przy krytyku
  const sp = { ...(w.specials ?? {}) };
  if (ammoV?.fire) sp.fire = "hit";
  if (ammoV?.nonlethal) sp.shock = true;
  // Spark: dodatkowe kości przeciw maszynom — rzucone teraz, doliczane przy nanoszeniu, gdy cel jest maszyną
  let machineBonus = 0;
  const ammoRolls = [];
  if (ammoV?.machineDice) {
    const mr = await new Roll(`${ammoV.machineDice}d${dieOf(w.damage)}`).evaluate();
    ammoRolls.push(mr);
    machineBonus = mr.total;
  }
  if (sp.fire === "crit" && !crit) sp.fire = "";
  if (sp.disintegrate === "crit") sp.disintegrateCrit = !!crit;
  let shockWounds = 0;
  const extraRolls = [];
  if (sp.shock && crit) {
    const r = await new Roll("1d10").evaluate();
    extraRolls.push(r);
    shockWounds = r.total;
  }
  const active = ["fire", "electric", "rads", "disintegrate", "shock", "poison", "knockdown"].filter(k => sp[k]);
  const spLine = active.map(k => {
    if (k === "poison") return `${SPECIALS.poison.label}: ${POISONS[sp.poison] ?? sp.poison}`;
    if (k === "shock" && shockWounds) return t("{label}: critical +{n} wounds", { label: SPECIALS.shock.label, n: shockWounds });
    return SPECIALS[k].label;
  });
  const locLine = hit?.loc ? `${t("Location:")} <b>${esc(hit.area ?? (hit.called ? CALLED_SHOTS[hit.called]?.label ?? locationName(hit.loc) : attack?.areaLabels?.[hit.loc] ?? locationName(hit.loc, attack?.table)))}</b>`
    : aoe ? t("Explosion: each exposed location separately (DT counted for each)") : t("Location: choose it when applying (torso by default)");

  const content = `
  <div class="foe-card damage ${crit ? "crit-success" : ""}">
    <div class="fc-tag"><span>PIPBUCK // ${crit ? t("CRITICAL") : t("DAMAGE")}</span><span>${esc(roll.formula)}</span></div>
    <h3>${esc(item.name)}</h3>
    <div class="fc-main">
      <div class="fc-roll">${total}<small>${t("DMG")}</small></div>
      <div class="fc-outcome">${crit ? t("Critical") : t("Damage")}</div>
      <div class="fc-sum">${dice ? `<div class="fc-dice">${dice}</div>` : esc(roll.formula)}</div>
    </div>
    <div class="fc-calc">${esc(calc)}</div>
    <div class="fc-hit"><div>${locLine}</div></div>
    ${crit ? `<div class="fc-crit">${t("Critical:")} ${esc(critNote)}</div>` : ""}
    ${spLine.length ? `<div class="fc-special">${spLine.map(l => `<span>${esc(l)}</span>`).join("")}</div>` : ""}
    <div class="fc-meta">
      ${df.notes.length || fxDamage ? `<div>${t("Bonuses:")} ${[...df.notes, fxDamage ? t("from traits {v}", { v: signed(fxDamage) }) : ""].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
      ${sitDamage.length ? `<div>${t("Situational (add it yourself):")} ${sitDamage.map(esc).join(" · ")}</div>` : ""}
      ${ammoV ? `<div>${esc(t("Ammo {label}: {effect}", { label: ammoV.label, effect: ammoV.effect }))}${machineBonus ? ` ${t("(vs. machines +{n})", { n: machineBonus })}` : ""}</div>` : ""}
      ${(item.type === "weapon" ? ammoIgnoreDT(w) : w.ignoreDT) ? `<div>${t("Ignores {n} DT of the target.", { n: item.type === "weapon" ? ammoIgnoreDT(w) : w.ignoreDT })}</div>` : ""}
    </div>
    <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> ${t("Apply damage")}</button>
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll, ...extraRolls, ...ammoRolls],
    sound: CONFIG.sounds.dice,
    flags: {
      "foe-rpg": {
        damage: {
          ammo: ammoV ? { key: ammoV.key, machineBonus } : null,
          specials: sp, shockWounds,
          actorUuid: actor.uuid, itemUuid: item.uuid ?? null, itemName: item.name, total, pre, critMult, crit: !!crit, aoe,
          loc: hit?.loc ?? null, called: hit?.called ?? null, table: attack?.table ?? null,
          ignoreDT: item.type === "weapon" ? ammoIgnoreDT(w) : Number(w.ignoreDT) || 0, targets,
          ...(w.armorless ? { ignoreArmor: true, noDegrade: true } : {})
        }
      }
    }
  });
}
