import { ATTRS, SKILLS, LOCATIONS } from "./data.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const P = "systems/foe-rpg/templates";

export class FoeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "actor"],
    position: { width: 760, height: 820 },
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
      newSession: FoeActorSheet.#onNewSession
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
        { id: "main", label: "S.P.E.C.I.A.L. i umiejętności" },
        { id: "combat", label: "Walka" },
        { id: "gear", label: "Ekwipunek" },
        { id: "notes", label: "Cechy i notatki" }
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
    ctx.attrs = Object.entries(ATTRS).map(([k, label]) => {
      const a = sys.attributes[k];
      return { key: k, label, ...a, q3: Math.floor(a.tn * .75), q2: Math.floor(a.tn / 2), q1: Math.floor(a.tn / 4) };
    });
    ctx.skills = Object.entries(SKILLS).map(([k, def]) => {
      const s = sys.skills[k];
      const tn = s.tn + s.mod;
      return {
        key: k, label: def.label, racial: def.racial, ...s,
        attrLabel: s.attr.toUpperCase(),
        attrChoices: def.choice ? def.choice.map(c => ({ v: c, sel: c === s.attr })) : null,
        tnShown: tn, q3: Math.floor(s.tn * .75) + s.mod, q2: Math.floor(s.tn / 2) + s.mod, q1: Math.floor(s.tn / 4) + s.mod
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
    ctx.features = items.filter(i => i.type === "feature");
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
    const r = await promptMfd(`${ATTRS[k]} (×10)`, a.tn);
    if (r) rollTest(this.document, { label: ATTRS[k], baseTn: a.tn, ...r });
  }

  static async #onRollSkill(event, target) {
    const k = target.dataset.key;
    const s = this.document.system.skills[k];
    const r = await promptMfd(SKILLS[k].label, s.tn);
    if (r) rollTest(this.document, { label: SKILLS[k].label, baseTn: s.tn, step: r.step, mod: r.mod + s.mod });
  }

  static async #onRollWeapon(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    const s = this.document.system.skills[item.system.skill];
    if (!s) return ui.notifications.warn("Broń nie ma przypisanej umiejętności.");
    const r = await promptMfd(`Atak: ${item.name}`, s.tn);
    if (!r) return;
    const { ammo } = item.system;
    if (ammo.max > 0) {
      if (ammo.value <= 0) return ui.notifications.warn(`${item.name}: brak amunicji — przeładuj.`);
      await item.update({ "system.ammo.value": ammo.value - 1 });
    }
    rollTest(this.document, { label: `Atak: ${item.name} (${SKILLS[item.system.skill].label})`, baseTn: s.tn, step: r.step, mod: r.mod + s.mod });
  }

  static async #onRollDamage(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    let formula = item.system.damage || "0";
    // Energy Weapons: bonus do obrażeń = ranga /10
    if (item.system.skill === "energy") formula += ` + ${Math.floor(this.document.system.skills.energy.rank / 10)}`;
    const roll = await new Roll(formula, this.document.getRollData()).evaluate();
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      flavor: `Obrażenia: ${item.name} — DT celu odejmij przed liczeniem ran (1 rana / ${this.document.system.dmgPerWound} obrażeń u postaci gracza).`
    });
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
    position: { width: 480, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true }
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
    ctx.descHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.document.system.description, { relativeTo: this.document });
    return ctx;
  }
}
