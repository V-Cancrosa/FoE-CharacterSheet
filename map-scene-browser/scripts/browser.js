/**
 * Map & Scene Browser: a GM window listing map and scene modules from a remote CSV
 * (columns: source, name, json_link, zip_link, version), with search, a type filter and Install / Uninstall.
 *
 * Foundry v14 has no client API that installs or removes packages inside a running world: ModuleManagement only
 * enables and disables modules (it has no installModules). Install and Uninstall therefore send the request the Setup
 * screen sends (POST /setup, actions "installPackage" / "uninstallPackage"). The server may refuse it while a world is
 * running or when this browser isn't logged in as the server administrator. In that case the GM is told why, and Install
 * copies the manifest URL for Setup → Add-on Modules → Install Module.
 */

const MODULE_ID = "map-scene-browser";
const TITLE = "Map & Scene Browser";
/** Types always offered in the filter; other values from the CSV's source column are added after them. */
const TYPES = ["Scene", "Map"];

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const esc = value => foundry.utils.escapeHTML(String(value ?? ""));

/* ---------------------------------------- CSV ---------------------------------------- */

/** RFC 4180 CSV: quoted fields may contain commas, doubled quotes ("") and line breaks. */
export function parseCSV(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (src[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    }
    else if (c === '"' && !field) quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim()));
}

/** CSV text → entries. The header row names the columns, in any order and case; rows without a name or manifest are skipped. */
export function csvEntries(text) {
  const [head = [], ...rows] = parseCSV(text);
  const col = new Map(head.map((h, i) => [h.trim().toLowerCase(), i]));
  for (const name of ["name", "json_link"]) {
    if (!col.has(name)) throw new Error(`the CSV has no "${name}" column`);
  }
  const cell = (row, name) => (row[col.get(name)] ?? "").trim();
  return rows
    .map(row => ({ source: cell(row, "source"), name: cell(row, "name"), manifest: cell(row, "json_link"), version: cell(row, "version") }))
    .filter(e => e.name && e.manifest);
}

/**
 * Dropbox share links (www.dropbox.com, dl.dropbox.com) reach the file through a redirect that a browser may not be
 * allowed to read from another site; the same path on dl.dropboxusercontent.com is served directly.
 */
function corsUrl(url) {
  try {
    const u = new URL(url);
    if (!/^(www\.|dl\.)?dropbox\.com$/i.test(u.hostname)) return url;
    u.hostname = "dl.dropboxusercontent.com";
    u.searchParams.delete("dl");
    return u.href;
  }
  catch { return url; }
}

/** Text of a public URL, trying the Dropbox content host first. */
async function fetchText(url) {
  let error;
  for (const href of new Set([corsUrl(url), url])) {
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }
    catch (err) { error = err; }
  }
  throw error;
}

let csvCache = null;
/** Entries from the CSV set in the settings, downloaded once per URL; null while no URL is set. */
async function loadEntries() {
  const url = game.settings.get(MODULE_ID, "csvUrl").trim();
  if (!url) return null;
  if (csvCache?.url !== url) csvCache = { url, entries: fetchText(url).then(csvEntries) };
  const cached = csvCache;
  try { return await cached.entries; }
  catch (err) {
    if (csvCache === cached) csvCache = null;
    throw err;
  }
}

/* ---------------------------------- installed state ---------------------------------- */

/** A manifest link without what doesn't change the file: www., the Dropbox host alias, the dl= and raw= flags. */
function manifestKey(url) {
  try {
    const u = new URL(url.trim());
    let host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (/(^|\.)dropbox(usercontent)?\.com$/.test(host)) host = "dropbox";
    u.searchParams.delete("dl");
    u.searchParams.delete("raw");
    u.searchParams.sort();
    const query = u.searchParams.toString();
    return host + u.pathname.replace(/\/+$/, "") + (query ? `?${query}` : "");
  }
  catch { return url.trim(); }
}

/** Installed modules by manifest link. */
const installedByManifest = () => new Map(game.modules.filter(m => m.manifest).map(m => [manifestKey(m.manifest), m]));

/** Changes made from this window since the world loaded; game.modules only picks them up after a reload. */
const session = { installed: new Set(), removed: new Set() };

/** Module ID of an entry without downloading anything: an installed module with the same manifest, or an ID read earlier. */
function knownId(entry, index = installedByManifest()) {
  const key = manifestKey(entry.manifest);
  return index.get(key)?.id ?? game.settings.get(MODULE_ID, "moduleIds")[key];
}

/** Module ID of an entry, read from its manifest when it isn't known yet (and remembered for the world). */
async function resolveId(entry) {
  const known = knownId(entry);
  if (known) return known;
  const { id } = JSON.parse(await fetchText(entry.manifest));
  if (!id || typeof id !== "string") throw new Error("the manifest has no module ID");
  const ids = game.settings.get(MODULE_ID, "moduleIds");
  await game.settings.set(MODULE_ID, "moduleIds", { ...ids, [manifestKey(entry.manifest)]: id });
  return id;
}

function stateOf(entry, index) {
  const key = manifestKey(entry.manifest);
  const id = knownId(entry, index);
  const mod = id && !session.removed.has(id) ? game.modules.get(id) : undefined;
  const pending = session.installed.has(key);
  return { key, id, mod, pending, installed: !!mod || pending };
}

function statusOf(entry, st) {
  if (st.pending) return { cls: "pending", text: "Installed, reload to use" };
  if (!st.mod) return { cls: "", text: "Not installed" };
  const { version, active } = st.mod;
  const update = entry.version && version && foundry.utils.isNewerVersion(entry.version, version);
  const text = [`v${version} installed`, update && `update: v${entry.version}`, active && "enabled"].filter(Boolean).join(" · ");
  return { cls: update ? "update" : active ? "active" : "installed", text };
}

/* --------------------------------- install / uninstall --------------------------------- */

/** The server didn't handle the request like the Setup screen's (as opposed to an error from the installer itself). */
class SetupRefused extends Error {}

/**
 * Sends a package action to the server the way the Setup screen does. Outside Setup the server may refuse it
 * (a redirect or a page instead of JSON), e.g. while a world is running or without an administrator login.
 */
async function setupRequest(body) {
  const res = await fetch(foundry.utils.getRoute("setup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual"
  });
  if (res.type === "opaqueredirect") throw new SetupRefused("the server redirected the request away from Setup");
  const data = await res.json().catch(() => null);
  if (data?.error) throw new Error(data.error);
  if (!res.ok || !data) throw new SetupRefused(res.ok ? "the server didn't answer like Setup does" : `HTTP ${res.status}`);
  return data;
}

/** The error's message, and for a refusal, the likely reason. */
function failure(err) {
  if (!(err instanceof SetupRefused)) return `${err.message}.`;
  const why = game.isAdmin
    ? "Foundry may allow this only from the Setup screen."
    : "This browser isn't logged in as the server administrator, and Foundry may allow this only from the Setup screen.";
  return `${err.message}. ${why}`;
}

async function installEntry(entry) {
  // the ID is only needed for the status and the "install again?" question, so a manifest that can't be read is fine
  const id = await resolveId(entry).catch(() => undefined);
  const st = stateOf(entry, installedByManifest());
  if (st.installed) {
    const again = await DialogV2.confirm({
      window: { title: "Install again?" },
      content: `<p><strong>${esc(st.mod?.title ?? entry.name)}</strong> is already installed${st.mod ? ` (v${esc(st.mod.version)})` : ""}.
        Install it again from its manifest${entry.version ? ` (v${esc(entry.version)} in the CSV)` : ""}?</p>`,
      rejectClose: false
    });
    if (!again) return;
  }
  ui.notifications.info(`Installing ${entry.name}…`);
  try {
    await setupRequest({ action: "installPackage", type: "module", id, manifest: entry.manifest });
  }
  catch (err) {
    const copied = await game.clipboard.copyPlainText(entry.manifest).then(() => true, () => false);
    const where = copied ? "The manifest URL is copied: paste it" : `Paste the manifest URL (${entry.manifest})`;
    ui.notifications.error(`Couldn't install ${entry.name}: ${failure(err)} ${where} in Setup → Add-on Modules → Install Module.`, { permanent: true });
    return;
  }
  session.installed.add(st.key);
  if (id) session.removed.delete(id);
  ui.notifications.success(`The server accepted ${entry.name}. Once it's installed, reload the world to enable it in Manage Modules.`);
}

async function uninstallEntry(entry) {
  let id;
  try { id = await resolveId(entry); }
  catch (err) {
    ui.notifications.error(`Couldn't read the module ID of ${entry.name} from its manifest (${err.message}). Uninstall it in Setup → Add-on Modules.`);
    return;
  }
  const st = stateOf(entry, installedByManifest());
  if (!st.installed) {
    ui.notifications.warn(`${entry.name} (${id}) isn't installed on this server.`);
    return;
  }
  const title = st.mod?.title ?? entry.name;
  if (st.mod?.active) {
    ui.notifications.warn(`${title} is enabled in this world. Disable it in Manage Modules first, then uninstall it.`);
    return;
  }
  const sure = await DialogV2.confirm({
    window: { title: "Uninstall module?" },
    content: `<p>Delete <strong>${esc(title)}</strong> (<code>${esc(id)}</code>) from the server? Its files are removed for every world.</p>`,
    rejectClose: false
  });
  if (!sure) return;
  try {
    await setupRequest({ action: "uninstallPackage", type: "module", id });
  }
  catch (err) {
    ui.notifications.error(`Couldn't uninstall ${title}: ${failure(err)} You can uninstall it in Setup → Add-on Modules.`, { permanent: true });
    return;
  }
  session.removed.add(id);
  session.installed.delete(st.key);
  ui.notifications.success(`${title} uninstalled.`);
}

/* --------------------------------------- window --------------------------------------- */

class MapSceneBrowser extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: MODULE_ID,
    classes: [MODULE_ID],
    window: { title: TITLE, icon: "fa-solid fa-map-location-dot", resizable: true },
    position: { width: 880, height: 680 },
    actions: {
      install: MapSceneBrowser.#onInstall,
      uninstall: MapSceneBrowser.#onUninstall,
      copy: MapSceneBrowser.#onCopy,
      reload: MapSceneBrowser.#onReload,
      settings: () => game.settings.sheet.render({ force: true })
    }
  };

  #entries = [];
  #query = "";
  #type = "all";
  #busy = new Set();

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    try { return { ...context, entries: await loadEntries() }; }
    catch (err) { return { ...context, entries: [], error: err.message || String(err) }; }
  }

  async _renderHTML(context) {
    this.#entries = context.entries ?? [];
    const types = new Map(TYPES.map(t => [t.toLowerCase(), t]));
    for (const { source } of this.#entries) if (source && !types.has(source.toLowerCase())) types.set(source.toLowerCase(), source);
    if (!types.has(this.#type)) this.#type = "all";
    const options = [["all", "All"], ...types].map(([v, label]) => `<option value="${esc(v)}" ${v === this.#type ? "selected" : ""}>${esc(label)}</option>`);

    let grid;
    if (context.entries === null) {
      grid = `<div class="msb-empty"><p>No CSV source yet. Set <strong>CSV source URL</strong> in Configure Settings → ${TITLE}.</p>
        <button type="button" data-action="settings"><i class="fa-solid fa-gear"></i> Open settings</button></div>`;
    }
    else if (context.error) {
      grid = `<div class="msb-empty"><p>Couldn't load the CSV: ${esc(context.error)}.</p>
        <p>The link has to be public and readable from another site (CORS), e.g. raw.githubusercontent.com, a Google Sheets “Publish to web” CSV, or Dropbox.</p>
        <button type="button" data-action="reload"><i class="fa-solid fa-rotate"></i> Try again</button></div>`;
    }
    else {
      const index = installedByManifest();
      grid = this.#entries.map((e, i) => this.#card(e, i, index)).join("")
        + `<p class="msb-empty msb-nomatch" hidden>${this.#entries.length ? "Nothing matches the search." : "The CSV has no entries."}</p>`;
    }

    const body = document.createElement("div");
    body.className = "msb-body";
    body.innerHTML = `
      <div class="msb-toolbar">
        <input type="search" name="query" value="${esc(this.#query)}" placeholder="Search by name…" aria-label="Search by name">
        <select name="type" aria-label="Type">${options.join("")}</select>
        <span class="msb-count"></span>
        <button type="button" class="msb-icon" data-action="reload" data-tooltip="Download the CSV again" aria-label="Download the CSV again"><i class="fa-solid fa-rotate"></i></button>
        <button type="button" class="msb-icon" data-action="settings" data-tooltip="CSV source URL (Configure Settings)" aria-label="Settings"><i class="fa-solid fa-gear"></i></button>
      </div>
      <div class="msb-grid">${grid}</div>`;
    return body;
  }

  _replaceHTML(result, content) {
    const top = content.querySelector(".msb-grid")?.scrollTop ?? 0;
    content.replaceChildren(result);
    const grid = result.querySelector(".msb-grid");
    if (grid) grid.scrollTop = top;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const query = this.element.querySelector("input[name=query]");
    const type = this.element.querySelector("select[name=type]");
    query.addEventListener("input", () => { this.#query = query.value; this.#filter(); });
    type.addEventListener("change", () => { this.#type = type.value; this.#filter(); });
    this.#filter();
  }

  /** Shows the cards whose name has every search word and whose type matches. */
  #filter() {
    const words = this.#query.toLowerCase().split(/\s+/).filter(Boolean);
    const cards = this.element.querySelectorAll(".msb-card");
    let shown = 0;
    for (const card of cards) {
      card.hidden = !((this.#type === "all" || card.dataset.type === this.#type) && words.every(w => card.dataset.name.includes(w)));
      if (!card.hidden) shown++;
    }
    this.element.querySelector(".msb-count").textContent = cards.length ? `${shown} / ${cards.length}` : "";
    const none = this.element.querySelector(".msb-nomatch");
    if (none) none.hidden = shown > 0;
  }

  #card(entry, i, index) {
    const st = stateOf(entry, index);
    const status = statusOf(entry, st);
    const busy = this.#busy.has(entry);
    const type = entry.source.toLowerCase();
    const slug = type.replace(/[^a-z0-9]+/g, "-");
    return `<article class="msb-card msb-src-${esc(slug)}" data-i="${i}" data-type="${esc(type)}" data-name="${esc(entry.name.toLowerCase())}">
      <header>
        <h3 class="msb-name">${esc(entry.name)}</h3>
        ${entry.source ? `<span class="msb-badge">${esc(entry.source)}</span>` : ""}
      </header>
      <dl class="msb-meta">
        <dt>Version</dt><dd>${esc(entry.version || "—")}</dd>
        <dt>Status</dt><dd class="msb-status ${status.cls}">${esc(status.text)}</dd>
      </dl>
      <footer>
        <button type="button" data-action="install" ${busy ? "disabled" : ""}>
          <i class="fa-solid ${busy ? "fa-spinner fa-spin" : "fa-download"}"></i> Install</button>
        <button type="button" class="msb-uninstall" data-action="uninstall" ${busy || (st.id && !st.installed) ? "disabled" : ""}>
          <i class="fa-solid fa-trash"></i> Uninstall</button>
        <button type="button" class="msb-icon" data-action="copy" data-tooltip="Copy manifest URL" aria-label="Copy manifest URL">
          <i class="fa-solid fa-link"></i></button>
      </footer>
    </article>`;
  }

  /** Redraws one card (busy state, installed status) without touching the search or the scroll position. */
  #refreshCard(entry) {
    const i = this.#entries.indexOf(entry);
    const card = this.element?.querySelector(`.msb-card[data-i="${i}"]`);
    if (!card) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = this.#card(entry, i, installedByManifest());
    const next = tpl.content.firstElementChild;
    next.hidden = card.hidden;
    card.replaceWith(next);
  }

  #entryOf(target) {
    return this.#entries[target.closest(".msb-card")?.dataset.i];
  }

  async #run(entry, task) {
    if (!entry || this.#busy.has(entry)) return;
    this.#busy.add(entry);
    this.#refreshCard(entry);
    try { await task(entry); }
    finally {
      this.#busy.delete(entry);
      this.#refreshCard(entry);
    }
  }

  static #onInstall(event, target) {
    return this.#run(this.#entryOf(target), installEntry);
  }

  static #onUninstall(event, target) {
    return this.#run(this.#entryOf(target), uninstallEntry);
  }

  static async #onCopy(event, target) {
    const entry = this.#entryOf(target);
    if (!entry) return;
    await game.clipboard.copyPlainText(entry.manifest);
    ui.notifications.info(`Manifest URL of ${entry.name} copied.`);
  }

  static #onReload() {
    csvCache = null;
    return this.render();
  }
}

let browser;
function openBrowser() {
  if (!game.user.isGM) return ui.notifications.warn(`${TITLE} is for the GM only.`);
  browser ??= new MapSceneBrowser();
  return browser.render({ force: true });
}

/* ---------------------------------------- hooks ---------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "csvUrl", {
    name: "CSV source URL",
    hint: "Public link to a CSV with the columns source, name, json_link, zip_link, version. The host has to allow "
      + "cross-origin requests (CORS): raw.githubusercontent.com, a Google Sheets “Publish to web” CSV, or Dropbox work.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => {
      csvCache = null;
      if (browser?.rendered) browser.render();
    }
  });
  // manifest link → module ID, read from manifests so the installed status shows without downloading them again
  game.settings.register(MODULE_ID, "moduleIds", { scope: "world", config: false, type: Object, default: {} });
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { open: openBrowser };
});

Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens;
  if (!game.user?.isGM || !tokens?.tools) return;
  tokens.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: TITLE,
    icon: "fa-solid fa-map-location-dot",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openBrowser()
  };
});
