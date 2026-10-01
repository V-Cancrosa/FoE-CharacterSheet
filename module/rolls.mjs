import { MFD_STEPS } from "./data.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const signed = n => (n > 0 ? `+${n}` : `${n}`).replace("-", "−");
const threshold = (baseTn, step, mod) => Math.floor(baseTn * step.f) + mod;
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : null);

/**
 * Okno wyboru MFD i modyfikatora. Zwraca {step, mod} albo null.
 * fixedMod — stały modyfikator (np. z karty umiejętności), wliczany do pokazywanych progów.
 */
export async function promptMfd(title, baseTn, fixedMod = 0) {
  const rows = MFD_STEPS.map(s => `
    <label>
      <input type="radio" name="mfd" value="${s.key}" ${s.key === "1" ? "checked" : ""}>
      <span class="k">${s.name}</span><span class="d">${s.desc}</span>
      <span class="t" data-f="${s.f}">≤ ${threshold(baseTn, s, fixedMod)}</span>
    </label>`).join("");
  const content = `
    <div class="foe-dialog">
      <div class="dlg-base">Próg bazowy (MFD 1): <b>${baseTn + fixedMod}</b>${fixedMod ? ` · w tym stały mod ${signed(fixedMod)}` : ""}</div>
      <div class="mfd-pick">${rows}</div>
      <label class="mod-row">Modyfikator (+ ułatwia, − utrudnia) <input type="number" name="mod" value="0" step="1"></label>
    </div>`;

  // Progi przeliczają się na żywo po wpisaniu modyfikatora
  const render = (event, dialog) => {
    const root = elementOf(dialog) ?? elementOf(event?.target);
    const input = root?.querySelector("input[name=mod]");
    if (!input) return;
    input.addEventListener("input", () => {
      const mod = fixedMod + (Number(input.value) || 0);
      for (const t of root.querySelectorAll(".mfd-pick .t")) t.textContent = `≤ ${Math.floor(baseTn * Number(t.dataset.f)) + mod}`;
    });
  };

  return foundry.applications.api.DialogV2.wait({
    window: { title },
    classes: ["foe-rpg", "foe-roll-dialog"],
    position: { width: 380 },
    content,
    render,
    rejectClose: false,
    buttons: [{
      action: "roll", label: "Rzuć d100", icon: "fa-solid fa-dice-d20", default: true,
      callback: (event, button) => ({
        step: button.form.elements.mfd.value,
        mod: Number(button.form.elements.mod.value) || 0
      })
    }]
  });
}

/** Najtrudniejszy krok MFD, który rzut jeszcze zalicza (do rzutów przeciwstawnych). */
function achievedStep(total, baseTn, mod) {
  let best = null;
  for (const s of MFD_STEPS) if (total <= threshold(baseTn, s, mod)) best = s;
  return best;
}

/**
 * Wykonuje rzut d100 i tworzy kartę na czacie.
 * data: {label, baseTn, step, mod, rerolls, itemUuid?} — itemUuid: broń, dla której karta pokaże przycisk obrażeń
 */
export async function rollTest(actor, data) {
  const rerolls = data.rerolls ?? 0;
  const critS = Math.min(50, 5 + 5 * rerolls);
  const critF = 101 - critS;                 // 96 przy braku przerzutów
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

  // Drabinka: wszystkie poziomy MFD z progami; zaznaczony wymagany (CEL) i osiągnięty (WYNIK)
  const ladder = MFD_STEPS.map(s => {
    const t = threshold(data.baseTn, s, data.mod);
    const pass = r <= t;
    const classes = [pass ? "pass" : "", s === step ? "target" : "", s === ach ? "achieved" : ""].join(" ");
    const tags = [s === step ? `<span class="badge">CEL</span>` : "", s === ach ? `<span class="badge">WYNIK</span>` : ""].join(" ");
    return `<tr class="${classes}"><td class="k" title="${s.desc}">${s.name}</td><td class="t">≤ ${t}</td><td class="m">${pass ? "✓" : "×"}</td><td class="tg">${tags}</td></tr>`;
  }).join("");

  const meta = [
    data.mod ? `Modyfikator ${signed(data.mod)}` : "",
    `Krytyki: 1–${critS} / ${critF}–100`,
    rerolls ? `Przerzut nr ${rerolls}` : ""
  ].filter(Boolean).join(" · ");

  const content = `
  <div class="foe-card test ${cls}">
    <div class="fc-tag"><span>PIPBUCK // TEST</span><span>d100</span></div>
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
    <table class="fc-ladder"><tbody>${ladder}</tbody></table>
    <div class="fc-meta">
      <div>${meta}</div>
      ${cls === "crit-fail" ? `<div>Kartą szczęścia + rzutem na Luck×10 można zamienić krytyczną porażkę w zwykłą.</div>` : ""}
    </div>
    ${data.itemUuid && !failed ? `<button type="button" class="foe-luck" data-action="foeDamage"><i class="fa-solid fa-burst"></i> ${cls === "crit-success" ? "Obrażenia krytyczne" : "Rzuć obrażenia"}</button>` : ""}
    ${canReroll ? `<button type="button" class="foe-luck" data-action="foeLuckReroll"><i class="fa-solid fa-clover"></i> Przerzuć za kartę szczęścia</button>` : ""}
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { "foe-rpg": { test: { ...data, actorUuid: actor.uuid, rerolls } } }
  });
}

/**
 * Jak liczyć krytyk z pola „Krytyk” broni:
 *   puste lub „max” → maksymalne obrażenia z kości
 *   „x2”, „×1.5”    → mnożnik obrażeń
 *   „+1d6”, „+5”    → dodatkowe obrażenia
 *   inny tekst      → tylko wyświetlany jako efekt krytyka (np. „krwawienie”)
 */
function parseCrit(text) {
  const raw = String(text ?? "").trim();
  const spec = raw.toLowerCase().replace(",", ".");
  if (!spec || spec === "max") return { maximize: true, note: "maksymalne obrażenia z kości" };
  const mult = spec.match(/^[x×*]\s*(\d+(?:\.\d+)?)$/);
  if (mult) return { multiplier: Number(mult[1]), note: `obrażenia ×${mult[1].replace(".", ",")}` };
  if (spec.startsWith("+") && Roll.validate(spec.slice(1))) return { extra: spec.slice(1).trim(), note: `dodatkowo ${raw}` };
  return { note: `efekt: ${raw}` };
}

/** Rzut na obrażenia broni z kartą w stylu PipBucka. crit: krytyczne trafienie. */
export async function rollDamage(actor, item, { crit = false } = {}) {
  let formula = item.system.damage || "0";
  // Energy Weapons: bonus do obrażeń = ranga /10
  if (item.system.skill === "energy") formula += ` + ${Math.floor(actor.system.skills.energy.rank / 10)}`;
  const c = crit ? parseCrit(item.system.crit) : {};
  if (c.extra) formula = `${formula} + ${c.extra}`;
  const roll = await new Roll(formula, actor.getRollData()).evaluate({ maximize: !!c.maximize });
  const total = c.multiplier ? Math.floor(roll.total * c.multiplier) : roll.total;
  const dice = roll.dice.flatMap(d => d.results.filter(x => x.active !== false).map(x => `<span>${x.result}</span>`)).join("");

  const content = `
  <div class="foe-card damage ${crit ? "crit-success" : ""}">
    <div class="fc-tag"><span>PIPBUCK // ${crit ? "KRYTYK" : "OBRAŻENIA"}</span><span>${esc(roll.formula)}</span></div>
    <h3>${esc(item.name)}</h3>
    <div class="fc-main">
      <div class="fc-roll">${total}<small>OBR.</small></div>
      <div class="fc-outcome">${crit ? "Krytyczne" : "Obrażenia"}</div>
      <div class="fc-sum">${dice ? `<div class="fc-dice">${dice}</div>` : esc(roll.formula)}${c.multiplier ? `<div>${roll.total} × ${String(c.multiplier).replace(".", ",")} = ${total}</div>` : ""}</div>
    </div>
    ${crit ? `<div class="fc-crit">Krytyk: ${esc(c.note)}</div>` : ""}
    <div class="fc-meta">Odejmij DT celu, potem licz rany: 1 rana / ${actor.system.dmgPerWound} obrażeń (postać gracza).</div>
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });
}

/** Obsługa przycisku przerzutu w czacie (Live by Luck). */
export function registerChatListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const dmg = html.querySelector("[data-action=foeDamage]");
    dmg?.addEventListener("click", async ev => {
      ev.preventDefault();
      const test = message.getFlag("foe-rpg", "test");
      const item = test?.itemUuid ? await fromUuid(test.itemUuid) : null;
      if (!item) return ui.notifications.warn("Nie znaleziono tej broni.");
      if (!item.isOwner) return ui.notifications.warn("Nie jesteś właścicielem tej broni.");
      await rollDamage(item.parent ?? item.actor, item, { crit: html.querySelector(".foe-card")?.classList.contains("crit-success") });
    });

    const btn = html.querySelector("[data-action=foeLuckReroll]");
    if (!btn) return;
    btn.addEventListener("click", async ev => {
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
}
