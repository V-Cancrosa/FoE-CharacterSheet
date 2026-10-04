/**
 * Pojazdy — czyste zasady (bez Foundry, do testów).
 * Podręcznik v1.22 nie ma rozdziału o pojazdach (zapowiada je w dodatku). Z książki pochodzą:
 *   - tabela XLI (s. 608): rozmiar (mnożnik objętości kucyka) → obrażenia na ranę i modyfikator trafienia
 *     (Bomb-wagon 8 → 16, czołg i balon 32 → 20, Vertibuck i sky-wagon 64 → 22, Thunderhead 16384 → 38 i +2 kroki…),
 *   - zderzenia (Speed Lines, s. 13536): każde 20 ft prędkości = 10 ft upadku, czyli 1d20 obrażeń,
 *   - pojazdy ciągnięte przez kucyki jadą z prędkością najwolniejszego ciągnącego (s. 21242),
 *   - wybuchy i ogień obszarowy można celować wprost w pojazdy i duże konstrukcje (s. 451).
 * Reszta to zasady domowe zbudowane na tych samych mechanikach (oznaczone w opisach i w README).
 */

/** Wiersze tabeli XLI od rozmiaru kucyka w górę: mnożnik objętości, D/W, kroki MFD łatwiej w trafienie, kara do uników. */
export const VEHICLE_SIZES = [
  { key: "1", dw: 10, steps: 0, dodge: 0, label: "×1 — jak kucyk (rydwan jednoosobowy)" },
  { key: "2", dw: 12, steps: 0, dodge: 0, label: "×2 — wózek, sanie" },
  { key: "4", dw: 14, steps: 0, dodge: 0, label: "×4 — wóz, rydwan" },
  { key: "8", dw: 16, steps: 0, dodge: 0, label: "×8 — Bomb-wagon, Sentry Bot" },
  { key: "16", dw: 18, steps: 0, dodge: 0, label: "×16 — duży wóz, łódź" },
  { key: "32", dw: 20, steps: 0, dodge: -1, label: "×32 — czołg, balon" },
  { key: "64", dw: 22, steps: 0, dodge: -1, label: "×64 — Vertibuck, sky-wagon" },
  { key: "128", dw: 24, steps: 0, dodge: -1, label: "×128 — wagon kolejowy, barka" },
  { key: "256", dw: 26, steps: 0, dodge: -1, label: "×256 — lokomotywa" },
  { key: "512", dw: 28, steps: 0, dodge: -1, label: "×512 — mały statek" },
  { key: "1024", dw: 30, steps: 1, dodge: -1, label: "×1024 — okręt patrolowy" },
  { key: "2048", dw: 32, steps: 1, dodge: -1, label: "×2048" },
  { key: "4096", dw: 34, steps: 1, dodge: -1, label: "×4096" },
  { key: "8192", dw: 36, steps: 2, dodge: -1, label: "×8192" },
  { key: "16384", dw: 38, steps: 2, dodge: -1, label: "×16384 — Thunderhead" },
  { key: "32768", dw: 40, steps: 3, dodge: -1, label: "×32768 — HMS Celestia" }
];
export const sizeRow = key => VEHICLE_SIZES.find(s => s.key === String(key)) ?? VEHICLE_SIZES[3];

/** Domyślna wytrzymałość lokacji (ile ran ją niszczy) — zasada domowa: 5 jak END kucyka + 1 za każde podwojenie rozmiaru. */
export const defaultStructure = key => 5 + Math.round(Math.log2(Math.max(1, Number(sizeRow(key).key))));

export const VEHICLE_KINDS = { ground: "Lądowy", sky: "Powietrzny", water: "Wodny", rail: "Szynowy" };
export const VEHICLE_POWER = { pulled: "Ciągnięty przez kucyki", motor: "Własny napęd (silnik, magia, balon)" };
const PROPULSION = { ground: "Napęd (koła, gąsienice)", sky: "Napęd (śmigła, skrzydła, balon)", water: "Napęd (śruba, żagle, wiosła)", rail: "Napęd (koła, lokomotywa)" };

/** Strefy trafień pojazdu jako lokacje systemu (jak strefy potworów z bestiariusza). */
export function vehicleAreas(kind = "ground") {
  return [
    { loc: "torso", label: "Kadłub", mfd: "1", dt: null },
    { loc: "head", label: "Kabina i załoga", mfd: "1/2", dt: null },
    { loc: "wings", label: PROPULSION[kind] ?? PROPULSION.ground, mfd: "3/4", dt: null },
    { loc: "horn", label: "Uzbrojenie", mfd: "1/2", dt: null }
  ];
}
export const VEHICLE_LOCS = ["torso", "head", "wings", "horn"];

/** Skutki zniszczeń stref (zasada domowa). */
export const AREA_EFFECTS = {
  torso: { crippled: "kadłub uszkodzony — przy zderzeniu załoga obrywa jak bez osłony", lethal: "WRAK — pojazd zniszczony" },
  head: { crippled: "kabina uszkodzona: sterowanie −1 krok MFD", lethal: "kabina rozbita: sterowanie −3 kroki, załoga odsłonięta" },
  wings: { crippled: "napęd uszkodzony: prędkość o połowę, sterowanie −2 kroki", lethal: "napęd zniszczony: pojazd stoi (w powietrzu — spada)" },
  horn: { crippled: "uzbrojenie uszkodzone: strzały z broni pokładowej −2 kroki MFD", lethal: "uzbrojenie zniszczone: broń pokładowa nie strzela" }
};
export const AREA_STATUS = { torso: "WRAK", head: "KABINA ROZBITA", wings: "NAPĘD ZNISZCZONY", horn: "UZBROJENIE ZNISZCZONE" };

export const CREW_ROLES = {
  pilot: "Kierowca / pilot", gunner: "Strzelec", puller: "Ciągnie (zaprzęg)", passenger: "Pasażer"
};

/** Umiejętność albo atrybut sterowania: domyślnie Flight w powietrzu, AGI na ziemi, wodzie i szynach (zasada domowa). */
export const defaultPilotSkill = kind => (kind === "sky" ? "flight" : "agi");

/** Kości obrażeń zderzenia: 1d20 za każde pełne 20 ft prędkości (Speed Lines). d10, gdy osłania pojazd (załoga w środku). */
export function collisionFormula(speed, { cushioned = false } = {}) {
  const n = Math.floor(Math.max(0, Number(speed) || 0) / 20);
  return n ? `${n}d${cushioned ? 10 : 20}` : "";
}

/** Dodatkowe kości przy taranowaniu za różnicę rozmiaru (zasada domowa): +1 kość za każde dwa rzędy tabeli, o które taranujący jest większy. */
export function ramBonusDice(attackerDw, targetDw) {
  const diff = Math.floor(((Number(attackerDw) || 10) - (Number(targetDw) || 10)) / 4);
  return Math.max(0, diff);
}

/**
 * Prędkość pojazdu (ft na akcję).
 *   - ciągnięty: najwolniejszy z ciągnących (w powietrzu liczy się lot i tylko ci, którzy mogą latać),
 *   - własny napęd: wartość z karty,
 *   - uszkodzony napęd: połowa, zniszczony: 0; przeciążenie ładunkiem: −5 ft za każde 10% ponad udźwig.
 * pullers: [{ name, speed, flySpeed, canFly }]
 */
export function vehicleSpeed(v, { pullers = [], propulsion = "ok", cargo = 0, cargoMax = 0 } = {}) {
  const notes = [];
  let speed;
  if (v.power === "pulled") {
    const sky = v.kind === "sky";
    const able = pullers.filter(p => (sky ? p.canFly : true));
    const unable = pullers.filter(p => sky && !p.canFly);
    if (unable.length) notes.push(`nie mogą teraz latać: ${unable.map(p => p.name).join(", ")}`);
    if (!able.length) { speed = 0; notes.push(sky ? "brak lotników w zaprzęgu — sky-wagon nie poleci" : "brak zaprzęgu — pojazd stoi"); }
    else {
      const slow = able.reduce((m, p) => ((sky ? p.flySpeed : p.speed) < (sky ? m.flySpeed : m.speed) ? p : m));
      speed = sky ? slow.flySpeed : slow.speed;
      notes.push(`najwolniejszy w zaprzęgu: ${slow.name} (${speed} ft)`);
      if (v.harness && able.length < v.harness) notes.push(`zaprzęg niepełny (${able.length}/${v.harness})`);
    }
  } else speed = Math.max(0, Number(v.speed) || 0);
  if (propulsion === "crippled") { speed = Math.floor(speed / 10) * 5; notes.push("napęd uszkodzony: połowa prędkości"); }
  if (propulsion === "lethal") { speed = 0; notes.push("napęd zniszczony"); }
  if (cargoMax > 0 && cargo > cargoMax) {
    const over = Math.ceil(((cargo - cargoMax) / cargoMax) * 10);
    speed = Math.max(0, speed - 5 * over);
    notes.push(`przeładowany (${cargo}/${cargoMax} lb): −${5 * over} ft`);
  }
  return { speed: Math.max(0, speed), notes };
}

/** Kroki MFD dla atakującego pojazd: rozmiar (tabela XLI) i manewr unikowy. */
export function hitStepsAgainst(size, evasive = 0) {
  const parts = [];
  if (size.steps) parts.push({ label: `Duży cel (D/W ${size.dw})`, steps: size.steps });
  if (evasive) parts.push({ label: "Manewr unikowy pojazdu", steps: -evasive });
  return parts;
}

/** Czy manewr unikowy jeszcze działa: do końca następnej rundy w tej samej walce. */
export function evasiveActive(flag, combat) {
  if (!flag || !combat) return 0;
  if (flag.combat !== combat.id) return 0;
  const r = Number(combat.round) || 0;
  return r >= flag.round && r <= flag.round + 1 ? Number(flag.steps) || 1 : 0;
}

/**
 * Wzór pojazdu (data/vehicles.json) → { actor, items } do utworzenia.
 * weaponItem — funkcja z catalog-data.mjs; catalog — wczytany katalog (broń pokładowa po nazwie).
 */
export function buildVehicle(e, { catalog = { weapons: [] }, weaponItem } = {}) {
  const locations = {};
  for (const [k, dt] of Object.entries(e.dt ?? {})) locations[k] = { dt: Number(dt) || 0, wounds: 0 };
  const attributes = {};
  for (const [k, val] of Object.entries(e.attrs ?? {})) attributes[k] = { value: val };
  const skills = {};
  for (const [k, pts] of Object.entries(e.points ?? {})) skills[k] = { points: pts };
  const actor = {
    name: e.name, type: "vehicle", img: "systems/foe-rpg/icons/vehicle.svg",
    system: {
      race: "Pojazd", attributes, skills, locations,
      vehicle: {
        kind: e.kind ?? "ground", power: e.power ?? "pulled", size: String(e.size ?? "4"), speed: e.speed ?? 30, handling: e.handling ?? 0,
        crewMax: e.crewMax ?? 1, passengers: e.passengers ?? 0, harness: e.harness ?? 0, cargo: e.cargo ?? 500, currentSpeed: 0, crew: []
      },
      woundLimits: { maim: e.structure ?? 0, cripple: 0 },
      notes: e.desc ? `<p>${e.desc}</p>` : ""
    },
    prototypeToken: { actorLink: true, width: Number(e.size) >= 32 ? 2 : 1, height: Number(e.size) >= 32 ? 2 : 1 },
    flags: { "foe-rpg": { created: true, vehicle: e.name } }
  };
  const missing = [];
  const items = (e.weapons ?? []).map(n => {
    const w = catalog.weapons?.find(x => x.name === n);
    if (!w || !weaponItem) { missing.push(n); return null; }
    const d = weaponItem(w);
    d.system.mounted = true;
    return d;
  }).filter(Boolean);
  return { actor, items, missing };
}
