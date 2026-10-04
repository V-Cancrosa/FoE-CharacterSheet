/**
 * Cybernetyka i implanty — czyste zasady (bez Foundry, do testów).
 * Podręcznik v1.22:
 *   - Cyberpony (s. 104–105): kończyny znoszą 1 ranę więcej do okaleczenia i do utraty, +6 DT w miejscu protezy (1 pkt)
 *     albo +3 DT wszędzie (3 pkt), +10 DT od ognia, 10% odporności na promieniowanie, +10 przeciw truciznom,
 *   - zasilanie klejnotami jak jedzenie (s. 178): wartości dla jednej cyber-kończyny, tułów zużywa dwa razy tyle,
 *   - talizman naprawczy: złom naprawia 1 ranę na 15 minut,
 *   - Implanted i tabela IX (s. 107): przykładowe implanty; implantami +1 do atrybutu najwyżej raz na atrybut,
 *   - Adamantium Bone Lacing / Bone Strengthening Brew: kończyny ×2 ran do okaleczenia i utraty (przed premiami stałymi),
 *   - Zebra Augmented i Bone Strengthening Brew nie łączą się z cybernetyką.
 * Implant i proteza to cecha („feature”) rodzaju implant / cyberlimb z polami w system.cyber.
 */
const F = "foe-rpg";

/** Kończyny w rozumieniu zasad o ranach (nogi i skrzydła). */
export const LIMB_LOCS = ["flLeg", "frLeg", "rlLeg", "rrLeg", "wings"];
export const LEG_LOCS = ["flLeg", "frLeg", "rlLeg", "rrLeg"];
const LOC_PL = { head: "głowa", torso: "tułów", flLeg: "przednia lewa", frLeg: "przednia prawa", rlLeg: "tylna lewa", rrLeg: "tylna prawa", wings: "skrzydła", horn: "róg" };
const ATTR_PL = { str: "STR", per: "PER", end: "END", cha: "CHA", int: "INT", agi: "AGI", luck: "LCK" };

export const CYBER_KINDS = { implant: "Implant", cyberlimb: "Proteza" };
export const isCyber = i => i?.type === "feature" && !!CYBER_KINDS[i.system?.kind];
export const cyberItems = actor => (actor?.items ?? []).filter(isCyber);
const active = i => i.system?.active !== false;

/** Klejnoty jako zasilanie (s. 178): godziny dla jednej cyber-kończyny za sztukę. */
export function gemHours(name) {
  const n = String(name ?? "").toLowerCase();
  if (/cyberpony cakes/.test(n)) return 24;          // 4 posiłki po 6 h
  if (/crushed gemstone|gem dust|pył/.test(n)) return 2;
  if (/gem \(small\)/.test(n)) return 12;
  if (/gem \(medium\)/.test(n)) return 24;
  if (/gem \(large\)/.test(n)) return 96;            // 4 dni na 5 lb
  return 0;
}
export const isGem = item => item?.type === "gear" && gemHours(item.name) > 0;
export const isScrap = item => item?.type === "gear" && /scrap (metal|electronics)|złom/i.test(item.name ?? "");

/** Dane cechy z wpisu data/cyber.json; loc — lokacja protezy nogi, attr — atrybut implantu. */
export function cyberItemData(e, { loc = "", attr = "" } = {}) {
  const where = e.slot === "leg" ? loc : e.slot && e.slot !== "attr" ? e.slot : "";
  const effects = (e.fx ?? []).map(([type, target, value, when = ""]) => ({
    type, target: target === "@loc" ? where : target === "@attr" ? attr : target, value, when
  })).filter(x => x.target);
  const suffix = e.slot === "leg" && where ? `: ${LOC_PL[where]}` : e.slot === "attr" && attr ? `: ${ATTR_PL[attr]}` : "";
  return {
    name: `${e.name}${suffix}`, type: "feature", img: "systems/foe-rpg/icons/cyber.svg",
    system: {
      kind: e.kind === "limb" ? "cyberlimb" : "implant", active: true, effects, description: `<p>${e.desc ?? ""}</p>`,
      cyber: { loc: where, power: Number(e.power) || 0, talisman: !!e.talisman, capacity: Number(e.capacity) || 0, charges: 0, regen: Number(e.regen) || 0 }
    },
    flags: { [F]: { cyber: e.name } }
  };
}

const hasFeature = (actor, re) => (actor?.items ?? []).some(i => i.type === "feature" && active(i) && re.test(i.name));
const cyberponyFull = actor => (actor?.items ?? []).some(i => i.type === "feature" && active(i) && /cyberpony/i.test(i.name)
  && (i.system?.effects ?? []).some(e => e.type === "dt" && e.target === "all"));

/** Ostrzeżenia przy montażu (decyzja należy do MG). */
export function cyberWarnings(actor, e, { attr = "", loc = "" } = {}) {
  const w = [];
  const race = String(actor?.system?.race ?? "");
  if (hasFeature(actor, /zebra augmented/i)) w.push("Zebra Augmented nie łączy się z cybernetyką — organizm odrzuca implant (bolesne, możliwie śmiertelne)");
  if (hasFeature(actor, /bone strengthening brew/i)) w.push("Bone Strengthening Brew wyklucza cybernetykę");
  if (e.kind === "implant" && (/alikorn|alicorn/i.test(race) || hasFeature(actor, /canterlot ghoul/i))) w.push("alikorny i ghule z Canterlotu nie mogą mieć implantów (Implanted)");
  if (e.slot === "attr") {
    if (!attr) w.push("wybierz atrybut");
    else if (cyberItems(actor).some(i => (i.system.effects ?? []).some(x => x.type === "attr" && x.target === attr && x.value > 0))) w.push(`${ATTR_PL[attr]} ma już implant — implantami można go podnieść tylko o 1`);
  }
  if (e.slot === "leg" && !loc) w.push("wybierz nogę");
  const where = e.slot === "leg" ? loc : e.slot;
  if (e.kind === "limb" && where && cyberItems(actor).some(i => i.system.kind === "cyberlimb" && i.system.cyber?.loc === where && !/oko|organ/i.test(i.name))) w.push(`na lokacji ${LOC_PL[where]} jest już proteza`);
  if (/star and cross/i.test(e.name) && !hasFeature(actor, /cyberpony/i)) w.push("wymaga co najmniej 1 pkt w Cyberpony");
  if (/nemean|basilisk/i.test(e.name) && cyberItems(actor).some(i => /nemean|basilisk/i.test(i.name))) w.push("Nemean i Basilisk nie sumują się — liczy się mocniejszy");
  if (e.slot === "wings" && actor?.system?.skills?.flight?.known === false) w.push("postać nie ma rasowej umiejętności Flight — skrzydło nie da lotu");
  return w;
}

// ---------- zasilanie ----------
/** Ile „kończyn” zasilania zużywa postać (kończyna 1, tułów 2, implant ¼ — wg pola power). */
export const powerUnits = actor => Math.round(cyberItems(actor).filter(active).reduce((t, i) => t + (Number(i.system.cyber?.power) || 0), 0) * 100) / 100;

function tracking() {
  try { return !!globalThis.game?.settings?.get?.(F, "cyberPower"); } catch { return false; }
}

/** Stan zasilania: { tracked, units, until, powered, hoursLeft }. Bez śledzenia (ustawienie) zawsze zasilone. */
export function powerState(actor, now = globalThis.game?.time?.worldTime ?? 0, tracked = tracking()) {
  const units = powerUnits(actor);
  const until = Number(actor?.flags?.[F]?.cyberPower?.until ?? actor?.getFlag?.(F, "cyberPower")?.until) || 0;
  const powered = !tracked || units <= 0 || until > now;
  return { tracked, units, until, powered, hoursLeft: until > now ? Math.round(((until - now) / 3600) * 10) / 10 : 0 };
}

/** Nowy koniec zasilania po zjedzeniu klejnotu: godziny dla jednej kończyny / liczba kończyn. */
export function feedUntil(state, hours, now) {
  const per = state.units > 0 ? hours / state.units : hours;
  return Math.max(state.until, now) + Math.round(per * 3600);
}

/** Lokacje protez wyłączonych z braku zasilania (działają jak okaleczone). */
export function unpoweredLocs(actor, state = powerState(actor)) {
  if (state.powered) return [];
  return [...new Set(cyberItems(actor).filter(i => active(i) && i.system.kind === "cyberlimb" && (Number(i.system.cyber?.power) || 0) > 0 && i.system.cyber?.loc).map(i => i.system.cyber.loc))];
}

/**
 * Filtr efektów cybernetyki (actorEffects): bez zasilania implanty i protezy nie działają;
 * Nemean nie sumuje się z Basiliskiem; przy Cyberpony 3 pkt (+3 DT wszędzie) protezy nie dają osobno +6 DT.
 */
export function cyberFilter(actor) {
  const items = cyberItems(actor).filter(active);
  if (!items.length) return () => true;
  const state = powerState(actor);
  const basilisk = items.some(i => /basilisk/i.test(i.name));
  const full = cyberponyFull(actor);
  // implantami najwyżej +1 do danego atrybutu: liczy się pierwszy implant na atrybut
  const firstAttr = {};
  for (const i of items) for (const e of i.system.effects ?? []) if (e.type === "attr" && e.value > 0 && !e.when) firstAttr[e.target] ??= i.id;
  return (item, e) => {
    if (!isCyber(item)) return true;
    if (e.type === "attr" && e.value > 0 && !e.when && firstAttr[e.target] !== item.id) return false;
    if (!state.powered && (Number(item.system.cyber?.power) || 0) > 0) return false;
    if (basilisk && /nemean/i.test(item.name) && e.type === "dt") return false;
    if (full && item.system.kind === "cyberlimb" && e.type === "dt") return false;
    return true;
  };
}

/** Czy postać jest cyborgiem (Robotics Expert: +5 obrażeń przeciw robotom i cyborgom). */
export const isCyborg = actor => cyberItems(actor).some(i => i.system.kind === "cyberlimb") || hasFeature(actor, /cyberpony/i);

// ---------- regeneracja ----------
/**
 * Plan samonaprawy po upływie czasu:
 *   - talizman naprawczy protezy: 1 rana na 15 minut na tej lokacji, za 1 złom (zasada domowa: złom na ranę),
 *   - Phoenix Monocyte Breeder: 1 rana na godzinę, najpierw najbardziej ranna lokacja.
 * carry — niewykorzystane sekundy z poprzednich wywołań { talisman, phoenix }.
 * Zwraca { wounds: {loc: nowe rany}, scrapUsed, notes, carry }.
 */
export function planRegen(actor, seconds, carry = {}, scrap = 0) {
  const sys = actor.system;
  const items = cyberItems(actor).filter(active);
  const state = powerState(actor);
  const wounds = Object.fromEntries(Object.entries(sys.locations).map(([k, L]) => [k, L.wounds]));
  const notes = [];
  let scrapUsed = 0;
  const out = { talisman: carry.talisman ?? 0, phoenix: carry.phoenix ?? 0 };
  const talLocs = state.powered ? [...new Set(items.filter(i => i.system.kind === "cyberlimb" && i.system.cyber?.talisman && i.system.cyber?.loc).map(i => i.system.cyber.loc))] : [];
  const hurtTal = talLocs.filter(k => wounds[k] > 0);
  if (hurtTal.length && scrap > 0) {
    out.talisman += seconds;
    let ticks = Math.floor(out.talisman / 900);
    out.talisman -= ticks * 900;
    while (ticks-- > 0 && scrap - scrapUsed > 0) {
      const k = hurtTal.find(l => wounds[l] > 0);
      if (!k) break;
      wounds[k]--; scrapUsed++;
    }
    if (scrapUsed) notes.push(`talizman naprawczy: −${scrapUsed} ${scrapUsed === 1 ? "rana" : "rany"} (złom ×${scrapUsed})`);
  } else out.talisman = 0;
  const phoenix = state.powered && items.some(i => (Number(i.system.cyber?.regen) || 0) > 0);
  const anyHurt = () => Object.values(wounds).some(v => v > 0);
  if (phoenix && anyHurt()) {
    out.phoenix += seconds;
    let ticks = Math.floor(out.phoenix / 3600);
    out.phoenix -= ticks * 3600;
    let healed = 0;
    while (ticks-- > 0 && anyHurt()) {
      const k = Object.keys(wounds).reduce((a, b) => (wounds[b] > wounds[a] ? b : a));
      wounds[k]--; healed++;
    }
    if (healed) notes.push(`Phoenix Monocyte Breeder: −${healed} ${healed === 1 ? "rana" : "rany"}`);
  } else if (!phoenix || !anyHurt()) out.phoenix = 0;
  const changed = Object.fromEntries(Object.entries(wounds).filter(([k, v]) => v !== sys.locations[k].wounds));
  return { wounds: changed, scrapUsed, notes, carry: out };
}
