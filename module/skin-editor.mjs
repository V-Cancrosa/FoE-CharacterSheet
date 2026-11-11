/**
 * Edytor własnych szczebli wyglądu dla MG (ustawienie świata customSkins, logika w skins.mjs).
 * Każda reguła: nazwa, warunek (założony przedmiot / cecha, perk albo czar / rasa / imię postaci) z tekstem do znalezienia
 * („tekst|inny tekst”), szczebel 1–5, wygląd bazowy, własne kolory (tekst i tło) i napis na pasku karty.
 * Otwierany z ustawień systemu albo z zakładki Ustawienia na karcie (tylko MG).
 */
import { t, N_ } from "./i18n.mjs";
import { SKINS, RUNGS, cleanRule, customSkins } from "./skins.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const { ApplicationV2 } = foundry.applications.api;

const WHEN = { item: N_("Item worn (name contains)"), feature: N_("Trait, perk or spell (name contains)"), race: N_("Race (contains)"), name: N_("Character name (contains)") };
const newId = () => Math.random().toString(36).slice(2, 10);

export class FoeSkinEditor extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "foe-skin-editor",
    classes: ["foe-rpg", "foe-skin-editor"],
    window: { title: "Custom sheet looks", icon: "fa-solid fa-palette", resizable: true },
    position: { width: 640, height: 620 },
    actions: {
      add: FoeSkinEditor.#onAdd,
      remove: FoeSkinEditor.#onRemove,
      save: FoeSkinEditor.#onSave
    }
  };

  rules = customSkins().map(r => ({ ...r }));

  get title() { return t("Custom sheet looks"); }

  /** Odczyt pól formularza do this.rules (przed każdą akcją, żeby nic nie zginęło przy przerysowaniu). */
  #read() {
    const el = this.element;
    if (!el) return;
    this.rules = [...el.querySelectorAll(".skr-rule")].map(box => {
      const v = n => box.querySelector(`[data-f="${n}"]`);
      return {
        id: box.dataset.id, name: v("name").value, when: v("when").value, match: v("match").value, rung: Number(v("rung").value),
        base: v("base").value, bar: v("bar").value,
        ink: v("inkOn").checked ? v("ink").value : "", bg: v("bgOn").checked ? v("bg").value : ""
      };
    });
  }

  async _renderHTML() {
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("");
    const rungs = [5, 4, 3, 2, 1].map(n => [n, `${n} — ${t(RUNGS[n])}`]);
    const bases = SKINS.map(s => [s.id, t(s.label)]);
    const whens = Object.entries(WHEN).map(([k, l]) => [k, t(l)]);
    const rows = this.rules.map(r => `
      <fieldset class="skr-rule" data-id="${esc(r.id)}">
        <div class="skr-grid">
          <label>${t("Look name")}<input type="text" data-f="name" value="${esc(r.name)}" placeholder="${esc(t("e.g. Ministry of Morale"))}"></label>
          <label>${t("Ladder rung")}<select data-f="rung">${opt(rungs, r.rung ?? 2)}</select></label>
          <label>${t("Condition")}<select data-f="when">${opt(whens, r.when ?? "item")}</select></label>
          <label>${t("Text to find")}<input type="text" data-f="match" value="${esc(r.match)}" placeholder="${esc(t("e.g. Ministry badge|MoM uniform"))}"></label>
          <label>${t("Base look")}<select data-f="base">${opt(bases, r.base ?? "paper")}</select></label>
          <label>${t("Top bar text")}<input type="text" data-f="bar" value="${esc(r.bar)}" placeholder="${esc(t("empty — the name"))}"></label>
          <label class="skr-col"><span><input type="checkbox" data-f="inkOn" ${r.ink ? "checked" : ""}> ${t("Own text colour")}</span><input type="color" data-f="ink" value="${esc(r.ink || "#4dff8a")}"></label>
          <label class="skr-col"><span><input type="checkbox" data-f="bgOn" ${r.bg ? "checked" : ""}> ${t("Own background")}</span><input type="color" data-f="bg" value="${esc(r.bg || "#0a0f0b")}"></label>
        </div>
        <div class="skr-foot"><div class="skr-preview"><span class="pip-bar"><span></span></span><span class="skr-sample"></span></div>
          <button type="button" data-action="remove"><i class="fa-solid fa-trash"></i> ${t("Remove")}</button></div>
      </fieldset>`).join("");
    return `<p class="hint">${t("A rule that fits a character adds its look on the chosen rung: on the sheet's Settings tab the player can pick it, and if its rung is at least as high as the character's ladder, it becomes the automatic look. Several texts — separate them with |.")}</p>
      ${rows || `<p class="empty">${t("No custom looks yet.")}</p>`}
      <footer class="skr-buttons"><button type="button" data-action="add"><i class="fa-solid fa-plus"></i> ${t("Add a look")}</button>
        <button type="button" data-action="save"><i class="fa-solid fa-floppy-disk"></i> ${t("Save")}</button></footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const paint = box => {
      const v = n => box.querySelector(`[data-f="${n}"]`);
      const pv = box.querySelector(".skr-preview");
      pv.className = `skr-preview foe-rpg skin-${v("base").value}`;
      pv.style.cssText = "";
      if (v("inkOn").checked) pv.style.setProperty("--pip", v("ink").value);
      if (v("bgOn").checked) {
        pv.style.setProperty("--pip-bg", v("bg").value);
        pv.style.setProperty("--pip-void", `color-mix(in srgb, ${v("bg").value} 65%, black)`);
      }
      pv.querySelector(".pip-bar > span").textContent = (v("bar").value || v("name").value || "—").toUpperCase();
      pv.querySelector(".skr-sample").textContent = t("Sample text · S.P.E.C.I.A.L.");
    };
    for (const box of this.element.querySelectorAll(".skr-rule")) {
      paint(box);
      box.addEventListener("input", () => paint(box));
      box.addEventListener("change", () => paint(box));
    }
  }

  static #onAdd() {
    this.#read();
    this.rules.push({ id: newId(), name: "", when: "item", match: "", rung: 2, base: "paper", bar: "", ink: "", bg: "" });
    this.render();
  }

  static #onRemove(event, target) {
    this.#read();
    const id = target.closest(".skr-rule")?.dataset.id;
    this.rules = this.rules.filter(r => r.id !== id);
    this.render();
  }

  static async #onSave() {
    this.#read();
    const clean = this.rules.map(cleanRule);
    const bad = this.rules.filter((r, i) => !clean[i] || !clean[i].match).length;
    if (bad) return ui.notifications.warn(t("Every look needs a name and a text to find."));
    await game.settings.set(F, "customSkins", clean);
    ui.notifications.info(t("Custom looks saved: {n}.", { n: clean.length }));
    this.close();
  }
}

export function openSkinEditor() {
  if (!game.user.isGM) return;
  const open = foundry.applications.instances?.get?.("foe-skin-editor");
  return open ? open.bringToFront?.() ?? open.render({ force: true }) : new FoeSkinEditor().render({ force: true });
}

export function registerSkinEditorMenu() {
  class Menu extends ApplicationV2 { async render() { openSkinEditor(); return this; } }
  game.settings.registerMenu(F, "customSkinsMenu", {
    name: "Custom sheet looks",
    label: "Open the editor",
    hint: "Your own rungs of the sheet appearance ladder: a look for characters with a given item, trait, race or name (e.g. a Ministry, a gang, a tribe).",
    icon: "fa-solid fa-palette",
    type: Menu,
    restricted: true
  });
}
