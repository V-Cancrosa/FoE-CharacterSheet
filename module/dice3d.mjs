/**
 * Kości 3D (moduł Dice So Nice, jeśli jest włączony): zestawy kolorów w klimacie Fallout: Equestria
 * do wyboru w ustawieniach modułu (kategoria „Fallout: Equestria”) oraz wyzwalacze efektów na krytyki z naszych zasad
 * (1–5 i 96–100 przy rzucie d100; przerzuty kartą szczęścia poszerzają zakres).
 * Bez Dice So Nice nic się nie dzieje.
 */
import { t, N_ } from "./i18n.mjs";
const F = "foe-rpg";
const T = `systems/${F}/assets/dice`;
const CATEGORY = "Fallout: Equestria";
export const SFX_ID = "foe-rpg";
// identyfikatory wyników efektów zostają jak dawniej (zapisane ustawienia graczy w Dice So Nice się do nich odwołują)
export const SFX = { success: "Krytyczny sukces", fail: "Krytyczna porażka" }; // pl-ok
const SFX_NAMES = { success: N_("Critical success"), fail: N_("Critical failure") };

/** Kolory PipBucka jak w ustawieniu „Kolor ekranu PipBucka”. */
const PIP = { green: [N_("Green"), "#4dff8a"], amber: [N_("Amber"), "#ffb547"], blue: [N_("Blue"), "#5fd8ff"], white: [N_("White"), "#e4f2e8"] };

const TEXTURES = {
  "foe-zebra": { name: N_("FoE: zebra stripes"), composite: "multiply", source: `${T}/zebra.webp` },
  "foe-hazard": { name: N_("FoE: hazard stripes"), composite: "multiply", source: `${T}/hazard.webp` },
  "foe-cap": { name: N_("FoE: bottle cap"), composite: "multiply", source: `${T}/cap.webp` },
  "foe-leaves": { name: N_("FoE: leaves (Gardens)"), composite: "multiply", source: `${T}/leaves.webp` }
};

export function colorsets() {
  const KINDS = t("Fallout: Equestria — roll kinds");
  const pip = Object.entries(PIP).map(([k, [label, c]]) => ({
    name: `foe-pipbuck-${k}`, description: `PipBuck (${t(label).toLowerCase()})`, category: CATEGORY,
    foreground: c, background: "#07100a", outline: "#000000", edge: "#0f2416", texture: "none", material: "glass", font: "FoE VT323", fontScale: { d100: 1.1, d10: 1.15, d20: 1.15 }
  }));
  return [
    ...pip,
    { name: "foe-stabletec", description: "Stable-Tec", category: CATEGORY, foreground: "#ffd23f", background: "#1f4fa3", outline: "#0a1a3a", edge: "#173a7a", texture: "none", material: "plastic" },
    { name: "foe-gardens", description: "Gardens", category: CATEGORY, foreground: "#e9d18a", background: "#1c3a22", outline: "#0b1a0e", edge: "#c8a85a", texture: "foe-leaves", material: "plastic" },
    { name: "foe-cap", description: t("Bottle cap"), category: CATEGORY, foreground: "#a8231d", background: "#c9c4b8", outline: "#3b3b3b", edge: "#8e897e", texture: "foe-cap", material: "metal" },
    { name: "foe-radiation", description: t("dice|Radiation"), category: CATEGORY, foreground: "#111111", background: "#f2c200", outline: "#f2c200", edge: "#1a1a1a", texture: "foe-hazard", material: "plastic" },
    { name: "foe-zebra", description: "Zebra", category: CATEGORY, foreground: "#ff3b3b", background: "#f4f1ea", outline: "#000000", edge: "#111111", texture: "foe-zebra", material: "plastic" },
    { name: "foe-enclave", description: t("Enclave"), category: CATEGORY, foreground: "#d8d8d8", background: "#141414", outline: "#000000", edge: "#5a5a5a", texture: "none", material: "metal" },
    // rodzaje rzutów (opcja „kolor według rodzaju rzutu”)
    { name: "foe-sats", description: t("Roll: S.A.T.S."), category: KINDS, foreground: "#eaffef", background: "#0b3d1e", outline: "#000000", edge: "#4dff8a", texture: "none", material: "glass", font: "FoE VT323" },
    { name: "foe-hitloc", description: t("Roll: hit location"), category: KINDS, foreground: "#ff6a4d", background: "#262626", outline: "#000000", edge: "#ff6a4d", texture: "none", material: "plastic" },
    { name: "foe-damage", description: t("Roll: damage"), category: KINDS, foreground: "#f3dcb4", background: "#6b2410", outline: "#2a0d05", edge: "#3d1407", texture: "foe-cap", material: "metal" },
    { name: "foe-magic", description: t("Roll: magic"), category: KINDS, foreground: "#f3e3ff", background: "#4b2a7a", outline: "#1e0f33", edge: "#b98cff", texture: "none", material: "glass" },
    { name: "foe-heal", description: t("Roll: healing"), category: KINDS, foreground: "#c8102e", background: "#f0f0f0", outline: "#ffffff", edge: "#c8102e", texture: "none", material: "plastic" },
    { name: "foe-luck", description: t("Roll: luck card"), category: KINDS, foreground: "#ffd700", background: "#1f5c2a", outline: "#0a2410", edge: "#ffd700", texture: "none", material: "metal" }
  ];
}

/** Zestaw dla rodzaju rzutu; test — PipBuck w kolorze ekranu gracza. */
export function colorsetFor(kind) {
  if (kind === "test") {
    let pip = "green";
    try { pip = game.settings.get(F, "pipColor") || "green"; } catch {}
    return `foe-pipbuck-${PIP[pip] ? pip : "green"}`;
  }
  return { sats: "foe-sats", hitloc: "foe-hitloc", damage: "foe-damage", magic: "foe-magic", heal: "foe-heal", luck: "foe-luck", trap: "foe-radiation" }[kind] ?? null;
}

const byRollOn = () => {
  try { return !!game.modules?.get?.("dice-so-nice")?.active && !!game.settings.get(F, "dice3dByRoll"); } catch { return false; }
};

/** Opcja gracza (domyślnie włączona): kolor kości według rodzaju rzutu (wygląd idzie z rzutem, więc inni widzą te same kolory). */
export function registerDice3dSettings() {
  game.settings.register(F, "dice3dByRoll", {
    name: "3D dice: color by roll kind",
    hint: "Requires the Dice So Nice module. Your dice change their look depending on the roll: test — PipBuck (screen color), SATS, hit location, damage, magic, healing, luck card, trap. Turn it off to use the set chosen in the Dice So Nice settings.",
    scope: "client", config: true, type: Boolean, default: true
  });
}

/** Nadaj kościom rzutu zestaw dla rodzaju rzutu (gdy opcja jest włączona). */
export function tint(roll, kind) {
  if (!roll?.dice?.length || !byRollOn()) return roll;
  const colorset = colorsetFor(kind);
  if (!colorset) return roll;
  for (const die of roll.dice) {
    die.options ??= {};
    die.options.colorset = colorset;
    die.options.appearance = { ...(die.options.appearance ?? {}), colorset };
  }
  return roll;
}

export function registerDice3d() {
  Hooks.once("diceSoNiceReady", async dice3d => {
    for (const [id, data] of Object.entries(TEXTURES)) {
      try { await dice3d.addTexture?.(id, { ...data, name: t(data.name) }); } catch (err) { console.warn(`${F} | dice texture ${id}`, err); }
    }
    for (const c of colorsets()) {
      try { await dice3d.addColorset(c); } catch (err) { console.warn(`${F} | dice colorset ${c.name}`, err); }
    }
    // nazwy wyników w języku gracza — Dice So Nice od 6.4.0 (starsze pokazują same identyfikatory)
    const named = !foundry.utils.isNewerVersion("6.4.0", game.modules?.get?.("dice-so-nice")?.version ?? "0");
    const results = ["success", "fail"].map(k => (named ? { id: SFX[k], name: t(SFX_NAMES[k]) } : SFX[k]));
    try { dice3d.addSFXTrigger?.(SFX_ID, "Fallout: Equestria", results); } catch (err) { console.warn(`${F} | dice effects`, err); }
  });
}

/** Oznacz kość d100 rzutu jako krytyk, żeby Dice So Nice mógł odpalić efekt wybrany przez gracza. */
export function markCrit(roll, cls) {
  const result = cls === "crit-success" ? SFX.success : cls === "crit-fail" ? SFX.fail : null;
  const die = roll?.dice?.[0];
  if (!result || !die) return roll;
  die.options ??= {};
  die.options.sfx = { id: SFX_ID, result };
  return roll;
}
