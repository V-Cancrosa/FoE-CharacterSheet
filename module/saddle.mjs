/**
 * Siodła bojowe i pancerze wspomagane (podręcznik s. 161–170, 460).
 *   - siodło: dwie bronie (czteroramienne — cztery); osobno albo razem jedną akcją z karą 1 kroku MFD (cztery: 2 kroki),
 *     w SATS koszt najdroższej broni +10 AP (czteroramienne +40),
 *   - limity wagi: użytkowe — broń do 3 lb; lekkie — jak bez siodła (2×STR), razem do 3×STR; średnie — 2×STR+5, razem 4×STR;
 *     ciężkie i czteroramienne — 4×STR, bez limitu łącznego,
 *   - akcesoria: rezerwa energii (podstawowa 30 ogniw / 15 MFC / 60 gem cells), rezerwa paliwa (60/120/240), podajnik
 *     automatyczny (przeładowanie bez akcji), półautomatyczny (1 akcja), wysuwany wędzidło (normalne przeładowanie);
 *     bez nich sięgnięcie po amunicję w siodle to dodatkowe 2 akcje,
 *   - pancerz wspomagany: wbudowane ciężkie siodło (u Enklawy czteroramienne z rezerwą energii); bez szkolenia
 *     (Power Armor Training) brak premii do atrybutów i umiejętności, ze szkoleniem brak kar AGI z pancerza;
 *     talizman naprawczy: 2 DT na każdej lokacji za jednostkę złomu (metalu albo elektroniki).
 */
const F = "foe-rpg";

export const SADDLE_KINDS = {
  utility: { label: "Siodło użytkowe", weapons: 2, indiv: () => 3, combined: null, volley: 1, extraAp: 10 },
  light: { label: "Lekkie siodło bojowe", weapons: 2, indiv: str => 2 * str, combined: str => 3 * str, volley: 1, extraAp: 10 },
  medium: { label: "Średnie siodło bojowe", weapons: 2, indiv: str => 2 * str + 5, combined: str => 4 * str, volley: 1, extraAp: 10 },
  heavy: { label: "Ciężkie siodło bojowe", weapons: 2, indiv: str => 4 * str, combined: null, volley: 1, extraAp: 10 },
  four: { label: "Czteroramienne siodło bojowe", weapons: 4, indiv: str => 4 * str, combined: null, volley: 2, extraAp: 40 }
};

/** Rodzaj siodła z nazwy przedmiotu. */
export function saddleKindOf(name) {
  const n = String(name ?? "").toLowerCase();
  if (/four.?pronged|czteroramien/.test(n)) return "four";
  if (/heavy battle saddle|ciężkie siod/.test(n)) return "heavy";
  if (/medium battle saddle|średnie siod/.test(n)) return "medium";
  if (/light battle saddle|lekkie siod/.test(n)) return "light";
  if (/utility battle saddle|użytkowe siod/.test(n)) return "utility";
  return null;
}

/** Akcesorium z nazwy: energy / fuel / auto / semi / bit / case. */
export function accessoryOf(name) {
  const n = String(name ?? "").toLowerCase();
  if (/energy reserve/.test(n)) return "energy";
  if (/fuel reserve/.test(n)) return "fuel";
  if (/semi-?auto loader/.test(n)) return "semi";
  if (/auto loader/.test(n)) return "auto";
  if (/retractable/.test(n)) return "bit";
  if (/munitions case/.test(n)) return "case";
  return null;
}

/** Pojemność rezerwy (w punktach energii: ogniwo energii 2, MFC 4, gem cell 1 — albo w jednostkach paliwa). */
export function reserveCapacity(name) {
  const n = String(name ?? "").toLowerCase();
  if (/energy reserve/.test(n)) return /advanced/.test(n) ? 120 : 60;
  if (/fuel reserve/.test(n)) return /large/.test(n) ? 240 : /medium/.test(n) ? 120 : 60;
  return 0;
}

/** Punkty rezerwy energii na jeden nabój danej amunicji (null — nie energia). */
export function energyCost(ammoType) {
  const t = String(ammoType ?? "").toLowerCase();
  if (/gem/.test(t)) return 1;
  if (/mfc|fission|micro ?fusion/.test(t)) return 4;
  if (/mec|me-?cell|energy cell|\bec\b|magical energy/.test(t)) return 2;
  return null;
}
export const isFuel = ammoType => /flamer|fuel|paliw/i.test(String(ammoType ?? ""));

export const hasPowerArmorTraining = actor =>
  (actor?.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && /power(ed)? armou?r training/i.test(i.name));

/** Wbudowane siodło pancerza wspomaganego (z opisu: „four pronged” → czteroramienne, inaczej ciężkie). */
export function builtInSaddle(armor) {
  if (!armor?.system?.powered) return null;
  const txt = `${armor.name} ${armor.system.description ?? ""}`;
  return { kind: /four.?pronged/i.test(txt) ? "four" : "heavy", energyOnly: /four.?pronged[^.]*energy/i.test(txt), reserve: /energy (weapons )?reserve/i.test(txt) };
}

/** Stan siodła postaci: rodzaj, źródło, limity, akcesoria, zamontowana broń. */
export function saddleState(actor) {
  const items = actor?.items ?? [];
  const str = actor?.system?.attributes?.str?.total ?? 0;
  const rank = k => Object.keys(SADDLE_KINDS).indexOf(k);
  let best = null;
  for (const a of items.filter(i => i.type === "armor" && i.system?.equipped)) {
    const b = builtInSaddle(a);
    if (b && (!best || rank(b.kind) > rank(best.kind))) best = { kind: b.kind, source: a.name, builtIn: true, energyOnly: b.energyOnly, builtInReserve: b.reserve };
  }
  for (const g of items.filter(i => i.type === "gear" && i.system?.category === "saddle" && i.system?.equipped)) {
    const k = saddleKindOf(g.name);
    if (k && (!best || rank(k) > rank(best.kind))) best = { kind: k, source: g.name, builtIn: false, item: g };
  }
  if (!best) return null;
  const def = SADDLE_KINDS[best.kind];
  const acc = {};
  for (const g of items.filter(i => i.type === "gear" && i.system?.category === "saddle" && i.system?.equipped)) {
    const a = accessoryOf(g.name);
    if (a && !acc[a]) acc[a] = g;
  }
  const mounted = items.filter(i => i.type === "weapon" && i.system?.mounted);
  const weight = mounted.reduce((t, i) => t + (Number(i.system.weight) || 0), 0);
  const combined = def.combined ? def.combined(str) : null;
  const indiv = def.indiv(str);
  const warnings = [];
  if (mounted.length > def.weapons) warnings.push(`zamontowano ${mounted.length} broni, siodło mieści ${def.weapons}`);
  if (combined !== null && weight > combined) warnings.push(`łączna waga ${weight} lb > ${combined} lb`);
  if (best.kind === "utility") for (const w of mounted) if ((Number(w.system.weight) || 0) > 3) warnings.push(`${w.name}: siodło użytkowe uniesie broń do 3 lb`);
  if (best.energyOnly) for (const w of mounted) if (w.system.skill !== "energy") warnings.push(`${w.name}: wbudowane siodło Enklawy przyjmuje tylko broń energetyczną`);
  const energyPts = acc.energy ? Number(acc.energy.system.charges) || 0 : 0;
  return {
    ...best, def, label: def.label, maxWeapons: def.weapons, indiv, combined, weight, mounted, warnings, acc,
    energy: acc.energy ? { item: acc.energy, pts: energyPts, cap: reserveCapacity(acc.energy.name) } : null,
    fuel: acc.fuel ? { item: acc.fuel, units: Number(acc.fuel.system.charges) || 0, cap: reserveCapacity(acc.fuel.name) } : null,
    volleySteps: def.volley, volleyExtraAp: def.extraAp
  };
}

/** Limit wagi broni do władania (bez kary): zamontowana na siodle — limit siodła, inaczej 2×STR. */
export function wieldLimit(actor, w) {
  const str = actor?.system?.attributes?.str?.total ?? 0;
  if (w?.mounted) {
    const s = saddleState(actor);
    if (s) return s.indiv;
  }
  return 2 * str;
}

/**
 * Filtr efektów pancerza wspomaganego (wywoływany przy zbieraniu efektów postaci):
 * bez szkolenia — bez premii do atrybutów, umiejętności i SATS; ze szkoleniem — bez kar AGI z pancerza.
 */
export function powerArmorFilter(item, e, trained) {
  if (item.type !== "armor" || !item.system?.powered) return true;
  const v = Number(e.value) || 0;
  const boosts = ["tempAttr", "attr", "sats", "skillRoll", "skillRank", "skillsOf", "basedRoll", "accuracy", "damage", "critSuccess"];
  if (!trained && v > 0 && boosts.includes(e.type)) return false;
  if (trained && v < 0 && ["tempAttr", "attr"].includes(e.type) && String(e.target).split(",").map(s => s.trim()).includes("agi")) return false;
  return true;
}

/** Dodatkowa kara AGI za pancerz wspomagany bez szkolenia — zasada domowa (ustawienie świata, domyślnie 0; podręcznik podaje tylko kary z samego pancerza). */
export function untrainedAgiPenalty() {
  try { return Math.max(0, Number(globalThis.game?.settings?.get?.(F, "powerArmorUntrainedAgi")) || 0); } catch { return 0; }
}
