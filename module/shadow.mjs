/**
 * Magia cieni (Shadowflash, Shadow Form) i podmieńcy w grze. Zasady: shadow-data.mjs.
 */
import { clearFlag } from "./flags.mjs";
import { ATTRS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";
import { spendActions } from "./tracker.mjs";
import { RACES } from "./creation-data.mjs";
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
  if (!can[mode]) return warn(mode === "warp" ? `${actor.name} nie jest w Shadow Form.` : `${actor.name} nie ma cechy Shadowflash (kucyki nietoperzowe, s. 35).`);
  if (!fl || fl.known === false) return warn(`${actor.name}: Shadowflash wymaga umiejętności Flight.`);
  const m = SHADOW_MODES[mode];
  const st = shadowState(actor, now());
  if (st.value < m.cost) return warn(`Za mało strainu cieni (${st.value}/${st.max}) — odnawia się 1 na godzinę.`);
  const dist = mode === "teleport" ? `${10 * sys.attributes.int.total} ft` : mode === "warp" ? "40 ft" : "";
  const extraHtml = `<div class="dlg-attack"><div class="atk-info">
    <div>${esc(m.label)} · MFD ${m.mfd}${m.cost ? ` · koszt ${m.cost} z puli cieni (${st.value}/${st.max})` : ""}${dist ? ` · zasięg ${dist}` : ""}</div>
    <div>${esc(m.note)}. Magii cieni nie blokuje tłumienie magii.</div></div></div>`;
  const rc = rollContext(actor, { kind: "skill", skill: "flight", skillAttr: fl.attr }, { manualMod: fl.mod });
  const r = await promptMfd(`${m.label}: ${actor.name}`, fl.tn, rc, { defaultStep: m.mfd, extraHtml });
  if (!r) return null;
  const { extra, ...roll } = r;
  if (m.cost) await actor.setFlag(F, "shadow", spendShadow(st, m.cost, now()));
  if (mode !== "dodge") await spendActions(actor, 1, m.label);
  const msg = await rollTest(actor, { label: `${m.label} (Flight)`, baseTn: fl.tn, ...roll });
  const res = resultOf(msg);
  if (mode === "dodge") ui.notifications[ok(res) ? "info" : "warn"](ok(res) ? `${actor.name}: unik cieniem udany — atak chybia.` : `${actor.name}: unik cieniem nieudany.`);
  return msg;
}

/** Dodaje atak rasowy Sonic Screech (kucyki nietoperzowe). */
export async function addSonicScreech(actor) {
  if (actor.items.some(i => i.type === "weapon" && /sonic screech/i.test(i.name))) return ui.notifications.info(`${actor.name} ma już Sonic Screech.`);
  await actor.createEmbeddedDocuments("Item", [sonicScreechItem()]);
  ui.notifications.info(`${actor.name}: dodano Sonic Screech (zakładka Walka).`);
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
  if (!isChangeling(actor)) return warn(`${actor.name} nie jest podmieńcem.`);
  const s = loveState(actor);
  if (s.value < 1) return warn(`${actor.name}: brak miłości na przemianę — najpierw żerowanie.`);
  const cur = disguiseOf(actor);
  const pick = await DialogV2.wait({
    window: { title: `Przemiana: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <label class="atk-row">Kogo udaje (imię) <input type="text" name="name" value="${esc(cur?.name ?? "")}" placeholder="np. Velvet Remedy"></label>
      <label class="atk-row">Rasa formy <select name="race">${raceOptions()}</select></label>
      <label class="atk-row atk-check"><input type="checkbox" name="tokens" checked><span>Zmień imię tokenów na scenie</span><small>gracze widzą przebranie; prawdziwe imię zostaje na karcie</small></label>
      <p class="hint">Zasada domowa: 1 miłość za przemianę; utrzymanie formy nic nie kosztuje. Postać musiała widzieć oryginał; rozmiar podobny do kucyka.
      Forma nie daje zdolności rasy (np. lotu pegaza czy magii jednorożca) — podmieniec ma własne skrzydła i róg.</p></div>`,
    buttons: [{ action: "ok", label: "Przemień się", icon: "fa-solid fa-masks-theater", default: true,
      callback: (ev, btn) => ({ name: btn.form.elements.name.value.trim(), race: btn.form.elements.race.value, tokens: btn.form.elements.tokens.checked }) }]
  });
  if (!pick?.name) return pick ? warn("Podaj, kogo udaje podmieniec.") : null;
  const original = cur?.original ?? actor.getActiveTokens?.()[0]?.document?.name ?? actor.name;
  if (pick.tokens) for (const t of actor.getActiveTokens?.() ?? []) await t.document.update({ name: pick.name });
  await actor.setFlag(F, "disguise", { name: pick.name, race: pick.race, original, tokens: pick.tokens });
  await setLove(actor, s.value - 1);
  await spendActions(actor, 1, "przemiana");
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id),
    content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // PRZEMIANA</span><span>podmieniec</span></div><h3>${esc(actor.name)}</h3>
      <div class="fc-calc">Wygląda jak <b>${esc(pick.name)}</b> (${esc(pick.race)}) · miłość ${s.value - 1}/${s.max}</div></div>`
  });
}

export async function endDisguise(actor) {
  const d = disguiseOf(actor);
  if (!d) return null;
  if (d.tokens) for (const t of actor.getActiveTokens?.() ?? []) await t.document.update({ name: d.original ?? actor.name });
  await clearFlag(actor, "disguise");
  ui.notifications.info(`${actor.name}: powrót do własnej postaci.`);
  return true;
}

/** Żerowanie: rzut Speechcraft; sukces +1d4 miłości (krytyk 2d4). Poza walką. */
export async function feedOnLove(actor) {
  if (!isChangeling(actor)) return warn(`${actor.name} nie jest podmieńcem.`);
  const sk = actor.system.skills.speech;
  const extraHtml = `<div class="dlg-attack"><div class="atk-info"><div>Żerowanie na uczuciach kucyków w pobliżu (zasada domowa): sukces +1d4 miłości, krytyk +2d4.
    Wrogo nastawieni albo podejrzliwi — trudniej (MFD ¾ albo ½). Ofiary czują się zmęczone.</div></div></div>`;
  const rc = rollContext(actor, { kind: "skill", skill: "speech", skillAttr: sk.attr }, { manualMod: sk.mod });
  const r = await promptMfd(`Żerowanie: ${actor.name}`, sk.tn, rc, { defaultStep: "1", extraHtml });
  if (!r) return null;
  const { extra, ...roll } = r;
  const msg = await rollTest(actor, { label: "Żerowanie na miłości (Speechcraft)", baseTn: sk.tn, ...roll });
  const res = resultOf(msg);
  if (!ok(res)) return msg;
  const gain = await new Roll(res === "crit-success" ? "2d4" : "1d4").evaluate();
  const s = loveState(actor);
  await setLove(actor, s.value + gain.total);
  ui.notifications.info(`${actor.name}: +${gain.total} miłości (${Math.min(s.max, s.value + gain.total)}/${s.max}).`);
  return msg;
}

/** Wykrycie przebrania: rzut PER obserwatora z MFD wg znajomości z oryginałem (s. 316). */
export async function detectDisguise(changeling) {
  const d = disguiseOf(changeling);
  const own = game.user?.character;
  const observers = [...new Map([...(canvas?.tokens?.controlled ?? []).map(t => t.actor), own].filter(a => a && a !== changeling && a.isOwner).map(a => [a.uuid, a])).values()];
  if (!observers.length) return warn("Zaznacz token obserwatora (albo przypisz sobie postać), który próbuje przejrzeć przebranie.");
  const pick = await DialogV2.wait({
    window: { title: "Wykrycie przebrania" }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <div class="atk-info"><div>Podmieniec udaje: <b>${esc(d?.name ?? "?")}</b></div></div>
      <label class="atk-row">Obserwator <select name="who">${observers.map((a, i) => `<option value="${i}">${esc(a.name)}</option>`).join("")}</select></label>
      <label class="atk-row">Znajomość oryginału <select name="fam">${Object.entries(FAMILIARITY).map(([k, f]) => `<option value="${k}">${esc(f.label)} (MFD ${f.mfd})</option>`).join("")}</select></label>
      <p class="hint">Jak przy Voice Alteration (s. 316): rzut co około 30 minut przebywania razem, MFD zależy od tego, jak dobrze obserwator zna oryginał.</p></div>`,
    buttons: [{ action: "ok", label: "Dalej", icon: "fa-solid fa-eye", default: true, callback: (ev, btn) => ({ who: Number(btn.form.elements.who.value), fam: btn.form.elements.fam.value }) }]
  });
  if (!pick) return null;
  const obs = observers[pick.who];
  const a = obs.system.attributes.per;
  const rc = rollContext(obs, { kind: "attr", attr: "per" });
  const r = await promptMfd(`Wykrycie przebrania: ${obs.name}`, a.tn, rc, { defaultStep: FAMILIARITY[pick.fam].mfd });
  if (!r) return null;
  const { extra, ...roll } = r;
  return rollTest(obs, { label: `Wykrycie przebrania (${ATTRS.per})`, baseTn: a.tn, ...roll });
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
        content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // PODMIENIEC</span><span>głód</span></div><h3>${esc(actor.name)}</h3>
          <div class="fc-meta">Pula miłości pusta: −1 krok rzutów END i CHA, dopóki podmieniec się nie pożywi.</div></div>`
      });
    }
  });
}

/** Ręczne ustawienie puli miłości (MG albo właściciel). */
export async function promptLove(actor) {
  const s = loveState(actor);
  const v = await DialogV2.wait({
    window: { title: `Miłość: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 340 }, rejectClose: false,
    content: `<div class="foe-dialog"><label class="atk-row">Miłość (0–${s.max}) <input type="number" name="v" value="${s.value}" min="0" max="${s.max}"></label></div>`,
    buttons: [{ action: "ok", label: "Zapisz", icon: "fa-solid fa-heart", default: true, callback: (ev, btn) => Number(btn.form.elements.v.value) }]
  });
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return setLove(actor, v);
}
