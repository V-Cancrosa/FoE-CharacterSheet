/**
 * Kości 3D (moduł Dice So Nice, jeśli jest włączony): zestawy kolorów w klimacie Fallout: Equestria
 * do wyboru w ustawieniach modułu (kategoria „Fallout: Equestria”) oraz wyzwalacze efektów na krytyki z naszych zasad
 * (1–5 i 96–100 przy rzucie d100; przerzuty kartą szczęścia poszerzają zakres).
 * Bez Dice So Nice nic się nie dzieje.
 */
const F = "foe-rpg";
const T = `systems/${F}/assets/dice`;
const CATEGORY = "Fallout: Equestria";
export const SFX_ID = "foe-rpg";
export const SFX = { success: "Krytyczny sukces", fail: "Krytyczna porażka" };

/** Kolory PipBucka jak w ustawieniu „Kolor ekranu PipBucka”. */
const PIP = { green: ["Zielony", "#4dff8a"], amber: ["Bursztynowy", "#ffb547"], blue: ["Niebieski", "#5fd8ff"], white: ["Biały", "#e4f2e8"] };

const TEXTURES = {
  "foe-zebra": { name: "FoE: paski zebry", composite: "multiply", source: `${T}/zebra.webp` },
  "foe-hazard": { name: "FoE: pasy ostrzegawcze", composite: "multiply", source: `${T}/hazard.webp` },
  "foe-cap": { name: "FoE: kapsel", composite: "multiply", source: `${T}/cap.webp` },
  "foe-leaves": { name: "FoE: listki (Gardens)", composite: "multiply", source: `${T}/leaves.webp` }
};

export function colorsets() {
  const pip = Object.entries(PIP).map(([k, [label, c]]) => ({
    name: `foe-pipbuck-${k}`, description: `PipBuck (${label.toLowerCase()})`, category: CATEGORY,
    foreground: c, background: "#07100a", outline: "#000000", edge: "#0f2416", texture: "none", material: "glass", font: "FoE VT323", fontScale: { d100: 1.1, d10: 1.15, d20: 1.15 }
  }));
  return [
    ...pip,
    { name: "foe-stabletec", description: "Stable-Tec", category: CATEGORY, foreground: "#ffd23f", background: "#1f4fa3", outline: "#0a1a3a", edge: "#173a7a", texture: "none", material: "plastic" },
    { name: "foe-gardens", description: "Gardens", category: CATEGORY, foreground: "#e9d18a", background: "#1c3a22", outline: "#0b1a0e", edge: "#c8a85a", texture: "foe-leaves", material: "plastic" },
    { name: "foe-cap", description: "Kapsel", category: CATEGORY, foreground: "#a8231d", background: "#c9c4b8", outline: "#3b3b3b", edge: "#8e897e", texture: "foe-cap", material: "metal" },
    { name: "foe-radiation", description: "Radiacja", category: CATEGORY, foreground: "#111111", background: "#f2c200", outline: "#f2c200", edge: "#1a1a1a", texture: "foe-hazard", material: "plastic" },
    { name: "foe-zebra", description: "Zebra", category: CATEGORY, foreground: "#ff3b3b", background: "#f4f1ea", outline: "#000000", edge: "#111111", texture: "foe-zebra", material: "plastic" },
    { name: "foe-enclave", description: "Enklawa", category: CATEGORY, foreground: "#d8d8d8", background: "#141414", outline: "#000000", edge: "#5a5a5a", texture: "none", material: "metal" }
  ];
}

export function registerDice3d() {
  Hooks.once("diceSoNiceReady", async dice3d => {
    for (const [id, data] of Object.entries(TEXTURES)) {
      try { await dice3d.addTexture?.(id, data); } catch (err) { console.warn(`${F} | tekstura kości ${id}`, err); }
    }
    for (const c of colorsets()) {
      try { await dice3d.addColorset(c); } catch (err) { console.warn(`${F} | zestaw kości ${c.name}`, err); }
    }
    try { dice3d.addSFXTrigger?.(SFX_ID, "Fallout: Equestria", [SFX.success, SFX.fail]); } catch (err) { console.warn(`${F} | efekty kości`, err); }
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
