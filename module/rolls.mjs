import { MFD_STEPS } from "./data.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const signed = n => (n > 0 ? `+${n}` : `${n}`).replace("-", "−");
const threshold = (baseTn, step, mod) => Math.floor(baseTn * step.f) + mod;
const stepName = s => `MFD ${s.name} (${s.desc})`;
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
 * data: {label, baseTn, step, mod, rerolls}
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
      <div class="fc-sum">
        Wymagane: <b>${stepName(step)}</b> → próg <b>≤ ${tn}</b><br>
        Osiągnięto: <b>${ach ? stepName(ach) : "żaden poziom"}</b>
      </div>
    </div>
    <table class="fc-ladder"><tbody>${ladder}</tbody></table>
    <div class="fc-meta">
      <div>${meta}</div>
      ${cls === "crit-fail" ? `<div>Kartą szczęścia + rzutem na Luck×10 można zamienić krytyczną porażkę w zwykłą.</div>` : ""}
    </div>
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

/** Rzut na obrażenia broni z kartą w stylu PipBucka. */
export async function rollDamage(actor, item) {
  let formula = item.system.damage || "0";
  // Energy Weapons: bonus do obrażeń = ranga /10
  if (item.system.skill === "energy") formula += ` + ${Math.floor(actor.system.skills.energy.rank / 10)}`;
  const roll = await new Roll(formula, actor.getRollData()).evaluate();
  const dice = roll.dice.flatMap(d => d.results.filter(x => x.active !== false).map(x => `<span>${x.result}</span>`)).join("");

  const content = `
  <div class="foe-card damage">
    <div class="fc-tag"><span>PIPBUCK // OBRAŻENIA</span><span>${esc(roll.formula)}</span></div>
    <h3>${esc(item.name)}</h3>
    <div class="fc-main">
      <div class="fc-roll">${roll.total}<small>OBR.</small></div>
      <div class="fc-outcome">Obrażenia</div>
      <div class="fc-sum">${dice ? `<div class="fc-dice">${dice}</div>` : esc(roll.formula)}</div>
    </div>
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
