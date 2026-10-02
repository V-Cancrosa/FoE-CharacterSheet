import { ATTRS, SKILLS } from "./data.mjs";
import { CREATION, RACES, HINDRANCES, TRAITS, EARTH_PERKS, NPC_ARCHETYPES } from "./creation-data.mjs";

const ATTR_KEYS = Object.keys(ATTRS);
const RACIAL_SKILLS = Object.entries(SKILLS).filter(([, s]) => s.racial).map(([k]) => k);
const zero = () => Object.fromEntries(ATTR_KEYS.map(k => [k, 0]));
const baseRank = (att, luck) => Math.max(5, 2 * att + Math.floor(luck / 2) + 2);

/** Początkowy stan kreatora postaci gracza. */
export function defaultPcState(name = "") {
  return {
    step: 0,
    name,
    race: "earth",
    raceAttrs: [],
    raceSkills: [],          // wybory z grup „wybierz n” (płaska lista kluczy)
    zebraNoMagic: false,
    zebraSplit: [],
    magicAttr: "int",
    earthPerk: "strongBack",
    hindrances: [],
    traits: {},              // klucz → wybrany koszt
    spent: Object.fromEntries(ATTR_KEYS.map(k => [k, 4])),   // 28 punktów: wszystko po 5
    adj: zero(),
    tags: [],
    extra: {},
    filter: ""
  };
}

/** Sumuje efekty (eff) wybranych wad i cech. */
function collectEffects(entries) {
  const out = { attrs: zero(), skills: {}, allSkills: 0, wound: 0, carry: 0, tags: 0, karma: 0, racial: {}, caps: null, removeLockpickPenalty: false };
  for (const e of entries) {
    const f = e?.eff;
    if (!f) continue;
    for (const [k, v] of Object.entries(f.attrs ?? {})) out.attrs[k] += v;
    for (const [k, v] of Object.entries(f.skills ?? {})) out.skills[k] = (out.skills[k] ?? 0) + v;
    for (const [k, v] of Object.entries(f.racial ?? {})) out.racial[k] = (out.racial[k] ?? 0) + v;
    out.allSkills += f.allSkills ?? 0;
    out.wound += f.wound ?? 0;
    out.carry += f.carry ?? 0;
    out.tags += f.tags ?? 0;
    out.karma += f.karma ?? 0;
    if (f.caps != null) out.caps = Math.min(out.caps ?? Infinity, f.caps);
    if (f.removeLockpickPenalty) out.removeLockpickPenalty = true;
  }
  return out;
}

/**
 * Przelicza cały stan kreatora: budżet punktów, atrybuty, umiejętności, błędy.
 * pool — pula punktów tworzenia z ustawień (domyślnie 35).
 */
export function computePc(state, pool = CREATION.pool) {
  const race = RACES[state.race] ?? RACES.other;
  const errors = [], warnings = [];

  // --- wady: automatyczne z rasy + wybrane ---
  const autoH = (race.hindrances ?? []).map(h => ({ ...h, auto: true }));
  const chosenH = state.hindrances.filter(k => HINDRANCES[k] && !autoH.some(a => a.key === k)).map(k => ({ key: k, points: true }));
  const allH = [...autoH, ...chosenH];
  const counted = allH.filter(h => !h.uncounted);
  const maxH = race.maxHindrances ?? CREATION.maxHindrances;
  const pointGiving = Math.min(counted.filter(h => h.points !== false).length, maxH);
  let hindPts = pointGiving;
  if (race.hindrancePoints === "half") hindPts = Math.floor(pointGiving / 2);
  if (race.hindrancePoints === "minus2") hindPts = Math.max(0, pointGiving - 2);
  if (counted.length > maxH) warnings.push(`Więcej niż ${maxH} wad — nadmiarowe nie dają punktów.`);
  else if (counted.length > 4 && !race.maxHindrances) warnings.push("Podręcznik zaleca na początek najwyżej 3 wady (powyżej 4 — raczej za cechy niż atrybuty).");

  // --- cechy: automatyczne (darmowe) + wybrane ---
  const autoT = (race.traits ?? []).map(t => ({ ...t, auto: true }));
  const chosenT = Object.entries(state.traits).filter(([k]) => TRAITS[k]).map(([k, c]) => {
    const [min, max] = TRAITS[k].cost;
    return { key: k, cost: Math.min(max, Math.max(min, Number(c) || min)) };
  });
  const rawTraitCost = chosenT.reduce((t, x) => t + x.cost, 0);
  const credit = Math.min(race.freeTraitPoints ?? 0, rawTraitCost);
  const traitCost = rawTraitCost - credit;

  // --- efekty ---
  const effSources = [
    ...allH.map(h => HINDRANCES[h.key]),
    ...autoT.map(t => TRAITS[t.key] ?? t),
    ...chosenT.map(t => TRAITS[t.key])
  ];
  const eff = collectEffects(effSources);
  if (race.earthPerk) eff.carry += EARTH_PERKS[state.earthPerk]?.carry ?? 0;
  const speedBonus = race.earthPerk ? (EARTH_PERKS[state.earthPerk]?.speed ?? 0) : 0;

  // --- budżet ---
  const budget = (pool - ATTR_KEYS.length) + hindPts - traitCost;
  const spentTotal = ATTR_KEYS.reduce((t, k) => t + (state.spent[k] ?? 0), 0);
  const remaining = budget - spentTotal;
  if (remaining < 0) errors.push(`Wydano o ${-remaining} pkt za dużo — odejmij z atrybutów, dodaj wadę albo usuń cechę.`);
  else if (remaining > 0) warnings.push(`Zostało ${remaining} niewydanych punktów.`);

  // --- rasowe atrybuty ---
  const raceAttrs = state.raceAttrs.filter(k => race.attrs.from.includes(k)).slice(0, race.attrs.pick);
  if (raceAttrs.length < race.attrs.pick) errors.push(`Wybierz ${race.attrs.pick === 2 ? "dwa atrybuty" : "atrybut"} z premią rasową (krok Rasa).`);

  const attrs = {};
  for (const k of ATTR_KEYS) {
    const spent = state.spent[k] ?? 0;
    const racial = raceAttrs.includes(k) ? 1 : 0;
    const total = CREATION.attrStart + spent + racial + eff.attrs[k] + (state.adj[k] ?? 0);
    const maxSpent = k === "luck" ? CREATION.maxRaiseLuck : CREATION.maxRaise;
    attrs[k] = { key: k, label: ATTRS[k], spent, racial, eff: eff.attrs[k], adj: state.adj[k] ?? 0, total, maxSpent };
    if (total > CREATION.hardCap) errors.push(`${ATTRS[k]} przekracza limit ${CREATION.hardCap}.`);
    if (total < 1) errors.push(`${ATTRS[k]} spada poniżej 1.`);
  }

  // --- premie rasowe do umiejętności ---
  const raceSkill = {};
  for (const [k, v] of Object.entries(race.skills?.fixed ?? {})) raceSkill[k] = (raceSkill[k] ?? 0) + v;
  const groups = (race.skills?.picks ?? []).map((g, i) => {
    const chosen = state.raceSkills.filter(x => x.startsWith(`${i}:`)).map(x => x.slice(x.indexOf(":") + 1)).filter(k => g.from.includes(k)).slice(0, g.n);
    for (const k of chosen) raceSkill[k] = (raceSkill[k] ?? 0) + g.value;
    if (chosen.length < g.n) errors.push(`Wybierz ${g.n} umiejętności z premią rasową +${g.value} (krok Rasa).`);
    return { ...g, index: i, chosen };
  });
  if (eff.removeLockpickPenalty && (raceSkill.lockpick ?? 0) < 0) raceSkill.lockpick = 0;

  // umiejętności rasowe (Magic / Flight / Dig)
  const known = Object.fromEntries(Object.entries(SKILLS).map(([k, d]) => [k, !d.racial || !!race.manual]));
  let magicAttr = "int";
  for (const [k, r] of Object.entries(race.racial ?? {})) {
    if (k === "magic" && race.zebraNoMagic && state.zebraNoMagic) continue;
    known[k] = true;
    raceSkill[k] = (raceSkill[k] ?? 0) + r.bonus + (eff.racial[k] ?? 0);
    if (k === "magic") magicAttr = r.attrs.includes(state.magicAttr) ? state.magicAttr : r.attrs[0];
  }
  const zebraSplit = race.zebraNoMagic && state.zebraNoMagic
    ? state.zebraSplit.filter(k => !["survival", "unarmed", "sneak", ...RACIAL_SKILLS].includes(k)).slice(0, 2) : [];
  for (const k of zebraSplit) raceSkill[k] = (raceSkill[k] ?? 0) + 5;
  if (race.zebraNoMagic && state.zebraNoMagic && zebraSplit.length < 2) errors.push("Zebra bez magii: wybierz dwie umiejętności po +5 (krok Rasa).");

  // --- umiejętności ---
  const tagLimit = CREATION.tags + eff.tags;
  const tags = state.tags.filter(k => SKILLS[k] && (!SKILLS[k].racial || known[k])).slice(0, tagLimit);
  const skills = {};
  for (const [k, def] of Object.entries(SKILLS)) {
    const attr = k === "magic" ? magicAttr : def.attr;
    const base = baseRank(attrs[attr].total, attrs.luck.total);
    const fromRace = raceSkill[k] ?? 0;
    const fromEff = (eff.skills[k] ?? 0) + (known[k] ? eff.allSkills : 0);
    const extra = Number(state.extra[k]) || 0;
    const bonus = fromRace + fromEff + extra;
    const tag = tags.includes(k);
    const rank = Math.min(100, Math.max(5, base + bonus) + (tag ? CREATION.tagBonus : 0));
    const tn = rank + Math.floor(attrs[attr].total * 10 / 2);
    skills[k] = { key: k, label: def.label, attr, attrLabel: attr.toUpperCase(), racial: !!def.racial, known: known[k], base, fromRace, fromEff, extra, bonus, tag, rank, tn };
  }
  if (tags.length < tagLimit) warnings.push(`Wybrano ${tags.length} z ${tagLimit} umiejętności z tagiem.`);

  const caps = eff.caps ?? CREATION.caps;
  const woundBonus = eff.wound;

  return {
    race, raceKey: state.race, groups, raceAttrs, magicAttr, zebraSplit,
    hindrances: allH, traits: [...autoT.map(t => ({ ...t, cost: 0 })), ...chosenT],
    hindPts, rawTraitCost, credit, traitCost, budget, spentTotal, remaining, pool,
    maxHindrances: maxH, countedHindrances: counted.length,
    attrs, skills, tags, tagLimit,
    caps, woundBonus, carryBonus: eff.carry, speedBonus, karma: eff.karma,
    errors, warnings
  };
}

const SATS = agi => 40 + agi * 5;
const LUCK_CARDS = luck => Math.max(3, Math.ceil(luck / 2) + 2);

/** Zmiany dla aktora i lista przedmiotów-cech na podstawie wyniku computePc. */
export function buildPcUpdate(state, r) {
  const update = {
    "system.race": r.race.manual ? (state.raceName || "") : r.race.label,
    "system.level": 1,
    "system.caps": r.caps,
    "system.karma": r.karma,
    "system.woundBonus": r.woundBonus,
    "system.carryBonus": r.carryBonus,
    "system.speedBonus": r.speedBonus,
    "system.resources.sats.value": SATS(r.attrs.agi.total),
    "system.resources.luck.value": LUCK_CARDS(r.attrs.luck.total),
    "flags.foe-rpg.created": true,
    // jako tekst JSON — zwykły zapis obiektu scalałby się ze starym i nie usuwał odznaczonych cech
    "flags.foe-rpg.creation": JSON.stringify({ ...state, step: 0, filter: "" })
  };
  if (state.name) update.name = state.name;
  for (const [k, a] of Object.entries(r.attrs)) {
    update[`system.attributes.${k}.value`] = Math.max(0, Math.min(12, a.total));
    update[`system.attributes.${k}.mod`] = 0;
  }
  for (const [k, s] of Object.entries(r.skills)) {
    update[`system.skills.${k}.tag`] = s.tag;
    update[`system.skills.${k}.bonus`] = s.bonus;
    update[`system.skills.${k}.points`] = 0;
    update[`system.skills.${k}.mod`] = 0;
    update[`system.skills.${k}.attr`] = s.attr;
    update[`system.skills.${k}.known`] = s.known;
  }

  const items = [];
  const feature = (name, kind, description) => ({ name, type: "feature", system: { kind, description }, flags: { "foe-rpg": { creator: true } } });
  const race = r.race;
  if (!race.manual) {
    const lines = [race.desc, ...(race.notes ?? [])].map(t => `<p>${t}</p>`).join("");
    items.push(feature(`Rasa: ${race.label}`, "other", lines));
  }
  if (race.earthPerk) {
    const p = EARTH_PERKS[state.earthPerk];
    if (p) items.push(feature(p.label, "perk", `<p>Darmowy perk kucyka ziemskiego. ${p.desc}</p>`));
  }
  for (const h of r.hindrances) {
    const d = HINDRANCES[h.key];
    if (d) items.push(feature(d.label, "hindrance", `<p>${d.desc}</p>${h.auto ? "<p><i>Wada rasowa.</i></p>" : ""}`));
  }
  for (const t of r.traits) {
    const d = TRAITS[t.key] ?? t;
    const cost = t.auto ? "darmowa (rasa)" : `${t.cost} pkt`;
    items.push(feature(d.label + (d.cost && d.cost[0] !== d.cost[1] && !t.auto ? ` (${t.cost})` : ""), t.key === "hindLegStance" ? "perk" : "trait", `<p>${d.desc ?? ""}</p><p><i>Koszt: ${cost}.</i></p>`));
  }
  return { update, items };
}

// ---------------------------------------------------------------------------
// NPC
// ---------------------------------------------------------------------------

/** Wylicza NPC z archetypu, rasy i poziomu. */
export function computeNpc({ race: raceKey = "earth", archetype = "raider", level = 1 }) {
  const race = RACES[raceKey] ?? RACES.other;
  const arch = NPC_ARCHETYPES[archetype] ?? NPC_ARCHETYPES.raider;
  const lvl = Math.max(1, Math.min(30, Number(level) || 1));
  const attrs = { ...arch.attrs };

  // premia rasowa do atrybutów, które archetyp ceni najbardziej
  const raceAttrs = [...race.attrs.from].sort((a, b) => attrs[b] - attrs[a]).slice(0, race.attrs.pick);
  for (const k of raceAttrs) attrs[k] = Math.min(12, attrs[k] + 1);

  // umiejętności rasowe
  const known = Object.fromEntries(Object.entries(SKILLS).map(([k, d]) => [k, !d.racial || !!race.manual]));
  const bonus = {};
  for (const [k, v] of Object.entries(race.skills?.fixed ?? {})) bonus[k] = (bonus[k] ?? 0) + v;
  const pref = k => (arch.focus[k] ?? 0) * 100 + (arch.tags.includes(k) ? 50 : 0) + (attrs[SKILLS[k].attr] ?? 0);
  for (const g of race.skills?.picks ?? []) {
    for (const k of [...g.from].sort((a, b) => pref(b) - pref(a)).slice(0, g.n)) bonus[k] = (bonus[k] ?? 0) + g.value;
  }
  let magicAttr = "int";
  for (const [k, r] of Object.entries(race.racial ?? {})) {
    known[k] = true;
    bonus[k] = (bonus[k] ?? 0) + r.bonus;
    if (k === "magic") magicAttr = r.attrs.includes("int") ? "int" : r.attrs[0];
  }

  // tagi: archetyp, a gdy rasa nie ma danej umiejętności — następna z listy priorytetów
  const usable = k => !SKILLS[k].racial || known[k];
  const tags = arch.tags.filter(usable);
  for (const k of Object.keys(arch.focus).sort((a, b) => arch.focus[b] - arch.focus[a])) {
    if (tags.length >= 3) break;
    if (usable(k) && !tags.includes(k)) tags.push(k);
  }

  const attrOf = k => (k === "magic" ? magicAttr : SKILLS[k].attr);
  const rankOf = (k, pts) => Math.min(100, Math.max(5, baseRank(attrs[attrOf(k)], attrs.luck) + (bonus[k] ?? 0)) + (tags.includes(k) ? 15 : 0) + pts);

  // punkty z awansów: 10 + INT/2 na poziom (+1 kucyk ziemski), rozdzielone wg wag archetypu
  const perLevel = 10 + Math.floor(attrs.int / 2) + (race.earthPerk ? 1 : 0);
  let pool = (lvl - 1) * perLevel;
  const points = {};
  const focus = Object.entries(arch.focus).filter(([k]) => usable(k));
  const weightSum = focus.reduce((t, [, w]) => t + w, 0) || 1;
  // gdy umiejętności archetypu dojdą do 100, reszta idzie równo w pozostałe
  const rest = Object.keys(SKILLS).filter(k => usable(k) && !arch.focus[k]).map(k => [k, 1]);
  for (let guard = 0; pool > 0 && guard < 40; guard++) {
    let open = focus.filter(([k]) => rankOf(k, points[k] ?? 0) < 100);
    if (!open.length) open = rest.filter(([k]) => rankOf(k, points[k] ?? 0) < 100);
    if (!open.length) break;
    const ws = open.reduce((t, [, w]) => t + w, 0) || weightSum;
    let given = 0;
    for (const [k, w] of open) {
      const want = Math.max(1, Math.floor(pool * w / ws));
      const room = 100 - rankOf(k, points[k] ?? 0);
      const add = Math.min(want, room, pool - given);
      if (add <= 0) continue;
      points[k] = (points[k] ?? 0) + add;
      given += add;
    }
    pool -= given;
    if (!given) break;
  }

  const skills = Object.fromEntries(Object.entries(SKILLS).map(([k, def]) => {
    const attr = attrOf(k);
    const rank = rankOf(k, points[k] ?? 0);
    return [k, { key: k, label: def.label, attr, attrLabel: attr.toUpperCase(), known: known[k], tag: tags.includes(k), bonus: bonus[k] ?? 0, points: points[k] ?? 0, rank, tn: rank + Math.floor(attrs[attr] * 5) }];
  }));

  const wound = (race.traits ?? []).some(t => t.key === "large") ? 2 : 0;
  return { race, arch, level: lvl, attrs, raceAttrs, skills, tags, magicAttr, perLevel, woundBonus: wound, unspent: pool };
}

/** Zmiany dla aktora NPC. */
export function buildNpcUpdate(opts, r) {
  const update = {
    "system.race": r.race.manual ? "" : r.race.label,
    "system.level": r.level,
    "system.woundBonus": r.woundBonus,
    "system.carryBonus": r.woundBonus ? 20 : 0,
    "system.speedBonus": 0,
    "system.resources.sats.value": SATS(r.attrs.agi),
    "system.resources.luck.value": LUCK_CARDS(r.attrs.luck),
    "flags.foe-rpg.created": true,
    "flags.foe-rpg.npcCreation": JSON.stringify(opts)
  };
  if (opts.name) update.name = opts.name;
  for (const [k, v] of Object.entries(r.attrs)) {
    update[`system.attributes.${k}.value`] = v;
    update[`system.attributes.${k}.mod`] = 0;
  }
  for (const [k, s] of Object.entries(r.skills)) {
    update[`system.skills.${k}.tag`] = s.tag;
    update[`system.skills.${k}.bonus`] = s.bonus;
    update[`system.skills.${k}.points`] = s.points;
    update[`system.skills.${k}.mod`] = 0;
    update[`system.skills.${k}.attr`] = s.attr;
    update[`system.skills.${k}.known`] = s.known;
  }
  const items = [];
  if (!r.race.manual) {
    const lines = [r.race.desc, ...(r.race.notes ?? [])].map(t => `<p>${t}</p>`).join("");
    items.push({ name: `Rasa: ${r.race.label}`, type: "feature", system: { kind: "other", description: lines }, flags: { "foe-rpg": { creator: true } } });
  }
  items.push({ name: `Archetyp: ${r.arch.label}`, type: "feature", system: { kind: "other", description: `<p>NPC poziomu ${r.level} wygenerowany kreatorem.</p>` }, flags: { "foe-rpg": { creator: true } } });
  return { update, items };
}
