/**
 * Karta pojazdu: rozmiar, strefy (kadłub, kabina, napęd, uzbrojenie), broń pokładowa, załoga i ładunek.
 * Akcje: sterowanie, taranowanie, zderzenie, naprawa — vehicle.mjs.
 */
import { clearFlag } from "./flags.mjs";
import { ATTRS, SKILLS, GEAR_CATEGORIES } from "./data.mjs";
import { rollDamage } from "./rolls.mjs";
import { reloadWeapon } from "./attack.mjs";
import { openCatalog } from "./catalog.mjs";
import { rollActorInitiative } from "./tracker.mjs";
import { rangeIncrement, reloadInfo, specialList, SPECIALS } from "./combat.mjs";
import { VEHICLE_SIZES, VEHICLE_KINDS, VEHICLE_POWER, CREW_ROLES, vehicleAreas, defaultStructure, defaultPilotSkill, evasiveActive } from "./vehicle-data.mjs";
import { addCrew, removeCrew, setCrewRole, driveVehicle, fireVehicleWeapon, ramWithVehicle, crashVehicle, repairVehicle } from "./vehicle.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const P = "systems/foe-rpg/templates";
const F = "foe-rpg";
// umiejętności „załogi bez imienia” pokazywane na karcie pojazdu
const CREW_SKILLS = ["bigGuns", "smallGuns", "energy", "explosives", "flight", "repair"];

export class FoeVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "actor", "vehicle"],
    position: { width: 860, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      drive: FoeVehicleSheet.#onDrive,
      ram: FoeVehicleSheet.#onRam,
      crash: FoeVehicleSheet.#onCrash,
      repair: FoeVehicleSheet.#onRepair,
      fireWeapon: FoeVehicleSheet.#onFire,
      rollDamage: FoeVehicleSheet.#onRollDamage,
      reload: FoeVehicleSheet.#onReload,
      createItem: FoeVehicleSheet.#onCreateItem,
      editItem: FoeVehicleSheet.#onEditItem,
      deleteItem: FoeVehicleSheet.#onDeleteItem,
      openCatalog: FoeVehicleSheet.#onOpenCatalog,
      addCrew: FoeVehicleSheet.#onAddCrew,
      removeCrew: FoeVehicleSheet.#onRemoveCrew,
      openCrew: FoeVehicleSheet.#onOpenCrew,
      rollInitiative: FoeVehicleSheet.#onRollInitiative,
      clearEvasive: FoeVehicleSheet.#onClearEvasive
    }
  };

  static PARTS = { body: { template: `${P}/actor/vehicle.hbs`, scrollable: [""] } };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const v = sys.vehicle;
    ctx.actor = actor;
    ctx.system = sys;
    ctx.v = v;
    const opt = (obj, cur) => Object.entries(obj).map(([value, label]) => ({ value, label, sel: value === cur }));
    ctx.kinds = opt(VEHICLE_KINDS, v.kind);
    ctx.powers = opt(VEHICLE_POWER, v.power);
    ctx.sizes = VEHICLE_SIZES.map(s => ({ value: s.key, label: `${s.label} (D/W ${s.dw}${s.steps ? `, +${s.steps} kr. do trafienia` : ""})`, sel: s.key === String(v.size) }));
    const pilotKey = v.pilotSkill || "";
    ctx.pilotOptions = [
      { value: "", label: `wg rodzaju (${v.kind === "sky" ? "Flight" : "Agility"})`, sel: !pilotKey },
      ...Object.entries(ATTRS).map(([k, l]) => ({ value: k, label: `${l} (atrybut)`, sel: pilotKey === k })),
      ...Object.entries(SKILLS).map(([k, s]) => ({ value: k, label: s.label, sel: pilotKey === k }))
    ];
    ctx.sky = v.kind === "sky";
    ctx.pulled = v.power === "pulled";
    const evasive = evasiveActive(actor.getFlag(F, "evasive"), game.combat);
    ctx.stats = {
      dw: sys.dmgPerWound, structure: sys.structure, crippleAt: sys.locations.torso.crippleAt, defaultStructure: defaultStructure(v.size),
      speed: sys.speed, speedNotes: sys.speedNotes ?? [], hitSteps: sys.size.steps, dodge: sys.size.dodge, evasive,
      dead: sys.dead, falling: sys.falling, weight: sys.weight, carry: sys.carry, overload: sys.overload,
      pilot: sys.crewList?.find(c => c.role === "pilot" && c.actor)?.actor?.name ?? "załoga pojazdu",
      pilotSkill: ATTRS[sys.pilotSkill] ?? SKILLS[sys.pilotSkill]?.label ?? sys.pilotSkill
    };
    const STATUS_CLS = { destroyed: "dead", crippled: "crippled", wounded: "wounded", ok: "" };
    ctx.areas = vehicleAreas(v.kind).map(a => {
      const L = sys.locations[a.loc];
      return { key: a.loc, label: a.label, mfd: a.mfd, wounds: L.wounds, dt: L.dt, limit: L.limit, crippleAt: L.crippleAt,
        statusText: L.statusText, effect: L.effect, cls: STATUS_CLS[L.status] ?? "" };
    });
    ctx.weapons = actor.items.filter(i => i.type === "weapon").map(i => {
      const w = i.system;
      const inc = rangeIncrement(w, 0);
      return {
        id: i.id, name: i.name, img: i.img, ...w, skillLabel: SKILLS[w.skill]?.label ?? w.skill, burst: w.shots > 1 ? w.shots : 0,
        reloadLabel: w.reload ? `${w.reload}: ${reloadInfo(w.reload, { energy: w.skill === "energy" }).ap} AP w SATS` : "przeładuj",
        rangeLabel: inc ? `${inc} ft` : w.range || "—",
        tags: specialList(w.specials).map(k => ({ label: SPECIALS[k].label, tip: SPECIALS[k].desc }))
      };
    });
    ctx.gunsDown = sys.gunsDown;
    ctx.gunSteps = sys.gunSteps;
    ctx.crew = (sys.crewList ?? []).map(c => ({
      index: c.index, name: c.actor?.name ?? c.name ?? "?", img: c.actor?.img ?? "icons/svg/mystery-man.svg", missing: !c.actor,
      roles: Object.entries(CREW_ROLES).filter(([k]) => k !== "puller" || ctx.pulled || c.role === "puller").map(([value, label]) => ({ value, label, sel: value === c.role })),
      info: c.actor ? (c.role === "puller" ? `${ctx.sky ? `lot ${c.actor.system.canFly ? `${c.actor.system.flySpeed} ft` : c.actor.system.flyNote || "nie lata"}` : `ruch ${c.actor.system.speed} ft`}` : "") : "aktor usunięty"
    }));
    ctx.crewWarnings = sys.crewWarnings ?? [];
    ctx.crewCount = sys.crewCount;
    ctx.attrs = Object.entries(ATTRS).map(([k, label]) => ({ key: k, label: k.toUpperCase(), title: label, value: sys.attributes[k].value }));
    ctx.crewSkills = CREW_SKILLS.map(k => ({ key: k, label: SKILLS[k].label.split(" / ").pop(), tn: sys.skills[k].tn, points: sys.skills[k].points }));
    ctx.cargo = actor.items.filter(i => i.type === "gear" || i.type === "armor").map(i => ({
      id: i.id, name: i.name, img: i.img, qty: i.system.qty ?? 1, category: GEAR_CATEGORIES[i.system.category] ?? "",
      weight: Math.round((Number(i.system.weight) || 0) * (i.type === "gear" ? Number(i.system.qty) || 0 : 1) * 10) / 10
    }));
    ctx.defaultPilot = defaultPilotSkill(v.kind);
    ctx.notesHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.notes, { relativeTo: actor });
    return ctx;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // rola w załodze: lista poza schematem formularza (tablica obiektów)
    for (const sel of this.element.querySelectorAll("select[data-crew-index]")) {
      sel.addEventListener("change", ev => {
        ev.stopPropagation();
        setCrewRole(this.document, Number(sel.dataset.crewIndex), sel.value);
      });
    }
  }

  /** Upuszczenie postaci/NPC na kartę pojazdu = dodanie do załogi. */
  async _onDropActor(event, actor) {
    if (!this.document.isOwner) return false;
    return addCrew(this.document, actor);
  }

  #item(target) {
    return this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static #onDrive() { return driveVehicle(this.document); }
  static #onRam() { return ramWithVehicle(this.document); }
  static #onCrash() { return crashVehicle(this.document); }
  static #onRepair() { return repairVehicle(this.document); }
  static #onRollInitiative() { return rollActorInitiative(this.document); }
  static #onClearEvasive() { return clearFlag(this.document, "evasive"); }

  static async #onFire(event, target) {
    const item = this.#item(target);
    if (item) await fireVehicleWeapon(this.document, item);
  }

  static #onRollDamage(event, target) {
    const item = this.#item(target);
    if (item) rollDamage(this.document, item, { crit: event.shiftKey, attack: { vehicle: this.document.uuid } });
  }

  static async #onReload(event, target) {
    const item = this.#item(target);
    if (item) await reloadWeapon(this.document, item);
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const names = { weapon: "Nowa broń pokładowa", gear: "Nowy ładunek" };
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name: names[type] ?? "Nowy przedmiot", type, ...(type === "weapon" ? { system: { skill: "bigGuns", mounted: true } } : {}) }]);
    item?.sheet.render(true);
  }

  static #onEditItem(event, target) { this.#item(target)?.sheet.render(true); }

  static async #onDeleteItem(event, target) {
    const item = this.#item(target);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Usuń przedmiot" }, content: `<p>Usunąć <b>${foundry.utils.escapeHTML(item.name)}</b>?</p>`
    });
    if (ok) item.delete();
  }

  static #onOpenCatalog(event, target) { openCatalog(this.document, target.dataset.tab || "weapons"); }

  /** Dodaje do załogi zaznaczone tokeny (albo własną postać gracza). */
  static async #onAddCrew() {
    const picked = (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(a => a && a.type !== "vehicle");
    const list = picked.length ? picked : game.user?.character ? [game.user.character] : [];
    if (!list.length) return ui.notifications.warn("Zaznacz tokeny postaci na scenie albo przeciągnij aktora z zakładki aktorów na kartę pojazdu.");
    for (const a of list) await addCrew(this.document, a);
  }

  static async #onRemoveCrew(event, target) {
    await removeCrew(this.document, Number(target.closest("[data-crew]")?.dataset.crew));
  }

  static async #onOpenCrew(event, target) {
    const c = this.document.system.crewList?.[Number(target.closest("[data-crew]")?.dataset.crew)];
    c?.actor?.sheet?.render(true);
  }
}
