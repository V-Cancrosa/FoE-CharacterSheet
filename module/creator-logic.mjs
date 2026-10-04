import { ATTRS, SKILLS } from "./data.mjs";
import { CREATION, RACES, HINDRANCES, TRAITS, EARTH_PERKS, NPC_ARCHETYPES } from "./creation-data.mjs";
import { hits, CREATION_ONLY } from "./effects.mjs";

const ATTR_KEYS = Object.keys(ATTRS);
const RACIAL_SKILLS = Object.entries(SKILLS).filter(([, s]) => s.racial).map(([k]) => k);
const zero = () => Object.fromEntries(ATTR_KEYS.map(k => [k, 0]));
const baseRank = (att, luck) => Math.max(5, 2 * att + Math.floor(luck / 2) + 2);
const num = v => Number(v) || 0;

/** Początkowy stan kreatora postaci gracza. */
export function defaultPcState(name = "") {
  return {
    step: 0,
    name,
    race: "earth",
    raceAttrs: [],
    raceSkills: [],          // wybory z grup „wybierz n” (płaska lista „indeks:klucz”)
    zebraNoMagic: false,
    zebraSplit: [],
    magicAttr: "int",
    earthPerk: "strongBack",
    hindrances: [],
    traits: {},              // klucz → wybrany koszt (dla cech z zakresem kosztu)
    choices: {},             // „h:klucz” / „t:klucz” → { idWyboru: wartość | [wartości] }
    spent: Object.fromEntries(ATTR_KEYS.map(k => [k, 4])),   // 28 punktów: wszystko po 5
    adj: zero(),
    tags: [],
    extra: {},
    filter: ""
  };
}

/** Widoczne wybory cechy/wady i ich poprawne wartości (niewidoczne i nieprawidłowe są pomijane). */
export function choiceState(def, raw = {}) {
  const ch = {}, visible = [], missing = [];
  for (const c of def.choices ?? []) {
    if (c.show && !c.show(ch)) continue;
    const valid = new Set(c.options.map(o => o.v));
    if (c.type === "many") {
      const n = typeof c.pick === "function" ? c.pick(ch) : c.pick;
      const value = (Array.isArray(raw[c.id]) ? raw[c.id] : []).filter(v => valid.has(v)).slice(0, n);
      ch[c.id] = value;
      visible.push({ ...c, n, value });
      if (value.length < n) missing.push(c.label);
    } else {
      const value = valid.has(raw[c.id]) ? raw[c.id] : "";
      ch[c.id] = value;
      visible.push({ ...c, value });
      if (!value) missing.push(c.label);
    }
  }
  return { ch, visible, missing };
}

/** Rozwiązuje cechę/wadę: efekty stałe + zależne od wyborów, koszt, braki. */
export function resolveFeature(kind, key, def, raw = {}, { chosenCost, auto = false } = {}) {
  const { ch, visible, missing } = choiceState(def, raw);
  const fx = [...(def.fx ?? []), ...(def.resolve ? def.resolve(ch) : [])];
  let cost = 0;
  if (kind === "trait" && !auto) {
    const optCost = visible.flatMap(c => c.options.filter(o => o.v === c.value && o.cost != null)).map(o => o.cost);
    const [min, max] = def.cost ?? [1, 1];
    cost = optCost.length ? optCost[0] : Math.min(max, Math.max(min, chosenCost ?? min));
  }
  return { kind, key, def, label: def.label, desc: def.desc, fx, ch, visible, missing, cost, auto };
}

/** Sumuje efekty danego typu trafiające w klucz (do podglądu w kreatorze). */
const fxSum = (list, type, key = "all") => list.filter(e => e.type === type && !e.when && hits(e.target, key)).reduce((t, e) => t + num(e.value), 0);

/**
 * Przelicza cały stan kreatora: budżet punktów, atrybuty, umiejętności, błędy.
 * pool — pula punktów tworzenia z ustawień (domyślnie 35).
 */
export function computePc(state, pool = CREATION.pool) {
  const race = RACES[state.race] ?? RACES.other;
  const errors = [], warnings = [];
  const choices = state.choices ?? {};

  // --- wady: automatyczne z rasy + wybrane ---
  const autoH = race.hindrances ?? [];
  const hList = [
    ...autoH.map(h => ({ ...resolveFeature("hindrance", h.key, HINDRANCES[h.key], choices[`h:${h.key}`] ?? h.choices, { auto: true }), points: h.points !== false, uncounted: !!h.uncounted })),
    ...state.hindrances.filter(k => HINDRANCES[k] && !autoH.some(a => a.key === k))
      .map(k => ({ ...resolveFeature("hindrance", k, HINDRANCES[k], choices[`h:${k}`]), points: true }))
  ];
  const counted = hList.filter(h => !h.uncounted);
  const maxH = race.maxHindrances ?? CREATION.maxHindrances;
  const pointGiving = Math.min(counted.filter(h => h.points).length, maxH);
  let hindPts = pointGiving;
  if (race.hindrancePoints === "half") hindPts = Math.floor(pointGiving / 2);
  if (race.hindrancePoints === "minus2") hindPts = Math.max(0, pointGiving - 2);
  if (counted.length > maxH) warnings.push(`Więcej niż ${maxH} wad — nadmiarowe nie dają punktów.`);
  else if (counted.length > 4 && !race.maxHindrances) warnings.push("Podręcznik zaleca na początek najwyżej 3 wady (powyżej 4 — raczej za cechy niż atrybuty).");

  // --- cechy: automatyczne (darmowe) + wybrane ---
  const autoT = race.traits ?? [];
  const tList = [
    ...autoT.map(t => TRAITS[t.key]
      ? resolveFeature("trait", t.key, TRAITS[t.key], choices[`t:${t.key}`] ?? t.choices, { auto: true })
      : { kind: "perk", key: t.key, label: t.label, desc: t.desc, fx: [], ch: {}, visible: [], missing: [], cost: 0, auto: true }),
    ...Object.keys(state.traits).filter(k => TRAITS[k] && !autoT.some(a => a.key === k))
      .map(k => resolveFeature("trait", k, TRAITS[k], choices[`t:${k}`], { chosenCost: state.traits[k] }))
  ];
  const rawTraitCost = tList.reduce((t, x) => t + x.cost, 0);
  const credit = Math.min(race.freeTraitPoints ?? 0, rawTraitCost);
  const traitCost = rawTraitCost - credit;

  for (const f of [...hList, ...tList]) {
    if (f.missing.length) errors.push(`${f.label}: wybierz ${f.missing.join(", ").toLowerCase()} (krok Wady i cechy).`);
  }
  // cechy dostępne tylko dla wybranych ras / niełączące się z wadą (np. Shadowflash: kucyki nietoperzowe, nie z Young)
  for (const t of tList) {
    const def = TRAITS[t.key];
    if (def?.onlyRaces && !def.onlyRaces.includes(state.race)) warnings.push(`${def.label}: według podręcznika tylko ${def.onlyRaces.map(r => RACES[r]?.label ?? r).join(", ")} — za zgodą MG.`);
    for (const h of def?.notWith ?? []) if ((state.hindrances ?? []).includes(h)) errors.push(`${def.label} nie łączy się z wadą ${h === "young" ? "Young" : h}.`);
  }

  // --- wszystkie efekty: wady, cechy, perk kucyka ziemskiego, rasa ---
  const perk = race.earthPerk ? EARTH_PERKS[state.earthPerk] : null;
  const allFx = [...hList, ...tList].flatMap(f => f.fx).concat(perk?.fx ?? [], race.fx ?? []);

  // --- budżet ---
  const budget = (pool - ATTR_KEYS.length) + hindPts + fxSum(allFx, "creationPoints") - traitCost;
  const spentTotal = ATTR_KEYS.reduce((t, k) => t + num(state.spent[k]), 0);
  const remaining = budget - spentTotal;
  if (remaining < 0) errors.push(`Wydano o ${-remaining} pkt za dużo — odejmij z atrybutów, dodaj wadę albo usuń cechę.`);
  else if (remaining > 0) warnings.push(`Zostało ${remaining} niewydanych punktów.`);

  // --- rasowe atrybuty ---
  const raceAttrs = state.raceAttrs.filter(k => race.attrs.from.includes(k)).slice(0, race.attrs.pick);
  if (raceAttrs.length < race.attrs.pick) errors.push(`Wybierz ${race.attrs.pick === 2 ? "dwa atrybuty" : "atrybut"} z premią rasową (krok Rasa).`);

  const attrs = {};
  for (const k of ATTR_KEYS) {
    const spent = num(state.spent[k]);
    const racial = raceAttrs.includes(k) ? 1 : 0;
    const eff = fxSum(allFx, "attr", k);
    const adj = num(state.adj[k]);
    const base = CREATION.attrStart + spent + racial + adj;    // zapisywane na karcie
    const total = base + eff;                                   // z efektami cech
    const maxSpent = k === "luck" ? CREATION.maxRaiseLuck : CREATION.maxRaise;
    attrs[k] = { key: k, label: ATTRS[k], spent, racial, eff, adj, base, total, maxSpent };
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
  if (tList.some(t => t.def?.removeLockpickPenalty) && (raceSkill.lockpick ?? 0) < 0) raceSkill.lockpick = 0;

  // umiejętności rasowe (Magic / Flight / Dig)
  const known = Object.fromEntries(Object.entries(SKILLS).map(([k, d]) => [k, !d.racial || !!race.manual]));
  let magicAttr = "int";
  for (const [k, r] of Object.entries(race.racial ?? {})) {
    if (k === "magic" && race.zebraNoMagic && state.zebraNoMagic) continue;
    known[k] = true;
    raceSkill[k] = (raceSkill[k] ?? 0) + r.bonus;
    if (k === "magic") magicAttr = r.attrs.includes(state.magicAttr) ? state.magicAttr : r.attrs[0];
  }
  const zebraSplit = race.zebraNoMagic && state.zebraNoMagic
    ? state.zebraSplit.filter(k => !["survival", "unarmed", "sneak", ...RACIAL_SKILLS].includes(k)).slice(0, 2) : [];
  for (const k of zebraSplit) raceSkill[k] = (raceSkill[k] ?? 0) + 5;
  if (race.zebraNoMagic && state.zebraNoMagic && zebraSplit.length < 2) errors.push("Zebra bez magii: wybierz dwie umiejętności po +5 (krok Rasa).");

  // --- umiejętności ---
  const tagLimit = CREATION.tags + fxSum(allFx, "tags");
  const tags = state.tags.filter(k => SKILLS[k] && known[k]).slice(0, tagLimit);
  const skills = {};
  for (const [k, def] of Object.entries(SKILLS)) {
    const attr = k === "magic" ? magicAttr : def.attr;
    const base = baseRank(attrs[attr].total, attrs.luck.total);
    const fromRace = raceSkill[k] ?? 0;
    const fromEff = fxSum(allFx, "skillRank", k);
    const extra = num(state.extra[k]);
    const bonus = fromRace + extra;                    // zapisywane na karcie (efekty liczy karta)
    const tag = tags.includes(k);
    const rank = Math.min(100, Math.max(5, base + bonus + fromEff) + (tag ? CREATION.tagBonus : 0));
    const tn = rank + Math.floor(attrs[attr].total * 10 / 2);
    skills[k] = { key: k, label: def.label, attr, attrLabel: attr.toUpperCase(), racial: !!def.racial, known: known[k], base, fromRace, fromEff, extra, bonus, tag, rank, tn };
  }
  if (tags.length < tagLimit) warnings.push(`Wybrano ${tags.length} z ${tagLimit} umiejętności z tagiem.`);

  const caps = CREATION.caps + fxSum(allFx, "caps");
  const karma = fxSum(allFx, "karma");

  // --- cechy do zapisania na karcie (z efektami) ---
  const features = [];
  if (!race.manual) features.push({ kind: "other", key: "race", label: `Rasa: ${race.label}`, desc: [race.desc, ...(race.notes ?? [])].join(" "), notes: race.notes, fx: race.fx ?? [], auto: true });
  if (perk) features.push({ kind: "perk", key: "earthPerk", label: perk.label, desc: `Darmowy perk kucyka ziemskiego. ${perk.desc}`, fx: perk.fx ?? [], auto: true });
  features.push(...hList, ...tList);

  return {
    race, raceKey: state.race, groups, raceAttrs, magicAttr, zebraSplit,
    hindrances: hList, traits: tList, features, allFx,
    hindPts, rawTraitCost, credit, traitCost, budget, spentTotal, remaining, pool,
    maxHindrances: maxH, countedHindrances: counted.length,
    attrs, skills, tags, tagLimit, caps, karma,
    preview: {
      wound: 10 + fxSum(allFx, "wound"),
      carry: 100 + 10 * attrs.str.total + fxSum(allFx, "carry"),
      sats: 40 + 5 * attrs.agi.total + fxSum(allFx, "sats"),
      luckCards: Math.max(0, Math.max(3, Math.ceil(attrs.luck.total / 2) + 2) + fxSum(allFx, "luckCards"))
    },
    errors, warnings
  };
}

/** Przedmiot-cecha do zapisania na karcie. */
function featureItem(f) {
  const kind = f.kind === "hindrance" ? "hindrance" : f.kind === "trait" ? "trait" : f.kind;
  const picked = (f.visible ?? []).map(c => {
    const vals = Array.isArray(c.value) ? c.value : [c.value];
    return `${c.label}: ${vals.map(v => c.options.find(o => o.v === v)?.label ?? v).join(", ")}`;
  });
  const lines = [f.desc, ...picked, f.auto && f.kind !== "other" && f.key !== "earthPerk" ? "<i>Z rasy.</i>" : "",
    f.kind === "trait" && !f.auto ? `<i>Koszt: ${f.cost} pkt.</i>` : ""].filter(Boolean);
  const label = f.label + (picked.length && f.visible.length === 1 && !Array.isArray(f.visible[0].value)
    ? ` (${f.visible[0].options.find(o => o.v === f.visible[0].value)?.label ?? ""})` : "");
  return {
    name: label,
    type: "feature",
    system: {
      kind, active: true, description: lines.map(t => `<p>${t}</p>`).join(""),
      effects: f.fx.filter(e => !CREATION_ONLY.has(e.type)).map(e => ({ type: e.type, target: e.target, value: e.value, when: e.when ?? "" }))
    },
    flags: { "foe-rpg": { creator: true, source: `${f.kind}:${f.key}` } }
  };
}

const SATS = (agi, bonus = 0) => 40 + agi * 5 + bonus;
const LUCK_CARDS = (luck, bonus = 0) => Math.max(0, Math.max(3, Math.ceil(luck / 2) + 2) + bonus);

/** Zmiany dla aktora i lista przedmiotów-cech na podstawie wyniku computePc. */
export function buildPcUpdate(state, r) {
  const update = {
    "system.race": r.race.manual ? (state.raceName || "") : r.race.label,
    "system.level": 1,
    "system.caps": r.caps,
    "system.karma": r.karma,
    // premie z cech (Large, Young…) liczą teraz efekty cech, więc pola ręczne zerujemy
    "system.woundBonus": 0,
    "system.carryBonus": 0,
    "system.speedBonus": 0,
    "system.resources.sats.value": r.preview.sats,
    "system.resources.luck.value": r.preview.luckCards,
    "flags.foe-rpg.created": true,
    // jako tekst JSON — zwykły zapis obiektu scalałby się ze starym i nie usuwał odznaczonych cech
    "flags.foe-rpg.creation": JSON.stringify({ ...state, step: 0, filter: "" })
  };
  if (state.name) update.name = state.name;
  for (const [k, a] of Object.entries(r.attrs)) {
    update[`system.attributes.${k}.value`] = Math.max(0, Math.min(12, a.base));
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
  return { update, items: r.features.map(featureItem) };
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

  return { race, arch, level: lvl, attrs, raceAttrs, skills, tags, magicAttr, perLevel, unspent: pool };
}

/** Zmiany dla aktora NPC. */
export function buildNpcUpdate(opts, r) {
  const update = {
    "system.race": r.race.manual ? "" : r.race.label,
    "system.level": r.level,
    "system.woundBonus": 0,
    "system.carryBonus": 0,
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
  // rasa i jej darmowe cechy (np. Large) jako przedmioty z efektami
  const feats = [];
  if (!r.race.manual) feats.push({ kind: "other", key: "race", label: `Rasa: ${r.race.label}`, desc: [r.race.desc, ...(r.race.notes ?? [])].join(" "), fx: r.race.fx ?? [], auto: true });
  for (const t of r.race.traits ?? []) {
    if (TRAITS[t.key]) feats.push(resolveFeature("trait", t.key, TRAITS[t.key], t.choices, { auto: true }));
  }
  for (const h of r.race.hindrances ?? []) feats.push(resolveFeature("hindrance", h.key, HINDRANCES[h.key], h.choices, { auto: true }));
  const items = feats.map(featureItem);
  items.push({ name: `Archetyp: ${r.arch.label}`, type: "feature", system: { kind: "other", active: true, effects: [], description: `<p>NPC poziomu ${r.level} wygenerowany kreatorem.</p>` }, flags: { "foe-rpg": { creator: true } } });
  return { update, items };
}
