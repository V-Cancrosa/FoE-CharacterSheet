/**
 * Wygląd postaci (skins.mjs) poza jej kartą:
 *   - okna systemu otwierane z karty (rzut, atak, katalog, przedmioty postaci, kreator…) — wygląd tej postaci
 *     (przedmiot — jego właściciela; okno bez dokumentu — postaci, której kartę ostatnio klikano),
 *   - karty na czacie (rzuty, zamek, przetrwanie…) — wygląd postaci, która mówi; „PIPBUCK //” na pasku karty zmienia
 *     się na „STAJNIA //”, „TERMINAL //” itd.
 * Pojazdy, terminale i stoły do gry mają własny wygląd — bez zmian.
 */
import { t, N_ } from "./i18n.mjs";
import { skinOf } from "./skins.mjs";

let active = null;   // wygląd ostatnio używanej karty postaci
const SKINNED = new Set(["character", "npc"]);
/** Zapamiętaj wygląd karty, z której gracz właśnie korzysta. */
export const setActiveSkin = skin => { active = skin; };

/** Pasek kart czatu według wyglądu. */
const TAG = { terminal: N_("TERMINAL"), "terminal-white": N_("TERMINAL"), enclave: N_("ENCLAVE"), griffin: N_("NOTEBOOK"), zebra: N_("NOTES"), paper: N_("STABLE") };

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
