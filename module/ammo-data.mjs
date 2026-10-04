/**
 * Amunicja specjalna — zasada opcjonalna z podręcznika (s. 202–203). Czyste funkcje (bez Foundry).
 * Przy włączonej zasadzie zwykłe naboje i amunicja broni energetycznej (bez paliwa miotacza) ignorują 5 DT.
 * Wariant naboju zapisuje się w amunicji (gear.system.variant) i w broni po przeładowaniu (weapon.system.loaded).
 *
 * Pola efektu:
 *   ignore        — ignoruje tyle DT (zamiast 5 dla zwykłej amunicji),
 *   dice          — ± kości obrażeń broni (Explosive, Overcharged +1; Bulk −1),
 *   addDice       — dodatkowe kości (Incendiary +2d10),
 *   fire          — efekt Ogień przy trafieniu,
 *   machineDice   — dodatkowe kości przeciw maszynom, robotom i pancerzom wspomaganym (Spark +4),
 *   lowDtQuarter  — ¼ obrażeń, gdy DT celu jest niższe niż ta wartość (Spark),
 *   halfUnarmored — połowa obrażeń, gdy lokacji nie chroni pancerz średni albo ciężki (AP, Focused),
 *   maxAbove20    — brak skutku, gdy DT lokacji > 20 (Gel, Stun, Beanbag),
 *   nonlethal     — obrażenia nie zabijają (utrata przytomności),
 *   living4       — ×4 obrażeń przeciw żywym celom i ghulom; dtMult — DT liczy się ×3 (Hollow Point / Flechette),
 *   maxDamage     — maksymalne obrażenia (Slugs); steps — kroki MFD celności,
 *   noWound       — nie rani; noDamage — nie zadaje obrażeń (Gas, Smoke, Cryo, Glue),
 *   shotgun       — tylko strzelby.
 */
const F = "foe-rpg";

export const AMMO_GROUPS = { conventional: "Naboje (broń palna)", energy: "Amunicja broni energetycznej", explosive: "Amunicja wybuchowa" };

export const SPECIAL_AMMO = {
  // ---- naboje ----
  ap: { group: "conventional", label: "Armor Piercing (AP)", cost: 3, ignore: 40, halfUnarmored: true,
    effect: "ignoruje do 40 DT", downside: "połowa obrażeń przeciw celom bez pancerza średniego lub ciężkiego" },
  explosive: { group: "conventional", label: "Explosive", cost: 5, dice: 1,
    effect: "+1 kość obrażeń; sąsiednie cele też obrywają (obszarowo, ½)", downside: "broń zużywa się 2× szybciej; zacięcie niszczy broń" },
  incendiary: { group: "conventional", label: "Incendiary", cost: 3, addDice: "2d10", fire: true,
    effect: "+2d10 obrażeń i efekt Ogień", downside: "zacięcie albo niewypał podpala resztę amunicji" },
  spark: { group: "conventional", label: "Spark", cost: 5, ignore: 10, machineDice: 4, lowDtQuarter: 10,
    effect: "ignoruje 10 DT, +4 kości przeciw maszynom, robotom, komputerom i pancerzom wspomaganym", downside: "¼ obrażeń przeciw celom z DT poniżej 10" },
  glue: { group: "conventional", label: "Glue/Goo", cost: 1.5, noWound: true,
    effect: "w kończyny: przykleja (STR ½, by się uwolnić); w pysk: może dusić", downside: "nie rani" },
  gel: { group: "conventional", label: "Gel/Rubber/Beanbag", cost: 1.5, nonlethal: true, maxAbove20: true,
    effect: "obrażenia nie zabijają", downside: "bez skutku przy DT lokacji powyżej 20" },
  paint: { group: "conventional", label: "Paint", cost: 1, noWound: true,
    effect: "cel o 1 krok MFD łatwiej wypatrzyć i trafić, nawet w ciemności", downside: "nie rani" },
  hollow: { group: "conventional", label: "Hollow Point / Flechette", cost: 3, living4: true, dtMult: 3,
    effect: "×4 obrażeń przeciw żywym celom i ghulom", downside: "DT celu liczy się potrójnie" },
  slug: { group: "conventional", label: "Slugs (tylko strzelby)", cost: 2, shotgun: true, maxDamage: true, steps: -1,
    effect: "maksymalne obrażenia na każdym dystansie", downside: "−1 krok MFD celności" },
  dragon: { group: "conventional", label: "Dragon's Breath (tylko strzelby)", cost: 2, shotgun: true, fire: true,
    effect: "obrażenia jak z miotacza ognia (efekt Ogień)", downside: "ładowane ręcznie po jednym — przeładowanie trwa 2× dłużej" },
  bulk: { group: "conventional", label: "Bulk", cost: 0.5, dice: -1,
    effect: "połowa ceny", downside: "1 kość obrażeń mniej, broń zużywa się 2× szybciej" },
  // ---- energia ----
  focused: { group: "energy", label: "Focused", cost: 5, ignore: 50, halfUnarmored: true,
    effect: "ignoruje do 50 DT", downside: "połowa obrażeń przeciw celom bez pancerza średniego lub ciężkiego" },
  stun: { group: "energy", label: "Stun", cost: 2, nonlethal: true, maxAbove20: true,
    effect: "obrażenia nie zabijają", downside: "bez skutku przy DT lokacji powyżej 20" },
  overcharged: { group: "energy", label: "Overcharged", cost: 2, dice: 1,
    effect: "+1 kość obrażeń", downside: "broń zużywa się 2× szybciej" },
  ebulk: { group: "energy", label: "Bulk (energia)", cost: 0.5, dice: -1,
    effect: "połowa ceny", downside: "1 kość obrażeń mniej, broń zużywa się 2× szybciej" },
  homemade: { group: "energy", label: "Home Made", cost: 0.5,
    effect: "połowa ceny", downside: "broń zużywa się 4× szybciej" },
  // ---- wybuchowa ----
  xincendiary: { group: "explosive", label: "Incendiary (wybuchowa)", cost: 3, fire: true,
    effect: "dodaje efekt Ogień", downside: "broń zużywa się 2× szybciej" },
  he: { group: "explosive", label: "High Explosive", cost: 2, ignore: 30,
    effect: "ignoruje 30 DT", downside: "spadek obrażeń z odległością od epicentrum jest podwojony" },
  gas: { group: "explosive", label: "Gas", cost: 3, noDamage: true,
    effect: "co rundę w promieniu: END MFD ½ albo utrata przytomności", downside: "nie zadaje obrażeń; promień −5 ft" },
  smoke: { group: "explosive", label: "Smoke", cost: 5, noDamage: true,
    effect: "chmura dymu: −1 krok MFD celności w niej i przez nią (SATS znosi)", downside: "nie zadaje obrażeń; promień 10 ft" },
  xpaint: { group: "explosive", label: "Paint (wybuchowa)", cost: 1, noWound: true,
    effect: "cel łatwiej wypatrzyć, nawet w ciemności", downside: "nie rani" },
  xbeanbag: { group: "explosive", label: "Beanbag (wybuchowa)", cost: 1.5, nonlethal: true, maxAbove20: true,
    effect: "obrażenia nie zabijają", downside: "bez skutku przy DT lokacji powyżej 20" },
  cryo: { group: "explosive", label: "Cryo", cost: 5, noDamage: true,
    effect: "efekt granatu Windigo (zamrożenie)", downside: "nie zadaje obrażeń; promień −5 ft" },
  xspark: { group: "explosive", label: "Spark (wybuchowa)", cost: 5, ignore: 10, machineDice: 4, lowDtQuarter: 20,
    effect: "ignoruje 10 DT, +4 kości przeciw maszynom i pancerzom wspomaganym", downside: "¼ obrażeń przeciw celom z DT poniżej 20" },
  xglue: { group: "explosive", label: "Glue/Goo (wybuchowa)", cost: 1.5, noDamage: true,
    effect: "w promieniu: STR MFD ½, by się ruszyć", downside: "nie zadaje obrażeń" }
};

/** Grupa amunicji danego typu (null — bez wariantów: paliwo, strzały, złom, balefire…). */
export function ammoGroup(ammoType) {
  const t = String(ammoType ?? "").toLowerCase();
  if (!t || /flamer|fuel|junk|cake|rock|arrow|bolt|dart|nail|spike|balefire/.test(t)) return null;
  if (/grenade|missile|rocket|shell/.test(t)) return "explosive";
  if (/gem|mfc|me-?cell|spc|solar|energy cell|\bec\b/.test(t)) return "energy";
  if (/mm|cal|gauge|\.44|\.45|bb/.test(t)) return "conventional";
  return null;
}
export const isShotgunAmmo = ammoType => /gauge/i.test(String(ammoType ?? ""));

/** Warianty pasujące do typu amunicji. */
export function variantsFor(ammoType) {
  const g = ammoGroup(ammoType);
  if (!g) return [];
  const shot = isShotgunAmmo(ammoType);
  return Object.entries(SPECIAL_AMMO).filter(([, v]) => v.group === g && (!v.shotgun || shot)).map(([key, v]) => ({ key, ...v }));
}

export function specialAmmoOn() {
  try { return !!globalThis.game?.settings?.get?.(F, "specialAmmo"); } catch { return false; }
}

/** Wariant załadowany w broni (null — zwykła amunicja albo zasada wyłączona). */
export function loadedVariant(w, on = specialAmmoOn()) {
  if (!on || !w?.loaded) return null;
  const v = SPECIAL_AMMO[w.loaded];
  return v && ammoGroup(w.ammoType) === v.group ? { key: w.loaded, ...v } : null;
}

/** Ile DT ignoruje strzał: broń + (wariant albo 5 za zwykłą amunicję przy włączonej zasadzie). */
export function ammoIgnoreDT(w, on = specialAmmoOn()) {
  const base = Number(w?.ignoreDT) || 0;
  if (!on) return base;
  const v = loadedVariant(w, on);
  if (v?.ignore) return base + v.ignore;
  const g = ammoGroup(w?.ammoType);
  return base + (g === "conventional" || g === "energy" ? 5 : 0);
}

/** Zmiana liczby kości pierwszej kości w formule: „3d12 + 4” z +1 → „4d12 + 4” (min. 1 kość). */
export function shiftDice(formula, n) {
  if (!n) return formula;
  return String(formula).replace(/(\d*)d(\d+)/, (m, c, d) => `${Math.max(1, (Number(c) || 1) + n)}d${d}`);
}
/** Typ kości broni (do dodatkowych kości Spark), np. „3d12” → 12. */
export const dieOf = formula => Number(String(formula).match(/d(\d+)/)?.[1]) || 6;

/** Nazwa przedmiotu amunicji z wariantem, np. „5mm (AP)”. */
export const variantName = (ammoName, v) => `${ammoName} (${v.label.replace(/ \(.*\)$/, "")})`;

/**
 * Skutek amunicji na jednej lokacji przy nanoszeniu obrażeń.
 * opts: { dmg, dt, armoredLoc, living, machine } → { dmg, dt, notes[] }
 */
export function ammoOnHit(a, { dmg, dt, armoredLoc = false, living = true }) {
  const notes = [];
  if (!a) return { dmg, dt, notes };
  if (a.noDamage || a.noWound) return { dmg: 0, dt, notes: [a.noDamage ? "bez obrażeń" : "nie rani"] };
  if (a.dtMult) { dt *= a.dtMult; notes.push(`DT ×${a.dtMult}`); }
  if (a.living4 && living) { dmg *= 4; notes.push("×4 przeciw żywym"); }
  if (a.halfUnarmored && !armoredLoc) { dmg = Math.floor(dmg / 2); notes.push("½ — brak pancerza średniego/ciężkiego"); }
  if (a.lowDtQuarter && dt < a.lowDtQuarter) { dmg = Math.floor(dmg / 4); notes.push(`¼ — DT < ${a.lowDtQuarter}`); }
  if (a.maxAbove20 && dt > 20) { dmg = 0; notes.push("bez skutku — DT > 20"); }
  return { dmg, dt, notes };
}
