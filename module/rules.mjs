/**
 * Linki „?” do kompendium zasad (packs/rules, budowane przez tools/build-packs.mjs z packs-src/rules/).
 * {{rule "combat/sats"}} w szablonie albo ruleLink("combat/sats") w kodzie wstawia mały znak zapytania; kliknięcie
 * otwiera dziennik na tej stronie — działa na kartach, w oknach rzutów i na czacie.
 */
import { t } from "./i18n.mjs";
import { ruleUuid } from "./rules-ids.mjs";

/** HTML linku „?” do strony zasad („combat/sats”). */
export const ruleLink = key =>
  `<a class="foe-rule" data-foe-rule="${key}" data-tooltip="${t("Rules: open this page of the rules compendium")}" aria-label="${t("Rules")}"><i class="fa-solid fa-circle-question"></i></a>`;

/** Otwiera stronę zasad w dzienniku kompendium. */
export async function openRule(key) {
  const doc = await fromUuid(ruleUuid(key)).catch(() => null);
  if (!doc) {
    ui.notifications.warn(t("The rules compendium is missing. After updating the system, restart the world (Return to Setup → Launch World)."));
    return null;
  }
  if (doc.documentName === "JournalEntryPage") return doc.parent.sheet.render(true, { pageId: doc.id });
  return doc.sheet.render(true);
}

export function registerRuleLinks() {
  Handlebars.registerHelper("rule", key => new Handlebars.SafeString(ruleLink(String(key))));
  // przechwycenie przed obsługą akcji kart i okien: „?” bywa w nagłówkach z innymi przyciskami
  document.addEventListener("click", ev => {
    const a = ev.target.closest?.("[data-foe-rule]");
    if (!a) return;
    ev.preventDefault();
    ev.stopPropagation();
    openRule(a.dataset.foeRule);
  }, true);
}
