/**
 * Warsztat, degradacja i naprawa — czyste zasady (bez Foundry).
 *
 * Degradacja broni (zasada opcjonalna, s. 458): liczba kości obrażeń = liczba kroków degradacji; każdy krok to −1 kość.
 *   dystans: krok co 2 magazynki wystrzelonej amunicji; broń z ponad 8 kośćmi — co 1 magazynek; jednostrzałowa — co 4 strzały
 *   (z ponad 8 kośćmi — co 2); wręcz: krok po tylu trafieniach, ile ma kroków; 0 kości = złom.
 *   Amunicja specjalna: Explosive, Bulk, Overcharged, Incendiary (wybuchowa) ×2, Home Made ×4.
 * Naprawa broni (tabela XXIX, s. 459): do kroku = ranga Repair (z premiami do rzutu) jako procent wszystkich kroków, w dół;
 *   broń-dawca tego samego typu naprawia najwyżej do swojego stanu +1 krok i idzie na części (Jury Rigging: podobna broń).
 * Naprawa pancerza (s. 460): inny pancerz — 10% jego DT za każde 10 rang Repair (min. 1), dawca przepada; surowce (ranga ≥ 25)
 *   — 1 DT za jednostkę wagi podobnego materiału; 10 min na punkt DT (30 min przy średnim i ciężkim); wspomagany tylko
 *   talizmanem albo częściami z tego samego modelu.
 * Wytwarzanie (s. 198–199): naboje, ładunki miotające, proch, ogniwa energii, ładowanie zużytych ogniw, paliwo do miotacza.
 */

// ---------- jednostki w paczkach („(10)”, „10 units”) ----------
/** Ile jednostek ma jedna sztuka przedmiotu: „Black Powder (10 oz. – 10 units)” → 10, „Brass Casings (10, …)” → 10. */
export function unitsPer(name) {
  const n = String(name ?? "");
  const m = n.match(/\((\d+)(?:,| oz\.| units|\))/i) ?? n.match(/(\d+) units/i) ?? n.match(/, (\d+)\)/);
  return m ? Math.max(1, Number(m[1])) : 1;
}
/** Jednostki dostępne w stosie (otwarta paczka trzyma resztę w system.charges). */
export function unitsOf(item) {
  const per = unitsPer(item.name);
  const qty = Math.max(0, Number(item.system?.qty) || 0);
  if (per === 1 || !qty) return qty * per;
  const open = Number(item.system?.charges) || 0;
  return (qty - 1) * per + (open > 0 && open < per ? open : per);
}
/** Stan stosu po zmianie liczby jednostek: { qty, charges }. */
export function stackFor(name, units) {
  const per = unitsPer(name);
  const u = Math.max(0, Math.floor(units));
  if (per === 1) return { qty: u, charges: 0 };
  const qty = Math.ceil(u / per);
  const rest = u % per;
  return { qty, charges: qty ? (rest || per) : 0 };
}

// ---------- amunicja ----------
/** Łuski do kalibru: hulls (strzelby), .50, duże, małe; null — kaliber bez łusek. */
export function casingFor(ammoType) {
  const t = String(ammoType ?? "").toLowerCase();
  if (/gauge/.test(t)) return { re: /^hulls/i, label: "Hulls (Spent Shotgun Shells, 10)" };
  if (/\.50|12\.7/.test(t)) return { re: /brass casings.*\.50/i, label: "Brass Casings (10, .50 cal)" };
  if (/\.308|\.45|\.44|\.357|5\.56|7\.62/.test(t)) return { re: /brass casings.*large/i, label: "Brass Casings (10, any large caliber)" };
  if (/5mm|9mm|10mm|\.22|\.32/.test(t)) return { re: /brass casings.*small/i, label: "Brass Casings (10, any small caliber)" };
  return null;
}
/** Kryształowy pył na ogniwo (s. 199): 1 pył = 5 gem cells, 3 ogniwa energii albo 1 MFC; SPC nie da się zrobić. */
export function dustPerCell(ammoType) {
  const t = String(ammoType ?? "").toLowerCase();
  if (/spc|star/.test(t)) return null;
  if (/gem/.test(t)) return 1 / 5;
  if (/mfc|fusion/.test(t)) return 1;
  if (/me-?cell|energy cell/.test(t)) return 1 / 3;
  return null;
}
export const DRAINED = [
  { re: /drained gem cells/i, ammo: "Gem Cells" },
  { re: /drained energy cells/i, ammo: "ME-Cell" },
  { re: /drained magical fusion cells/i, ammo: "MFC" }
];

export const MATCH = {
  metal: /^scrap metal$|^lead \(/i,
  propellant: /propellant charges/i,
  blackPowder: /^black powder/i,
  flux: /^flux \(/i,
  fluxAlt: /crushed gemstone dust|abronco cleaner|turpentine/i,
  dust: /crushed gemstone dust/i,
  charcoal: /^charcoal/i,
  fertilizer: /^fertilizer/i,
  prewarFood: /^cram$|instamash|dandy colt apples|fancy lads|blamco|sugar apple bombs|pork n.? beans/i,
  alcohol: /\(alcohol/i,
  vodka: /vodka/i,
  sugarBombs: /sugar apple bombs/i,
  abronco: /abronco cleaner/i,
  press: /bullet press/i
};

/** Wynik rzutu wytwarzania → mnożnik produktu i strata materiałów. */
export function craftOutcome(result, { failHalf = true, critDouble = true } = {}) {
  if (result === "crit-success") return { mult: critDouble ? 2 : 1, waste: 1, note: critDouble ? "krytyk: podwójnie" : "krytyk" };
  if (result === "success") return { mult: 1, waste: 1, note: "" };
  if (result === "crit-fail") return { mult: 0, waste: 1, note: "krytyczna porażka: nic nie wychodzi" };
  return { mult: failHalf ? 0.5 : 0, waste: 1, note: failHalf ? "porażka: połowa" : "porażka: nic" };
}

// ---------- degradacja broni ----------
/** Liczba kości (= kroków degradacji) w formule obrażeń: „3d12 + 4” → 3. */
export const diceCount = formula => Number(String(formula ?? "").match(/(\d*)d\d+/)?.[1] || (/d\d+/.test(String(formula)) ? 1 : 0)) || 0;

/** Ile „zużycia” trzeba na jeden krok: dystans — w nabojach, wręcz — w trafieniach. null — broń się nie zużywa. */
export function degradeThreshold(w) {
  const dice = diceCount(w.damage);
  if (!dice || w.consumable) return null;
  const close = ["melee", "unarmed"].includes(w.skill);
  if (close) return (Number(w.weight) || 0) > 0 || (Number(w.value) || 0) > 0 ? dice : null;   // naturalna broń (kopyta) się nie zużywa
  const mag = Number(w.ammo?.max) || 0;
  if (!mag) return null;
  if (mag <= 1) return dice > 8 ? 2 : 4;
  return dice > 8 ? mag : 2 * mag;
}
const AMMO_WEAR = { explosive: 2, bulk: 2, ebulk: 2, overcharged: 2, xincendiary: 2, homemade: 4 };
export const ammoWearFactor = variant => AMMO_WEAR[variant] ?? 1;

/** Po strzale / trafieniu: nowy licznik i kroki { fired, wear, stepped, broken }. */
export function addWear(w, amount) {
  const thr = degradeThreshold(w);
  if (!thr || !amount) return { fired: Number(w.fired) || 0, wear: Number(w.wear) || 0, stepped: 0, broken: false };
  let fired = (Number(w.fired) || 0) + amount;
  const steps = Math.floor(fired / thr);
  fired -= steps * thr;
  const total = diceCount(w.damage);
  const wear = Math.min(total, (Number(w.wear) || 0) + steps);
  return { fired, wear, stepped: steps, broken: wear >= total };
}

/** Stan broni: { total, left, broken }. */
export function weaponCondition(w) {
  const total = diceCount(w.damage);
  const left = Math.max(0, total - (Number(w.wear) || 0));
  return { total, left, broken: total > 0 && left <= 0 };
}

/** Tabela XXIX: do którego kroku naprawi ranga (z premiami do rzutu) przy danej liczbie kroków. */
export const repairCap = (rank, total) => Math.max(0, Math.min(total, Math.floor((Math.max(0, rank) * total) / 100)));

/** Wynik naprawy broni: do min(limit z rangi, stan dawcy + 1), nigdy w dół. */
export function weaponRepairTarget(w, rank, donor) {
  const c = weaponCondition(w);
  const cap = repairCap(rank, c.total);
  const donorLeft = donor ? weaponCondition(donor).left : 0;
  const target = Math.max(c.left, Math.min(cap, donorLeft + 1, c.total));
  return { ...c, cap, donorLeft, target, gain: target - c.left };
}

/** Czy dawca pasuje: ta sama broń, a z Jury Rigging — ta sama umiejętność i rodzaj (energia: ta sama amunicja). */
export function donorFits(w, wName, d, dName, jury = false) {
  if (dName === wName) return true;
  if (!jury) return false;
  if (w.skill === "energy") return d.skill === "energy" && d.ammoType === w.ammoType;
  return d.skill === w.skill && (d.kind || "") === (w.kind || "");
}

// ---------- pancerz ----------
/** Punkty DT z pancerza-dawcy: 10% jego DT za każde 10 rang Repair, w dół, min. 1. */
export const armorDonorPoints = (donorDt, rank) => Math.max(1, Math.floor((Number(donorDt) || 0) * 0.1 * Math.floor(Math.max(0, rank) / 10)));
/** Materiał do naprawy z surowców wg rodzaju pancerza. */
export function armorMaterial(a) {
  if (a.powered) return null;
  if (["medium", "heavy", "helmet"].includes(a.category)) return { re: /^scrap metal$/i, label: "Scrap Metal", tools: [{ re: /^hammer$/i, label: "Hammer" }] };
  return { re: /leather|hide,|bolt of cloth/i, label: "skóra albo materiał (Hide, Leather Belt, Bolt of Cloth)", tools: [{ re: /^needle$/i, label: "Needle" }, { re: /spool of thread/i, label: "Spool of Thread" }] };
}
export const minutesPerDt = a => (["medium", "heavy"].includes(a.category) || a.powered ? 30 : 10);

export function degradationOn() {
  try { return !!globalThis.game?.settings?.get?.("foe-rpg", "weaponDegradation"); } catch { return false; }
}
