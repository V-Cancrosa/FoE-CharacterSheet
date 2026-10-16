/**
 * Inicjatywa i tracker walki (podręcznik s. 436–437).
 *   - d100 ± próg AGI ¼ (gracz wybiera po rzucie: odjąć = szybciej, dodać = później) − premie z cech; niższy działa pierwszy,
 *   - 2 akcje na turę (licznik w trackerze, atak i przeładowanie odhaczają same),
 *   - runda zaskoczenia: zaskoczeni nie działają, atakujący mają 1 akcję, potem wszyscy rzucają od nowa,
 *   - opcjonalnie: ten sam rząd dziesiątek = akcje jednoczesne.
 */

const { DialogV2 } = foundry.applications.api;
import { clearFlag } from "./flags.mjs";
import { t } from "./i18n.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const signed = n => (n > 0 ? `+${n}` : `${n}`).replace("-", "−");
const F = "foe-rpg";

/** Ile akcji ma walczący w tej rundzie. */
export function maxActions(combat, combatant) {
  if (combat?.getFlag(F, "surprise")) return combatant.getFlag(F, "surprised") ? 0 : 1;
  return 2;
}
const usedActions = c => Number(c.getFlag(F, "used")) || 0;

/** Okienko po rzucie: ile dodać lub odjąć (do progu AGI ¼). Zwraca modyfikator AGI (ujemny = szybciej). */
async function chooseAgiMod(name, d100, q, fx) {
  if (!q) return 0;
  const total = m => d100 + m - fx;
  const content = `
    <div class="foe-dialog">
      <div class="atk-info"><div>${esc(name)}: d100 = <b>${d100}</b> · AGI ¼ = <b>${q}</b>${fx ? ` · ${t("traits {n}", { n: signed(-fx) })}` : ""}</div></div>
      <label class="mod-row">${t("Custom value (from −{q} to +{q})", { q })} <input type="number" name="v" value="${-q}" min="${-q}" max="${q}"></label>
      <p class="hint">${t("Lower initiative acts earlier. Subtract to act faster (usually the best); add if the character is to wait.")}</p>
    </div>`;
  const clamp = v => Math.max(-q, Math.min(q, Math.round(Number(v) || 0)));
  const r = await DialogV2.wait({
    window: { title: t("Initiative: {name}", { name }) },
    classes: ["foe-rpg", "foe-roll-dialog"],
    position: { width: 400 },
    content,
    rejectClose: false,
    buttons: [
      { action: "sub", label: t("Subtract → {n}", { n: total(-q) }), icon: "fa-solid fa-forward", default: true, callback: () => -q },
      { action: "add", label: t("Add → {n}", { n: total(q) }), icon: "fa-solid fa-backward", callback: () => q },
      { action: "own", label: t("Custom"), icon: "fa-solid fa-pen", callback: (ev, btn) => clamp(btn.form.elements.v.value) }
    ]
  });
  return r ?? -q;
}

/** W FoE RPG niższa inicjatywa działa pierwsza. */
/**
 * Przycisk „Inicjatywa” na karcie: dodaje token postaci do walki na tej scenie i rzuca (z wyborem ± AGI).
 * Gdy walki jeszcze nie ma, MG ją tworzy tym samym kliknięciem; gracz dostaje podpowiedź.
 */
export async function rollActorInitiative(actor) {
  const tokens = actor.getActiveTokens?.() ?? [];
  if (!tokens.length) return ui.notifications.warn(t("{name}: place this character's token on the scene to join the combat.", { name: actor.name }));
  if (!game.combat && !game.user.isGM) return ui.notifications.warn(t("There's no combat yet — the GM starts it in the combat tab (swords) or by clicking “Initiative” here."));
  const c = game.combat?.getCombatantsByActor?.(actor)?.[0];
  if (c && Number.isNumeric(c.initiative)) {
    const again = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Initiative") }, content: `<p>${t("{name} already has initiative {n}. Roll again?", { name: foundry.utils.escapeHTML(actor.name), n: `<b>${c.initiative}</b>` })}</p>`
    });
    if (!again) return null;
  }
  return actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
}

export class FoeCombat extends Combat {
  _sortCombatants(a, b) {
    const ia = Number.isNumeric(a.initiative) ? a.initiative : Infinity;
    const ib = Number.isNumeric(b.initiative) ? b.initiative : Infinity;
    return (ia - ib) || (b.actor?.system.attributes?.agi.total ?? 0) - (a.actor?.system.attributes?.agi.total ?? 0)
      || (a.id > b.id ? 1 : -1);
  }

  /**
   * Rzut inicjatywy: d100, potem gracz wybiera ± AGI ¼ (MG za swoich NPC i przy „rzuć wszystkim” — odejmowanie).
   */
  async rollInitiative(ids, { updateTurn = true, messageOptions = {} } = {}) {
    ids = typeof ids === "string" ? [ids] : Array.from(ids ?? []);
    const currentId = this.combatant?.id;
    const ask = ids.length === 1 || !game.user.isGM;
    const updates = [];
    for (const id of ids) {
      const c = this.combatants.get(id);
      if (!c?.isOwner) continue;
      const sys = c.actor?.system;
      const q = sys?.initAgi ?? 0;
      const fx = sys?.initFx ?? 0;
      const roll = await new Roll("1d100").evaluate();
      const player = c.actor?.hasPlayerOwner;
      const agiMod = ask && (player || !game.user.isGM) ? await chooseAgiMod(c.name, roll.total, q, fx) : -q;
      const total = roll.total + agiMod - fx;
      updates.push({ _id: id, initiative: total });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: c.actor, token: c.token, alias: c.name }),
        rolls: [roll],
        sound: CONFIG.sounds.dice,
        flavor: "",
        content: `
        <div class="foe-card test">
          <div class="fc-tag"><span>${t("PIPBUCK // INITIATIVE")}</span><span>d100</span></div>
          <h3>${esc(c.name)}</h3>
          <div class="fc-main">
            <div class="fc-roll">${total}<small>${t("INIT.")}</small></div>
            <div class="fc-outcome">${agiMod < 0 ? t("Faster") : agiMod > 0 ? t("Waits") : t("Initiative")}</div>
            <div class="fc-sum">d100 ${roll.total} ${agiMod < 0 ? "−" : "+"} ${Math.abs(agiMod)} (AGI)${fx ? ` ${signed(-fx)} (${t("traits")})` : ""}</div>
          </div>
          <div class="fc-meta">${t("Lower initiative acts earlier.")}</div>
        </div>`,
        ...messageOptions
      });
    }
    if (!updates.length) return this;
    await this.updateEmbeddedDocuments("Combatant", updates);
    if (updateTurn && currentId) await this.update({ turn: this.turns.findIndex(tr => tr.id === currentId) });
    return this;
  }
}

/** Odhacza akcje postaci w bieżącej walce (atak, przeładowanie, gaszenie). */
export async function spendActions(actor, n = 1, what = t("action")) {
  const combat = game.combat;
  if (!combat?.started || !actor) return;
  const c = combat.getCombatantsByActor?.(actor)?.[0] ?? combat.combatants.find(x => x.actor === actor);
  if (!c?.isOwner) return;
  const max = maxActions(combat, c);
  const used = usedActions(c);
  if (used + n > max) ui.notifications.warn(t("{name}: {what} — {left} of {max} actions left this round.", { name: c.name, what, left: Math.max(0, max - used), max }));
  await c.setFlag(F, "used", Math.min(max, used + n));
}

/** Okno rundy zaskoczenia: kto jest zaskoczony. */
async function startSurprise(combat) {
  const rows = combat.combatants.contents.map(c =>
    `<label class="atk-row atk-check"><input type="checkbox" name="s-${c.id}"><span>${esc(c.name)}</span><small>${t("tick if surprised")}</small></label>`).join("");
  const picked = await DialogV2.wait({
    window: { title: t("Surprise round") },
    classes: ["foe-rpg", "foe-roll-dialog"],
    position: { width: 420 },
    content: `<div class="foe-dialog">${rows}
      <p class="hint">${t("The surprised don't act and don't roll initiative. Attackers have 1 action each. When the round ends, everyone rolls initiative again.")}</p></div>`,
    rejectClose: false,
    buttons: [{ action: "ok", label: t("btn|Start"), icon: "fa-solid fa-eye-slash", default: true,
      callback: (ev, btn) => combat.combatants.contents.filter(c => btn.form.elements[`s-${c.id}`]?.checked).map(c => c.id) }]
  });
  if (!picked) return;
  await combat.updateEmbeddedDocuments("Combatant", combat.combatants.contents.map(c => ({
    _id: c.id, [`flags.${F}.surprised`]: picked.includes(c.id), [`flags.${F}.used`]: 0,
    ...(picked.includes(c.id) ? { initiative: null } : {})
  })));
  await combat.setFlag(F, "surprise", true);
  if (!combat.started) await combat.startCombat();
  ChatMessage.create({ content: `<div class="foe-card test"><div class="fc-tag"><span>${t("PIPBUCK // SURPRISE")}</span><span>${t("round {n}", { n: 1 })}</span></div>
    <div class="fc-meta">${t("Surprised: {list}. Attackers have 1 action each.", { list: picked.map(id => esc(combat.combatants.get(id)?.name)).join(", ") || t("nobody") })}</div></div>` });
}

export function registerTrackerHooks() {
  // Nowa runda: odnowione akcje; koniec rundy zaskoczenia → wszyscy rzucają inicjatywę od nowa
  Hooks.on("updateCombat", async (combat, changed, options) => {
    if (!("round" in changed) || !game.users.activeGM?.isSelf) return;
    const forward = options?.direction ? options.direction > 0 : changed.round > (combat.previous?.round ?? changed.round);
    if (!forward) return;
    const endSurprise = combat.getFlag(F, "surprise") && changed.round > 1;
    await combat.updateEmbeddedDocuments("Combatant", combat.combatants.contents.map(c => ({
      _id: c.id, [`flags.${F}.used`]: 0, ...(endSurprise ? { [`flags.${F}.surprised`]: false } : {})
    })));
    if (endSurprise) {
      await clearFlag(combat, "surprise");
      await combat.resetAll();
      ChatMessage.create({ content: `<div class="foe-card test"><div class="fc-tag"><span>${t("PIPBUCK // SURPRISE OVER")}</span><span>${t("round {n}", { n: changed.round })}</span></div>
        <div class="fc-meta">${t("Everyone rolls initiative again (the dice icon next to the name in the tracker).")}</div></div>` });
    }
  });

  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const combat = app.viewed ?? game.combat;
    if (!root || !combat) return;
    const tens = game.settings.get(F, "simultaneousTens");
    const groups = new Map();
    if (tens) for (const c of combat.combatants) {
      if (!Number.isNumeric(c.initiative)) continue;
      const g = Math.floor(c.initiative / 10);
      groups.set(g, (groups.get(g) ?? 0) + 1);
    }

    for (const li of root.querySelectorAll("[data-combatant-id]")) {
      const c = combat.combatants.get(li.dataset.combatantId);
      if (!c || li.querySelector(".foe-ct")) continue;
      const max = maxActions(combat, c);
      const used = usedActions(c);
      const box = document.createElement("div");
      box.className = "foe-ct";
      let html = "";
      if (combat.getFlag(F, "surprise") && c.getFlag(F, "surprised")) html += `<span class="foe-ct-tag surprised">${t("SURPRISED")}</span>`;
      else if (combat.started) {
        html += `<span class="foe-ct-pips" title="${t("Actions this round (click to tick off)")}">${Array.from({ length: max }, (_, i) =>
          `<a class="foe-pip ${i < used ? "used" : ""}" data-i="${i}"></a>`).join("")}</span>`;
      }
      if (tens && Number.isNumeric(c.initiative)) {
        const g = Math.floor(c.initiative / 10);
        if ((groups.get(g) ?? 0) > 1) html += `<span class="foe-ct-tag" title="${t("Same tens — simultaneous actions")}">⇄ ${g * 10}–${g * 10 + 9}</span>`;
      }
      if (!html) continue;
      box.innerHTML = html;
      box.addEventListener("click", async ev => {
        const pip = ev.target.closest(".foe-pip");
        if (!pip) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (!c.isOwner) return;
        const i = Number(pip.dataset.i);
        await c.setFlag(F, "used", i < usedActions(c) ? i : i + 1);
      });
      (li.querySelector(".token-name") ?? li).append(box);
    }

    if (game.user.isGM && !root.querySelector(".foe-surprise")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "foe-surprise";
      btn.title = t("Surprise round (p. 436)");
      btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${t("Surprise")}`;
      btn.addEventListener("click", () => startSurprise(combat));
      const bar = root.querySelector(".combat-tracker-header") ?? root.querySelector("header") ?? root;
      bar.append(btn);
    }
  });
}

export function registerTrackerSettings() {
  game.settings.register(F, "simultaneousTens", {
    name: "Simultaneous actions (same tens)",
    hint: "Optional rule (p. 436): combatants with initiative in the same tens (e.g. 40–49) act simultaneously — the tracker marks them.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => ui.combat?.render()
  });
}
