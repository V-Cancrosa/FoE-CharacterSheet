/**
 * Usuwanie flag systemu tak, by działało w Foundry v13 i v14.
 * W v14 zmieniła się składnia usuwania kluczy („-=klucz”), więc po unsetFlag sprawdzamy wynik
 * i w razie potrzeby zapisujemy null — wszystkie odczyty traktują null jak brak flagi.
 */
const F = "foe-rpg";

export async function clearFlag(doc, key) {
  try { await doc.unsetFlag(F, key); } catch (err) { console.warn(`foe-rpg | unsetFlag(${key})`, err); }
  if (doc.getFlag(F, key) != null) await doc.update({ [`flags.${F}.${key}`]: null });
}
