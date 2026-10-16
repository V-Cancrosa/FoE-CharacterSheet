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
import { t, tmap, tfields } from "./i18n.mjs";
const F = "foe-rpg";

export const AMMO_GROUPS = tmap({ conventional: "Cartridges (firearms)", energy: "Energy weapon ammo", explosive: "Explosive ammo" });

export const SPECIAL_AMMO = tfields({
  // ---- naboje ----
  ap: { group: "conventional", label: "Armor Piercing (AP)", cost: 3, ignore: 40, halfUnarmored: true,   // en=pl
    effect: "ignores up to 40 DT", downside: "half damage against targets without medium or heavy armor" },
  explosive: { group: "conventional", label: "Explosive", cost: 5, dice: 1,   // en=pl
    effect: "+1 damage die; adjacent targets get hit too (area, ½)", downside: "the weapon wears out 2× faster; a jam destroys the weapon" },
  incendiary: { group: "conventional", label: "Incendiary", cost: 3, addDice: "2d10", fire: true,   // en=pl
    effect: "+2d10 damage and the Fire effect", downside: "a jam or a misfire ignites the rest of the ammo" },
  spark: { group: "conventional", label: "Spark", cost: 5, ignore: 10, machineDice: 4, lowDtQuarter: 10,   // en=pl
    effect: "ignores 10 DT, +4 dice against machines, robots, computers and power armor", downside: "¼ damage against targets with DT below 10" },
  glue: { group: "conventional", label: "Glue/Goo", cost: 1.5, noWound: true,   // en=pl
    effect: "on limbs: sticks (STR ½ to break free); on the muzzle: may suffocate", downside: "doesn't wound" },
  gel: { group: "conventional", label: "Gel/Rubber/Beanbag", cost: 1.5, nonlethal: true, maxAbove20: true,   // en=pl
    effect: "the damage doesn't kill", downside: "no effect when the location's DT is above 20" },
  paint: { group: "conventional", label: "Paint", cost: 1, noWound: true,   // en=pl
    effect: "the target is 1 MFD step easier to spot and hit, even in darkness", downside: "doesn't wound" },
  hollow: { group: "conventional", label: "Hollow Point / Flechette", cost: 3, living4: true, dtMult: 3,   // en=pl
    effect: "×4 damage against living targets and ghouls", downside: "the target's DT counts triple" },
  slug: { group: "conventional", label: "Slugs (shotguns only)", cost: 2, shotgun: true, maxDamage: true, steps: -1,
    effect: "maximum damage at any range", downside: "−1 MFD step to accuracy" },
  dragon: { group: "conventional", label: "Dragon's Breath (shotguns only)", cost: 2, shotgun: true, fire: true,
    effect: "damage like a flamethrower (the Fire effect)", downside: "loaded by hand one at a time — reloading takes 2× longer" },
  bulk: { group: "conventional", label: "Bulk", cost: 0.5, dice: -1,   // en=pl
    effect: "half the price", downside: "1 damage die less, the weapon wears out 2× faster" },
  // ---- energia ----
  focused: { group: "energy", label: "Focused", cost: 5, ignore: 50, halfUnarmored: true,   // en=pl
    effect: "ignores up to 50 DT", downside: "half damage against targets without medium or heavy armor" },
  stun: { group: "energy", label: "Stun", cost: 2, nonlethal: true, maxAbove20: true,   // en=pl
    effect: "the damage doesn't kill", downside: "no effect when the location's DT is above 20" },
  overcharged: { group: "energy", label: "Overcharged", cost: 2, dice: 1,   // en=pl
    effect: "+1 damage die", downside: "the weapon wears out 2× faster" },
  ebulk: { group: "energy", label: "Bulk (energy)", cost: 0.5, dice: -1,
    effect: "half the price", downside: "1 damage die less, the weapon wears out 2× faster" },
  homemade: { group: "energy", label: "Home Made", cost: 0.5,   // en=pl
    effect: "half the price", downside: "the weapon wears out 4× faster" },
  // ---- wybuchowa ----
  xincendiary: { group: "explosive", label: "Incendiary (explosive)", cost: 3, fire: true,
    effect: "adds the Fire effect", downside: "the weapon wears out 2× faster" },
  he: { group: "explosive", label: "High Explosive", cost: 2, ignore: 30,   // en=pl
    effect: "ignores 30 DT", downside: "damage falloff with distance from the center is doubled" },
  gas: { group: "explosive", label: "Gas", cost: 3, noDamage: true,   // en=pl
    effect: "every round in the radius: END MFD ½ or unconsciousness", downside: "deals no damage; radius −5 ft" },
  smoke: { group: "explosive", label: "Smoke", cost: 5, noDamage: true,   // en=pl
    effect: "a smoke cloud: −1 MFD step to accuracy in it and through it (SATS negates)", downside: "deals no damage; radius 10 ft" },
  xpaint: { group: "explosive", label: "Paint (explosive)", cost: 1, noWound: true,
    effect: "the target is easier to spot, even in darkness", downside: "doesn't wound" },
  xbeanbag: { group: "explosive", label: "Beanbag (explosive)", cost: 1.5, nonlethal: true, maxAbove20: true,
    effect: "the damage doesn't kill", downside: "no effect when the location's DT is above 20" },
  cryo: { group: "explosive", label: "Cryo", cost: 5, noDamage: true,   // en=pl
    effect: "the effect of a Windigo grenade (freezing)", downside: "deals no damage; radius −5 ft" },
  xspark: { group: "explosive", label: "Spark (explosive)", cost: 5, ignore: 10, machineDice: 4, lowDtQuarter: 20,
    effect: "ignores 10 DT, +4 dice against machines and power armor", downside: "¼ damage against targets with DT below 20" },
  xglue: { group: "explosive", label: "Glue/Goo (explosive)", cost: 1.5, noDamage: true,
    effect: "in the radius: STR MFD ½ to move", downside: "deals no damage" }
}, ["label", "effect", "downside"]);

/** Grupa amunicji danego typu (null — bez wariantów: paliwo, strzały, złom, balefire…). */
export function ammoGroup(ammoType) {
  const a = String(ammoType ?? "").toLowerCase();
  if (!a || /flamer|fuel|junk|cake|rock|arrow|bolt|dart|nail|spike|balefire/.test(a)) return null;
  if (/grenade|missile|rocket|shell/.test(a)) return "explosive";
  if (/gem|mfc|me-?cell|spc|solar|energy cell|\bec\b/.test(a)) return "energy";
  if (/mm|cal|gauge|\.44|\.45|bb/.test(a)) return "conventional";
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
  if (a.noDamage || a.noWound) return { dmg: 0, dt, notes: [a.noDamage ? t("no damage") : t("doesn't wound")] };
  if (a.dtMult) { dt *= a.dtMult; notes.push(`DT ×${a.dtMult}`); }
  if (a.living4 && living) { dmg *= 4; notes.push(t("×4 vs. living")); }
  if (a.halfUnarmored && !armoredLoc) { dmg = Math.floor(dmg / 2); notes.push(t("½ — no medium/heavy armor")); }
  if (a.lowDtQuarter && dt < a.lowDtQuarter) { dmg = Math.floor(dmg / 4); notes.push(`¼ — DT < ${a.lowDtQuarter}`); }
  if (a.maxAbove20 && dt > 20) { dmg = 0; notes.push(t("no effect — DT > 20")); }
  return { dmg, dt, notes };
}
