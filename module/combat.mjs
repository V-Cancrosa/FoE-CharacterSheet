/**
 * Zasady walki z podręcznika v1.22 (rozdz. 4 i 7) jako czyste funkcje — bez zależności od Foundry,
 * żeby dało się je testować poza grą.
 */

// ---------- Lokacje trafień ----------
const span = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const table = spec => {
  const rows = Array(21).fill(null);
  for (const [loc, nums] of Object.entries(spec)) for (const n of nums) rows[n] = loc;
  return rows;
};

/** Losowe lokacje trafień k20 wg rasy celu (s. 450). Dwunożni: ramiona = przednie nogi, nogi = tylne; 20 = przerzut. */
export const HIT_TABLES = {
  earth: { label: "Ziemskie, osły, zebry", rows: table({ head: span(1, 2), torso: [...span(3, 6), ...span(11, 16)], flLeg: span(7, 8), frLeg: span(9, 10), rlLeg: span(17, 18), rrLeg: span(19, 20) }) },
  unicorn: { label: "Jednorożce", rows: table({ horn: [1], head: span(2, 3), torso: [...span(4, 6), ...span(11, 16)], flLeg: span(7, 8), frLeg: span(9, 10), rlLeg: span(17, 18), rrLeg: span(19, 20) }) },
  pegasus: { label: "Pegazy, nietoperze, gryfy", rows: table({ head: span(1, 2), torso: [...span(3, 4), ...span(13, 16)], flLeg: span(5, 6), frLeg: span(7, 8), wings: span(9, 12), rlLeg: span(17, 18), rrLeg: span(19, 20) }) },
  alicorn: { label: "Alikorny", rows: table({ horn: [1], head: span(2, 3), torso: [4, ...span(13, 16)], flLeg: span(5, 6), frLeg: span(7, 8), wings: span(9, 12), rlLeg: span(17, 18), rrLeg: span(19, 20) }) },
  buffalo: { label: "Bizony", rows: table({ horn: [1], head: span(2, 3), torso: [...span(4, 6), ...span(11, 16)], flLeg: span(7, 8), frLeg: span(9, 10), rlLeg: span(17, 18), rrLeg: span(19, 20) }) },
  biped: { label: "Dwunożni (minotaury, psy)", biped: true, rows: table({ head: span(1, 2), flLeg: span(3, 4), frLeg: span(5, 6), torso: span(7, 15), rlLeg: span(16, 17), rrLeg: span(18, 19) }) }
};

/** Nazwy kończyn dwunożnych (dla kart trafień). */
export const BIPED_LABELS = { flLeg: "Lewe ramię", frLeg: "Prawe ramię", rlLeg: "Lewa noga", rrLeg: "Prawa noga" };

/** Tabela trafień na podstawie wpisanej rasy (po polsku lub angielsku). */
export function hitTableFor(race) {
  const s = String(race ?? "").toLowerCase();
  if (/alikorn|alicorn/.test(s)) return "alicorn";
  if (/pegaz|pegas|nietoperz|bat ?pon|gryf|griff/.test(s)) return "pegasus";
  if (/jednoro|unicorn/.test(s)) return "unicorn";
  if (/bizon|buffalo/.test(s)) return "buffalo";
  if (/minotaur|piekieln|hellhound|piaskow|sand ?dog|diamond|dwunoż|biped|człowiek|human/.test(s)) return "biped";
  return "earth";
}

/** Lokacje, które ma istota z danej tabeli (do obrażeń obszarowych). */
export function tableLocations(tableKey) {
  const rows = (HIT_TABLES[tableKey] ?? HIT_TABLES.earth).rows;
  return [...new Set(rows.filter(Boolean))];
}

/**
 * Wynik k20 → lokacja. Wręcz +1 do rzutu (s. 450).
 * Zwraca { roll, total, loc } — loc null oznacza przerzut (20 u dwunożnych).
 */
export function hitLocation(tableKey, roll, { melee = false } = {}) {
  const t = HIT_TABLES[tableKey] ?? HIT_TABLES.earth;
  const total = Math.min(20, roll + (melee ? 1 : 0));
  return { roll, total, loc: t.rows[total] ?? null };
}

/** Strzały celowane (s. 443–446): kara w krokach MFD i lokacja, do której trafiają rany. */
export const CALLED_SHOTS = {
  torso: { label: "Tułów (domyślnie)", steps: 0, loc: "torso" },
  head: { label: "Głowa (×1,5 obrażeń)", steps: -2, loc: "head" },
  flLeg: { label: "Przednia lewa noga", steps: -1, loc: "flLeg" },
  frLeg: { label: "Przednia prawa noga", steps: -1, loc: "frLeg" },
  rlLeg: { label: "Tylna lewa noga", steps: -1, loc: "rlLeg" },
  rrLeg: { label: "Tylna prawa noga", steps: -1, loc: "rrLeg" },
  wings: { label: "Skrzydła złożone", steps: -1, loc: "wings" },
  wingsSpread: { label: "Skrzydła rozłożone", steps: 0, loc: "wings" },
  horn: { label: "Róg (przerywa zaklęcia)", steps: -3, loc: "horn" },
  eye: { label: "Oko (głowa, ×1,5)", steps: -4, loc: "head" },
  heart: { label: "Serce (tułów, ×2)", steps: -4, loc: "torso", mult: 2 }
};

/** Mnożnik obrażeń za lokację: głowa (i oko) ×1,5, serce ×2. */
export function locationMultiplier(loc, called = null) {
  if (called && CALLED_SHOTS[called]?.mult) return CALLED_SHOTS[called].mult;
  return loc === "head" ? 1.5 : 1;
}

/**
 * Kilka mnożników się sumuje (s. 462): krytyk ×3 w głowę (×1,5) = ×4,5.
 * Mnożniki równe 1 nie są mnożnikami i się nie liczą.
 */
export function combineMultipliers(...list) {
  const m = list.flat().map(Number).filter(x => Number.isFinite(x) && x > 0 && x !== 1);
  return m.length ? Math.round(m.reduce((a, b) => a + b, 0) * 100) / 100 : 1;
}

/** Mnożnik krytyka z pola broni („x1,5”, „×2”). null, gdy pole ma inną postać. */
export function critMultiplier(text) {
  const m = String(text ?? "").trim().toLowerCase().replace(",", ".").match(/^[x×*]\s*(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) : null;
}

// ---------- Broń ----------
export const CLOSE_SKILLS = ["melee", "unarmed"];
export const isClose = w => CLOSE_SKILLS.includes(w?.skill);
/** Broń obszarowa: materiały wybuchowe i Big Guns AoE — obrażenia zależne od rangi, bez krytyków. */
export const isAoe = w => !!(w?.aoe?.enabled || w?.kind === "explosive" || w?.kind === "bigGunsAoe");

/**
 * Przedział zasięgu w stopach. Dla broni rzucanej liczony z STR, np. „(STR/2)×5 ft” (min. 5 ft, s. 187).
 * 0 = broń do walki wręcz.
 */
export function rangeIncrement(w, str = 0) {
  if (Number(w?.rangeInc) > 0) return Number(w.rangeInc);
  const r = String(w?.range ?? "").toUpperCase().replace(/×/g, "X").replace(/\s+/g, "");
  let m;
  if ((m = r.match(/^\(STR\/(\d+)\)X(\d+)/))) return Math.max(5, Math.floor(str / Number(m[1])) * Number(m[2]));
  if ((m = r.match(/^STRX(\d+)/))) return Math.max(5, str * Number(m[1]));
  if ((m = r.match(/^(\d+)/))) return Number(m[1]);
  return 0;
}

/** Odległości do wyboru: każdy przedział zasięgu po pierwszym = 1 krok MFD trudniej (s. 187). */
export function rangeBands(inc, count = 6) {
  if (!(inc > 0)) return [];
  return Array.from({ length: count }, (_, i) => ({
    steps: -i,
    label: i === 0 ? `do ${inc} ft` : `${inc * i}–${inc * (i + 1)} ft`
  }));
}

/** Kara za zbyt ciężką broń: 1 krok MFD za każde rozpoczęte 2 lb ponad 2×STR (s. 187). */
export function wieldPenalty(weight, str, limit = null) {
  const over = (Number(weight) || 0) - (limit ?? 2 * (Number(str) || 0));
  return over > 0 ? Math.ceil(over / 2) : 0;
}

/**
 * Seria „/N”: broń zużywa N naboi na strzał; gdy brakuje amunicji, traci tyle kości, ile brakuje naboi,
 * a gdy nie zostaje żadna kość — nie strzela (s. 187).
 */
export function burst(formula, shots, ammoLeft) {
  const n = Math.max(1, Math.floor(Number(shots) || 1));
  const use = Math.min(n, Math.max(0, Math.floor(Number(ammoLeft) || 0)));
  const lacking = n - use;
  const f = String(formula ?? "");
  if (use <= 0) return { ok: false, use: 0, lacking, formula: f };
  if (!lacking) return { ok: true, use, lacking: 0, formula: f };
  const m = f.match(/(\d*)d(\d+)/i);
  if (!m) return { ok: true, use, lacking, formula: f };
  const dice = (m[1] === "" ? 1 : Number(m[1])) - lacking;
  if (dice < 1) return { ok: false, use, lacking, formula: f };
  return { ok: true, use, lacking, formula: f.replace(m[0], `${dice}d${m[2]}`) };
}

/** Premia STR do obrażeń wręcz wg rangi Melee/Unarmed (s. 58): 1–24 ×1, 25–49 ×2, 50–74 ×3, 75–99 ×4, 100 ×5. */
export const strFactor = rank => (rank <= 0 ? 0 : rank < 25 ? 1 : rank < 50 ? 2 : rank < 75 ? 3 : rank < 100 ? 4 : 5);
/** Materiały wybuchowe i Big Guns AoE: część obrażeń wg rangi (s. 58–59). */
export const aoePercent = rank => (rank <= 25 ? 0.25 : rank <= 50 ? 0.5 : rank <= 75 ? 0.75 : 1);
export const aoeFlat = rank => (rank >= 100 ? 10 : 0);

/**
 * Formuła obrażeń broni z premiami z umiejętności i siły.
 *   wręcz: „STR” w formule = STR × mnożnik z rangi (bez premii przy zbyt ciężkiej broni),
 *   inne (łuki, rzucane): „STR” = sama siła,
 *   Small Guns, Energy Weapons, Big Guns: + ranga/10,
 *   broń obszarowa: rzut × % z rangi (+10 przy randze 100) — pct/flat stosuje się po rzucie.
 */
export function damageFormula(w, { str = 0, rank = 0, overWield = false } = {}) {
  const notes = [];
  // broń potworów z bestiariusza: obrażenia już zawierają premie
  if (w?.flat) return { formula: String(w.damage || "0"), pct: 1, flat: 0, notes: ["obrażenia z bloku statystyk"] };
  const close = isClose(w);
  const aoe = isAoe(w);
  const strVal = close ? (overWield ? 0 : str * strFactor(rank)) : str;
  let formula = String(w?.damage || "0");
  const hasStr = /\bSTR\b/i.test(formula);
  formula = formula
    .replace(/(\d+(?:\.\d+)?)\s*[*×x]\s*STR\b/gi, (_, k) => String(Math.floor(Number(k) * strVal)))
    .replace(/\bSTR\s*[*×x]\s*(\d+(?:\.\d+)?)/gi, (_, k) => String(Math.floor(Number(k) * strVal)))
    .replace(/\bSTR\b/gi, String(strVal));
  if (hasStr) {
    if (close && overWield) notes.push("broń za ciężka — bez premii STR");
    else if (close) notes.push(`STR ${str} × ${strFactor(rank)} (ranga ${rank})`);
    else notes.push(`STR ${str}`);
  }
  if (!aoe && ["smallGuns", "energy", "bigGuns"].includes(w?.skill)) {
    const b = Math.floor(rank / 10);
    if (b) { formula += ` + ${b}`; notes.push(`ranga ${rank}/10 = +${b}`); }
  }
  const pct = aoe ? aoePercent(rank) : 1;
  const flat = aoe ? aoeFlat(rank) : 0;
  if (aoe) notes.push(`obszarowa: ${Math.round(pct * 100)}% z rzutu (ranga ${rank})${flat ? " +10" : ""}`);
  return { formula, pct, flat, notes };
}

/** DT po uwzględnieniu ignorowania (broń magiczna ignoruje 5 DT, s. 187). */
export const effectiveDT = (dt, ignore = 0) => Math.max(0, (Number(dt) || 0) - (Number(ignore) || 0));
/** Rany = obrażenia po DT / obrażenia na ranę, w dół (s. 462). */
export const woundsFrom = (damage, perWound) => (perWound > 0 ? Math.max(0, Math.floor(damage / perWound)) : 0);

// ---------- Przeładowanie (s. 451) ----------
const RELOAD_AP = { DTM: 10, REVOLVER: 20, INTERNAL: 20, BREECH: 25 };

/**
 * Typ przeładowania z tabeli broni → koszt w AP (SATS) i ile ładuje jedna akcja poza SATS:
 *   full — cały magazynek, half — pół (Internal, broń palna), breech — 1d4+1 naboi.
 */
export function reloadInfo(reload, { energy = false } = {}) {
  const s = String(reload ?? "").toUpperCase().replace(/\s+/g, "");
  const ap = s.match(/^(\d+)AP/);
  if (ap) return { ap: Number(ap[1]), action: "full", label: reload };
  const m = s.match(/^(DTM|REVOLVER|INTERNAL|BREECH)([+-]\d+)?/);
  if (!m) return { ap: 20, action: "full", label: reload || "—", unknown: true };
  const base = RELOAD_AP[m[1]] + (m[2] ? Number(m[2]) : 0);
  const action = m[1] === "BREECH" ? "breech" : m[1] === "INTERNAL" && !energy ? "half" : "full";
  return { ap: Math.max(0, base), action, label: reload };
}

// ---------- Pancerz ----------
export const LAYER_CATEGORIES = ["clothing", "light", "medium", "heavy"];
const BODY = ["torso", "flLeg", "frLeg", "rlLeg", "rrLeg"];

/** Domyślne osłonięcie (s. 156): bardingi tułów i cztery nogi, hełmy głowę, akcesoria nic. */
export function defaultCover(category, locations = ["head", "torso", "flLeg", "frLeg", "rlLeg", "rrLeg", "wings", "horn"]) {
  const on = category === "helmet" ? ["head"] : category === "accessory" ? [] : BODY;
  return Object.fromEntries(locations.map(k => [k, on.includes(k)]));
}

/** Kary za warstwy: −1 AGI za każdą warstwę po pierwszej, −1 STR za każdą po drugiej (s. 156). */
export function layerPenalties(count) {
  return { agi: Math.max(0, count - 1), str: Math.max(0, count - 2) };
}

// ---------- Obciążenie (s. 18) ----------
/** Ruch: −5 ft za każde rozpoczęte 10 lb ponad udźwig. */
export const overloadSpeed = (weight, carry) => (weight > carry ? 5 * Math.ceil((weight - carry) / 10) : 0);
/** Skradanie: −5 za każde rozpoczęte 10 lb ponad 50. */
export const sneakWeightPenalty = weight => (weight > 50 ? 5 * Math.ceil((weight - 50) / 10) : 0);

// ---------- Specjalne efekty broni (s. 200–202) ----------
export const SPECIALS = {
  fire: { label: "Ogień", desc: "3d12 na każdą lokację na koniec rundy przez 1d4 rundy; ignoruje pancerz niemetalowy" },
  electric: { label: "Elektryczność", desc: "na koniec rundy 3d12 na każdą lokację (maszyny 6d12); +6d12 dla robotów; wyłącza PipBucki i pancerze wspomagane" },
  rads: { label: "Promieniowanie", desc: "25 radów za każde 10 zadanych obrażeń" },
  disintegrate: { label: "Dezintegracja", desc: "rany na okaleczenie lokacji albo zabójcze trafienie zamieniają cel w popiół" },
  shock: { label: "Ogłuszenie (shock)", desc: "nie zabija — zamiast śmierci utrata przytomności; krytyk +1d10 ran" },
  poison: { label: "Trucizna", desc: "rzut END przeciw truciźnie" },
  knockdown: { label: "Przewraca", desc: "trafienie z co najmniej 1 raną przewraca cel" },
  concealable: { label: "Ukrywalna", desc: "+10 do Sneak przy ukrywaniu broni" },
  scoped: { label: "Luneta", desc: "większy przedział zasięgu (już wliczony w broń z katalogu)" },
  silenced: { label: "Tłumik", desc: "wykrycie strzelca o krok trudniejsze (MFD ½)" },
  timed: { label: "Zapalnik czasowy", desc: "wybucha po ustawionym czasie" },
  placed: { label: "Mina", desc: "wybucha, gdy ktoś podejdzie na 5 ft; rozbrojenie Explosives MFD ¾" }
};

export const POISONS = {
  "": "brak",
  radscorpion: "Radskorpion (END ¾, 1 rana na rundę w głowę lub tułów)",
  manticore: "Mantykora (END ½, paraliż)",
  other: "Inna (opis broni / MG)"
};

/** Lista aktywnych efektów broni do znaczników. */
export function specialList(sp = {}) {
  return Object.keys(SPECIALS).filter(k => sp[k] && sp[k] !== "none");
}

/**
 * Dezintegracja (s. 200): rany tego trafienia okaleczyłyby nietkniętą lokację, trafienie zabija albo urywa kończynę;
 * broń „crit” zawsze dezintegruje przy krytyku.
 */
export function disintegrates({ mode, wounds, now, endT, crit = false }) {
  if (!mode) return false;
  if (mode === "crit" && crit) return true;
  if (!(wounds > 0)) return false;
  return wounds * 2 >= endT || now >= endT;
}

/** Promieniowanie: 25 radów za każde pełne 10 obrażeń, minus odporność (%). */
export function radsFrom(damage, resist = 0) {
  const raw = Math.floor(Math.max(0, damage) / 10) * 25;
  return Math.max(0, Math.round(raw * (1 - Math.min(100, Math.max(0, resist)) / 100)));
}

/** Pancerz metalowy (średni, ciężki, wspomagany) — chroni przed ogniem, jeśli atak go nie przebił. */
export const isMetalArmor = sys => !!sys && (sys.powered || sys.category === "medium" || sys.category === "heavy");
