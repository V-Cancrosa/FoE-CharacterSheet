import { ATTRS, SKILLS } from "./data.mjs";
import { CREATION, RACES, HINDRANCES, TRAITS, EARTH_PERKS, NPC_ARCHETYPES } from "./creation-data.mjs";
import { defaultPcState, computePc, buildPcUpdate, computeNpc, buildNpcUpdate } from "./creator-logic.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;
const P = "systems/foe-rpg/templates/creator";
const STEPS = ["Rasa", "Wady i cechy", "S.P.E.C.I.A.L.", "Umiejętności", "Podsumowanie"];
const readFlag = (actor, key) => {
  try { return JSON.parse(actor.getFlag("foe-rpg", key) || "{}"); } catch { return {}; }
};
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

/** Usuwa przedmioty utworzone wcześniej przez kreator, zapisuje zmiany i dodaje nowe cechy. */
async function applyToActor(actor, update, items) {
  const old = actor.items.filter(i => i.getFlag("foe-rpg", "creator")).map(i => i.id);
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
  await actor.update(update);
  if (items.length) await actor.createEmbeddedDocuments("Item", items);
}

// ===========================================================================
// Kreator postaci gracza
// ===========================================================================
export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.state = { ...defaultPcState(actor.name), ...readFlag(actor, "creation") };
    this.state.step = 0;
  }

  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "foe-creator"],
    position: { width: 900, height: 780 },
    window: { resizable: true, icon: "fa-solid fa-user-plus" },
    actions: {
      goStep: CharacterCreator.#goStep,
      next: CharacterCreator.#next,
      prev: CharacterCreator.#prev,
      toggleRaceAttr: CharacterCreator.#toggleRaceAttr,
      toggleRaceSkill: CharacterCreator.#toggleRaceSkill,
      toggleZebraSplit: CharacterCreator.#toggleZebraSplit,
      toggleHindrance: CharacterCreator.#toggleHindrance,
      toggleTrait: CharacterCreator.#toggleTrait,
      attrPlus: CharacterCreator.#attrPlus,
      attrMinus: CharacterCreator.#attrMinus,
      toggleTag: CharacterCreator.#toggleTag,
      finish: CharacterCreator.#finish
    }
  };

  static PARTS = { body: { template: `${P}/pc.hbs`, scrollable: [".cr-scroll"] } };

  get title() { return `Kreator postaci: ${this.state.name || this.actor.name}`; }

  get pool() {
    try { return Number(game.settings.get("foe-rpg", "creationPool")) || CREATION.pool; } catch { return CREATION.pool; }
  }

  async _prepareContext() {
    const st = this.state;
    const r = computePc(st, this.pool);
    this.result = r;
    const race = r.race;
    const skillLabel = k => SKILLS[k]?.label ?? k;

    const ctx = {
      st, r,
      steps: STEPS.map((label, i) => ({ i, label, n: i + 1, active: i === st.step, done: i < st.step })),
      step: { race: st.step === 0, flaws: st.step === 1, special: st.step === 2, skills: st.step === 3, summary: st.step === 4 },
      isFirst: st.step === 0, isLast: st.step === STEPS.length - 1,
      remainingCls: r.remaining < 0 ? "bad" : r.remaining > 0 ? "warn" : "ok",
      canFinish: r.errors.length === 0,
      overwrite: !!this.actor.getFlag("foe-rpg", "created")
    };

    // --- krok 1: rasa ---
    ctx.races = Object.entries(RACES).map(([k, v]) => ({ k, label: v.label, sel: k === st.race }));
    ctx.raceAttrChips = race.attrs.from.map(k => ({ k, label: ATTRS[k], on: r.raceAttrs.includes(k) }));
    ctx.raceGroups = r.groups.map(g => ({
      n: g.n, value: g.value, chosenCount: g.chosen.length,
      chips: g.from.map(k => ({ key: `${g.index}:${k}`, label: skillLabel(k), on: g.chosen.includes(k) }))
    }));
    ctx.raceFixed = Object.entries(race.skills?.fixed ?? {}).map(([k, v]) => `${skillLabel(k)} ${signed(v)}`).join(", ");
    ctx.racialSkills = Object.entries(race.racial ?? {}).map(([k, v]) => ({
      label: skillLabel(k), bonus: v.bonus, attrs: v.attrs.map(a => a.toUpperCase()).join(" lub "),
      choice: k === "magic" && v.attrs.length > 1 ? v.attrs.map(a => ({ v: a, label: ATTRS[a], sel: a === r.magicAttr })) : null
    }));
    ctx.zebra = race.zebraNoMagic ? {
      on: st.zebraNoMagic,
      chips: Object.entries(SKILLS).filter(([k, s]) => !s.racial && !["survival", "unarmed", "sneak"].includes(k))
        .map(([k, s]) => ({ k, label: s.label, on: r.zebraSplit.includes(k) }))
    } : null;
    ctx.earthPerks = race.earthPerk ? Object.entries(EARTH_PERKS).map(([k, p]) => ({ k, ...p, sel: k === st.earthPerk })) : null;
    ctx.autoTraits = (race.traits ?? []).map(t => TRAITS[t.key]?.label ?? t.label).join(", ");
    ctx.autoHindrances = (race.hindrances ?? []).map(h => HINDRANCES[h.key]?.label + (h.points === false ? " (bez punktu)" : "")).join(", ");
    ctx.hindRule = race.hindrancePoints === "half" ? "1 punkt za każde 2 wady"
      : race.hindrancePoints === "minus2" ? "punkty = liczba wad − 2" : "1 punkt za każdą wadę";

    // --- krok 2: wady i cechy ---
    const autoH = new Set((race.hindrances ?? []).map(h => h.key));
    ctx.hindrances = Object.entries(HINDRANCES).map(([k, h]) => ({
      k, ...h, on: autoH.has(k) || st.hindrances.includes(k), locked: autoH.has(k),
      search: `${h.label} ${h.desc}`.toLowerCase()
    }));
    const autoT = new Set((race.traits ?? []).map(t => t.key));
    ctx.traits = Object.entries(TRAITS).map(([k, t]) => {
      const on = autoT.has(k) || k in st.traits;
      return {
        k, ...t, on, locked: autoT.has(k),
        costLabel: t.cost[0] === t.cost[1] ? `${t.cost[0]}` : `${t.cost[0]}–${t.cost[1]}`,
        range: t.cost[0] !== t.cost[1] && on && !autoT.has(k), min: t.cost[0], max: t.cost[1],
        chosenCost: st.traits[k] ?? t.cost[0],
        search: `${t.label} ${t.desc}`.toLowerCase()
      };
    });

    // --- krok 3: atrybuty ---
    ctx.attrs = Object.values(r.attrs).map(a => ({
      ...a, mfd: a.total * 10, canPlus: a.spent < a.maxSpent && r.remaining > 0, canMinus: a.spent > 0,
      racialLabel: a.racial ? "+1" : "", effLabel: signed(a.eff), bad: a.total > CREATION.hardCap || a.total < 1
    }));

    // --- krok 4: umiejętności ---
    ctx.skills = Object.values(r.skills).map(s => ({
      ...s, raceLabel: signed(s.fromRace), effLabel: signed(s.fromEff),
      canTag: s.known && (s.tag || r.tags.length < r.tagLimit)
    }));

    // --- krok 5: podsumowanie ---
    ctx.summary = {
      race: race.manual ? (st.raceName || "Inna rasa") : race.label,
      attrs: Object.values(r.attrs).map(a => `${a.label.slice(0, 3).toUpperCase()} ${a.total}`).join(" · "),
      tags: r.tags.map(skillLabel).join(", ") || "—",
      hindrances: r.hindrances.map(h => HINDRANCES[h.key]?.label).join(", ") || "—",
      traits: r.traits.map(t => (TRAITS[t.key]?.label ?? t.label) + (t.auto ? " (rasa)" : "")).join(", ") || "—",
      perk: race.earthPerk ? EARTH_PERKS[st.earthPerk]?.label : null,
      sats: 40 + r.attrs.agi.total * 5,
      luckCards: Math.max(3, Math.ceil(r.attrs.luck.total / 2) + 2),
      wound: 10 + r.woundBonus,
      carry: 100 + 10 * r.attrs.str.total + r.carryBonus
    };
    return ctx;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("change", ev => this.#onChange(ev));
    this.element.addEventListener("input", ev => {
      if (ev.target.name !== "filter") return;
      this.state.filter = ev.target.value;
      this.#applyFilter();
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#applyFilter();
  }

  #applyFilter() {
    const q = (this.state.filter || "").trim().toLowerCase();
    for (const row of this.element.querySelectorAll("[data-search]")) row.hidden = !!q && !row.dataset.search.includes(q);
  }

  #onChange(ev) {
    const t = ev.target;
    const name = t.name;
    if (!name || name === "filter") return;
    const st = this.state;
    const v = t.type === "checkbox" ? t.checked : t.value;
    if (name.startsWith("adj.")) st.adj[name.slice(4)] = Number(v) || 0;
    else if (name.startsWith("extra.")) st.extra[name.slice(6)] = Number(v) || 0;
    else if (name.startsWith("traitCost.")) st.traits[name.slice(10)] = Number(v) || 0;
    else if (name === "race") Object.assign(st, { race: v, raceAttrs: [], raceSkills: [], zebraSplit: [], zebraNoMagic: false });
    else st[name] = v;
    this.render();
  }

  // ---- akcje ----
  static #goStep(ev, target) { this.state.step = Number(target.dataset.step); this.render(); }
  static #next() { this.state.step = Math.min(STEPS.length - 1, this.state.step + 1); this.render(); }
  static #prev() { this.state.step = Math.max(0, this.state.step - 1); this.render(); }

  static #toggleRaceAttr(ev, target) {
    const k = target.dataset.key, st = this.state, n = RACES[st.race].attrs.pick;
    if (st.raceAttrs.includes(k)) st.raceAttrs = st.raceAttrs.filter(x => x !== k);
    else st.raceAttrs = [...st.raceAttrs, k].slice(-n);
    this.render();
  }

  static #toggleRaceSkill(ev, target) {
    const key = target.dataset.key, st = this.state;
    const g = Number(key.split(":")[0]);
    const n = RACES[st.race].skills.picks[g].n;
    if (st.raceSkills.includes(key)) st.raceSkills = st.raceSkills.filter(x => x !== key);
    else {
      const same = st.raceSkills.filter(x => x.startsWith(`${g}:`));
      const keep = same.length >= n ? same.slice(1) : same;
      st.raceSkills = [...st.raceSkills.filter(x => !x.startsWith(`${g}:`)), ...keep, key];
    }
    this.render();
  }

  static #toggleZebraSplit(ev, target) {
    const k = target.dataset.key, st = this.state;
    st.zebraSplit = st.zebraSplit.includes(k) ? st.zebraSplit.filter(x => x !== k) : [...st.zebraSplit, k].slice(-2);
    this.render();
  }

  static #toggleHindrance(ev, target) {
    const k = target.dataset.key, st = this.state;
    st.hindrances = st.hindrances.includes(k) ? st.hindrances.filter(x => x !== k) : [...st.hindrances, k];
    this.render();
  }

  static #toggleTrait(ev, target) {
    const k = target.dataset.key, st = this.state;
    if (k in st.traits) delete st.traits[k];
    else st.traits[k] = TRAITS[k].cost[0];
    this.render();
  }

  static #attrPlus(ev, target) {
    const a = this.result.attrs[target.dataset.key];
    if (a.spent < a.maxSpent && this.result.remaining > 0) this.state.spent[a.key] = a.spent + 1;
    this.render();
  }

  static #attrMinus(ev, target) {
    const k = target.dataset.key;
    this.state.spent[k] = Math.max(0, (this.state.spent[k] ?? 0) - 1);
    this.render();
  }

  static #toggleTag(ev, target) {
    const k = target.dataset.key, st = this.state, r = this.result;
    if (st.tags.includes(k)) st.tags = st.tags.filter(x => x !== k);
    else if (r.tags.length < r.tagLimit && r.skills[k]?.known) st.tags = [...r.tags, k];
    this.render();
  }

  static async #finish() {
    const r = computePc(this.state, this.pool);
    if (r.errors.length) return ui.notifications.warn(r.errors[0]);
    if (this.actor.getFlag("foe-rpg", "created")) {
      const ok = await DialogV2.confirm({
        window: { title: "Nadpisać postać?" },
        content: "<p>Kreator nadpisze atrybuty, umiejętności i cechy dodane wcześniej przez kreator. Przedmioty i notatki zostaną.</p>"
      });
      if (!ok) return;
    }
    const { update, items } = buildPcUpdate(this.state, r);
    await applyToActor(this.actor, update, items);
    ui.notifications.info(`${this.actor.name}: postać gotowa.`);
    this.close();
    this.actor.sheet?.render(true);
  }
}

// ===========================================================================
// Kreator NPC — archetyp + rasa + poziom
// ===========================================================================
export class NpcCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.state = { name: actor.name, race: "earth", archetype: "raider", level: 1, ...readFlag(actor, "npcCreation") };
  }

  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "foe-creator", "npc"],
    position: { width: 720, height: 720 },
    window: { resizable: true, icon: "fa-solid fa-user-secret" },
    actions: { finish: NpcCreator.#finish }
  };

  static PARTS = { body: { template: `${P}/npc.hbs`, scrollable: [".cr-scroll"] } };

  get title() { return `Kreator NPC: ${this.state.name || this.actor.name}`; }

  async _prepareContext() {
    const st = this.state;
    const r = computeNpc(st);
    return {
      st, r,
      races: Object.entries(RACES).map(([k, v]) => ({ k, label: v.label, sel: k === st.race })),
      archetypes: Object.entries(NPC_ARCHETYPES).map(([k, v]) => ({ k, label: v.label, sel: k === st.archetype })),
      attrs: Object.entries(r.attrs).map(([k, v]) => ({ k, label: ATTRS[k], short: k.toUpperCase(), v, racial: r.raceAttrs.includes(k), mfd: v * 10 })),
      skills: Object.values(r.skills).filter(s => s.known).sort((a, b) => b.rank - a.rank),
      levelPoints: (r.level - 1) * r.perLevel
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("change", ev => {
      const { name, value } = ev.target;
      if (!name) return;
      this.state[name] = name === "level" ? Math.max(1, Math.min(30, Number(value) || 1)) : value;
      this.render();
    });
  }

  static async #finish() {
    const r = computeNpc(this.state);
    if (this.actor.getFlag("foe-rpg", "created")) {
      const ok = await DialogV2.confirm({
        window: { title: "Nadpisać NPC?" },
        content: "<p>Kreator nadpisze atrybuty i umiejętności tego NPC.</p>"
      });
      if (!ok) return;
    }
    const { update, items } = buildNpcUpdate(this.state, r);
    await applyToActor(this.actor, update, items);
    ui.notifications.info(`${this.actor.name}: NPC gotowy.`);
    this.close();
    this.actor.sheet?.render(true);
  }
}

/** Otwiera właściwy kreator dla aktora. */
export function openCreator(actor) {
  const App = actor.type === "npc" ? NpcCreator : CharacterCreator;
  const existing = foundry.applications.instances?.get(`foe-creator-${actor.id}`);
  if (existing) return existing.bringToFront?.() ?? existing.render(true);
  return new App(actor, { id: `foe-creator-${actor.id}` }).render(true);
}
