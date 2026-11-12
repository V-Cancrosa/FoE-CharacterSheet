/**
 * Presety zagrożeń na mapie (bez Foundry). Wartości promieniowania z tabeli XXXV (s. 484):
 *   3 — 40 rad/min (źródła wody), 4 — 100/min (wysypiska, świeże balefire), 5 — 200/min (przeciekający generator iskrowy),
 *   6 — 640/min (aktywny reaktor), 7 — 1200/min (uszkodzona bomba balefire).
 * kind "tile" — kafelek-źródło (dawka przy źródle, zasięg ft), kind "region" — strefa (promieniowanie, różowa chmura,
 * kałuża skażenia). Rozmiary — w polach siatki (kafelek) albo promień w ft (region).
 */
import { N_ } from "./i18n.mjs";

const I = "systems/foe-rpg/icons/hazards/";
export const HAZARDS = Object.freeze([
  { id: "barrel", kind: "tile", icon: `${I}barrel.svg`, label: N_("Radioactive waste barrel"), desc: N_("A leaking barrel: 100 rads/min at the barrel, fading with distance, 15 ft."),
    rate: 100, range: 15, size: 1 },
  { id: "spark", kind: "tile", icon: `${I}spark.svg`, label: N_("Leaking spark generator"), desc: N_("Partially shielded spark generator: level 5 — 200 rads/min at the source, 30 ft."),
    rate: 200, range: 30, size: 1 },
  { id: "reactor", kind: "tile", icon: `${I}reactor.svg`, label: N_("Active spark reactor"), desc: N_("An open reactor core: level 6 — 640 rads/min at the source, 60 ft."),
    rate: 640, range: 60, size: 2 },
  { id: "egg", kind: "tile", icon: `${I}balefire.svg`, label: N_("Balefire egg"), desc: N_("A recently detonated or cracked balefire egg: level 4 — 100 rads/min, 30 ft."),
    rate: 100, range: 30, size: 1 },
  { id: "bomb", kind: "tile", icon: `${I}balefire.svg`, label: N_("Damaged balefire bomb"), desc: N_("Level 7 — over 1200 rads/min: deadly in under a minute without protection, 60 ft."),
    rate: 1200, range: 60, size: 2 },
  { id: "radzone", kind: "region", icon: "fa-solid fa-radiation", label: N_("Radiation zone"), desc: N_("A region with a background dose (choose the level): crater, irradiated water, ruins."),
    rads: 40, radius: 20, color: "#7dff4a" },
  { id: "dump", kind: "region", icon: "fa-solid fa-dumpster", label: N_("Toxic waste dump"), desc: N_("Level 4 — 100 rads/min inside the region."),
    rads: 100, radius: 25, color: "#c8ff3a" },
  { id: "pink", kind: "region", icon: `${I}pinkcloud.svg`, label: N_("Pink cloud"), desc: N_("A pink cloud region (choose the density); thins by a level an hour unless persistent."),
    pink: 3, radius: 20, color: "#ff8fd0" },
  { id: "taint", kind: "region", icon: `${I}taint.svg`, label: N_("Taint puddle"), desc: N_("Entering the region gives a taint dose (ticks on the slider, Luck rolls)."),
    taint: 2, radius: 10, color: "#b07dff" }
]);
export const hazardById = id => HAZARDS.find(h => h.id === id) ?? null;

/** Wybór dawki kałuży: 1 — kilka kropli, 2 — brodzenie, 4 — po pas, 6 — upadek (s. 485). */
export const TAINT_ENTRY = Object.freeze([
  { v: 0, label: N_("none") }, { v: 1, label: N_("1 — a few drops") }, { v: 2, label: N_("2 — wading through") },
  { v: 4, label: N_("4 — up to the belly") }, { v: 6, label: N_("6 — falling in") }
]);

/** Piksele z ft (promień regionu) i z pól siatki (kafelek). */
export const ftToPx = (ft, grid) => (Number(ft) || 0) / (Number(grid?.distance) || 5) * (Number(grid?.size) || 100);

/**
 * Dane dokumentu do utworzenia w punkcie (x, y — środek). params — wartości z okna (rate, range, size, radius, rads,
 * pink, persistent, taint, texture, name). Zwraca { type: "Tile" | "Region", data }.
 */
export function hazardDoc(h, params, { x, y, grid }) {
  const p = { ...h, ...params };
  const F = "foe-rpg";
  if (h.kind === "tile") {
    const w = Math.max(1, Number(p.size) || 1) * (Number(grid?.size) || 100);
    return { type: "Tile", data: {
      x: Math.round(x - w / 2), y: Math.round(y - w / 2), width: w, height: w, texture: { src: p.texture || h.icon },
      flags: { [F]: { rads: { rate: Math.max(0, Number(p.rate) || 0), range: Math.max(0, Number(p.range) || 0) }, hazard: h.id } }
    } };
  }
  const r = ftToPx(Math.max(5, Number(p.radius) || 10), grid);
  const flags = { hazard: h.id };
  if (p.rads) flags.rads = { rate: Math.max(0, Number(p.rads) || 0) };
  if (p.pink) flags.pink = { density: Math.max(0, Math.min(5, Number(p.pink) || 0)), persistent: !!p.persistent };
  if (p.taint) flags.taintPuddle = Math.max(0, Number(p.taint) || 0);
  return { type: "Region", data: {
    name: p.name || p.labelText || h.id, color: h.color,
    shapes: [{ type: "ellipse", x: Math.round(x), y: Math.round(y), radiusX: Math.round(r), radiusY: Math.round(r), rotation: 0, hole: false }],
    flags: { [F]: flags }
  } };
}

/** Czy punkt wszedł do strefy: był poza, jest w środku (test — funkcja punkt → bool). */
export const entered = (inside, before, after) => !inside(before) && inside(after);
