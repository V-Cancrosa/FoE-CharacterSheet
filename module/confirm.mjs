/**
 * Decyzja MG przed śmiertelnym albo nieodwracalnym skutkiem automatu (1000 radów, silne napromieniowanie, rany i zapaść
 * z odwodnienia, śmierć z głodu…). Zamiast działać od razu, system wysyła MG kartę „Rozegraj / Pomiń” (tylko MG ją
 * widzi). Rozegraj — wykonuje zarejestrowaną akcję; Pomiń — nic się nie dzieje (np. korekta wartości, scena fabularna).
 * Opcja świata „gmConfirm” wyłączona — akcje wykonują się od razu, jak wcześniej.
 */
import { t } from "./i18n.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const ACTIONS = new Map();

/** Akcja do wykonania po „Rozegraj”: fn(actor, data) → Promise. */
export function registerConfirmAction(kind, fn) { ACTIONS.set(kind, fn); }

const confirmOn = () => { try { return game.settings.get(F, "gmConfirm") !== false; } catch { return true; } };

/**
 * Skutek dla postaci: od razu (opcja wyłączona) albo karta dla MG. title — co się stało, text — co zrobi „Rozegraj”.
 * Zwraca wynik akcji albo wiadomość z kartą.
 */
export async function deadly(actor, kind, data = {}, { title = "", text = "" } = {}) {
  if (!confirmOn()) return ACTIONS.get(kind)?.(actor, data);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<div class="foe-card wounds foe-confirm"><div class="fc-tag"><span>PIPBUCK // ${t("GM DECISION")}</span><span>${esc(actor.name)}</span></div>
      <h3>${esc(title)}</h3>${text ? `<div class="fc-meta">${esc(text)}</div>` : ""}
      <div class="fc-confirm"><button type="button" class="foe-luck" data-action="foeConfirmPlay"><i class="fa-solid fa-dice-d20"></i> ${t("Play it out")}</button>
      <button type="button" class="foe-luck" data-action="foeConfirmSkip"><i class="fa-solid fa-forward"></i> ${t("Skip")}</button></div></div>`,
    flags: { [F]: { confirm: { kind, actorUuid: actor.uuid, data, state: "open" } } }
  });
}

/** Rozstrzygnięcie karty (MG): play — wykonaj akcję, inaczej pomiń. */
export async function resolveConfirm(message, play) {
  const c = message?.flags?.[F]?.confirm;
  if (!c || c.state !== "open" || !game.user?.isGM) return null;
  const state = play ? "played" : "skipped";
  const note = play ? t("Played out.") : t("Skipped — nothing happens.");
  const content = String(message.content ?? "").replace(/<div class="fc-confirm">[\s\S]*$/, `<div class="fc-meta"><b>${esc(note)}</b></div></div>`);
  await message.update({ content, [`flags.${F}.confirm.state`]: state });
  if (!play) return null;
  const actor = await fromUuid(c.actorUuid).catch(() => null);
  if (!actor) return null;
  return ACTIONS.get(c.kind)?.(actor, c.data ?? {});
}

export function registerConfirmSettings() {
  game.settings.register(F, "gmConfirm", {
    name: "Deadly automatic outcomes wait for the GM",
    hint: "Reaching 1000 rads, severe radiation exposure, wounds and collapse from dehydration, death from starvation, dehydration or radiation poisoning: instead of happening at once, the GM gets a card “Play it out / Skip” (only the GM sees it). Off — they happen automatically.",
    scope: "world", config: true, type: Boolean, default: true
  });
}

export function registerConfirmHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const c = message?.flags?.[F]?.confirm;
    if (!c) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const box = root?.querySelector?.(".fc-confirm");
    if (!box) return;
    if (!game.user.isGM || c.state !== "open") { box.remove(); return; }
    for (const [action, play] of [["foeConfirmPlay", true], ["foeConfirmSkip", false]]) {
      const btn = box.querySelector(`[data-action=${action}]`);
      btn?.addEventListener("click", async ev => {
        ev.preventDefault();
        for (const b of box.querySelectorAll("button")) b.disabled = true;
        try { await resolveConfirm(message, play); } catch (err) { console.error(`${F} | confirm`, err); }
      });
    }
  });
}
