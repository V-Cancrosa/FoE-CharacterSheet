/**
 * Zagrożenia na mapie (logika i presety: hazards-data.mjs).
 *   - Przycisk MG „Zagrożenia (FoE)” na pasku narzędzi kafelków: okno z presetami (beczka, generator, reaktor,
 *     balefire, strefa promieniowania, wysypisko, różowa chmura, kałuża skażenia) i własnymi presetami MG; „Postaw”
 *     tworzy kafelek albo region na środku widoku (potem przesuwasz go jak zwykle).
 *   - Kałuża skażenia: token postaci albo NPC wchodzący do regionu z flagą taintPuddle dostaje dawkę skażenia (aktywny MG).
 *   - Konfiguracja sceny, regionu i kafelka: wszystkie pola FoE w jednej sekcji „Fallout: Equestria” z presetem.
 */
import { t } from "./i18n.mjs";
import { HAZARDS, hazardById, hazardDoc, TAINT_ENTRY, entered } from "./hazards-data.mjs";
import { PINK_LEVELS } from "./pink-data.mjs";
import { RAD_ZONES } from "./survival-data.mjs";
import { exposeTaint } from "./taint.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const { DialogV2 } = foundry.applications.api;
const customs = () => { try { return game.settings.get(F, "hazardPresets") ?? []; } catch { return []; } };
const allPresets = () => [...HAZARDS, ...customs().map(c => ({ ...(hazardById(c.base) ?? {}), ...c, custom: true }))];
const iconHtml = icon => (/\.(svg|png|webp|jpe?g)$/i.test(icon ?? "") ? `<img src="${esc(icon)}" alt="">` : `<i class="${esc(icon ?? "fa-solid fa-triangle-exclamation")}"></i>`);
const radOptions = cur => RAD_ZONES.filter(z => z.level >= 1).map(z => `<option value="${z.rate}" ${Number(cur) === z.rate ? "selected" : ""}>${esc(t("Level {n} — {rate} rads/min", { n: z.level, rate: z.rate }))}</option>`).join("");

export function paramsHtml(h) {
  const row = (label, input) => `<label class="atk-row">${esc(label)} ${input}</label>`;
  const rows = [row(t("Hazard name"), `<input type="text" name="name" value="${esc(h.custom ? h.name : t(h.label))}">`)];
  if (h.kind === "tile") {
    rows.push(row(t("At the source (rads/min)"), `<input type="number" name="rate" min="0" step="any" value="${h.rate}">`));
    rows.push(row(t("Range (ft)"), `<input type="number" name="range" min="0" step="5" value="${h.range}">`));
    rows.push(row(t("Size (squares)"), `<input type="number" name="size" min="1" max="10" step="1" value="${h.size}">`));
    rows.push(row(t("Image"), `<span class="hz-file"><input type="text" name="texture" value="${esc(h.texture ?? "")}" placeholder="${esc(h.icon)}"><button type="button" class="hz-pick"><i class="fa-solid fa-folder-open"></i></button></span>`));
  } else {
    rows.push(row(t("Radius (ft)"), `<input type="number" name="radius" min="5" step="5" value="${h.radius}">`));
    if (h.rads) rows.push(row(t("Radiation"), `<select name="rads">${radOptions(h.rads)}</select>`));
    if (h.pink) {
      rows.push(row(t("Density"), `<select name="pink">${PINK_LEVELS.filter(l => l.d).map(l => `<option value="${l.d}" ${l.d === Number(h.pink) ? "selected" : ""}>${esc(t(l.label))}</option>`).join("")}</select>`));
      rows.push(`<label class="atk-row atk-check"><input type="checkbox" name="persistent" ${h.persistent ? "checked" : ""}> <span>${esc(t("persistent (doesn't thin)"))}</span></label>`);
    }
    if (h.taint) rows.push(row(t("Taint on entering"), `<select name="taint">${TAINT_ENTRY.filter(o => o.v).map(o => `<option value="${o.v}" ${o.v === Number(h.taint) ? "selected" : ""}>${esc(t(o.label))}</option>`).join("")}</select>`));
  }
  rows.push(`<label class="atk-row atk-check"><input type="checkbox" name="save"> <span>${esc(t("Also save as my own preset"))}</span></label>`);
  return rows.join("");
}

function readParams(form) {
  const e = form.elements, v = n => e[n]?.value;
  const num = n => (e[n] ? Number(v(n)) : undefined);
  return { name: v("name")?.trim(), rate: num("rate"), range: num("range"), size: num("size"), texture: v("texture")?.trim(), radius: num("radius"),
    rads: num("rads"), pink: num("pink"), persistent: e.persistent?.checked, taint: num("taint"), save: e.save?.checked };
}

let hazardsOpen = false;
export async function openHazards() {
  if (!game.user.isGM || !canvas?.scene) return ui.notifications.warn(t("Open a scene first."));
  if (hazardsOpen) return null;   // jedno okno naraz
  hazardsOpen = true;
  try { return await hazardsDialog(); } finally { hazardsOpen = false; }
}

async function hazardsDialog() {
  const list = allPresets();
  const cards = list.map((h, i) => `<label class="hz-card" title="${esc(h.custom ? h.name : t(h.desc))}"><input type="radio" name="preset" value="${i}" ${i ? "" : "checked"}>
    <span class="hz-ico">${iconHtml(h.texture || h.icon)}</span><span class="hz-name">${h.custom ? "★ " : ""}${esc(h.custom ? h.name : t(h.label))}</span>
    ${h.custom ? `<a class="hz-del" data-del="${esc(h.id)}" title="${esc(t("Delete this preset"))}"><i class="fa-solid fa-trash"></i></a>` : ""}</label>`).join("");
  const content = `<div class="foe-dialog foe-hazards"><div class="hz-grid">${cards}</div>
    <p class="hz-desc hint"></p><div class="hz-params"></div>
    <p class="hint">${esc(t("Placed at the centre of the view — then move and resize it like any tile or region. Settings stay editable in its configuration (section Fallout: Equestria)."))}</p></div>`;
  const res = await DialogV2.wait({
    window: { title: t("Hazards (Fallout: Equestria)"), icon: "fa-solid fa-biohazard" }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 560 }, content, rejectClose: false,
    render: (ev, dlg) => {
      const form = dlg.element.querySelector("form") ?? dlg.element;
      const show = () => {
        const h = list[Number(form.querySelector("input[name=preset]:checked")?.value) || 0];
        form.querySelector(".hz-params").innerHTML = paramsHtml(h);
        form.querySelector(".hz-desc").textContent = h.custom ? t("Own preset based on: {b}", { b: t(hazardById(h.base)?.label ?? "") }) : t(h.desc);
        form.querySelector(".hz-pick")?.addEventListener("click", () => {
          const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
          new FP({ type: "image", callback: path => { form.elements.texture.value = path; } }).render(true);
        });
      };
      form.querySelector(".hz-grid").addEventListener("change", show);
      for (const a of form.querySelectorAll(".hz-del")) a.addEventListener("click", async e2 => {
        e2.preventDefault(); e2.stopPropagation();
        await game.settings.set(F, "hazardPresets", customs().filter(c => c.id !== a.dataset.del));
        a.closest(".hz-card").remove();
      });
      show();
    },
    buttons: [{ action: "place", label: t("Place on the map"), icon: "fa-solid fa-location-dot", default: true,
      callback: (ev, btn) => ({ h: list[Number(btn.form.querySelector("input[name=preset]:checked")?.value) || 0], p: readParams(btn.form) }) }]
  });
  if (!res) return null;
  return placeHazard(res.h, res.p);
}

export async function placeHazard(h, p) {
  const base = h.custom ? hazardById(h.base) ?? h : h;
  if (p.save) {
    const id = `c${foundry.utils.randomID(8)}`;
    const keep = Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== undefined && v !== "" && k !== "save"));
    await game.settings.set(F, "hazardPresets", [...customs(), { id, base: base.id, kind: base.kind, icon: base.icon, ...keep, name: p.name || t(base.label) }]);
  }
  const grid = { size: canvas.scene.grid?.size ?? 100, distance: canvas.scene.grid?.distance ?? 5 };
  const c = canvas.stage?.pivot ?? { x: (canvas.dimensions?.width ?? 2000) / 2, y: (canvas.dimensions?.height ?? 2000) / 2 };
  const { type, data } = hazardDoc(base, { ...p, labelText: t(base.label) }, { x: c.x, y: c.y, grid });
  if (type === "Region") {
    const V = CONST.REGION_VISIBILITY ?? {};
    if (base.pink || base.taint || base.id === "dump") data.visibility = V.ALWAYS ?? 2;
    try { return await canvas.scene.createEmbeddedDocuments("Region", [data]); } catch (err) {
      // starsze Foundry bez elips — prostokąt
      const s = data.shapes[0];
      data.shapes = [{ type: "rectangle", x: s.x - s.radiusX, y: s.y - s.radiusY, width: s.radiusX * 2, height: s.radiusY * 2, rotation: 0, hole: false }];
      console.warn(`${F} | hazard region`, err);
      return canvas.scene.createEmbeddedDocuments("Region", [data]);
    }
  }
  return canvas.scene.createEmbeddedDocuments("Tile", [data]);
}

// ---------- kałuża skażenia ----------
const centerOf = (td, pos = {}) => {
  const size = td.parent?.grid?.size ?? 100;
  const x = pos.x ?? td.x, y = pos.y ?? td.y;
  return { x: x + ((td.width ?? 1) * size) / 2, y: y + ((td.height ?? 1) * size) / 2, elevation: pos.elevation ?? td.elevation ?? 0 };
};
const testIn = (region, p) => { try { return !!(region.testPoint?.(p) ?? region.object?.testPoint?.(p, p.elevation)); } catch { return false; } };

// ---------- jedna sekcja FoE w konfiguracji ----------
const GROUPS = { scene: [".foe-scene-rads", ".foe-scene-provided", ".foe-scene-taint", ".foe-pink-zone"], region: [".foe-region-rads", ".foe-pink-zone"], tile: [".foe-tile-rads"] };

function envSection(app, html, kind) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-env")) return;
  const parts = GROUPS[kind].map(s => root.querySelector(s)).filter(Boolean);
  if (kind === "region" && !root.querySelector(".foe-taint-puddle")) {
    const cur = Number(doc.flags?.[F]?.taintPuddle) || 0;
    const g = document.createElement("div");
    g.className = "form-group foe-taint-puddle";
    g.innerHTML = `<label>${esc(t("Taint puddle"))}</label><div class="form-fields"><select name="flags.${F}.taintPuddle" data-dtype="Number">${TAINT_ENTRY.map(o => `<option value="${o.v}" ${o.v === cur ? "selected" : ""}>${esc(t(o.label))}</option>`).join("")}</select></div>
      <p class="hint">${esc(t("A character's or NPC's token entering this region gets this many taint ticks (Luck rolls per Table XXXVI)."))}</p>`;
    parts.push(g);
  }
  if (!parts.length) return;
  const fs = document.createElement("fieldset");
  fs.className = "foe-env";
  const presets = HAZARDS.filter(h => h.kind === (kind === "tile" ? "tile" : "region"));
  fs.innerHTML = `<legend><i class="fa-solid fa-radiation"></i> Fallout: Equestria</legend>
    ${kind === "scene" ? "" : `<div class="form-group foe-env-preset"><label>${esc(t("Preset"))}</label><div class="form-fields"><select class="foe-env-pick"><option value="">—</option>${presets.map(h => `<option value="${h.id}">${esc(t(h.label))}</option>`).join("")}</select></div>
      <p class="hint">${esc(t("Fills the fields below; save the form as usual."))}</p></div>`}`;
  parts[0].before(fs);
  for (const p of parts) {
    if (p.tagName === "FIELDSET") { p.querySelector("legend")?.remove(); fs.append(...p.children); p.remove(); } else fs.append(p);
  }
  fs.querySelector(".foe-env-pick")?.addEventListener("change", ev => {
    const h = hazardById(ev.target.value);
    if (!h) return;
    const set = (name, v) => { const el = fs.querySelector(`[name="flags.${F}.${name}"]`); if (!el || v === undefined) return; if (el.type === "checkbox") el.checked = !!v; else el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    if (h.kind === "tile") { set("rads.rate", h.rate); set("rads.range", h.range); }
    else { set("rads.rate", h.rads ?? 0); set("pink.density", h.pink ?? 0); set("taintPuddle", h.taint ?? 0); }
  });
  app.setPosition?.({ height: "auto" });
}

export function registerHazards() {
  game.settings.register(F, "hazardPresets", { scope: "world", config: false, type: Array, default: [] });
  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user?.isGM) return;
    // v13+: narzędzie-przycisk woła onChange; v12 (lista): onClick — tylko jedno, inaczej okno otwiera się dwa razy
    const legacy = Array.isArray(controls);
    const tool = { name: "foeHazards", title: t("Hazards (Fallout: Equestria)"), icon: "fa-solid fa-biohazard", button: true, visible: true, order: 99,
      ...(legacy ? { onClick: () => openHazards() } : { onChange: () => openHazards() }) };
    const tiles = legacy ? controls.find(c => c.name === "tiles") : controls.tiles;
    if (!tiles) return;
    if (Array.isArray(tiles.tools)) tiles.tools.push(tool); else tiles.tools.foeHazards = tool;
  });
  for (const [hook, kind] of [["renderSceneConfig", "scene"], ["renderRegionConfig", "region"], ["renderTileConfig", "tile"]]) {
    Hooks.on(hook, (app, html) => { try { envSection(app, html, kind); } catch (err) { console.warn(`${F} | config section`, err); } });
  }
  Hooks.on("preUpdateToken", (td, changes, options) => {
    if (!("x" in changes || "y" in changes)) return;
    options.foeFrom = centerOf(td);
  });
  Hooks.on("updateToken", (td, changes, options) => {
    if (!game.users.activeGM?.isSelf || !options.foeFrom || !["character", "npc"].includes(td.actor?.type)) return;
    const to = centerOf(td, changes);
    for (const r of td.parent?.regions ?? []) {
      const dose = Number(r.flags?.[F]?.taintPuddle) || 0;
      if (dose > 0 && entered(p => testIn(r, p), options.foeFrom, to)) exposeTaint(td.actor, dose, r.name).catch(err => console.error(`${F} | taint puddle`, err));
    }
  });
}
