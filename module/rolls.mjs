import { MFD_STEPS, LOCATIONS } from "./data.mjs";
import { actorEffects, sumFx, hitsAttack } from "./effects.mjs";
import {
  CALLED_SHOTS, BIPED_LABELS, HIT_TABLES, hitLocation, locationMultiplier, combineMultipliers,
  damageFormula, isAoe, isClose, wieldPenalty
} from "./combat.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const signed = n => (n > 0 ? `+${n}` : `${n}`).replace("-", "−");
const num = n => String(n).replace(".", ",");
const threshold = (baseTn, step, mod) => Math.floor(baseTn * step.f) + mod;
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : null);

const stepIndex = key => Math.max(0, MFD_STEPS.findIndex(s => s.key === key));
// steps > 0 ułatwia (bliżej MFD 2), steps < 0 utrudnia (bliżej 1/10)
const shiftStep = (i, steps) => Math.max(0, Math.min(MFD_STEPS.length - 1, i - steps));
const stepsLabel = v => `${signed(v)} ${Math.abs(v) === 1 ? "krok" : "kroki"} MFD`;

/** Nazwa lokacji (u dwunożnych przednie nogi to ramiona). */
export function locationName(loc, table = null) {
  if (HIT_TABLES[table]?.biped && BIPED_LABELS[loc]) return BIPED_LABELS[loc];
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
    <label class="sit"><input type="checkbox" name="sit" value="${g.id}" data-label="${esc(g.label)}">
      <span>${esc(g.label)} <small>${esc(g.source)}</small></span>
      <b>${[g.mod ? signed(g.mod) : "", g.steps ? stepsLabel(g.steps) : ""].filter(Boolean).join(", ")}</b>
    </label>`).join("");
  const content = `
    <div class="foe-dialog">
      <div class="dlg-base">Próg bazowy (MFD 1): <b>${baseTn}</b></div>
      ${opts.extraHtml ?? ""}
      ${fixedList ? `<div class="dlg-fixed"><span>Stałe modyfikatory (już wliczone)</span><ul>${fixedList}</ul></div>` : ""}
      ${sitList ? `<div class="dlg-sit"><span>Sytuacyjne — zaznacz, jeśli dotyczą tego rzutu</span>${sitList}</div>` : ""}
      <div class="mfd-pick">${rows}</div>
      <label class="mod-row">Dodatkowy modyfikator (+ ułatwia, − utrudnia) <input type="number" name="mod" value="0" step="1"></label>
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
      action: "roll", label: "Rzuć d100", icon: "fa-solid fa-dice-d20", default: true,
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
          ...(r.extra ? [`Dodatkowy ${signed(r.extra)}`] : [])
        ];
        const out = { step, chosen, mod: r.mod, notes, crit: rc.crit ?? { success: 0, fail: 0 } };
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
    const r = await new Roll("1d20").evaluate();
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
  if (r <= critS) { outcome = "Krytyczny sukces"; cls = "crit-success"; }
  else if (r >= critF) { outcome = "Krytyczna porażka"; cls = "crit-fail"; }
  else if (r <= tn) { outcome = "Sukces"; cls = "success"; }
  else { outcome = "Porażka"; cls = "fail"; }

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
      atk.hit = { loc: c.loc, called: atk.called ?? "torso" };
    }
  }

  // Drabinka: wszystkie poziomy MFD z progami; zaznaczony wymagany (CEL) i osiągnięty (WYNIK)
  const ladder = MFD_STEPS.map(s => {
    const t = threshold(data.baseTn, s, data.mod);
    const pass = r <= t;
    const classes = [pass ? "pass" : "", s === step ? "target" : "", s === ach ? "achieved" : ""].join(" ");
    const tags = [s === step ? `<span class="badge">CEL</span>` : "", s === ach ? `<span class="badge">WYNIK</span>` : ""].join(" ");
    return `<tr class="${classes}"><td class="k" title="${s.desc}">${s.name}</td><td class="t">≤ ${t}</td><td class="m">${pass ? "✓" : "×"}</td><td class="tg">${tags}</td></tr>`;
  }).join("");

  const chosenStep = data.chosen && data.chosen !== step.key ? MFD_STEPS.find(s => s.key === data.chosen) : null;
  const meta = [
    chosenStep ? `Wybrano MFD ${chosenStep.name}, po krokach z modyfikatorów: MFD ${step.name}` : "",
    `Krytyki: 1–${critS} / ${critF}–100`,
    rerolls ? `Przerzut nr ${rerolls}` : ""
  ].filter(Boolean).join(" · ");

  const atkLines = [];
  if (atk?.hit) {
    const h = atk.hit;
    const m = locationMultiplier(h.loc, h.called);
    const mult = m !== 1 ? ` · obrażenia ×${num(m)}` : "";
    atkLines.push(h.called
      ? `Cel: <b>${esc(CALLED_SHOTS[h.called]?.label ?? locationName(h.loc))}</b>`
      : `Trafienie: <b>${esc(locationName(h.loc, atk.table))}</b> (k20: ${h.roll}${atk.melee ? " +1 wręcz" : ""}${h.rerolls ? `, przerzutów: ${h.rerolls}` : ""})${mult}`);
  }
  if (atk?.aoe && !failed) atkLines.push("Wybuch: obrażenia trafiają każdą odsłoniętą lokację (DT liczone osobno).");
  const atkMeta = atk ? [
    atk.used ? `${atk.consumable ? "zużyto sztuk" : "zużyto amunicji"}: ${atk.used}` : "",
    atk.lacking ? `niepełna seria: ${atk.formula}` : ""
  ].filter(Boolean).join(" · ") : "";

  const content = `
  <div class="foe-card test ${cls}">
    <div class="fc-tag"><span>PIPBUCK // ${atk ? (atk.sats ? "SATS" : "ATAK") : "TEST"}</span><span>d100</span></div>
    <h3>${esc(data.label)}</h3>
    <div class="fc-main">
      <div class="fc-roll">${r}<small>RZUT</small></div>
      <div class="fc-outcome">${outcome}</div>
      <div class="fc-sum">${r} ${r <= tn ? "≤" : ">"} ${tn}</div>
    </div>
    <dl class="fc-mfd">
      <dt>Cel</dt><dd><b>MFD ${step.name}</b><span class="t">≤ ${tn}</span><span class="d">${step.desc}</span></dd>
      <dt>Wynik</dt><dd>${ach ? `<b>MFD ${ach.name}</b><span class="t">≤ ${threshold(data.baseTn, ach, data.mod)}</span><span class="d">${ach.desc}</span>` : `<b>brak</b><span class="t"></span><span class="d">żaden poziom</span>`}</dd>
    </dl>
    ${atkLines.length ? `<div class="fc-hit">${atkLines.map(l => `<div>${l}</div>`).join("")}</div>` : ""}
    <table class="fc-ladder"><tbody>${ladder}</tbody></table>
    <div class="fc-meta">
      ${data.notes?.length ? `<div>Modyfikatory: ${data.notes.map(esc).join(" · ")}${data.mod ? ` (razem ${signed(data.mod)})` : ""}</div>` : data.mod ? `<div>Modyfikator ${signed(data.mod)}</div>` : ""}
      ${atkMeta ? `<div>${esc(atkMeta)}</div>` : ""}
      <div>${meta}</div>
      ${cls === "crit-fail" ? `<div>Kartą szczęścia + rzutem na Luck×10 można zamienić krytyczną porażkę w zwykłą.</div>` : ""}
    </div>
    ${data.itemUuid && !failed ? `<button type="button" class="foe-luck" data-action="foeDamage"><i class="fa-solid fa-burst"></i> ${cls === "crit-success" ? "Obrażenia krytyczne" : "Rzuć obrażenia"}</button>` : ""}
    ${canReroll ? `<button type="button" class="foe-luck" data-action="foeLuckReroll"><i class="fa-solid fa-clover"></i> Przerzuć za kartę szczęścia</button>` : ""}
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll, ...extraRolls],
    sound: CONFIG.sounds.dice,
    flags: { "foe-rpg": { test: { ...data, attack: atk ?? undefined, actorUuid: actor.uuid, rerolls } } }
  });
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
  if (!spec || spec === "max") return { maximize: true, note: "maksymalne obrażenia z kości" };
  const mult = spec.match(/^[x×*]\s*(\d+(?:\.\d+)?)$/);
  if (mult) return { multiplier: Number(mult[1]), note: Number(mult[1]) === 1 ? "broń bez premii za krytyk (×1)" : `obrażenia ×${num(mult[1])}` };
  if (spec.startsWith("+") && Roll.validate(spec.slice(1))) return { extra: spec.slice(1).trim(), note: `dodatkowo ${raw}` };
  return { note: `efekt: ${raw}` };
}

/**
 * Rzut na obrażenia broni z kartą w stylu PipBucka.
 * crit — krytyczne trafienie; attack — dane z karty ataku (lokacja, SATS, niepełna seria, cele).
 * Kolejność z podręcznika (s. 462): obrażenia z premiami → mnożniki (sumowane) → DT → rany.
 * DT i rany liczy dopiero przycisk „Nanieś obrażenia”.
 */
export async function rollDamage(actor, item, { crit = false, attack = null } = {}) {
  const w = item.system;
  const sys = actor.system;
  const rank = sys.skills?.[w.skill]?.rank ?? 0;
  const str = sys.attributes?.str?.total ?? 0;
  const aoe = isAoe(w);
  const close = isClose(w);
  const overWield = wieldPenalty(w.weight, str) > 0;
  const df = damageFormula({ ...w, damage: attack?.formula || w.damage }, { str, rank, overWield });
  let formula = df.formula;

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
    roll = await new Roll(formula, actor.getRollData?.() ?? {}).evaluate({ maximize: !!c.maximize });
  } catch (err) {
    ui.notifications.error(`Nieprawidłowa formuła obrażeń „${formula}” — popraw ją w broni (${err.message}).`);
    return null;
  }
  const rolled = roll.total;
  const pre = aoe ? Math.floor(rolled * df.pct) + df.flat : rolled;
  const satsDouble = !!(crit && !aoe && attack?.sats && close);
  const critMult = crit && !aoe ? (c.multiplier ?? 1) * (satsDouble ? 2 : 1) : 1;
  const hit = attack?.hit ?? null;
  const locMult = hit?.loc && !aoe ? locationMultiplier(hit.loc, hit.called) : 1;
  const mult = combineMultipliers(critMult, locMult);
  const total = Math.floor(pre * mult);

  const dice = roll.dice.flatMap(d => d.results.filter(x => x.active !== false).map(x => `<span>${x.result}</span>`)).join("");
  const multParts = [critMult !== 1 ? `krytyk ×${num(critMult)}` : "", locMult !== 1 ? `${locationName(hit.loc)} ×${num(locMult)}` : ""].filter(Boolean).join(" + ");
  const calc = [
    `rzut ${rolled}`,
    aoe ? `× ${Math.round(df.pct * 100)}%${df.flat ? ` + ${df.flat}` : ""} = ${pre}` : "",
    mult !== 1 ? `× ${num(mult)} (${multParts}) = ${total}` : ""
  ].filter(Boolean).join(" ");
  const critNote = aoe
    ? "broń obszarowa nie zadaje krytyków — idealne trafienie (opcjonalnie: ignoruje DT celów w pierwszym promieniu)"
    : `${c.note ?? ""}${satsDouble ? " · w SATS wręcz ×2" : ""}`;
  const targets = attack?.targets?.length ? attack.targets : [...(game.user?.targets ?? [])].map(t => t.document?.uuid).filter(Boolean);
  const locLine = hit?.loc ? `Lokacja: <b>${esc(hit.called ? CALLED_SHOTS[hit.called]?.label ?? locationName(hit.loc) : locationName(hit.loc, attack?.table))}</b>`
    : aoe ? "Wybuch: każda odsłonięta lokacja osobno (DT liczone dla każdej)" : "Lokacja: wybierz przy nanoszeniu (domyślnie tułów)";

  const content = `
  <div class="foe-card damage ${crit ? "crit-success" : ""}">
    <div class="fc-tag"><span>PIPBUCK // ${crit ? "KRYTYK" : "OBRAŻENIA"}</span><span>${esc(roll.formula)}</span></div>
    <h3>${esc(item.name)}</h3>
    <div class="fc-main">
      <div class="fc-roll">${total}<small>OBR.</small></div>
      <div class="fc-outcome">${crit ? "Krytyczne" : "Obrażenia"}</div>
      <div class="fc-sum">${dice ? `<div class="fc-dice">${dice}</div>` : esc(roll.formula)}</div>
    </div>
    <div class="fc-calc">${esc(calc)}</div>
    <div class="fc-hit"><div>${locLine}</div></div>
    ${crit ? `<div class="fc-crit">Krytyk: ${esc(critNote)}</div>` : ""}
    <div class="fc-meta">
      ${df.notes.length || fxDamage ? `<div>Premie: ${[...df.notes, fxDamage ? `z cech ${signed(fxDamage)}` : ""].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
      ${sitDamage.length ? `<div>Sytuacyjnie (dolicz ręcznie): ${sitDamage.map(esc).join(" · ")}</div>` : ""}
      ${w.ignoreDT ? `<div>Ignoruje ${w.ignoreDT} DT celu.</div>` : ""}
    </div>
    <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> Nanieś obrażenia</button>
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: {
      "foe-rpg": {
        damage: {
          actorUuid: actor.uuid, itemUuid: item.uuid ?? null, itemName: item.name, total, pre, critMult, crit: !!crit, aoe,
          loc: hit?.loc ?? null, called: hit?.called ?? null, table: attack?.table ?? null,
          ignoreDT: Number(w.ignoreDT) || 0, targets
        }
      }
    }
  });
}
