/**
 * Wygląd postaci (skins.mjs) poza jej kartą:
 *   - okna systemu otwierane z karty (rzut, atak, katalog, przedmioty postaci, kreator…) — wygląd tej postaci
 *     (przedmiot — jego właściciela; okno bez dokumentu — postaci, której kartę ostatnio klikano),
 *   - karty na czacie (rzuty, zamek, przetrwanie…) — wygląd postaci, która mówi; „PIPBUCK //” na pasku karty zmienia
 *     się na „STAJNIA //”, „TERMINAL //” itd.
 * Pojazdy, terminale i stoły do gry mają własny wygląd — bez zmian.
 * Do tego nakładki stanu na karcie postaci (overlaysOf): zakłócenia, promieniowanie, osłabienie, utrata przytomności,
 * śmierć, ogień/trucizna/paraliż — gracz wyłącza je u siebie (ustawienie klienta „sheetEffects”, też w zakładce Ustawienia).
 * Akcent: jednorożec z własnym kolorem magii może go użyć jako koloru ekranu (flaga foe-rpg.skin.accent).
 */
import { t, N_ } from "./i18n.mjs";
import { skinOf, overlaysOf, accentOk, devices } from "./skins.mjs";
import { dehydrationLevel } from "./body.mjs";
import { magicColorOf, customMagic } from "./fx-data.mjs";
const F = "foe-rpg";

let active = null;   // wygląd ostatnio używanej karty postaci
const SKINNED = new Set(["character", "npc"]);
/** Zapamiętaj wygląd karty, z której gracz właśnie korzysta. */
export const setActiveSkin = skin => { active = skin; };

/** Pasek kart czatu według wyglądu. */
const TAG = { terminal: N_("TERMINAL"), "terminal-white": N_("TERMINAL"), enclave: N_("ENCLAVE"), griffin: N_("NOTEBOOK"), zebra: N_("NOTES"), paper: N_("STABLE"),
  "power-armor": "HUD", "power-armor-enclave": "HUD", rangers: N_("CODEX"), raider: N_("SCRAPS"), ghoul: N_("OLD PAPERS"), changeling: N_("HIVE") };

export function applySkin(el, skin) {
  if (!el || !skin) return;
  for (const c of [...el.classList]) if (c.startsWith("skin-")) el.classList.remove(c);
  el.classList.add(`skin-${skin}`);
}

function actorOf(app) {
  const doc = app?.document ?? app?.object ?? null;
  if (doc?.documentName === "Actor") return doc;
  if (doc?.parent?.documentName === "Actor") return doc.parent;
  return app?.actor ?? app?.options?.actor ?? null;
}

/** Stan postaci do nakładek (overlaysOf). */
export function stateOf(actor) {
  const c = actor?.flags?.[F]?.conditions ?? {};
  const st = actor?.statuses;
  const starving = [...(actor?.items ?? [])].some(i => i.type === "feature" && i.flags?.[F]?.starvation && i.system?.active !== false)
    && !((actor?.flags?.[F]?.survival?.ignoreUntil ?? 0) > (globalThis.game?.time?.worldTime ?? 0));
  return {
    dead: !!actor?.system?.dead || !!st?.has?.("dead"), out: !!st?.has?.("unconscious"),
    jolted: !!(c.jolted || c.shocked), burning: !!c.burning, poisoned: !!c.poisoned, paralyzed: !!c.paralyzed,
    rads: actor?.system?.resources?.rads?.value ?? 0, thirst: dehydrationLevel(actor), starving
  };
}

const effectsOn = () => { try { return game.settings.get(F, "sheetEffects") !== false; } catch { return true; } };
const LABEL = { "ov-out": N_("NO SIGNAL"), "ov-dead": N_("KIA") };

/** Nakładki stanu na oknie karty postaci. */
export function applyOverlays(el, actor) {
  if (!el) return;
  for (const c of [...el.classList]) if (c.startsWith("ov-")) el.classList.remove(c);
  let box = el.querySelector(":scope > .foe-ov");
  const list = effectsOn() ? overlaysOf(stateOf(actor)) : [];
  if (!list.length) { box?.remove(); return; }
  el.classList.add(...list);
  if (!box) {
    box = document.createElement("div");
    box.className = "foe-ov";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = `<span class="foe-ov-label"></span>`;
    el.append(box);
  }
  const lbl = list.map(c => LABEL[c]).find(Boolean);
  box.querySelector(".foe-ov-label").textContent = lbl ? t(lbl) : "";
}

/** Akcent w kolorze magii: zmienna --pip na oknie (albo nic). */
export function applyAccent(el, actor, skin) {
  if (!el) return;
  const on = actor?.flags?.[F]?.skin?.accent && customMagic(actor) && accentOk(skin);
  if (on) el.style.setProperty("--pip", magicColorOf(actor));
  else el.style.removeProperty("--pip");
}

/** Opcja świata: SATS i licznik Geigera tylko z założonym PipBuckiem (NPC bez ograniczeń). */
export function needsPipbuck(actor) {
  let rule = false;
  try { rule = !!game.settings.get(F, "pipbuckGadgets"); } catch { /* przed init */ }
  return rule && actor?.type === "character" && !devices(actor).pipbuck;
}

export function registerSkinSettings() {
  game.settings.register(F, "sheetEffects", {
    name: "State effects on character sheets",
    hint: "Static after an electric shock, radiation tint, a vignette when weakened by thirst or hunger, NO SIGNAL when unconscious, KIA when dead, a frame when burning, poisoned or paralyzed. Only on your screen.",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => { for (const app of foundry.applications.instances?.values?.() ?? []) if (app.document?.documentName === "Actor") app.render?.(); }
  });
  game.settings.register(F, "pipbuckGadgets", {
    name: "SATS and Geiger counter only with a PipBuck",
    hint: "House rule: a player character uses SATS and sees and hears the Geiger counter only with a PipBuck worn (Inventory → PipBuck). NPCs and the GM are not limited.",
    scope: "world", config: true, type: Boolean, default: false
  });
}

export function registerSkinHooks() {
  Hooks.on("renderApplicationV2", (app, html) => {
    const el = html instanceof HTMLElement ? html : app?.element;
    if (!el?.classList?.contains("foe-rpg")) return;
    if (el.classList.contains("actor") && SKINNED.has(app.document?.type)) return;   // karta postaci ustawia się sama
    if (el.matches(".vehicle, .terminal, .casino")) return;
    const actor = actorOf(app);
    if (actor && !SKINNED.has(actor.type)) return;
    applySkin(el, actor ? skinOf(actor) : active);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const cards = root?.querySelectorAll?.(".foe-card");
    if (!cards?.length) return;
    const sp = message.speaker ?? {};
    const actor = (sp.token && game.scenes?.get(sp.scene)?.tokens?.get(sp.token)?.actor) || game.actors?.get(sp.actor);
    if (!actor || !SKINNED.has(actor.type)) return;
    const skin = skinOf(actor);
    for (const c of cards) {
      applySkin(c, skin);
      const tag = c.querySelector(".fc-tag > span:first-child");
      if (tag && TAG[skin] && /^PIPBUCK\b/.test(tag.textContent)) tag.textContent = tag.textContent.replace(/^PIPBUCK/, t(TAG[skin]));
    }
  });
}
