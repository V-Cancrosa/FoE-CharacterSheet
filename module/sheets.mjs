import { ATTRS, SKILLS, LOCATIONS, ARMOR_CATEGORIES, GEAR_CATEGORIES } from "./data.mjs";
import { promptMfd, rollTest, rollDamage } from "./rolls.mjs";
import { attackWithWeapon, reloadWeapon } from "./attack.mjs";
import { rollContext, describeFx, shortFx, FX_TYPES, signed } from "./effects.mjs";
import { openCreator } from "./creator.mjs";
import { openCatalog } from "./catalog.mjs";
import { WEAPON_KINDS } from "./catalog-data.mjs";
import { LAYER_CATEGORIES, reloadInfo, rangeIncrement, overloadSpeed, SPECIALS, POISONS, specialList } from "./combat.mjs";
import { conditionRows, clearCondition, extinguish, resistParalysis, endOfRound } from "./conditions.mjs";
import { castSpell, endMaintained, spellLimits, COST_LABELS } from "./magic.mjs";
import { RARITY, MODES, modesOf, ingredientStock, prepareRecipe, castRitual, useProduct, searchIngredients, startingRecipes } from "./zebra.mjs";
import { performManeuver, rollFall, grantStartingManeuvers, maneuverLimits, maneuverCounts, isWeatherManeuver, MFD_LABEL, RANK_FOR_LEVEL } from "./flight.mjs";
import { currentWeather, weatherSummary } from "./weather.mjs";
import { levelUp, undoLevelUp, promptAwardXp, xpFor, xpProgression } from "./perks.mjs";
import { useChem, endChem, cureAddiction, chemRows } from "./chems.mjs";
import { useHealItem, rest, setLimb, HEAL_KINDS } from "./healing.mjs";
import { rollActorInitiative } from "./tracker.mjs";
import { radLevel } from "./body.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const P = "systems/foe-rpg/templates";

const STATUS = { ok: "", wounded: "ranna", crippled: "OKALECZONA", maimed: "UTRACONA", dead: "ŚMIERĆ" };
const SHORT = { head: "głowa", torso: "tułów", flLeg: "PL", frLeg: "PP", rlLeg: "TL", rrLeg: "TP", wings: "skrzydła", horn: "róg" };
const SHORT_ATTR = { str: "STR", per: "PER", end: "END", cha: "CHA", int: "INT", agi: "AGI", luck: "LCK" };
const shortLabels = () => ({
  ...SHORT_ATTR, ...Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label.split(" / ").pop()])), ...LOCATIONS,
  all: "wszystko", attack: "ataki", melee: "wręcz", ranged: "dystans", ground: "ląd", fly: "lot"
});
const fxLabels = () => ({
  all: "wszystko", ...ATTRS, ...Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label])), ...LOCATIONS,
  ranged: "broń dystansowa", melee: "wręcz", attack: "ataki", ground: "ląd", fly: "lot"
});

/** Krótki opis osłony pancerza, np. „tułów, 4 nogi”. */
export function coverText(cover = {}) {
  const has = k => !!cover[k];
  const legs = ["flLeg", "frLeg", "rlLeg", "rrLeg"].filter(has);
  const parts = [];
  if (has("head")) parts.push("głowa");
  if (has("torso")) parts.push("tułów");
  if (legs.length === 4) parts.push("4 nogi");
  else if (legs.length) parts.push(legs.map(k => SHORT[k]).join("+"));
  if (has("wings")) parts.push("skrzydła");
  if (has("horn")) parts.push("róg");
  return parts.join(", ") || "—";
}

export class FoeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "actor"],
    position: { width: 940, height: 860 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAttr: FoeActorSheet.#onRollAttr,
      rollSkill: FoeActorSheet.#onRollSkill,
      rollWeapon: FoeActorSheet.#onRollWeapon,
      rollDamage: FoeActorSheet.#onRollDamage,
      reload: FoeActorSheet.#onReload,
      createItem: FoeActorSheet.#onCreateItem,
      editItem: FoeActorSheet.#onEditItem,
      deleteItem: FoeActorSheet.#onDeleteItem,
      newSession: FoeActorSheet.#onNewSession,
      openCreator: FoeActorSheet.#onOpenCreator,
      openCatalog: FoeActorSheet.#onOpenCatalog,
      toggleFeature: FoeActorSheet.#onToggleFeature,
      toggleEquip: FoeActorSheet.#onToggleEquip,
      clearCondition: FoeActorSheet.#onClearCondition,
      extinguish: FoeActorSheet.#onExtinguish,
      resistParalysis: FoeActorSheet.#onResistParalysis,
      endRound: FoeActorSheet.#onEndRound,
      castSpell: FoeActorSheet.#onCastSpell,
      endMaintain: FoeActorSheet.#onEndMaintain,
      clearBurnout: FoeActorSheet.#onClearBurnout,
      strainRest: FoeActorSheet.#onStrainRest,
      prepareRecipe: FoeActorSheet.#onPrepareRecipe,
      castRitual: FoeActorSheet.#onCastRitual,
      useProduct: FoeActorSheet.#onUseProduct,
      searchIngredients: FoeActorSheet.#onSearchIngredients,
      performManeuver: FoeActorSheet.#onPerformManeuver,
      rollFall: FoeActorSheet.#onRollFall,
      startManeuvers: FoeActorSheet.#onStartManeuvers,
      levelUp: FoeActorSheet.#onLevelUp,
      undoLevel: FoeActorSheet.#onUndoLevel,
      awardXp: FoeActorSheet.#onAwardXp,
      rollInitiative: FoeActorSheet.#onRollInitiative,
      endChem: FoeActorSheet.#onEndChem,
      cureAddiction: FoeActorSheet.#onCureAddiction,
      rest: FoeActorSheet.#onRest,
      setLimb: FoeActorSheet.#onSetLimb,
      qty: FoeActorSheet.#onQty
    }
  };

  static PARTS = {
    header: { template: `${P}/actor/header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${P}/actor/main.hbs`, scrollable: [""] },
    combat: { template: `${P}/actor/combat.hbs`, scrollable: [""] },
    gear: { template: `${P}/actor/gear.hbs`, scrollable: [""] },
    magic: { template: `${P}/actor/magic.hbs`, scrollable: [""] },
    notes: { template: `${P}/actor/notes.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "Statystyki" },
        { id: "combat", label: "Walka" },
        { id: "gear", label: "Ekwipunek" },
        { id: "magic", label: "Magia i lot" },
        { id: "notes", label: "Cechy i dane" }
      ],
      initial: "main"
    }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const sys = this.document.system;
    ctx.actor = this.document;
    ctx.system = sys;
    ctx.tabs = this._prepareTabs("primary");
    ctx.isNpc = this.document.type === "npc";
    ctx.digSpeed = sys.skills.dig?.known !== false;
    const prog = xpProgression();
    const xpNext = prog === "none" ? null : xpFor(sys.level + 1, prog);
    ctx.adv = {
      useXp: prog !== "none", xp: sys.xp ?? 0, next: xpNext, ready: xpNext !== null && (sys.xp ?? 0) >= xpNext,
      canUndo: (this.document.getFlag("foe-rpg", "levelLog") ?? []).length > 0
    };
    const pct = (v, m) => (m > 0 ? Math.max(0, Math.min(100, Math.round(100 * v / m))) : 0);
    const res = sys.resources;
    ctx.meters = {
      sats: pct(res.sats.value, res.sats.max),
      luck: pct(res.luck.value, res.luck.max),
      strain: pct(res.strain.value, sys.strainMax ?? res.strain.max),
      rads: pct(res.rads.value, res.rads.max)
    };
    const tip = list => list?.length ? list.join("\n") : "";
    ctx.attrs = Object.entries(ATTRS).map(([k, label]) => {
      const a = sys.attributes[k];
      return {
        key: k, label, letter: label[0], rest: label.slice(1), ...a,
        q3: Math.floor(a.tn * .75), q2: Math.floor(a.tn / 2), q1: Math.floor(a.tn / 4),
        fxLabel: a.fx ? signed(a.fx) : "", fxTip: tip(a.fxSources),
        tempLabel: a.temp ? signed(a.temp) : "", tempTip: tip(a.tempSources),
        rollLabel: a.fxRoll ? signed(a.fxRoll) : "", rollTip: tip(a.fxRollSources)
      };
    });
    ctx.skills = Object.entries(SKILLS).filter(([k]) => sys.skills[k].known !== false).map(([k, def]) => {
      const s = sys.skills[k];
      const m = s.rollMod ?? s.mod;
      return {
        key: k, label: def.label, racial: def.racial, ...s,
        attrLabel: s.attr.toUpperCase(),
        attrChoices: def.choice ? def.choice.map(c => ({ v: c, upper: c.toUpperCase(), sel: c === s.attr })) : null,
        tnShown: s.tn + m, q3: Math.floor(s.tn * .75) + m, q2: Math.floor(s.tn / 2) + m, q1: Math.floor(s.tn / 4) + m,
        rankFx: s.fxRank ? signed(s.fxRank) : "", rankTip: tip(s.fxRankSources),
        rollFx: s.fxRoll ? signed(s.fxRoll) : "", rollTip: tip(s.fxRollSources),
        tempFx: s.temp ? signed(s.temp) : ""
      };
    });
    ctx.locations = Object.entries(LOCATIONS).map(([k, label]) => {
      const l = sys.locations[k];
      return { key: k, label, ...l, statusLabel: STATUS[l.status] ?? "", dtFxLabel: l.dtFx ? signed(l.dtFx) : "" };
    });
    ctx.endT = sys.attributes.end.total;
    ctx.crippleAt = Math.max(1, Math.ceil(ctx.endT / 2));
    ctx.conditions = conditionRows(this.document);
    const rads = sys.resources.rads.value || 0;
    const rl = radLevel(rads);
    ctx.body = { ...chemRows(this.document), rad: rl ? rl.label : "", radFx: rl ? Object.entries(rl.fx).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(", ") : "" };
    ctx.body.any = ctx.body.active.length || ctx.body.addictions.length || ctx.body.rad;
    // Magia
    const spells = this.document.items.filter(i => i.type === "spell" && (i.system.tradition ?? "unicorn") === "unicorn");
    const recipes = this.document.items.filter(i => i.type === "spell" && i.system.tradition === "zebra");
    const lim = spellLimits(this.document);
    const held = new Set((sys.maintained ?? []).map(m => m.id));
    ctx.magic = {
      caster: sys.caster, burnout: sys.burnout, alicorn: sys.alicorn,
      strain: sys.resources.strain.value, strainMax: sys.strainMax,
      tn: sys.skills.magic?.tn ?? 0, rank: sys.skills.magic?.rank ?? 0,
      maintained: (sys.maintained ?? []).map(m => ({ ...m, perRound: (m.cost || 0) + (m.layers || 0) })),
      levels: [0, 1, 2, 3, 4].map(l => {
        const list = spells.filter(i => (i.system.level ?? 1) === l).sort((a, b) => a.name.localeCompare(b.name));
        const max = lim[l];
        return {
          level: l, count: list.length, limit: max === undefined || max === Infinity ? "" : max, over: max !== undefined && list.length > max,
          spells: list.map(i => ({
            id: i.id, name: i.name, img: i.img, ...i.system, held: held.has(i.id),
            costLabel: COST_LABELS[i.system.cost] ?? i.system.cost,
            tags: [i.system.targeted ? "celowane" : "", i.system.maintained ? "podtrzymywane" : "", i.system.damage ? `obr. ${i.system.damage}` : ""].filter(Boolean)
          }))
        };
      }).filter(g => g.count || g.level <= 1)
    };
    // Lot i manewry (s. 379–394)
    const w = currentWeather();
    ctx.weather = { label: w.label, summary: weatherSummary(w) };
    const mans = this.document.items.filter(i => i.type === "spell" && i.system.tradition === "flight");
    const mlim = maneuverLimits(this.document);
    const mcnt = maneuverCounts(this.document);
    const TAG = { dodge: "unik powietrzny", block: "blok powietrzny" };
    ctx.flight = {
      flier: sys.flier, canFly: sys.canFly, note: sys.flyNote, speed: sys.flySpeed, altitude: sys.altitude,
      rank: mlim.rank, tn: sys.skills.flight?.tn ?? 0, total: mlim.total, known: mcnt.total, over: mcnt.total > mlim.total,
      load: sys.flightLoad, weather: ctx.weather,
      levels: [0, 1, 2, 3, 4].map(l => {
        const list = mans.filter(i => i.system.level === l).sort((a, b) => a.name.localeCompare(b.name));
        const cap = mlim.byLevel[l];
        return {
          level: l, rankReq: RANK_FOR_LEVEL[l], locked: l > mlim.maxLevel, count: mcnt.per[l] ?? list.length, limit: cap ?? "",
          over: cap !== undefined && (mcnt.per[l] ?? 0) > cap,
          list: list.map(i => ({
            id: i.id, name: i.name, img: i.img,
            mfd: i.system.kind === "passive" ? "zawsze" : i.system.kind === "variable" ? "zmienne" : `MFD ${MFD_LABEL[i.system.mfd] ?? i.system.mfd}`,
            actions: i.system.kind === "passive" ? "—" : i.system.actions ? `${i.system.actions} ak.` : "bez akcji", learned: i.system.learned || i.system.kind === "passive",
            attempts: i.system.attempts, attemptsMax: sys.level,
            tags: [i.system.kind === "passive" ? "pasywny" : i.system.kind === "variable" ? "zmienne MFD" : i.system.kind === "special" ? "specjalny" : "",
              TAG[i.system.tag] ?? "", isWeatherManeuver(i.name) ? "pogoda" : "", i.system.requires ? i.system.requires.replace(/^Requires/i, "wymaga") : ""].filter(Boolean)
          }))
        };
      }).filter(g => g.list.length)
    };
    ctx.flight.empty = !mans.length;
    const stock = ingredientStock(this.document);
    ctx.zebra = {
      mage: sys.zebraMage || recipes.length > 0,
      tn: sys.skills.magic?.tn ?? 0, rank: sys.skills.magic?.rank ?? 0,
      perPrep: `1d4+1${Math.floor((sys.skills.magic?.rank ?? 0) / 25) ? ` − ${Math.floor((sys.skills.magic?.rank ?? 0) / 25)}` : ""}`,
      start: startingRecipes(this.document),
      stock: Object.entries(RARITY).map(([k, label]) => ({ label, n: stock[k] })),
      recipes: recipes.sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name)).map(i => ({
        id: i.id, name: i.name, img: i.img, level: i.system.level, school: i.system.school, special: i.system.special,
        rarityLabel: RARITY[i.system.rarity] ?? "—", damage: i.system.damage,
        modes: modesOf(i.system.usage).map(m => ({ key: m, label: MODES[m].short, tip: MODES[m].label, ritual: m === "Cast" }))
      }))
    };
    ctx.stateFx = (sys.stateFx ?? []).map(e => `${e.source} — ${shortFx(e, shortLabels())}`);

    const items = this.document.items;
    const str = sys.attributes.str.total;
    ctx.weapons = items.filter(i => i.type === "weapon").map(i => {
      const w = i.system;
      const inc = rangeIncrement(w, str);
      return {
        id: i.id, name: i.name, img: i.img, ...w,
        skillLabel: SKILLS[w.skill]?.label ?? w.skill,
        burst: w.shots > 1 ? w.shots : 0,
        reloadLabel: w.reload ? `${w.reload}: ${reloadInfo(w.reload, { energy: w.skill === "energy" }).ap} AP w SATS` : "przeładuj",
        rangeLabel: inc ? `${inc} ft` : w.range || "wręcz",
        tags: specialList(w.specials).map(k => ({
          label: k === "fire" && w.specials.fire === "crit" ? "Ogień (kryt.)" : k === "disintegrate" && w.specials.disintegrate === "crit" ? "Dezintegracja (kryt.)" : SPECIALS[k].label,
          tip: k === "poison" ? POISONS[w.specials.poison] : SPECIALS[k].desc
        })),
        rangeTip: inc && !w.rangeInc ? `${w.range} przy STR ${str}` : ""
      };
    });

    const labels = fxLabels();
    const short = shortLabels();
    ctx.armor = items.filter(i => i.type === "armor").map(i => {
      const a = i.system;
      const wear = Object.values(a.wear ?? {}).reduce((t, v) => t + (v || 0), 0);
      return {
        id: i.id, name: i.name, img: i.img, ...a,
        categoryLabel: ARMOR_CATEGORIES[a.category] ?? a.category,
        coverText: coverText(a.cover),
        wearText: wear ? Object.entries(a.wear).filter(([, v]) => v).map(([k, v]) => `${SHORT[k]} −${v}`).join(", ") : "",
        fxText: (a.effects ?? []).filter(e => FX_TYPES[e.type]).map(e => shortFx(e, short)).join(", ")
      };
    });
    const layers = sys.armorLayers ?? { count: 0 };
    ctx.layers = { ...layers, names: (layers.names ?? []).join(", "), warn: layers.count > 1 };

    const groups = new Map();
    for (const i of items.filter(x => x.type === "gear")) {
      const cat = GEAR_CATEGORIES[i.system.category] ? i.system.category : "misc";
      if (!groups.has(cat)) groups.set(cat, []);
      const w = Number(i.system.weight) || 0;
      groups.get(cat).push({
        id: i.id, name: i.name, img: i.img, qty: i.system.qty, ammoType: i.system.ammoType,
        usable: ["potion", "talisman", "drug", "medical"].includes(cat),
        useLabel: cat === "medical" ? `${HEAL_KINDS[i.system.heal]?.label ?? "Leczenie"} — na siebie albo namierzony cel` : cat === "drug" ? "Zażyj (efekt, czas działania, rzut na uzależnienie)" : MODES[i.system.usage]?.label ?? "Użyj",
        charges: /talisman/i.test(i.system.heal ?? "") ? i.system.charges : null,
        weightLabel: cat === "ammo" ? "—" : w ? `${Math.round(w * (i.system.qty || 0) * 10) / 10} lb` : "",
        notes: String(i.system.description ?? "").replace(/<[^>]+>/g, "").slice(0, 300)
      });
    }
    ctx.gearGroups = Object.entries(GEAR_CATEGORIES).filter(([k]) => groups.has(k)).map(([k, label]) => ({ key: k, label, items: groups.get(k) }));
    ctx.overSpeed = overloadSpeed(sys.weight, sys.carry);

    const kinds = { trait: "Cecha", hindrance: "Wada", perk: "Perk", spell: "Zaklęcie", other: "Inne" };
    ctx.features = items.filter(i => i.type === "feature").map(i => ({
      id: i.id, name: i.name, system: i.system, kindLabel: kinds[i.system.kind] ?? i.system.kind,
      active: i.system.active !== false,
      fx: (i.system.effects ?? []).filter(e => FX_TYPES[e.type]).map(e => ({ text: describeFx(e, labels), when: !!e.when }))
    }));
    const fx = sys.fx ?? {};
    ctx.extra = {
      dodge: fx.dodge ? signed(fx.dodge) : "", dodgeTip: tip(fx.dodgeSources),
      crit: sys.critRange ?? { success: 5, fail: 5 },
      critFailFrom: 101 - (sys.critRange?.fail ?? 5),
      strainBonus: sys.strainBonus ? signed(sys.strainBonus) : "",
      damage: fx.damage ? signed(fx.damage) : "",
      initFx: sys.initFx > 0 ? `− ${sys.initFx} (cechy)` : sys.initFx < 0 ? `+ ${-sys.initFx} (cechy)` : ""
    };
    ctx.weight = sys.weight;
    ctx.notesHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.notes, { relativeTo: this.document });
    return ctx;
  }

  async _preparePartContext(partId, ctx) {
    ctx.tab = ctx.tabs?.[partId];
    return ctx;
  }

  #item(target) {
    return this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  // ---- akcje ----
  static async #onRollAttr(event, target) {
    const k = target.dataset.key;
    const a = this.document.system.attributes[k];
    const rc = rollContext(this.document, { kind: "attr", attr: k });
    const r = await promptMfd(`${ATTRS[k]} (×10)`, a.tn, rc);
    if (r) rollTest(this.document, { label: ATTRS[k], baseTn: a.tn, ...r });
  }

  static async #onRollSkill(event, target) {
    const k = target.dataset.key;
    const s = this.document.system.skills[k];
    const rc = rollContext(this.document, { kind: "skill", skill: k, skillAttr: s.attr }, { manualMod: s.mod });
    const r = await promptMfd(SKILLS[k].label, s.tn, rc);
    if (r) rollTest(this.document, { label: SKILLS[k].label, baseTn: s.tn, ...r });
  }

  static async #onRollWeapon(event, target) {
    const item = this.#item(target);
    if (item) await attackWithWeapon(this.document, item);
  }

  static async #onRollDamage(event, target) {
    const item = this.#item(target);
    if (item) rollDamage(this.document, item, { crit: event.shiftKey });   // Shift+klik = krytyk
  }

  static async #onReload(event, target) {
    const item = this.#item(target);
    if (item) await reloadWeapon(this.document, item);
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const names = { weapon: "Nowa broń", armor: "Nowy pancerz", gear: "Nowy przedmiot", feature: "Nowa cecha" };
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name: names[type], type }]);
    item?.sheet.render(true);
  }

  static #onEditItem(event, target) {
    this.#item(target)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const item = this.#item(target);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Usuń przedmiot" }, content: `<p>Usunąć <b>${foundry.utils.escapeHTML(item.name)}</b>?</p>`
    });
    if (ok) item.delete();
  }

  static #onToggleFeature(event, target) {
    const item = this.#item(target);
    item?.update({ "system.active": item.system.active === false });
  }

  /** Zakładanie pancerza: jedna warstwa z kategorii i jeden hełm — poprzedni z tej kategorii zostaje zdjęty. */
  static async #onToggleEquip(event, target) {
    const item = this.#item(target);
    if (!item) return;
    const on = !item.system.equipped;
    const updates = [{ _id: item.id, "system.equipped": on }];
    const cat = item.system.category;
    if (on && (LAYER_CATEGORIES.includes(cat) || cat === "helmet")) {
      const off = this.document.items.filter(i => i.type === "armor" && i.id !== item.id && i.system.equipped && i.system.category === cat);
      for (const i of off) updates.push({ _id: i.id, "system.equipped": false });
      if (off.length) ui.notifications.info(`Zdjęto: ${off.map(i => i.name).join(", ")} — z jednej kategorii zakłada się jedną warstwę.`);
    }
    await this.document.updateEmbeddedDocuments("Item", updates);
  }

  static async #onQty(event, target) {
    const item = this.#item(target);
    if (!item) return;
    const d = Number(target.dataset.d) || 0;
    await item.update({ "system.qty": Math.max(0, (Number(item.system.qty) || 0) + (event.shiftKey ? d * 10 : d)) });
  }

  static async #onClearCondition(event, target) {
    await clearCondition(this.document, target.closest("[data-cond]").dataset.cond);
  }

  static async #onExtinguish() {
    await extinguish(this.document);
  }

  static async #onResistParalysis() {
    await resistParalysis(this.document);
  }

  static async #onEndRound() {
    if (!(await endOfRound(this.document))) ui.notifications.info("Brak stanów działających na koniec rundy.");
  }

  static async #onCastSpell(event, target) {
    const item = this.#item(target);
    if (item) await castSpell(this.document, item);
  }

  static async #onEndMaintain(event, target) {
    await endMaintained(this.document, target.dataset.id);
  }

  static async #onClearBurnout() {
    await this.document.unsetFlag("foe-rpg", "burnout");
  }

  /** Odpoczynek: +1 strain za każdą godzinę (Shift: do pełna). */
  static async #onStrainRest(event) {
    const sys = this.document.system;
    const v = event.shiftKey ? sys.strainMax : Math.min(sys.strainMax, sys.resources.strain.value + 1);
    await this.document.update({ "system.resources.strain.value": v });
  }

  static async #onPrepareRecipe(event, target) {
    const item = this.#item(target);
    if (item) await prepareRecipe(this.document, item, target.dataset.mode);
  }

  static async #onCastRitual(event, target) {
    const item = this.#item(target);
    if (item) await castRitual(this.document, item);
  }

  static async #onUseProduct(event, target) {
    const item = this.#item(target);
    if (!item) return;
    if (item.system.category === "drug") return useChem(this.document, item);
    if (item.system.category === "medical") return useHealItem(this.document, item);
    await useProduct(this.document, item);
  }

  static async #onRollInitiative() {
    await rollActorInitiative(this.document);
  }

  static async #onEndChem(event, target) {
    await endChem(this.document, target.closest("[data-chem]").dataset.chem);
  }

  static async #onCureAddiction(event, target) {
    await cureAddiction(this.document, target.closest("[data-group]").dataset.group);
  }

  static async #onRest() {
    await rest(this.document);
  }

  static async #onSetLimb() {
    await setLimb(this.document);
  }

  static async #onPerformManeuver(event, target) {
    const item = this.#item(target);
    if (item) await performManeuver(this.document, item);
  }

  static async #onRollFall() {
    await rollFall(this.document);
  }

  static async #onLevelUp() {
    await levelUp(this.document);
  }

  static async #onUndoLevel() {
    await undoLevelUp(this.document);
  }

  static async #onAwardXp() {
    await promptAwardXp(this.document);
  }

  static async #onStartManeuvers() {
    await grantStartingManeuvers(this.document);
  }

  static async #onSearchIngredients() {
    await searchIngredients(this.document);
  }

  static #onOpenCreator() {
    openCreator(this.document);
  }

  static #onOpenCatalog(event, target) {
    openCatalog(this.document, target.dataset.tab || "weapons");
  }

  static async #onNewSession() {
    const sys = this.document.system;
    await this.document.update({
      "system.resources.luck.value": sys.resources.luck.max,
      "system.resources.sats.value": sys.resources.sats.max
    });
    ui.notifications.info(`${this.document.name}: karty szczęścia i SATS odnowione.`);
  }
}

export class FoeItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "item"],
    position: { width: 580, height: 680 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addFx: FoeItemSheet.#onAddFx,
      removeFx: FoeItemSheet.#onRemoveFx
    }
  };
  static PARTS = { body: { template: `${P}/item/item.hbs` } };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const sys = this.document.system;
    ctx.item = this.document;
    ctx.system = sys;
    ctx.isWeapon = this.document.type === "weapon";
    ctx.isArmor = this.document.type === "armor";
    ctx.isGear = this.document.type === "gear";
    ctx.isFeature = this.document.type === "feature";
    ctx.isSpell = this.document.type === "spell";
    ctx.isRecipe = ctx.isSpell && sys.tradition === "zebra";
    ctx.isManeuver = ctx.isSpell && sys.tradition === "flight";
    ctx.mfdSteps = MFD_LABEL;
    ctx.maneuverKinds = { active: "Aktywny (rzut Flight)", passive: "Pasywny (zawsze działa)", variable: "Zmienne MFD", special: "Specjalny" };
    ctx.maneuverTags = { "": "—", dodge: "Unik powietrzny", block: "Blok powietrzny" };
    ctx.isUnicorn = ctx.isSpell && !ctx.isRecipe && !ctx.isManeuver;
    ctx.traditions = { unicorn: "Jednorożce / alikorny", zebra: "Zebry (receptura)", flight: "Lot (manewr)" };
    ctx.rarities = RARITY;
    ctx.zebraGear = ctx.isGear && ["ingredient", "potion", "talisman"].includes(sys.category);
    ctx.medGear = ctx.isGear && sys.category === "medical";
    ctx.healKinds = { "": "—", ...Object.fromEntries(Object.entries(HEAL_KINDS).map(([k, v]) => [k, v.label])) };
    ctx.gearRarities = { 0: "—", ...RARITY };
    ctx.usages = { "": "—", ...Object.fromEntries(["Drink", "Throw", "Apply", "Worn"].map(k => [k, MODES[k].label])) };
    ctx.spellLevels = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4" };
    ctx.spellCosts = COST_LABELS;
    ctx.hasFx = ctx.isFeature || ctx.isArmor;
    ctx.armorCats = ARMOR_CATEGORIES;
    ctx.gearCats = GEAR_CATEGORIES;
    ctx.weaponKinds = { "": "—", ...WEAPON_KINDS };
    ctx.hitModes = { "": "nie", hit: "przy każdym trafieniu", crit: "tylko przy krytyku" };
    ctx.poisons = POISONS;
    ctx.specialChecks = ["electric", "rads", "shock", "knockdown", "concealable", "scoped", "silenced", "timed", "placed"]
      .map(k => ({ key: k, label: SPECIALS[k].label, desc: SPECIALS[k].desc, on: !!sys.specials?.[k] }));
    ctx.featureKinds = { trait: "Trait", hindrance: "Hindrance", perk: "Perk", spell: "Zaklęcie", other: "Inne" };
    ctx.skillOptions = Object.fromEntries(Object.entries(SKILLS).map(([k, s]) => [k, s.label]));
    if (ctx.isArmor) {
      ctx.coverRows = Object.entries(LOCATIONS).map(([k, label]) => ({ key: k, label, on: !!sys.cover?.[k], wear: sys.wear?.[k] ?? 0 }));
      ctx.wearRows = ctx.coverRows.filter(r => r.on || r.wear);
    }
    if (ctx.hasFx) {
      const groups = [
        { label: "Ogólne", opts: [["all", "Wszystko"], ["attack", "Każdy atak"], ["ranged", "Ataki dystansowe"], ["melee", "Ataki wręcz"]] },
        { label: "Atrybuty", opts: Object.entries(ATTRS) },
        { label: "Umiejętności", opts: Object.entries(SKILLS).map(([k, v]) => [k, v.label]) },
        { label: "Lokacje (DT)", opts: Object.entries(LOCATIONS) },
        { label: "Ruch (%)", opts: [["ground", "Ruch po ziemi"], ["fly", "Lot"]] }
      ];
      const known = new Set(groups.flatMap(g => g.opts.map(o => o[0])));
      ctx.fxRows = (sys.effects ?? []).map((e, i) => ({
        i, value: e.value, when: e.when,
        types: Object.entries(FX_TYPES).map(([k, t]) => ({ v: k, label: t.label, sel: k === e.type })),
        custom: known.has(e.target) ? null : {
          v: e.target,
          label: e.target.split(",").map(t => t.trim()).map(t => groups.flatMap(g => g.opts).find(o => o[0] === t)?.[1] ?? t).join(", ")
        },
        groups: groups.map(g => ({ label: g.label, opts: g.opts.map(([v, label]) => ({ v, label, sel: v === e.target })) }))
      }));
    }
    ctx.descHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.description, { relativeTo: this.document });
    return ctx;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    // Pola efektów nie mają atrybutu name — zapisujemy całą listę naraz
    this.element.addEventListener("change", ev => {
      const el = ev.target.closest("[data-fx-i]");
      if (!el) return;
      const effects = foundry.utils.deepClone(this.document.system.effects ?? []);
      const row = effects[Number(el.dataset.fxI)];
      if (!row) return;
      const field = el.dataset.fxField;
      row[field] = field === "value" ? (Number(el.value) || 0) : el.value;
      this.document.update({ "system.effects": effects });
    });
  }

  static #onAddFx() {
    const effects = [...(this.document.system.effects ?? []), { type: this.document.type === "armor" ? "tempAttr" : "skillRoll", target: "all", value: 0, when: "" }];
    this.document.update({ "system.effects": effects });
  }

  static #onRemoveFx(event, target) {
    const effects = [...(this.document.system.effects ?? [])];
    effects.splice(Number(target.dataset.i), 1);
    this.document.update({ "system.effects": effects });
  }
}
