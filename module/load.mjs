/**
 * Przeciążenie ponad 2× udźwigu: gracz nie przesunie tokena, dopóki postać czegoś nie odda, nie porzuci
 * albo ktoś jej czegoś nie zabierze (blokada znika sama, gdy waga spadnie). MG może przesunąć — dostaje ostrzeżenie.
 * Stopnie liczy loadMovement() w combat.mjs, wynik jest w actor.system.load.
 */
import { t, isPL } from "./i18n.mjs";

/** Czy zmiana tokena to przesunięcie po mapie (nie sama wysokość, obrót czy wygląd). */
export const movesToken = (doc, change) =>
  ("x" in change && change.x !== doc.x) || ("y" in change && change.y !== doc.y);

/** Wynik dla przesunięcia tokena: null — można; inaczej { block, message }. */
export function overloadMoveCheck(doc, change, isGM) {
  const load = doc.actor?.system?.load;
  if (!load?.stuck || !movesToken(doc, change)) return null;
  const name = doc.name ?? doc.actor?.name ?? "";
  if (isGM) return { block: false, message: t("{name} carries more than twice the carry limit and can't move on their own — moved by the GM.", { name }) };
  return { block: true, message: t("{name} can't move: the load is over twice the carry limit. Drop, give away or hand over at least {d} lb.", { name, d: isPL() ? String(load.drop).replace(".", ",") : load.drop }) };
}

export function registerLoadHooks() {
  Hooks.on("preUpdateToken", (doc, change, options, userId) => {
    if (userId !== game.user?.id) return;
    const res = overloadMoveCheck(doc, change, game.user.isGM);
    if (!res) return;
    ui.notifications.warn(res.message);
    if (res.block) return false;
  });
}
