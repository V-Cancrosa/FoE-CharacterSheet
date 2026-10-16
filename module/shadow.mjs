/**
 * Magia cieni (Shadowflash, Shadow Form) i podmieńcy w grze. Zasady: shadow-data.mjs.
 */
import { clearFlag } from "./flags.mjs";
import { ATTRS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";
import { spendActions } from "./tracker.mjs";
import { RACES } from "./creation-data.mjs";
import { t } from "./i18n.mjs";
import {
  shadowState, spendShadow, SHADOW_MODES, hasShadowflash, hasShadowForm, sonicScreechItem,
  loveState, disguiseOf, upkeepDays, FAMILIARITY, isChangeling
} from "./shadow-data.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const now = () => game.time?.worldTime ?? 0;
const resultOf = msg => msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
const ok = r => r === "success" || r === "crit-success";

// ---------- magia cieni ----------

/** Shadowflash (unik albo teleport) lub przeskok Shadow Form: rzut Flight, koszt z puli cieni. */
export async function castShadow(actor, mode = "teleport") {
  const sys = actor.system;
  const fl = sys.skills.flight;
  const can = { dodge: hasShadowflash(actor), teleport: hasShadowflash(actor), warp: hasShadowForm(actor) };
  if (!can[mode]) return warn(mode === "warp" ? t("{name} is not in Shadow Form.", { name: actor.name }) : t("{name} doesn't have the Shadowflash trait (bat ponies, p. 35).", { name: actor.name }));
  if (!fl || fl.known === false) return warn(t("{name}: Shadowflash requires the Flight skill.", { name: actor.name }));
  const m = SHADOW_MODES[mode];
  const st = shadowState(actor, now());
  if (st.value < m.cost) return warn(t("Not enough shadow strain ({v}/{max}) — it recovers 1 per hour.", { v: st.value, max: st.max }));
  const dist = mode === "teleport" ? `${10 * sys.attributes.int.total} ft` : mode === "warp" ? "40 ft" : "";
  const extraHtml = `<div class="dlg-attack"><div class="atk-info">
    <div>${esc(m.label)} · MFD ${m.mfd}${m.cost ? ` · ${t("cost {c} from the shadow pool ({v}/{max})", { c: m.cost, v: st.value, max: st.max })}` : ""}${dist ? ` · ${t("range {d}", { d: dist })}` : ""}</div>
    <div>${esc(m.note)}. ${t("Magic suppression doesn't block shadow magic.")}</div></div></div>`;
  const rc = rollContext(actor, { kind: "skill", skill: "flight", skillAttr: fl.attr }, { manualMod: fl.mod });
  const r = await promptMfd(`${m.label}: ${actor.name}`, fl.tn, rc, { defaultStep: m.mfd, extraHtml });
  if (!r) return null;
  const { extra, ...roll } = r;
  if (m.cost) await actor.setFlag(F, "shadow", spendShadow(st, m.cost, now()));
  if (mode !== "dodge") await spendActions(actor, 1, m.label);
  const msg = await rollTest(actor, { label: `${m.label} (Flight)`, baseTn: fl.tn, ...roll });
  const res = resultOf(msg);
  if (mode === "dodge") ui.notifications[ok(res) ? "info" : "warn"](ok(res) ? t("{name}: shadow dodge succeeded — the attack misses.", { name: actor.name }) : t("{name}: shadow dodge failed.", { name: actor.name }));
  return msg;
}

/** Dodaje atak rasowy Sonic Screech (kucyki nietoperzowe). */
export async function addSonicScreech(actor) {
  if (actor.items.some(i => i.type === "weapon" && /sonic screech/i.test(i.name))) return ui.notifications.info(t("{name} already has Sonic Screech.", { name: actor.name }));
  await actor.createEmbeddedDocuments("Item", [sonicScreechItem()]);
  ui.notifications.info(t("{name}: Sonic Screech added (Combat tab).", { name: actor.name }));
  return true;
}

// ---------- podmieńcy (zasady domowe) ----------

async function setLove(actor, value, extra = {}) {
  const s = loveState(actor);
  await actor.setFlag(F, "love", { value: Math.max(0, Math.min(s.max, value)), day: s.day || Math.floor(now() / 86400), ...extra });
}

const raceOptions = () => Object.entries(RACES).filter(([k]) => !["other", "changeling"].includes(k)).map(([k, r]) => `<option value="${esc(r.label)}">${esc(r.label)}</option>`).join("");

/** Przemiana: wygląd i głos wybranego kucyka; tokeny dostają jego imię. Koszt 1 miłości. */
export async function shapeshift(actor) {
  if (!isChangeling(actor)) return warn(t("{name} is not a changeling.", { name: actor.name }));
  const s = loveState(actor);
  if (s.value < 1) return warn(t("{name}: no love for a transformation — feed first.", { name: actor.name }));
  const cur = disguiseOf(actor);
  const pick = await DialogV2.wait({
    window: { title: t("Transformation: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <label class="atk-row">${t("Who to impersonate (name)")} <input type="text" name="name" value="${esc(cur?.name ?? "")}" placeholder="${t("e.g. Velvet Remedy")}"></label>
      <label class="atk-row">${t("Race of the form")} <select name="race">${raceOptions()}</select></label>
      <label class="atk-row atk-check"><input type="checkbox" name="tokens" checked><span>${t("Rename the tokens on the scene")}</span><small>${t("players see the disguise; the real name stays on the sheet")}</small></label>
      <p class="hint">${t("House rule: 1 love per transformation; keeping the form costs nothing. The character must have seen the original; a pony-like size. The form doesn't give racial abilities (e.g. a pegasus's flight or a unicorn's magic) — a changeling has its own wings and horn.")}</p></div>`,
    buttons: [{ action: "ok", label: t("Transform"), icon: "fa-solid fa-masks-theater", default: true,
      callback: (ev, btn) => ({ name: btn.form.elements.name.value.trim(), race: btn.form.elements.race.value, tokens: btn.form.elements.tokens.checked }) }]
  });
  if (!pick?.name) return pick ? warn(t("Enter who the changeling impersonates.")) : null;
  const original = cur?.original ?? actor.getActiveTokens?.()[0]?.document?.name ?? actor.name;
  if (pick.tokens) for (const tk of actor.getActiveTokens?.() ?? []) await tk.document.update({ name: pick.name });
  await actor.setFlag(F, "disguise", { name: pick.name, race: pick.race, original, tokens: pick.tokens });
  await setLove(actor, s.value - 1);
  await spendActions(actor, 1, t("transformation"));
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id),
    content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // ${t("TRANSFORMATION")}</span><span>${t("changeling")}</span></div><h3>${esc(actor.name)}</h3>
      <div class="fc-calc">${t("Looks like {who} ({race}) · love {v}/{max}", { who: `<b>${esc(pick.name)}</b>`, race: esc(pick.race), v: s.value - 1, max: s.max })}</div></div>`
  });
}

export async function endDisguise(actor) {
  const d = disguiseOf(actor);
  if (!d) return null;
  if (d.tokens) for (const tk of actor.getActiveTokens?.() ?? []) await tk.document.update({ name: d.original ?? actor.name });
  await clearFlag(actor, "disguise");
  ui.notifications.info(t("{name}: back to their own form.", { name: actor.name }));
  return true;
}

/** Żerowanie: rzut Speechcraft; sukces +1d4 miłości (krytyk 2d4). Poza walką. */
export async function feedOnLove(actor) {
  if (!isChangeling(actor)) return warn(t("{name} is not a changeling.", { name: actor.name }));
  const sk = actor.system.skills.speech;
  const extraHtml = `<div class="dlg-attack"><div class="atk-info"><div>${t("Feeding on the feelings of nearby ponies (house rule): success +1d4 love, critical +2d4. Hostile or suspicious ones — harder (MFD ¾ or ½). The victims feel tired.")}</div></div></div>`;
  const rc = rollContext(actor, { kind: "skill", skill: "speech", skillAttr: sk.attr }, { manualMod: sk.mod });
  const r = await promptMfd(t("Feeding: {name}", { name: actor.name }), sk.tn, rc, { defaultStep: "1", extraHtml });
  if (!r) return null;
  const { extra, ...roll } = r;
  const msg = await rollTest(actor, { label: t("Feeding on love (Speechcraft)"), baseTn: sk.tn, ...roll });
  const res = resultOf(msg);
  if (!ok(res)) return msg;
  const gain = await new Roll(res === "crit-success" ? "2d4" : "1d4").evaluate();
  const s = loveState(actor);
  await setLove(actor, s.value + gain.total);
  ui.notifications.info(t("{name}: +{n} love ({v}/{max}).", { name: actor.name, n: gain.total, v: Math.min(s.max, s.value + gain.total), max: s.max }));
  return msg;
}

/** Wykrycie przebrania: rzut PER obserwatora z MFD wg znajomości z oryginałem (s. 316). */
export async function detectDisguise(changeling) {
  const d = disguiseOf(changeling);
  const own = game.user?.character;
  const observers = [...new Map([...(canvas?.tokens?.controlled ?? []).map(tk => tk.actor), own].filter(a => a && a !== changeling && a.isOwner).map(a => [a.uuid, a])).values()];
  if (!observers.length) return warn(t("Select the token of the observer (or assign yourself a character) who tries to see through the disguise."));
  const pick = await DialogV2.wait({
    window: { title: t("Detect disguise") }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <div class="atk-info"><div>${t("The changeling impersonates: {who}", { who: `<b>${esc(d?.name ?? "?")}</b>` })}</div></div>
      <label class="atk-row">${t("Observer")} <select name="who">${observers.map((a, i) => `<option value="${i}">${esc(a.name)}</option>`).join("")}</select></label>
      <label class="atk-row">${t("Familiarity with the original")} <select name="fam">${Object.entries(FAMILIARITY).map(([k, f]) => `<option value="${k}">${esc(f.label)} (MFD ${f.mfd})</option>`).join("")}</select></label>
      <p class="hint">${t("As with Voice Alteration (p. 316): a roll about every 30 minutes spent together, the MFD depends on how well the observer knows the original.")}</p></div>`,
    buttons: [{ action: "ok", label: t("Next"), icon: "fa-solid fa-eye", default: true, callback: (ev, btn) => ({ who: Number(btn.form.elements.who.value), fam: btn.form.elements.fam.value }) }]
  });
  if (!pick) return null;
  const obs = observers[pick.who];
  const a = obs.system.attributes.per;
  const rc = rollContext(obs, { kind: "attr", attr: "per" });
  const r = await promptMfd(t("Detect disguise: {name}", { name: obs.name }), a.tn, rc, { defaultStep: FAMILIARITY[pick.fam].mfd });
  if (!r) return null;
  const { extra, ...roll } = r;
  return rollTest(obs, { label: t("Detect disguise ({attr})", { attr: ATTRS.per }), baseTn: a.tn, ...roll });
}

/** Odpoczynek / upływ czasu: utrzymanie 1 miłości dziennie (liczy MG przy przesuwaniu czasu). */
export function registerShadowHooks() {
  Hooks.on("updateWorldTime", async worldTime => {
    if (!game.users.activeGM?.isSelf) return;
    for (const actor of game.actors ?? []) {
      if (!isChangeling(actor)) continue;
      const s = loveState(actor);
      const { today, days } = upkeepDays(s, worldTime);
      if (!s.day) { await actor.setFlag(F, "love", { value: s.value, day: today }); continue; }
      if (!days) continue;
      const value = Math.max(0, s.value - days);
      await actor.setFlag(F, "love", { value, day: today });
      if (value <= 0 && s.value > 0) ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id),
        content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // ${t("CHANGELING")}</span><span>${t("hunger")}</span></div><h3>${esc(actor.name)}</h3>
          <div class="fc-meta">${t("The love pool is empty: −1 step to END and CHA rolls until the changeling feeds.")}</div></div>`
      });
    }
  });
}

/** Ręczne ustawienie puli miłości (MG albo właściciel). */
export async function promptLove(actor) {
  const s = loveState(actor);
  const v = await DialogV2.wait({
    window: { title: t("Love: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 340 }, rejectClose: false,
    content: `<div class="foe-dialog"><label class="atk-row">${t("Love (0–{max})", { max: s.max })} <input type="number" name="v" value="${s.value}" min="0" max="${s.max}"></label></div>`,
    buttons: [{ action: "ok", label: t("Save"), icon: "fa-solid fa-heart", default: true, callback: (ev, btn) => Number(btn.form.elements.v.value) }]
  });
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return setLove(actor, v);
}
