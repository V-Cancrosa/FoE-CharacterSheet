#!/usr/bin/env node
/**
 * Sprawdzenie tłumaczeń (nie trafia do paczki systemu):
 *   - każdy tekst z t("…"), tn(n, "…", "…"), N_("…") w module/ i {{t "…"}}/{{tn x "…" "…"}} w templates/ ma wpis
 *     w lang/pl.mjs, z tymi samymi wstawkami {nazwa},
 *   - w kodzie i szablonach nie zostały polskie napisy poza słownikiem (linie z komentarzem „pl-ok” — pomijane),
 *   - wpisy słownika, których nikt nie używa (ostrzeżenie).
 * Użycie: node tools/i18n-check.mjs [--unused] [--quiet]
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const PL = (await import(url.pathToFileURL(path.join(ROOT, "lang/pl.mjs")).href)).default;
const args = new Set(process.argv.slice(2));
const PLCH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const PLWORDS = /\b(nie|jest|się|albo|oraz|tylko|przy|brak|Brak|zaznacz|Zaznacz|kliknij|Kliknij|rzut|Rzut|postać|karta|karty|gracz|gracza|MG)\b/;

/** Literały napisów w kodzie JS: [{ kind: "str"|"tpl", value, start, end, line }] — bez komentarzy i wyrażeń regularnych. */
function scanJs(src) {
  const out = [];
  let i = 0, line = 1, prev = "";
  const regexOk = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|of|in|do|else|void|delete|throw|new|yield|await)$/.test(prev);
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); for (let k = i; k < (e < 0 ? src.length : e + 2); k++) if (src[k] === "\n") line++; i = e < 0 ? src.length : e + 2; continue; }
    if (c === "/" && regexOk()) {
      let k = i + 1, cls = false;
      while (k < src.length && src[k] !== "\n") {
        if (src[k] === "\\") { k += 2; continue; }
        if (src[k] === "[") cls = true; else if (src[k] === "]") cls = false; else if (src[k] === "/" && !cls) break;
        k++;
      }
      k++; while (/[a-z]/i.test(src[k] ?? "")) k++;
      prev = "/re/"; i = k; continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1, v = "";
      while (k < src.length && src[k] !== c && src[k] !== "\n") { if (src[k] === "\\") { v += src[k] + src[k + 1]; k += 2; continue; } v += src[k++]; }
      out.push({ kind: "str", value: JSON.parse(`"${v.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"')}"`), start: i, end: k + 1, line });
      prev = "str"; i = k + 1; continue;
    }
    if (c === "`") {
      let k = i + 1, depth = 0, v = "";
      const startLine = line;
      while (k < src.length) {
        const ch = src[k];
        if (ch === "\\") { v += ch + src[k + 1]; k += 2; continue; }
        if (ch === "\n") line++;
        if (depth === 0 && ch === "`") break;
        if (ch === "$" && src[k + 1] === "{") { depth++; v += "${"; k += 2; continue; }
        if (depth > 0 && ch === "{") depth++;
        if (depth > 0 && ch === "}") depth--;
        v += ch; k++;
      }
      out.push({ kind: "tpl", value: v, start: i, end: k + 1, line: startLine });
      prev = "tpl"; i = k + 1; continue;
    }
    // zwykły token
    let k = i;
    if (/[\w$]/.test(c)) { while (k < src.length && /[\w$]/.test(src[k])) k++; } else k = i + 1;
    prev = src.slice(i, k); i = k;
  }
  return out;
}

const placeholders = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
const used = new Set();
const errors = [], leftovers = [];
function need(key, where) {
  used.add(key);
  const v = PL[key];
  if (v === undefined) { errors.push(`${where}: brak tłumaczenia: ${JSON.stringify(key)}`); return; }
  const vs = Array.isArray(v) ? v : [v];
  for (const x of vs) if (placeholders(x) !== placeholders(key.split("|").at(-1)) && placeholders(x) !== placeholders(key)) errors.push(`${where}: inne wstawki w tłumaczeniu ${JSON.stringify(key)} → ${JSON.stringify(x)}`);
}

// ---------- moduły ----------
for (const f of fs.readdirSync(path.join(ROOT, "module")).filter(f => f.endsWith(".mjs")).sort()) {
  const src = fs.readFileSync(path.join(ROOT, "module", f), "utf8");
  const lines = src.split("\n");
  const lits = scanJs(src);
  // rejestracje (ustawienia, menu, karty): name/hint/label i opcje choices tłumaczy localizeRegistrations()
  const spans = [];
  for (const m of src.matchAll(/(?:game\.settings\.register(?:Menu)?|\bregister)\(/g)) {
    let k = m.index + m[0].length, depth = 1;
    while (k < src.length && depth) { const ch = src[k]; if (ch === "(") depth++; else if (ch === ")") depth--; k++; }
    const body = src.slice(m.index, k);
    const ch = /choices\s*:\s*\{/.exec(body);
    let choices = null;
    if (ch) { let e = ch.index + ch[0].length, dd = 1; while (e < body.length && dd) { if (body[e] === "{") dd++; else if (body[e] === "}") dd--; e++; } choices = [m.index + ch.index, m.index + e]; }
    spans.push({ start: m.index, end: k, choices });
  }
  const regKey = L => spans.some(sp => L.start > sp.start && L.end < sp.end && (
    /(?:name|hint|label)\s*:\s*$/.test(src.slice(Math.max(0, L.start - 12), L.start)) ||
    (sp.choices && L.start > sp.choices[0] && L.end < sp.choices[1] && /:\s*$/.test(src.slice(Math.max(0, L.start - 4), L.start)))));
  for (let n = 0; n < lits.length; n++) {
    const L = lits[n];
    const before = src.slice(Math.max(0, L.start - 40), L.start);
    const where = `module/${f}:${L.line}`;
    if (L.kind === "str" && regKey(L)) { need(L.value, where); continue; }
    if (/(?:^|[^\w$.])(?:t|N_)\(\s*$/.test(before)) {
      if (L.kind === "tpl") errors.push(`${where}: t(\`…\`) — klucz musi być zwykłym napisem`);
      else need(L.value, where);
      continue;
    }
    // tn(n, "jedna", "wiele")
    const m = /(?:^|[^\w$.])tn\(([^()]|\([^()]*\))*?,\s*$/.exec(before);
    if (m && L.kind === "str") {
      const nx = lits[n + 1];
      if (nx?.kind === "str" && /^\s*,\s*$/.test(src.slice(L.end, nx.start))) { need(`${L.value}|${nx.value}`, where); n++; continue; }
    }
    const text = L.kind === "tpl" ? L.value.replace(/\$\{[^}]*\}/g, " ") : L.value;
    if ((PLCH.test(text) || PLWORDS.test(text)) && !/pl-ok/.test(lines[L.line - 1] ?? "")) leftovers.push(`${where}: ${JSON.stringify(text.slice(0, 90))}`);
  }
}

// ---------- szablony ----------
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])); }
for (const file of walk(path.join(ROOT, "templates")).filter(f => f.endsWith(".hbs")).sort()) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  const lineOf = idx => src.slice(0, idx).split("\n").length;
  for (const m of src.matchAll(/\{\{\{?\s*t\s+("(?:[^"\\]|\\.)*")/g)) need(JSON.parse(m[1]), `${rel}:${lineOf(m.index)}`);
  for (const m of src.matchAll(/\{\{\{?\s*tn\s+\S+\s+("(?:[^"\\]|\\.)*")\s+("(?:[^"\\]|\\.)*")/g)) need(`${JSON.parse(m[1])}|${JSON.parse(m[2])}`, `${rel}:${lineOf(m.index)}`);
  // polskie napisy poza {{…}}
  const bare = src.replace(/\{\{!--[\s\S]*?--\}\}/g, m => m.replace(/[^\n]/g, " ")).replace(/\{\{[\s\S]*?\}\}/g, m => m.replace(/[^\n]/g, " "));
  bare.split("\n").forEach((l, k) => { if ((PLCH.test(l) || PLWORDS.test(l.replace(/<[^>]*>/g, " ").replace(/[a-z-]+="[^"]*"/g, ""))) && !/pl-ok/.test(src.split("\n")[k])) leftovers.push(`${rel}:${k + 1}: ${l.trim().slice(0, 90)}`); });
}

// ---------- t()/tn()/N_() zasłonięte zmienną lokalną albo niezaimportowane (ESLint, jeśli jest) ----------
const scopeErrors = [];
try {
  const { createRequire } = await import("node:module");
  let eslint = null;
  for (const base of [path.join(ROOT, "package.json"), "/opt/node-tools/node_modules/.package.json", "/usr/lib/node_modules/.x"]) {
    try { eslint = createRequire(base)("eslint"); break; } catch { /* dalej */ }
  }
  if (!eslint) throw new Error("brak ESLint");
  const rule = {
    meta: { type: "problem" },
    create(context) {
      return {
        CallExpression(node) {
          const c = node.callee;
          if (c.type !== "Identifier" || !["t", "tn", "N_"].includes(c.name)) return;
          let sc = context.sourceCode.getScope(node), v = null;
          while (sc && !v) { v = sc.set.get(c.name); sc = sc.upper; }
          if (!v) context.report({ node, message: `${c.name}() nie jest zaimportowane` });
          else if (v.scope.type !== "module") context.report({ node, message: `${c.name}() zasłania zmienna lokalna z linii ${v.defs[0]?.name?.loc?.start?.line}` });
        }
      };
    }
  };
  const linter = new eslint.Linter({ configType: "flat" });
  const config = [{ files: ["**/*.mjs"], languageOptions: { ecmaVersion: "latest", sourceType: "module" }, plugins: { foe: { rules: { t: rule } } }, rules: { "foe/t": "error" } }];
  for (const f of fs.readdirSync(path.join(ROOT, "module")).filter(f => f.endsWith(".mjs")).sort()) {
    const src = fs.readFileSync(path.join(ROOT, "module", f), "utf8");
    for (const m of linter.verify(src, config, { filename: `module/${f}` })) scopeErrors.push(`module/${f}:${m.line}: ${m.message}`);
  }
} catch (err) {
  console.log(`(bez sprawdzenia zasięgu t(): ${err.message})`);
}
errors.push(...scopeErrors);

const unused = Object.keys(PL).filter(k => !used.has(k));
if (!args.has("--quiet")) {
  for (const e of errors) console.log("BŁĄD", e);
  for (const l of leftovers) console.log("POLSKI", l);
  if (args.has("--unused")) for (const u of unused) console.log("NIEUŻYWANE", JSON.stringify(u));
}
console.log(`tłumaczenia: ${used.size} użytych, ${Object.keys(PL).length} w słowniku, ${unused.length} nieużywanych | błędy: ${errors.length} | polskie napisy w kodzie: ${leftovers.length}`);
process.exitCode = errors.length ? 1 : 0;
