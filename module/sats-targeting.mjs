/**
 * Celownik S.A.T.S. (zasada opcjonalna; na podstawie modułu foe-sats autorstwa V_Cancrosa).
 * Zaznaczenie SATS w oknie ataku (albo przycisk celownika przy „Cel ataku”) przybliża kamerę do namierzonego tokena
 * i pokazuje sylwetkę celu jak w V.A.T.S.: każda część ciała z szansą trafienia liczoną przez okno ataku.
 * Klik na część ustawia strzał celowany w oknie; Esc wychodzi z SATS.
 * Włącza MG w ustawieniach świata; gdy aktywny jest osobny moduł foe-sats, wersja wbudowana się nie uruchamia.
 */
import { bodyMap } from "./body-map.mjs";
import { CALLED_SHOTS, HIT_TABLES, hitTableFor, tableLocations } from "./combat.mjs";
import { locationName } from "./rolls.mjs";

const F = "foe-rpg";
const ID = "foe-sats";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const SETTING = { autoOpen: "satsAutoOpen", zoom: "satsZoom", restoreDelay: "satsRestoreDelay", minimize: "satsMinimize" };
const setting = key => game.settings.get(F, SETTING[key]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Włączone w świecie i nie zdublowane przez osobny moduł foe-sats. */
const enabled = () => {
  try { return !!game.settings.get(F, "satsTargeting") && !game.modules?.get(ID)?.active; } catch { return false; }
};

/** Stan per okno ataku: zapamiętany widok kamery i otwarta nakładka. */
const STATE = new WeakMap();

export function registerSatsSettings() {
  game.settings.register(F, "satsTargeting", {
    name: "Celownik S.A.T.S. (opcja)",
    hint: "Przy ataku z SATS kamera najeżdża na namierzony cel, a na ekranie pojawia się jego sylwetka w stylu V.A.T.S. z szansą trafienia każdej części ciała — klik ustawia strzał celowany. Wymaga namierzenia celu (T).",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "satsAutoOpen", {
    name: "S.A.T.S.: celownik po zaznaczeniu SATS",
    hint: "Zaznaczenie SATS w oknie ataku od razu otwiera celownik (gdy jest namierzony cel). Wyłączony — tylko przycisk ⌖ przy „Cel ataku”.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "satsZoom", {
    name: "S.A.T.S.: przybliżaj kamerę do celu",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "satsMinimize", {
    name: "S.A.T.S.: zwijaj karty na czas celowania",
    hint: "Otwarte karty postaci i przedmiotów zwijają się, gdy otwiera się celownik, i wracają po ataku albo wyjściu z SATS — nic nie zasłania celu.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "satsRestoreDelay", {
    name: "S.A.T.S.: powrót kamery (ms)",
    hint: "Po zamknięciu okna ataku kamera wraca do poprzedniego widoku po tylu milisekundach. −1 = zostaje przy celu.",
    scope: "client", config: true, type: Number, default: 1500, range: { min: -1, max: 5000, step: 100 }
  });
}

export function registerSatsHooks() {
  Hooks.on("renderDialogV2", (app, element) => {
    if (!enabled()) return;
    const root = element instanceof HTMLElement ? element : app.element;
    if (!root?.classList.contains("foe-roll-dialog") || root.dataset.foeSats) return;
    const form = root.querySelector("form") ?? root;
    const sats = form.querySelector(".dlg-attack input[name=sats]");
    const loc = form.querySelector(".dlg-attack select[name=loc]");
    if (!sats || !loc) return;
    root.dataset.foeSats = "1";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "foe-sats-open";
    btn.title = "Celownik S.A.T.S. — przybliż cel i wybierz część ciała";
    btn.innerHTML = `<i class="fa-solid fa-crosshairs"></i>`;
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      openSats(app, form, { viaCheckbox: false });
    });
    loc.after(btn);

    sats.addEventListener("change", () => {
      if (sats.checked && setting("autoOpen")) openSats(app, form, { viaCheckbox: true });
    });
  });

  Hooks.on("closeDialogV2", app => {
    const st = STATE.get(app);
    if (!st) return;
    st.close?.();
    restoreCamera(st, setting("restoreDelay"));
    restoreSheets(st);
  });
}

// ======================================================================
// Szanse trafienia — liczy je samo okno ataku
// ======================================================================

/** Próg trafienia przy zaznaczonym MFD, odczytany z okna („≤ 34” albo „→ ½ ≤ 17”). */
function chanceOf(form) {
  const t = form.querySelector("input[name=mfd]:checked")?.closest("label")?.querySelector(".t")?.textContent ?? "";
  const n = Number(t.match(/≤\s*(-?\d+)/)?.[1]);
  return Number.isFinite(n) ? clamp(n, 0, 100) : null;
}

/** Każda opcja „Cel ataku” po kolei: ustaw, przelicz okno, odczytaj próg; na końcu przywróć wybór. */
function measure(form, select) {
  const original = select.value;
  const set = v => {
    select.value = v;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const out = [...select.options].map(o => {
    set(o.value);
    return { value: o.value, text: o.textContent.trim(), chance: chanceOf(form) };
  });
  set(original);
  return out;
}

const stepsNote = s => (s ? `${s} kr. MFD`.replace("-", "−") : "bez kary");

/** Wiersze listy celów: tylko części, które cel ma; oko, serce i rozłożone skrzydła pod swoją częścią. */
function rowsFor(measured, locs, table) {
  const rows = [];
  for (const m of measured) {
    const c = CALLED_SHOTS[m.value];
    if (c) {
      if (!locs.includes(c.loc)) continue;
      const primary = c.loc === m.value;
      const mult = c.mult ? `×${c.mult}` : c.loc === "head" ? "×1,5" : "";
      // dwunożni i pojazdy mają własne nazwy części (ramiona, kabina…); reszta — jak w oknie ataku, bez nawiasu
      const own = HIT_TABLES[table]?.biped || table === "vehicle";
      rows.push({
        ...m, part: c.loc, sub: !primary,
        name: primary && own ? locationName(m.value, table) : c.label.replace(/\s*\(.*\)$/, ""),
        note: [stepsNote(c.steps), mult].filter(Boolean).join(" · ")
      });
    } else {
      // strefy z bestiariusza i „Losowo”
      const [, name, note] = m.text.match(/^(.*?)\s*(?:\((.*)\))?$/) ?? [null, m.text, ""];
      rows.push({ ...m, part: null, sub: false, name, note: note ?? "", random: m.value === "random" });
    }
  }
  // podopcje bezpośrednio pod częścią, której dotyczą
  const main = rows.filter(r => !r.sub);
  return main.flatMap(r => [r, ...rows.filter(s => s.sub && s.part === r.value)]);
}

// ======================================================================
// Karty: zwinięte na czas celowania
// ======================================================================

/** Zwiń otwarte okna systemu z dokumentem (karty postaci, NPC, przedmiotów), żeby nie zasłaniały celu. */
function minimizeSheets(st) {
  if (!setting("minimize")) return;
  st.minimized ??= [];
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (!app?.rendered || app.minimized || !app.document || st.minimized.includes(app)) continue;
    if (!app.element?.classList?.contains("foe-rpg")) continue;
    try { app.minimize(); st.minimized.push(app); } catch (err) { console.warn(`${ID} | zwijanie karty`, err); }
  }
}

function restoreSheets(st) {
  for (const app of st.minimized ?? []) {
    try { if (app.rendered && app.minimized) app.maximize(); } catch (err) { console.warn(`${ID} | rozwijanie karty`, err); }
  }
  st.minimized = [];
}

// ======================================================================
// Kamera
// ======================================================================

async function focusCamera(st, token) {
  if (!canvas.ready) return;
  if (!setting("zoom")) return;
  st.prev ??= { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x };
  const size = Math.max(token.w, token.h) || canvas.grid.size;
  const scale = clamp(window.innerHeight * 0.3 / size, 0.5, CONFIG.Canvas.maxZoom ?? 3);
  const { x, y } = token.center;
  // cel w górnej części ekranu — dół zajmuje panel SATS
  await canvas.animatePan({ x, y: y + window.innerHeight * 0.17 / scale, scale, duration: 650 });
}

function restoreCamera(st, delay = 0) {
  const prev = st.prev;
  st.prev = null;
  if (!prev || delay < 0 || !canvas.ready) return;
  setTimeout(() => canvas.animatePan({ ...prev, duration: 600 }), delay);
}

// ======================================================================
// Nakładka S.A.T.S.
// ======================================================================

async function openSats(app, form, { viaCheckbox }) {
  const token = game.user.targets.first();
  if (!token?.actor) return ui.notifications.info("SATS: namierz cel (T), żeby go przybliżyć i wybrać część ciała.");
  const st = STATE.get(app) ?? {};
  STATE.set(app, st);
  if (st.close) return;

  const select = form.elements.loc;
  const sats = form.elements.sats;
  const actor = token.actor;
  const sys = actor.system;
  const table = hitTableFor(sys.race);
  const locs = tableLocations(sys.isVehicle ? "vehicle" : table).filter(k => sys.locations?.[k]);
  // skrzydła i róg także, gdy rasa ich nie ma w tabeli, ale mają rany albo DT (jak na karcie postaci)
  for (const k of ["wings", "horn"]) if (!locs.includes(k) && (sys.locations?.[k]?.wounds || sys.locations?.[k]?.dt)) locs.push(k);

  const measured = measure(form, select);
  const rows = rowsFor(measured, locs, sys.isVehicle ? "vehicle" : table);
  const monster = measured.some(m => m.value.startsWith("area:"));
  let map = null;
  if (!monster && !sys.isVehicle && sys.locations) {
    const cyber = new Set(actor.items.filter(i => i.system?.kind === "cyberlimb" && i.system.cyber?.loc).map(i => i.system.cyber.loc));
    map = bodyMap(sys, locs, { table, labels: Object.fromEntries(locs.map(k => [k, locationName(k, table)])), cyber });
  }

  const mfd = form.querySelector("input[name=mfd]:checked")?.closest("label")?.querySelector(".k")?.textContent ?? "";
  const ap = sats?.closest("label")?.querySelector("small")?.textContent ?? "";
  const el = document.createElement("div");
  el.className = "foe-rpg foe-sats";
  el.innerHTML = `
    <div class="sats-tint"></div>
    <div class="sats-vignette"></div>
    <div class="sats-reticle" hidden></div>
    <header class="sats-head">
      <div class="sats-logo">S.A.T.S.</div>
      <div class="sats-sub">Cel: <b>${esc(token.name)}</b>${mfd ? ` · MFD ${esc(mfd)}` : ""}${sats?.checked && ap ? ` · ${esc(ap.split(" · ")[0])}` : ""}</div>
    </header>
    <section class="sats-panel ${map ? "" : "list-only"}">
      ${map ? `<div class="sats-map">${svgOf(map, rows)}</div>` : ""}
      <ol class="sats-list">${rows.map(r => `
        <li data-opt="${esc(r.value)}" class="${r.sub ? "sub" : ""} ${r.random ? "random" : ""} ${lowClass(r.chance)}">
          <span class="nm">${esc(r.name)}</span>
          <b class="pct">${r.chance == null ? "—" : `${r.chance}%`}</b>
          <small>${esc(r.note)}</small>
        </li>`).join("")}
      </ol>
    </section>
    <footer class="sats-foot">
      <span>Najedź — podgląd · klik — wybierz · ↑↓ i Enter · Esc — ${viaCheckbox ? "wyjdź z SATS" : "zamknij"}</span>
      <button type="button" data-cancel>${viaCheckbox ? "Wyjdź z SATS" : "Zamknij"}</button>
    </footer>`;

  const values = rows.map(r => r.value);
  let active = values.includes(select.value) ? select.value : values[0];
  const setActive = v => {
    active = v;
    const part = rows.find(r => r.value === v)?.part ?? null;
    for (const n of el.querySelectorAll(".sats-list li")) n.classList.toggle("hot", n.dataset.opt === v);
    for (const n of el.querySelectorAll(".pip-body [data-opt]")) n.classList.toggle("hot", n.dataset.opt === part);
    el.querySelector(`.sats-list li[data-opt="${CSS.escape(v)}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const dialogEl = app.element;
  const close = () => {
    st.close = null;
    el.remove();
    window.removeEventListener("keydown", onKey, { capture: true });
    if (dialogEl) dialogEl.style.visibility = "";
  };
  const choose = v => {
    select.value = v;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  };
  const cancel = () => {
    close();
    if (viaCheckbox && sats?.checked) {
      sats.checked = false;
      sats.dispatchEvent(new Event("change", { bubbles: true }));
    }
    restoreCamera(st);
    restoreSheets(st);
  };
  // Esc w Foundry zamyka okna — przechwytujemy klawisze, zanim dotrą do skrótów Foundry
  const onKey = ev => {
    const i = values.indexOf(active);
    if (ev.key === "Escape") cancel();
    else if (ev.key === "Enter") choose(active);
    else if (ev.key === "ArrowDown") setActive(values[(i + 1) % values.length]);
    else if (ev.key === "ArrowUp") setActive(values[(i - 1 + values.length) % values.length]);
    else return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  };

  el.addEventListener("pointerover", ev => {
    const t = ev.target.closest("[data-opt]");
    if (t) setActive(t.dataset.opt);
  });
  el.addEventListener("click", ev => {
    if (ev.target.closest("[data-cancel]")) return cancel();
    const t = ev.target.closest("[data-opt]");
    if (t) choose(t.dataset.opt);
  });
  window.addEventListener("keydown", onKey, { capture: true });

  st.close = close;
  minimizeSheets(st);
  if (dialogEl) dialogEl.style.visibility = "hidden";
  document.body.append(el);
  setActive(active);

  await focusCamera(st, token);
  placeReticle(el, token);
}

/** Celownik na tokenie — pozycja na ekranie po zakończeniu najazdu kamery. */
function placeReticle(el, token) {
  const r = el.querySelector(".sats-reticle");
  if (!r || !el.isConnected || !canvas.ready) return;
  try {
    const p = canvas.clientCoordinatesFromCanvas(token.center);
    const size = Math.max(token.w, token.h) * canvas.stage.scale.x * 1.25;
    Object.assign(r.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${size}px`, height: `${size}px` });
    r.hidden = false;
  } catch (err) {
    console.warn(`${ID} | pozycja celownika`, err);
  }
}

const lowClass = c => (c == null ? "" : c < 25 ? "low" : c < 50 ? "mid" : "");

/** Sylwetka z body-map.mjs (ta sama co na karcie postaci), z szansą trafienia w opisach zamiast kary. */
function svgOf(map, rows) {
  const byPart = Object.fromEntries(rows.filter(r => !r.sub && r.part).map(r => [r.part, r]));
  const parts = map.parts.map(p => `
    <g class="part ${p.cls}" data-opt="${p.key}">${p.ds.map(d => `<path d="${d}"/>`).join("")}</g>`).join("");
  const callouts = map.callouts.map(c => {
    const r = byPart[c.key];
    const pct = r?.chance == null ? "—" : `${r.chance}%`;
    return `
    <g class="callout ${c.cls} ${lowClass(r?.chance)}" data-opt="${c.key}">
      <rect class="box" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="3"/>
      <text x="${c.tx}" y="${c.y}"><tspan class="nm" x="${c.tx}" dy="15">${esc(c.name)}</tspan><tspan x="${c.tx}" dy="17">${esc(c.line1)}</tspan><tspan x="${c.tx}" dy="14">${esc(c.line2)}</tspan><tspan class="dim" x="${c.tx}" dy="14">${esc(r?.note ?? "")}</tspan></text>
      <text class="pct" x="${c.x + c.w - 7}" y="${c.y + 34}" text-anchor="end">${pct}</text>
    </g>`;
  }).join("");
  return `
    <svg class="pip-body" viewBox="${map.viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Części ciała celu">
      <g class="vats" transform="translate(0,${map.dy})">
        <circle cx="${map.cx}" cy="${map.cy}" r="150"/><circle cx="${map.cx}" cy="${map.cy}" r="104"/>
      </g>
      ${map.callouts.map(c => `<line class="lead ${c.cls}" x1="${c.lx1}" y1="${c.ly1}" x2="${c.lx2}" y2="${c.ly2}"/>`).join("")}
      <g transform="translate(0,${map.dy})">
        ${parts}
        ${map.decor.map(d => `<path class="decor" d="${d}"/>`).join("")}
        ${map.eyes.map(e => `<circle class="decor eye" cx="${e.cx}" cy="${e.cy}" r="5"/>`).join("")}
      </g>
      ${callouts}
    </svg>`;
}
