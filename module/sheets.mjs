import { ATTRS, SKILLS, LOCATIONS } from "./data.mjs";
import { promptMfd, rollTest, rollDamage } from "./rolls.mjs";
import { rollContext, describeFx, FX_TYPES, signed } from "./effects.mjs";
import { openCreator } from "./creator.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const P = "systems/foe-rpg/templates";

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
      createItem: FoeActorSheet.#onCreateItem,
      editItem: FoeActorSheet.#onEditItem,
      deleteItem: FoeActorSheet.#onDeleteItem,
      newSession: FoeActorSheet.#onNewSession,
      openCreator: FoeActorSheet.#onOpenCreator,
      toggleFeature: FoeActorSheet.#onToggleFeature
    }
  };

  static PARTS = {
    header: { template: `${P}/actor/header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${P}/actor/main.hbs`, scrollable: [""] },
    combat: { template: `${P}/actor/combat.hbs`, scrollable: [""] },
    gear: { template: `${P}/actor/gear.hbs`, scrollable: [""] },
    notes: { template: `${P}/actor/notes.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "Statystyki" },
        { id: "combat", label: "Walka" },
        { id: "gear", label: "Ekwipunek" },
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
    const pct = (v, m) => (m > 0 ? Math.max(0, Math.min(100, Math.round(100 * v / m))) : 0);
    const res = sys.resources;
    ctx.meters = {
      sats: pct(res.sats.value, res.sats.max),
      luck: pct(res.luck.value, res.luck.max),
      strain: pct(res.strain.value, res.strain.max + (sys.strainBonus ?? 0)),
      rads: pct(res.rads.value, res.rads.max)
    };
    const tip = list => list?.length ? list.join("\n") : "";
    ctx.attrs = Object.entries(ATTRS).map(([k, label]) => {
      const a = sys.attributes[k];
      return {
        key: k, label, letter: label[0], rest: label.slice(1), ...a,
        q3: Math.floor(a.tn * .75), q2: Math.floor(a.tn / 2), q1: Math.floor(a.tn / 4),
        fxLabel: a.fx ? signed(a.fx) : "", fxTip: tip(a.fxSources),
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
        rollFx: s.fxRoll ? signed(s.fxRoll) : "", rollTip: tip(s.fxRollSources)
      };
    });
    ctx.locations = Object.entries(LOCATIONS).map(([k, label]) => ({ key: k, label, ...sys.locations[k] }));
    const items = this.document.items;
    ctx.weapons = items.filter(i => i.type === "weapon").map(i => ({
      id: i.id, name: i.name, img: i.img, ...i.system,
      skillLabel: SKILLS[i.system.skill]?.label ?? i.system.skill
    }));
    ctx.armor = items.filter(i => i.type === "armor");
    ctx.gearItems = items.filter(i => i.type === "gear");
    const labels = { all: "wszystko", ...ATTRS, ...Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label])), ...LOCATIONS,
      ranged: "broń dystansowa", melee: "wręcz", attack: "ataki", ground: "ląd", fly: "lot" };
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
      damage: fx.damage ? signed(fx.damage) : ""
    };
    ctx.weight = items.reduce((t, i) => t + (Number(i.system.weight) || 0) * (i.system.qty ?? 1), 0);
    ctx.notesHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.notes, { relativeTo: this.document });
    return ctx;
  }

  async _preparePartContext(partId, ctx) {
    ctx.tab = ctx.tabs?.[partId];
    return ctx;
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
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    const s = this.document.system.skills[item.system.skill];
    if (!s) return ui.notifications.warn("Broń nie ma przypisanej umiejętności.");
    const rc = rollContext(this.document, { kind: "attack", skill: item.system.skill, skillAttr: s.attr }, { manualMod: s.mod });
    const r = await promptMfd(`Atak: ${item.name}`, s.tn, rc);
    if (!r) return;
    const { ammo } = item.system;
    if (ammo.max > 0) {
      if (ammo.value <= 0) return ui.notifications.warn(`${item.name}: brak amunicji — przeładuj.`);
      await item.update({ "system.ammo.value": ammo.value - 1 });
    }
    rollTest(this.document, { label: `Atak: ${item.name} (${SKILLS[item.system.skill].label})`, baseTn: s.tn, ...r, itemUuid: item.uuid });
  }

  static async #onRollDamage(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) rollDamage(this.document, item, { crit: event.shiftKey });   // Shift+klik = krytyk
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const names = { weapon: "Nowa broń", armor: "Nowy pancerz", gear: "Nowy przedmiot", feature: "Nowa cecha" };
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name: names[type], type }]);
    item?.sheet.render(true);
  }

  static #onEditItem(event, target) {
    this.document.items.get(target.closest("[data-item-id]").dataset.itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Usuń przedmiot" }, content: `<p>Usunąć <b>${foundry.utils.escapeHTML(item.name)}</b>?</p>`
    });
    if (ok) item.delete();
  }

  static #onToggleFeature(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    item?.update({ "system.active": item.system.active === false });
  }

  static #onOpenCreator() {
    openCreator(this.document);
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
    position: { width: 560, height: 620 },
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
    ctx.item = this.document;
    ctx.system = this.document.system;
    ctx.isWeapon = this.document.type === "weapon";
    ctx.isArmor = this.document.type === "armor";
    ctx.isGear = this.document.type === "gear";
    ctx.isFeature = this.document.type === "feature";
    ctx.armorCats = { clothing: "Ubranie", light: "Lekki", medium: "Średni", heavy: "Ciężki" };
    ctx.featureKinds = { trait: "Trait", hindrance: "Hindrance", perk: "Perk", spell: "Zaklęcie", other: "Inne" };
    ctx.skillOptions = Object.fromEntries(Object.entries(SKILLS).map(([k, s]) => [k, s.label]));
    if (ctx.isFeature) {
      const groups = [
        { label: "Ogólne", opts: [["all", "Wszystko"], ["attack", "Każdy atak"], ["ranged", "Ataki dystansowe"], ["melee", "Ataki wręcz"]] },
        { label: "Atrybuty", opts: Object.entries(ATTRS) },
        { label: "Umiejętności", opts: Object.entries(SKILLS).map(([k, v]) => [k, v.label]) },
        { label: "Lokacje (DT)", opts: Object.entries(LOCATIONS) },
        { label: "Ruch (%)", opts: [["ground", "Ruch po ziemi"], ["fly", "Lot"]] }
      ];
      const known = new Set(groups.flatMap(g => g.opts.map(o => o[0])));
      ctx.fxRows = (this.document.system.effects ?? []).map((e, i) => ({
        i, value: e.value, when: e.when,
        types: Object.entries(FX_TYPES).map(([k, t]) => ({ v: k, label: t.label, sel: k === e.type })),
        custom: known.has(e.target) ? null : {
          v: e.target,
          label: e.target.split(",").map(t => t.trim()).map(t => groups.flatMap(g => g.opts).find(o => o[0] === t)?.[1] ?? t).join(", ")
        },
        groups: groups.map(g => ({ label: g.label, opts: g.opts.map(([v, label]) => ({ v, label, sel: v === e.target })) }))
      }));
    }
    ctx.descHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.document.system.description, { relativeTo: this.document });
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
    const effects = [...(this.document.system.effects ?? []), { type: "skillRoll", target: "all", value: 0, when: "" }];
    this.document.update({ "system.effects": effects });
  }

  static #onRemoveFx(event, target) {
    const effects = [...(this.document.system.effects ?? [])];
    effects.splice(Number(target.dataset.i), 1);
    this.document.update({ "system.effects": effects });
  }
}
