import { MFD_STEPS } from "./data.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Okno wyboru MFD i modyfikatora. Zwraca {step, mod} albo null. */
export async function promptMfd(title, baseTn) {
  const opts = MFD_STEPS.map(s =>
    `<option value="${s.key}" ${s.key === "1" ? "selected" : ""}>${s.label} — próg ${Math.floor(baseTn * s.f)}</option>`
  ).join("");
  const content = `
    <div class="foe-dialog">
      <label>Trudność (MFD) <select name="mfd">${opts}</select></label>
      <label>Modyfikator (+ ułatwia, − utrudnia) <input type="number" name="mod" value="0" step="1"></label>
    </div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    rejectClose: false,
    buttons: [{
      action: "roll", label: "Rzuć", default: true,
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
  for (const s of MFD_STEPS) if (total <= Math.floor(baseTn * s.f) + mod) best = s;
  return best;
}

/**
 * Wykonuje rzut d100 i tworzy kartę na czacie.
 * data: {actorUuid, label, baseTn, step, mod, rerolls}
 */
export async function rollTest(actor, data) {
  const rerolls = data.rerolls ?? 0;
  const critS = Math.min(50, 5 + 5 * rerolls);
  const critF = 101 - critS;                 // 96 przy braku przerzutów
  const step = MFD_STEPS.find(s => s.key === data.step) ?? MFD_STEPS[2];
  const tn = Math.floor(data.baseTn * step.f) + data.mod;

  const roll = await new Roll("1d100").evaluate();
  const r = roll.total;
  let outcome, cls;
  if (r <= critS) { outcome = "Krytyczny sukces!"; cls = "crit-success"; }
  else if (r >= critF) { outcome = "Krytyczna porażka!"; cls = "crit-fail"; }
  else if (r <= tn) { outcome = "Sukces"; cls = "success"; }
  else { outcome = "Porażka"; cls = "fail"; }

  const ach = achievedStep(r, data.baseTn, data.mod);
  const failed = cls === "fail" || cls === "crit-fail";
  const canReroll = failed && critS < 50;

  const content = `
  <div class="foe-card ${cls}">
    <h3>${esc(data.label)}</h3>
    <div class="foe-line">MFD ${esc(step.key)} · próg <b>${tn}</b>${data.mod ? ` (mod ${data.mod > 0 ? "+" : ""}${data.mod})` : ""}</div>
    <div class="foe-result">${r}</div>
    <div class="foe-outcome">${outcome}</div>
    <div class="foe-line small">Osiągnięty poziom (rzut przeciwstawny): ${ach ? esc(ach.key) : "brak"}</div>
    <div class="foe-line small">Zakres krytyków: 1–${critS} / ${critF}–100${rerolls ? ` · przerzut nr ${rerolls}` : ""}</div>
    ${canReroll ? `<button type="button" class="foe-luck" data-action="foeLuckReroll">Przerzuć za kartę szczęścia</button>` : ""}
    ${cls === "crit-fail" ? `<div class="foe-line small">Kartą szczęścia + rzutem na Luck×10 można zamienić krytyczną porażkę w zwykłą.</div>` : ""}
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { "foe-rpg": { test: { ...data, actorUuid: actor.uuid, rerolls } } }
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
