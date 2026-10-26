#!/usr/bin/env node
/**
 * Buduje kompendium zasad (packs/rules, LevelDB) z plików Markdown w packs-src/rules/pl/ (nie trafia do paczki systemu).
 *   # Nazwa dziennika {#klucz}      — dziennik (JournalEntry)
 *   ## Tytuł strony {#klucz}        — strona (JournalEntryPage, tekst)
 *   [[walka/sats]], [[sats|tekst]]  — link do innej strony (bez „/” — w tym samym dzienniku)
 * Sprawdza też, czy każdy link „?” z szablonów ({{rule "…"}}) i kodu (ruleLink("…")) ma swoją stronę.
 * Użycie: npm ci && node tools/build-packs.mjs [--check]   (--check: tylko sprawdzenie, bez budowania)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { ruleId, ruleUuid } from "../module/rules-ids.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "packs-src/rules/pl");
const DEST = path.join(ROOT, "packs/rules");
const KEY = /^[a-z0-9-]+$/;

/** Markdown → [{ key, name, pages: [{ key, name, md }] }]; błędy formatu przerywają budowanie. */
export function parseRules(files) {
  const journals = [];
  let journal = null, page = null;
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const where = `${path.relative(ROOT, file)}:${i + 1}`;
      const h = line.match(/^(#{1,2}) (.+?) \{#([^}]+)\}\s*$/);
      if (h && h[1] === "#") {
        if (!KEY.test(h[3])) throw new Error(`${where}: zły klucz dziennika „${h[3]}”`);
        journals.push(journal = { key: h[3], name: h[2], pages: [] });
        page = null;
      } else if (h) {
        if (!journal) throw new Error(`${where}: strona przed nagłówkiem dziennika`);
        if (!KEY.test(h[3])) throw new Error(`${where}: zły klucz strony „${h[3]}”`);
        journal.pages.push(page = { key: `${journal.key}/${h[3]}`, name: h[2], md: "" });
      } else if (/^#{1,2} /.test(line)) {
        throw new Error(`${where}: nagłówek # i ## musi mieć klucz {#…}`);
      } else if (page) {
        page.md += `${line}\n`;
      } else if (line.trim()) {
        throw new Error(`${where}: tekst poza stroną`);
      }
    });
  }
  const keys = new Set();
  for (const k of journals.flatMap(j => [j.key, ...j.pages.map(p => p.key)])) {
    if (keys.has(k)) throw new Error(`Powtórzony klucz „${k}”`);
    keys.add(k);
  }
  const ids = new Set(journals.flatMap(j => [j.key, ...j.pages.map(p => p.key)]).map(ruleId));
  if (ids.size !== keys.size) throw new Error("Dwa klucze dają ten sam identyfikator — zmień jeden z nich");
  return journals;
}

/** Wszystkie klucze stron („combat/sats”). */
export const pageKeys = journals => new Set(journals.flatMap(j => j.pages.map(p => p.key)));

/** Linki „?” użyte w szablonach i kodzie: [{ key, where }]. */
export function usedRuleKeys() {
  const out = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const scan = (file, re) => fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(re)) out.push({ key: m[1], where: `${path.relative(ROOT, file)}:${i + 1}` });
  });
  for (const f of walk(path.join(ROOT, "templates")).filter(f => f.endsWith(".hbs"))) scan(f, /\{\{rule\s+"([^"]+)"/g);
  for (const f of walk(path.join(ROOT, "module")).filter(f => f.endsWith(".mjs"))) scan(f, /ruleLink\(\s*"([^"]+)"/g);
  return out;
}

/** Strona Markdown → HTML; [[…]] zamienia na linki @UUID (błąd, gdy strona nie istnieje). */
export function pageHtml(page, journals, marked) {
  const names = new Map(journals.flatMap(j => j.pages.map(p => [p.key, p.name])));
  const links = [];
  const md = page.md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const key = target.includes("/") ? target : `${page.key.split("/")[0]}/${target}`;
    if (!names.has(key)) throw new Error(`${page.key}: link do nieistniejącej strony „${target}”`);
    links.push(`@UUID[${ruleUuid(key)}]{${label ?? names.get(key)}}`);
    return `\u0000${links.length - 1}\u0000`;
  });
  return marked.parse(md.trim(), { gfm: true, async: false })
    .replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)])
    .trim();
}

/** Dokumenty do paczki (format źródłowy foundryvtt-cli: _key, strony osadzone w dzienniku). */
export function buildDocs(journals, marked, systemVersion) {
  const stats = { coreVersion: "13.351", systemId: "foe-rpg", systemVersion, createdTime: null, modifiedTime: null, lastModifiedBy: null, compendiumSource: null, duplicateSource: null };
  return journals.map((j, i) => {
    const id = ruleId(j.key);
    return {
      _id: id, name: j.name, folder: null, sort: (i + 1) * 100000, categories: [],
      ownership: { default: 0 }, flags: { "foe-rpg": { rule: j.key } }, _stats: stats,
      pages: j.pages.map((p, k) => {
        const pid = ruleId(p.key);
        return {
          _id: pid, name: p.name, type: "text", sort: (k + 1) * 100000, category: null,
          title: { show: true, level: 1 }, text: { format: 1, content: pageHtml(p, journals, marked) },
          image: {}, video: { controls: true, volume: 0.5 }, src: null, system: {},
          ownership: { default: -1 }, flags: { "foe-rpg": { rule: p.key } }, _stats: stats,
          _key: `!journal.pages!${id}.${pid}`
        };
      }),
      _key: `!journal!${id}`
    };
  });
}

async function main() {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith(".md")).sort().map(f => path.join(SRC, f));
  const journals = parseRules(files);
  const known = pageKeys(journals);
  const missing = usedRuleKeys().filter(u => !known.has(u.key));
  if (missing.length) throw new Error(`Linki „?” bez strony:\n${missing.map(m => `  ${m.where}: ${m.key}`).join("\n")}`);
  const { marked } = await import("marked");
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8")).version;
  const docs = buildDocs(journals, marked, version);
  const count = `${docs.length} dzienniki, ${docs.reduce((n, d) => n + d.pages.length, 0)} stron`;
  if (process.argv.includes("--check")) return console.log(`Zasady OK: ${count}.`);

  const { compilePack } = await import("@foundryvtt/foundryvtt-cli");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "foe-rules-"));
  try {
    for (const d of docs) fs.writeFileSync(path.join(tmp, `${d._id}.json`), JSON.stringify(d, null, 2));
    fs.rmSync(DEST, { recursive: true, force: true });
    await compilePack(tmp, DEST);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`Zbudowano ${path.relative(ROOT, DEST)}: ${count}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message ?? err); process.exit(1); });
}
