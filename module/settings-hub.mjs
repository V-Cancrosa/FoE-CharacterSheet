/**
 * Ustawienia systemu w jednym oknie w stylu PipBucka (zamiast długiej listy w „Ustawieniach modułów”).
 *   - W ustawieniach Foundry zostaje jeden przycisk „Ustawienia Fallout: Equestria” (i język — na wszelki wypadek).
 *   - Okno: kategorie po lewej, wyszukiwarka, przy każdej opcji opis „na co wpływa”, znaczniki (świat — MG / tylko u
 *     ciebie, zasada domowa, Project Horizons, wymaga przeładowania), przywrócenie domyślnej.
 *   - Gracz widzi wszystko, ale zmienia tylko swoje (klienckie) ustawienia; światowe zmienia MG.
 *   - Przyciski narzędzi MG (wcześniej osobne menu) są w kategorii „Narzędzia MG”.
 * Wszystkie ustawienia systemu z config: true trafiają tu same (hak setup) — nowe ustawienie bez kategorii ląduje w „Inne”.
 */
import { t, N_ } from "./i18n.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const { ApplicationV2 } = foundry.applications.api;
const KEEP_IN_CORE = new Set(["language"]);

export const CATEGORIES = [
  { id: "survival", icon: "fa-solid fa-utensils", label: N_("Survival and time"),
    about: N_("Food, water, sleep and how the passage of time is settled. Affects characters' penalties, cards in the chat and the time skip window."),
    keys: ["survivalHunger", "survivalDehydration", "dehydrationOptional", "survivalDiet", "sleepRules", "timeSkipHours", "gmConfirm"] },
  { id: "radiation", icon: "fa-solid fa-radiation", label: N_("Radiation, ghouls and the mind"),
    about: N_("Radiation sickness, severe exposure, ghoulification, insanity. Affects automatic END/INT rolls and attribute penalties."),
    keys: ["radiationChecks", "radiationPenalties", "ghoulification", "insanityRolls"] },
  { id: "pink", icon: "fa-solid fa-cloud", label: N_("Pink cloud"),
    about: N_("The pink cloud on scenes and in regions and the optional rules from Project Horizons. Affects wounds every round, armour and Canterlot ghouls."),
    keys: ["pinkCloud", "pinkCorrode", "pinkFuse", "pinkVariable", "pinkResist", "pinkScream", "pinkAlicorns"] },
  { id: "combat", icon: "fa-solid fa-crosshairs", label: N_("Combat"),
    about: N_("Optional combat rules: hit locations, wear, ammunition, losing consciousness, the order of actions. Affects attack windows and damage."),
    keys: ["consciousnessRolls", "simultaneousTens", "randomHitLocations", "armorDegradation", "weaponDegradation", "specialAmmo", "overloadRule", "powerArmorUntrainedAgi", "npcRollsPrivate", "groundMarkers", "altitudeMovesToken"] },
  { id: "sats", icon: "fa-solid fa-bullseye", label: N_("S.A.T.S. and the PipBuck"),
    about: N_("The S.A.T.S. targeting screen, the PipBuck requirement and the Geiger counter. Affects the attack window, the camera and sounds."),
    keys: ["satsTargeting", "pipbuckGadgets", "satsAutoOpen", "satsZoom", "satsMinimize", "satsRestoreDelay", "geigerSound"] },
  { id: "characters", icon: "fa-solid fa-user-plus", label: N_("Characters and advancement"),
    about: N_("The creator, experience, what players may do themselves, chems, cybernetics and loot."),
    keys: ["autoCreator", "creationPool", "xpProgression", "playerAdvancement", "playerFreeItems", "addictionFrequency", "cyberPower", "lootReminder"] },
  { id: "world", icon: "fa-solid fa-earth-europe", label: N_("World"),
    about: N_("Weather, the calendar, terminals, gaming tables, the stable and the radar. Affects roll modifiers and the map."),
    keys: ["weather", "weatherForging", "calendarStart", "calendarLastDay", "terminalMinigame", "terminalReach", "casinoReach", "casinoChat", "stableNumber", "efsColors"] },
  { id: "look", icon: "fa-solid fa-palette", label: N_("Look and sound (only for you)"),
    about: N_("How the game looks and sounds on your computer: the PipBuck theme, colours, animations, dice. Doesn't change anything for other players."),
    keys: ["uiTheme", "uiWelcome", "uiSounds", "pipColor", "crtEffect", "sheetEffects", "fxCombat", "fxEngine", "fxStatuses", "dice3dByRoll", "dice3dColors", "rulesReader", "terminalBootAnim", "language"] },
  { id: "tools", icon: "fa-solid fa-toolbox", label: N_("GM tools"), about: N_("One-off actions and editors."), keys: [] },
  { id: "other", icon: "fa-solid fa-ellipsis", label: N_("Other"), about: N_("Settings without a category."), keys: [] }
];

/** Znaczniki z nazwy i opisu: zasada domowa, Project Horizons (strona podręcznika jest już w nazwie). */
export function badgesOf(s) {
  const text = `${s.name ?? ""} ${s.hint ?? ""}`;
  const out = [];
  if (/project horizons/i.test(text)) out.push({ cls: "ph", label: "Project Horizons" });
  if (/house rule|zasada domowa/i.test(text)) out.push({ cls: "house", label: N_("house rule") });
  return out;
}

const HUB = { settings: [], menus: [] };
const catOf = key => CATEGORIES.find(c => c.keys.includes(key))?.id ?? "other";

function fieldHtml(s, value, editable) {
  const dis = editable ? "" : "disabled";
  const name = `name="${esc(s.key)}"`;
  if (s.type === Boolean) return `<input type="checkbox" class="hub-toggle" ${name} ${value ? "checked" : ""} ${dis}>`;
  if (s.choices) {
    const ch = typeof s.choices === "function" ? s.choices() : s.choices;
    return `<select ${name} ${dis}>${Object.entries(ch).map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(value) ? "selected" : ""}>${esc(t(l))}</option>`).join("")}</select>`;
  }
  if (s.type === Number) {
    const r = s.range ?? {};
    return `<input type="number" ${name} value="${esc(value)}" ${r.min != null ? `min="${r.min}"` : ""} ${r.max != null ? `max="${r.max}"` : ""} ${r.step != null ? `step="${r.step}"` : ""} ${dis}>`;
  }
  return `<input type="text" ${name} value="${esc(value)}" ${dis}>`;
}

export class FoeSettingsHub extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "foe-settings-hub",
    classes: ["foe-rpg", "foe-hub"],
    window: { title: "Fallout: Equestria settings", icon: "fa-solid fa-gear", resizable: true },
    position: { width: 860, height: 700 },
    actions: { cat: FoeSettingsHub.#onCat, save: FoeSettingsHub.#onSave, reset: FoeSettingsHub.#onReset, menu: FoeSettingsHub.#onMenu }
  };
  cat = "survival";
  query = "";
  draft = {};

  get title() { return t("Fallout: Equestria settings"); }

  #value(s) {
    if (s.key in this.draft) return this.draft[s.key];
    try { return game.settings.get(F, s.key); } catch { return s.default; }
  }

  async _renderHTML() {
    const gm = game.user.isGM;
    const q = this.query.trim().toLowerCase();
    const cats = CATEGORIES.filter(c => c.id === "tools" ? HUB.menus.length : HUB.settings.some(s => catOf(s.key) === c.id));
    const visible = HUB.settings.filter(s => q ? `${t(s.name)} ${t(s.hint ?? "")} ${s.name}`.toLowerCase().includes(q) : catOf(s.key) === this.cat);
    const order = s => { const c = CATEGORIES.find(x => x.id === catOf(s.key)); return [CATEGORIES.indexOf(c), c.keys.indexOf(s.key)]; };
    visible.sort((a, b) => { const [x1, y1] = order(a), [x2, y2] = order(b); return x1 - x2 || y1 - y2; });
    const cur = CATEGORIES.find(c => c.id === this.cat);
    const rows = visible.map(s => {
      const editable = s.scope !== "world" || gm;
      const v = this.#value(s);
      const changed = s.key in this.draft;
      const isDefault = JSON.stringify(v) === JSON.stringify(s.default);
      const badges = [
        { cls: s.scope === "world" ? "world" : "client", label: s.scope === "world" ? t("world — GM") : t("only for you") },
        ...badgesOf(s).map(b => ({ ...b, label: t(b.label) })),
        s.requiresReload ? { cls: "reload", label: t("needs a reload") } : null
      ].filter(Boolean);
      return `<div class="hub-row ${changed ? "changed" : ""} ${editable ? "" : "locked"}" data-key="${esc(s.key)}">
        <div class="hub-main"><div class="hub-name">${esc(t(s.name))}</div>
          ${s.hint ? `<div class="hub-hint">${esc(t(s.hint))}</div>` : ""}
          <div class="hub-badges">${badges.map(b => `<span class="hub-badge ${b.cls}">${esc(b.label)}</span>`).join("")}${q ? `<span class="hub-badge cat">${esc(t(CATEGORIES.find(c => c.id === catOf(s.key)).label))}</span>` : ""}</div></div>
        <div class="hub-ctl">${fieldHtml(s, v, editable)}
          ${editable && !isDefault ? `<a data-action="reset" title="${esc(t("Back to the default"))}"><i class="fa-solid fa-rotate-left"></i></a>` : ""}</div></div>`;
    }).join("");
    const tools = !q && this.cat === "tools" ? HUB.menus.map(m => `<div class="hub-row"><div class="hub-main"><div class="hub-name">${esc(t(m.name))}</div>
        ${m.hint ? `<div class="hub-hint">${esc(t(m.hint))}</div>` : ""}</div>
        <div class="hub-ctl"><button type="button" data-action="menu" data-key="${esc(m.key)}" ${m.restricted && !gm ? "disabled" : ""}><i class="${esc(m.icon ?? "fa-solid fa-gear")}"></i> ${esc(t(m.label))}</button></div></div>`).join("") : "";
    const dirty = Object.keys(this.draft).length;
    return `<nav class="hub-nav">
        <input type="search" class="hub-search" placeholder="${esc(t("Search settings…"))}" value="${esc(this.query)}">
        ${cats.map(c => `<a data-action="cat" data-cat="${c.id}" class="${!q && c.id === this.cat ? "active" : ""}"><i class="${c.icon}"></i> ${esc(t(c.label))}</a>`).join("")}
      </nav>
      <section class="hub-body">
        <header class="hub-head">${q ? esc(t("Search: {q}", { q: this.query })) : `<h2>${esc(t(cur?.label ?? ""))}</h2><p>${esc(t(cur?.about ?? ""))}</p>`}
          ${gm ? "" : `<p class="hub-note">${esc(t("You can change your own settings; world settings are changed by the GM."))}</p>`}</header>
        <div class="hub-list">${rows}${tools}${!rows && !tools ? `<p class="hub-empty">${esc(t("Nothing found."))}</p>` : ""}</div>
        <footer class="hub-foot"><span>${dirty ? esc(t("Unsaved changes: {n}", { n: dirty })) : ""}</span>
          <button type="button" data-action="save" ${dirty ? "" : "disabled"}><i class="fa-solid fa-floppy-disk"></i> ${esc(t("Save"))}</button></footer>
      </section>`;
  }

  _replaceHTML(result, content) {
    const focus = document.activeElement?.classList?.contains("hub-search") ? document.activeElement.selectionStart : null;
    const scroll = content.querySelector(".hub-list")?.scrollTop ?? 0;
    content.innerHTML = result;
    const list = content.querySelector(".hub-list");
    if (list) list.scrollTop = scroll;
    if (focus != null) { const s = content.querySelector(".hub-search"); s.focus(); s.setSelectionRange(focus, focus); }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    el.querySelector(".hub-search")?.addEventListener("input", ev => { this.query = ev.target.value; this.render(); });
    el.querySelector(".hub-list")?.addEventListener("change", ev => {
      const s = HUB.settings.find(x => x.key === ev.target.name);
      if (!s) return;
      let v = s.type === Boolean ? ev.target.checked : s.type === Number ? Number(ev.target.value) : ev.target.value;
      if (s.type === Number && !Number.isFinite(v)) v = s.default;
      let saved; try { saved = game.settings.get(F, s.key); } catch { saved = s.default; }
      if (JSON.stringify(v) === JSON.stringify(saved)) delete this.draft[s.key]; else this.draft[s.key] = v;
      this.render();
    });
  }

  static #onCat(event, target) { this.cat = target.dataset.cat; this.query = ""; this.render(); }

  static #onReset(event, target) {
    const key = target.closest("[data-key]")?.dataset.key;
    const s = HUB.settings.find(x => x.key === key);
    if (!s) return;
    let saved; try { saved = game.settings.get(F, key); } catch { saved = s.default; }
    if (JSON.stringify(saved) === JSON.stringify(s.default)) delete this.draft[key]; else this.draft[key] = s.default;
    this.render();
  }

  static #onMenu(event, target) {
    const m = HUB.menus.find(x => x.key === target.dataset.key);
    if (!m?.type) return;
    try { new m.type().render({ force: true }); } catch (err) { console.error(`${F} | menu`, err); }
  }

  static async #onSave() {
    let reload = false;
    for (const [key, v] of Object.entries(this.draft)) {
      const s = HUB.settings.find(x => x.key === key);
      if (!s || (s.scope === "world" && !game.user.isGM)) continue;
      await game.settings.set(F, key, v);
      if (s.requiresReload) reload = true;
    }
    this.draft = {};
    ui.notifications.info(t("Settings saved."));
    this.render();
    if (reload) {
      const SC = foundry.applications?.settings?.SettingsConfig;
      if (SC?.reloadConfirm) await SC.reloadConfirm({ world: true });
      else if (await foundry.applications.api.DialogV2.confirm({ content: `<p>${t("Some changes need a reload. Reload now?")}</p>` })) foundry.utils.debouncedReload?.() ?? location.reload();
    }
  }
}

export function openSettingsHub() {
  const open = foundry.applications.instances?.get?.("foe-settings-hub");
  return open ? open.bringToFront?.() ?? open.render({ force: true }) : new FoeSettingsHub().render({ force: true });
}

/** Klucz bez przestrzeni nazw (Foundry zapisuje go raz jako „klucz”, raz jako „foe-rpg.klucz”). */
const shortKey = (k, id = "") => String(k ?? id).replace(new RegExp(`^${F}\\.`), "");

/** Ustawienia i menu systemu z listy Foundry → do okna (zostaje język i przycisk okna). */
export function collect() {
  HUB.settings = [];
  for (const [id, s] of [...(game.settings.settings?.entries?.() ?? [])]) {
    if (s.namespace !== F || !s.config) continue;
    const key = shortKey(s.key, id);
    HUB.settings.push({ ...s, key });
    if (!KEEP_IN_CORE.has(key)) s.config = false;
  }
  HUB.menus = [];
  for (const [id, m] of [...(game.settings.menus?.entries?.() ?? [])]) {
    const key = shortKey(m.key, id);
    if (m.namespace !== F || key === "settingsHub") continue;
    HUB.menus.push({ ...m, key });
    game.settings.menus.delete(id);
  }
  return HUB;
}

export function registerSettingsHub() {
  class Menu extends ApplicationV2 { async render() { openSettingsHub(); return this; } }
  game.settings.registerMenu(F, "settingsHub", {
    name: "Fallout: Equestria settings",
    label: "Open the settings",
    hint: "All system options in one PipBuck window: categories, search and a description of what each one changes. Players change their own (look and sound) there too.",
    icon: "fa-solid fa-sliders",
    type: Menu,
    restricted: false
  });
  // po rejestracji wszystkiego: ustawienia i menu systemu z listy Foundry przechodzą do okna
  Hooks.once("setup", () => collect());
  // zapasowe wejście: przycisk w zakładce Ustawienia na pasku bocznym (obok „Konfiguruj ustawienia”)
  Hooks.on("renderSettings", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-hub-open")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "foe-hub-open";
    btn.innerHTML = `<i class="fa-solid fa-sliders"></i> ${esc(t("Fallout: Equestria settings"))}`;
    btn.addEventListener("click", ev => { ev.preventDefault(); openSettingsHub(); });
    const anchor = root.querySelector('[data-action="configure"], [data-app="configure"], button[data-action="openApp"]');
    if (anchor) anchor.after(btn); else (root.querySelector("section, .settings, #settings-game") ?? root).prepend(btn);
  });
}
