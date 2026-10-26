/**
 * Kompendium zasad: stałe identyfikatory dokumentów liczone z kluczy stron („combat/sats”).
 * Ten sam kod liczy je przy budowaniu paczki (tools/build-packs.mjs) i na karcie (rules.mjs), więc link „?” trafia
 * na właściwą stronę bez spisu identyfikatorów. Bez zależności od Foundry — importuje go też Node.
 */
export const RULES_PACK = "foe-rpg.rules";

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 16 znaków [A-Za-z0-9] (format _id Foundry) z klucza — FNV-1a w czterech rundach z różnym ziarnem. */
export function ruleId(key) {
  let out = "";
  for (let round = 0; round < 4; round++) {
    let h = (0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
    for (const ch of `foe-rules:${key}`) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
    for (let i = 0; i < 4; i++) { out += ABC[h % 62]; h = Math.floor(h / 62); }
  }
  return out;
}

/** UUID dziennika („combat”) albo strony („combat/sats”) w kompendium zasad. */
export function ruleUuid(key) {
  const [entry, page] = String(key).split("/");
  const base = `Compendium.${RULES_PACK}.JournalEntry.${ruleId(entry)}`;
  return page ? `${base}.JournalEntryPage.${ruleId(`${entry}/${page}`)}` : base;
}
