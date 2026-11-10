/**
 * Okno kompendium zasad w stylu PipBucka: spis rozdziałów i stron, wyszukiwarka, historia (wstecz), linki między
 * stronami w tym samym oknie. Treść — strony dziennika z paczki foe-rpg.rules (packs-src/rules → tools/build-packs.mjs),
 * więc jest jedna dla okna i dla zwykłego dziennika. Linki „?” ({{rule}}, ruleLink) otwierają to okno na właściwej
 * stronie (opcja gracza „Zasady: okno PipBucka”; wyłączona — zwykły dziennik).
 */
import { t } from "./i18n.mjs";
import { RULES_PACK, ruleId } from "./rules-ids.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const { ApplicationV2 } = foundry.applications.api;
const LAST = "foe-rpg.rules.last";
const store = { get: k => { try { return globalThis.localStorage?.getItem(k); } catch { return null; } }, set: (k, v) => { try { globalThis.localStorage?.setItem(k, v); } catch { /* bez pamięci */ } } };

/** Spis z paczki: [{ key, name, pages: [{ key, id, name, html, text }] }] (wczytany raz, wzbogacony). */
let INDEX = null;
async function loadIndex() {
  if (INDEX) return INDEX;
  const pack = game.packs?.get(RULES_PACK);
  if (!pack) return null;
  const docs = (await pack.getDocuments()).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const enrich = foundry.applications?.ux?.TextEditor?.implementation?.enrichHTML ?? globalThis.TextEditor?.enrichHTML;
  INDEX = [];
  for (const j of docs) {
    const pages = [];
    for (const p of [...j.pages].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
      const raw = p.text?.content ?? "";
      const html = enrich ? await enrich.call(globalThis.TextEditor, raw, { async: true, relativeTo: p }) : raw;
      pages.push({ key: p.flags?.[F]?.rule ?? p.id, id: p.id, uuid: p.uuid, name: p.name, html, text: raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase() });
    }
    INDEX.push({ key: j.flags?.[F]?.rule ?? j.id, name: j.name, pages });
  }
  return INDEX;
}
const allPages = () => (INDEX ?? []).flatMap(c => c.pages.map(p => ({ ...p, chapter: c })));
const pageBy = key => allPages().find(p => p.key === key || p.id === key || p.id === ruleId(key));

export class FoeRulesReader extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "foe-rules-reader",
    classes: ["foe-rpg", "foe-rules"],
    window: { title: "Rules", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 900, height: 700 }
  };

  page = null;
  history = [];
  query = "";

  get title() { return t("Fallout: Equestria — rules"); }

  /** Pokaż stronę („combat/sats”) — z historią. */
  async show(key, { push = true } = {}) {
    await loadIndex();
    const p = key ? pageBy(key) : null;
    if (p && this.page && p.key !== this.page && push) this.history.push(this.page);
    if (p) { this.page = p.key; store.set(LAST, p.key); }
    if (!this.page) this.page = store.get(LAST) && pageBy(store.get(LAST)) ? store.get(LAST) : allPages()[0]?.key ?? null;
    return this.render({ force: true });
  }

  async _renderHTML() {
    const index = await loadIndex();
    if (!index?.length) return `<div class="rules-empty">${esc(t("The rules compendium is missing. After updating the system, restart the world (Return to Setup → Launch World)."))}</div>`;
    const q = this.query.trim().toLowerCase();
    const cur = pageBy(this.page) ?? allPages()[0];
    const hits = q ? allPages().filter(p => p.name.toLowerCase().includes(q) || p.text.includes(q)) : null;
    const nav = hits
      ? `<div class="rules-hits">${esc(t("Results: {n}", { n: hits.length }))}</div>${hits.map(p => `<a class="rules-page${p.key === cur?.key ? " active" : ""}" data-page="${esc(p.key)}"><small>${esc(p.chapter.name)}</small>${esc(p.name)}</a>`).join("")}`
      : index.map(c => `<div class="rules-chapter${c.pages.some(p => p.key === cur?.key) ? " open" : ""}"><a class="rules-ch" data-chapter="${esc(c.key)}">${esc(c.name)}</a>
          ${c.pages.map(p => `<a class="rules-page${p.key === cur?.key ? " active" : ""}" data-page="${esc(p.key)}">${esc(p.name)}</a>`).join("")}</div>`).join("");
    const list = allPages(), i = list.findIndex(p => p.key === cur?.key);
    const prev = list[i - 1], next = list[i + 1];
    return `<div class="rules-bar"><span>PIPBUCK // ${esc(t("RULES"))}</span>
        <button type="button" class="rules-back" ${this.history.length ? "" : "disabled"} title="${esc(t("Back"))}"><i class="fa-solid fa-arrow-left"></i></button>
        <input type="search" class="rules-search" value="${esc(this.query)}" placeholder="${esc(t("Search the rules…"))}">
        <a class="rules-journal" title="${esc(t("Open as a journal"))}"><i class="fa-solid fa-book"></i></a></div>
      <div class="rules-body"><nav class="rules-nav">${nav}</nav>
        <article class="rules-content">${cur ? `<div class="rules-crumb">${esc(cur.chapter.name)}</div><h1>${esc(cur.name)}</h1>${cur.html}
          <div class="rules-pager">${prev ? `<a data-page="${esc(prev.key)}"><i class="fa-solid fa-chevron-left"></i> ${esc(prev.name)}</a>` : "<span></span>"}${next ? `<a data-page="${esc(next.key)}">${esc(next.name)} <i class="fa-solid fa-chevron-right"></i></a>` : ""}</div>` : ""}</article></div>`;
  }

  _replaceHTML(result, content) {
    const focus = document.activeElement?.classList?.contains("rules-search") ? document.activeElement.selectionStart : null;
    content.innerHTML = result;
    content.querySelector(".rules-content")?.scrollTo?.(0, 0);
    if (focus !== null) { const s = content.querySelector(".rules-search"); s?.focus(); s?.setSelectionRange?.(focus, focus); }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (root.dataset.wired) return;
    root.dataset.wired = "1";
    root.addEventListener("click", ev => {
      const a = ev.target.closest("[data-page]");
      if (a) { ev.preventDefault(); this.query = this.query && a.closest(".rules-nav") ? this.query : ""; return this.show(a.dataset.page); }
      const ch = ev.target.closest("[data-chapter]");
      if (ch) { ev.preventDefault(); const c = INDEX?.find(x => x.key === ch.dataset.chapter); return c?.pages[0] ? this.show(c.pages[0].key) : null; }
      if (ev.target.closest(".rules-back")) { ev.preventDefault(); const k = this.history.pop(); return k ? this.show(k, { push: false }) : null; }
      if (ev.target.closest(".rules-journal")) { ev.preventDefault(); return openJournal(this.page); }
      // link do innej strony zasad (@UUID w treści) — w tym oknie
      const link = ev.target.closest("a.content-link[data-uuid]");
      if (link && link.dataset.uuid.includes(RULES_PACK)) {
        const id = link.dataset.uuid.split(".").at(-1);
        const p = allPages().find(x => x.id === id);
        if (p) { ev.preventDefault(); ev.stopPropagation(); return this.show(p.key); }
      }
      return null;
    }, true);
    let timer = null;
    root.addEventListener("input", ev => {
      if (!ev.target.classList?.contains("rules-search")) return;
      clearTimeout(timer);
      timer = setTimeout(() => { this.query = ev.target.value; this.render(); }, 200);
    });
  }
}

let reader = null;
/** Otwórz okno zasad (na stronie „key” albo ostatnio czytanej). */
export function openRulesReader(key = null) {
  reader ??= new FoeRulesReader();
  return reader.show(key);
}

/** Zwykły dziennik na stronie (gdy okno wyłączone). */
export async function openJournal(key) {
  const p = key ? pageBy(key) : null;
  const doc = p ? await fromUuid(p.uuid).catch(() => null) : null;
  if (!doc) return null;
  return doc.parent.sheet.render(true, { pageId: doc.id });
}

export const readerOn = () => { try { return game.settings.get(F, "rulesReader") !== false; } catch { return true; } };

export function registerRulesReader() {
  game.settings.register(F, "rulesReader", {
    name: "Rules: PipBuck window",
    hint: "The “?” links and the RULES button open the rules in a PipBuck-style window (chapters, search, back). Off — the ordinary journal.",
    scope: "client", config: true, type: Boolean, default: true
  });
  // przycisk w zakładce dzienników
  Hooks.on("renderJournalDirectory", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-rules-open")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "foe-rules-open";
    btn.innerHTML = `<i class="fa-solid fa-book-open"></i> ${esc(t("Fallout: Equestria rules"))}`;
    btn.addEventListener("click", ev => { ev.preventDefault(); openRulesReader(); });
    (root.querySelector(".header-actions, .directory-header") ?? root).append(btn);
  });
}
