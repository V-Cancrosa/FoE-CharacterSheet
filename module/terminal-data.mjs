/**
 * Terminale — czyste zasady (bez Foundry, poza klasą modelu danych).
 * Podręcznik (zasady rozproszone):
 *   - hakowanie: Science; MFD 1 łatwy, ¾ przeciętny, ½ trudny, ¼ bardzo trudny (s. 6); w walce zajmuje akcję (s. 435),
 *   - wyższe Science może być wymagane, żeby w ogóle obsłużyć terminal (s. 61),
 *   - krytyczna porażka blokuje terminal; Computer Whiz daje drugą próbę, druga blokada jest ostateczna — nawet z hasłem (s. 140),
 *   - Illiterate nie odblokuje terminala (s. 83); terminale chmurowe tylko dla latających (s. 26, 381),
 *   - Certified Pipbuck Technician: dostęp administratora do terminali Stable-Tec (s. 145),
 *   - Rigged Terminal: wybucha przy włączeniu jak granat odłamkowy, ładunek albo sparkle grenade (s. 597),
 *   - holotaśmy: terminale je czytają, PipBuck kopiuje (s. 227).
 * Minigra ze zgadywaniem hasła (jak w grach Fallout) to zasada domowa — opcja świata.
 */
import { t, N_, tmap, tfields } from "./i18n.mjs";

export const TERMINAL_KINDS = tfields({
  office: { label: N_("Office (RobronCo)"), brand: "ROBRONCO INDUSTRIES (TM) TERMLINK PROTOCOL" },
  stabletec: { label: "Stable-Tec", brand: "STABLE-TEC UNIFIED OPERATING SYSTEM" },   // en=pl
  // klucz „military” został z czasów, gdy był to tylko terminal M.W.T. — teraz Ministerstwo wybiera MG (MINISTRIES)
  military: { label: N_("term|Ministry"), brand: "MINISTRY OF WARTIME TECHNOLOGY — SECURE TERMLINK" },
  cloud: { label: N_("Cloud (Enclave)"), brand: "ENCLAVE CLOUD TERMINAL // SKY-LINK" },
  unics: { label: "Unics", brand: "UNICS 3.4 — MULTI-USER SYSTEM" },   // en=pl
  portable: { label: N_("Portable"), brand: "PORTABLE TERMINAL — SPARK BATTERY MODE" }
}, ["label"]);

/**
 * Sześć Ministerstw (podręcznik, s. 66 — alfabetycznie, z klaczą, która nim kierowała). Terminal ministerialny ma
 * nagłówek, producenta, jedną linię testu przy starcie, logo (terminal-logos.mjs) i kolor ekranu swojego Ministerstwa.
 * Domyślnie Technologia Wojenna — tak wyglądały terminale „wojskowe” sprzed wyboru.
 */
export const MINISTRIES = tfields({
  mas: { label: N_("Arcane Science (Twilight Sparkle)"), name: N_("MINISTRY OF ARCANE SCIENCE"), brand: "M.A.S. TERMLINK PROTOCOL v2.1", line: N_("> ARCANE RESEARCH NET .... OK") },
  moa: { label: N_("Awesome (Rainbow Dash)"), name: N_("MINISTRY OF AWESOME"), brand: "MINISTRY OF AWESOME — FLIGHT OPS TERMLINK", line: N_("> FLIGHT TELEMETRY ....... OK") },
  moi: { label: N_("Image (Rarity)"), name: N_("MINISTRY OF IMAGE"), brand: "MINISTRY OF IMAGE — PUBLIC RELATIONS TERMLINK", line: N_("> IMAGE ARCHIVE .......... OK") },
  mom: { label: "Morale (Pinkie Pie)", name: N_("MINISTRY OF MORALE"), brand: "MINISTRY OF MORALE — OBSERVATION TERMLINK", line: N_("> LISTENING TALISMANS .... ACTIVE") },   // en=pl
  mop: { label: N_("Peace (Fluttershy)"), name: N_("MINISTRY OF PEACE"), brand: "MINISTRY OF PEACE — MEDICAL TERMLINK", line: N_("> MEDICAL DATABASE ....... OK") },
  mwt: { label: N_("Wartime Technology (Applejack)"), name: N_("MINISTRY OF WARTIME TECHNOLOGY"), brand: "MINISTRY OF WARTIME TECHNOLOGY — SECURE TERMLINK", line: N_("> ENCRYPTION ............. ACTIVE") }
}, ["label", "name", "line"]);
/** Ministerstwo terminala (zła albo pusta wartość — Technologia Wojenna). */
export const ministryOf = ts => (Object.hasOwn(MINISTRIES, ts?.ministry ?? "") ? ts.ministry : "mwt");
/** Nagłówek ekranu: własny z konfiguracji albo domyślny dla typu (ministerialny — dla Ministerstwa). */
export const terminalBrand = ts => ts?.brand || (ts?.kind === "military" ? MINISTRIES[ministryOf(ts)].brand : TERMINAL_KINDS[ts?.kind]?.brand) || "TERMLINK";

/** Zabezpieczenie: MFD hakowania i długość słów w minigrze. */
export const TERMINAL_SECURITY = tfields({
  none: { label: N_("None (open)"), mfd: null, len: [4, 5], penalty: 0 },
  "1": { label: N_("Easy (MFD 1)"), mfd: "1", len: [4, 5], penalty: 0 },
  "3/4": { label: N_("Average (MFD ¾)"), mfd: "3/4", len: [6, 7], penalty: 1 },
  "1/2": { label: N_("Hard (MFD ½)"), mfd: "1/2", len: [8, 9, 10], penalty: 2 },
  "1/4": { label: N_("Very hard (MFD ¼)"), mfd: "1/4", len: [11, 12], penalty: 3 }
}, ["label"]);

export const ACCESS = { none: 0, user: 1, admin: 2 };
export const ACCESS_LABELS = tmap({ public: N_("public"), user: N_("after login"), admin: N_("administrator") });
export const TRAP_EXPLOSIVES = tfields({
  frag: { label: N_("Frag grenade (6d12)"), formula: "6d12", name: "Frag Grenade" },
  satchel: { label: N_("Satchel charge (10d12)"), formula: "10d12", name: "Satchel Charge" },
  sparkle: { label: "Sparkle grenade (10d20)", formula: "10d20", name: "Sparkle Grenade" }   // en=pl
}, ["label"]);
/**
 * Śrubki obudowy w rogach ekranu. Ukryta (wybiera ją MG) otwiera oględziny pod kątem ładunku (Explosives),
 * a po wykryciu ładunku — rozbrajanie. Domyślnie prawa dolna (tak było przed wyborem).
 */
export const TRAP_SCREWS = tfields({
  tl: { label: N_("top left"), click: N_("the top left screw ◦") },
  tr: { label: N_("top right"), click: N_("the top right screw ◦") },
  bl: { label: N_("bottom left"), click: N_("the bottom left screw ◦") },
  br: { label: N_("bottom right"), click: N_("the bottom right screw ◦") }
}, ["label", "click"]);
export const trapScrew = ts => (Object.hasOwn(TRAP_SCREWS, ts?.trap?.screw ?? "") ? ts.trap.screw : "br");
export const COMMAND_KINDS = tmap({ door: N_("Door"), token: N_("Tokens (turrets, robots)"), message: N_("Chat message") });
export const COMMAND_ACTIONS = {
  door: tmap({ open: N_("open"), close: N_("close"), lock: N_("lock"), unlock: N_("unlock"), toggle: N_("toggle") }),
  token: tmap({ off: N_("turn off"), on: N_("turn on"), friendly: N_("against enemies (friendly)"), hostile: N_("hostile") }),
  message: tmap({ say: N_("send") })
};

const feature = (actor, re) => (actor?.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));
export const isIlliterate = actor => feature(actor, /illiterate/i);
export const hasComputerWhiz = actor => feature(actor, /computer whiz/i);
export const hasPipbuckTech = actor => feature(actor, /certified pipbuck tech/i);

export const accessLevel = s => ACCESS[s?.access] ?? 0;
/** Stan z dostępem efektywnym: terminal bez zabezpieczeń jest od razu otwarty (poziom użytkownika). */
export const effectiveState = t => (t.security === "none" && accessLevel(t.state) < 1 ? { ...t.state, access: "user" } : t.state);
/** Czy wpis/komenda o danym progu jest widoczna przy stanie terminala. */
export const canSee = (need, state) => (need === "public" ? true : need === "admin" ? accessLevel(state) >= 2 : accessLevel(state) >= 1);

/**
 * Czy postać może korzystać z terminala i go hakować: { use, hack, login, why[] }.
 * lockouts: 0 — działa; 1 — hakowanie tylko z Computer Whiz, hasło dalej działa; 2+ — nic nie działa.
 */
export function terminalAccess(actor, term) {
  const why = [];
  const st = term.state ?? {};
  const lockouts = Number(st.lockouts) || 0;
  let use = true, hack = true, login = true;
  if (!term.powered) { use = false; why.push(t("the terminal has no power")); }
  if (term.kind === "cloud" && actor && !actor.system?.flier) { use = false; why.push(t("cloud terminal — only fliers can use it")); }
  if (lockouts >= 2) { use = false; why.push(t("the terminal is locked for good")); }
  if (!use) return { use, hack: false, login: false, why };
  if (term.security === "none") { hack = false; }
  if (isIlliterate(actor)) { hack = false; why.push(t("the character can't read (Illiterate)")); }
  const rank = actor?.system?.skills?.science?.rank ?? 0;
  if ((Number(term.scienceReq) || 0) > rank) { hack = false; why.push(t("requires Science {req} (character: {rank})", { req: term.scienceReq, rank })); }
  if (lockouts === 1 && !hasComputerWhiz(actor)) { hack = false; why.push(t("the terminal is locked after a critical failure — password only (or Computer Whiz)")); }
  return { use, hack, login, why };
}

/** Wynik hakowania: { access, lockout }. Krytyk — administrator; Stable-Tec z Certified Pipbuck Technician — administrator. */
export function hackOutcome(result, { kind = "office", tech = false } = {}) {
  if (result === "crit-fail") return { access: null, lockout: true };
  if (result === "crit-success") return { access: "admin", lockout: false };
  if (result === "success") return { access: kind === "stabletec" && tech ? "admin" : "user", lockout: false };
  return { access: null, lockout: false };
}

/** Logowanie hasłem: hasło administratora daje „admin”, zwykłe „user”; wielkość liter bez znaczenia. */
export function loginOutcome(term, password) {
  const p = String(password ?? "").trim().toLowerCase();
  if (!p) return null;
  if (term.adminPassword && p === String(term.adminPassword).trim().toLowerCase()) return "admin";
  if (term.password && p === String(term.password).trim().toLowerCase()) return "user";
  return null;
}

// ---------- minigra (zasada domowa) ----------
/** Prosty powtarzalny generator liczb (wspólny układ ekranu u wszystkich graczy). */
export function rng(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
/** Próby w minigrze (jak w grach). */
export const MAX_TRIES = 4;
/** Podobieństwo: liczba liter na tych samych miejscach. */
export const likeness = (a, b) => [...String(a)].reduce((n, ch, i) => n + (ch === String(b)[i] ? 1 : 0), 0);

/**
 * Nowa gra: { words, answer, tries, hints, removed, seed, len }.
 * Podpowiedzi (usunięcie atrapy) = ranga Science / 25 minus trudność; próby — MAX_TRIES.
 */
export function newGame(dict, security, { scienceRank = 0, seed = Date.now(), count = 12 } = {}) {
  const sec = TERMINAL_SECURITY[security] ?? TERMINAL_SECURITY["3/4"];
  const rand = rng(seed);
  const len = sec.len[Math.floor(rand() * sec.len.length)];
  const pool = [...new Set(dict?.[len] ?? dict?.[String(len)] ?? [])];
  if (pool.length < 4) return null;
  const answer = pool[Math.floor(rand() * pool.length)];
  // część słów podobnych do hasła, żeby podobieństwo coś mówiło
  const scored = pool.filter(w => w !== answer).map(w => ({ w, l: likeness(w, answer), r: rand() }));
  scored.sort((a, b) => (b.l - a.l) || (a.r - b.r));
  const close = scored.slice(0, Math.ceil((count - 1) / 2));
  const rest = scored.slice(close.length).sort((a, b) => a.r - b.r).slice(0, count - 1 - close.length);
  const words = [answer, ...close.map(x => x.w), ...rest.map(x => x.w)].map(w => ({ w, r: rand() })).sort((a, b) => a.r - b.r).map(x => x.w);
  return { words, answer, tries: MAX_TRIES, hints: Math.max(0, Math.floor(scienceRank / 25) - sec.penalty), removed: [], seed, len };
}

/** Strzał w minigrze: { correct, likeness, tries, lockout }. */
export function guessWord(game, word) {
  const w = String(word ?? "").toUpperCase();
  if (w === game.answer) return { correct: true, likeness: w.length, tries: game.tries, lockout: false };
  const tries = Math.max(0, (game.tries ?? MAX_TRIES) - 1);
  return { correct: false, likeness: likeness(w, game.answer), tries, lockout: tries <= 0 };
}

/** Usuń jedną atrapę (podpowiedź): zwraca słowo albo null. */
export function pickDud(game, rand = Math.random) {
  const duds = game.words.filter(w => w !== game.answer && !(game.removed ?? []).includes(w));
  return duds.length ? duds[Math.floor(rand() * duds.length)] : null;
}

/**
 * Zrzut pamięci jak w grach: wiersze z adresem i 12 znakami śmieci, słowa wplecione w ciąg.
 * Zwraca [{ addr, parts: [{ t, word? }] }] — 2 kolumny po 12 wierszy.
 */
export function memoryDump(game, { rows = 24, width = 12 } = {}) {
  const rand = rng((game.seed ?? 1) + 7);
  const junk = "!@#$%^&*()-_=+[]{}<>/\\|;:'\",.?";
  const total = rows * width;
  const n = game.words.length;
  const slot = Math.floor(total / n);
  let stream = [];
  for (let i = 0; i < n; i++) {
    const w = game.words[i];
    const pad = Math.max(0, slot - w.length);
    const before = Math.floor(rand() * (pad + 1));
    for (let k = 0; k < before; k++) stream.push({ c: junk[Math.floor(rand() * junk.length)] });
    for (const c of w) stream.push({ c, word: w });
    for (let k = before; k < pad; k++) stream.push({ c: junk[Math.floor(rand() * junk.length)] });
  }
  while (stream.length < total) stream.push({ c: junk[Math.floor(rand() * junk.length)] });
  stream = stream.slice(0, total);
  const base = 0xf000 + Math.floor(rand() * 0x80) * 0x10;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const cells = stream.slice(r * width, (r + 1) * width);
    const parts = [];
    for (const cell of cells) {
      const last = parts.at(-1);
      if (last && last.word === cell.word && (cell.word || !last.word)) last.t += cell.c;
      else parts.push({ t: cell.c, word: cell.word });
    }
    out.push({ addr: `0x${(base + r * width).toString(16).toUpperCase()}`, parts });
  }
  return out;
}

/**
 * Analiza zrzutu — rzut Science w minigrze (raz na grę): krytyk — +2 podpowiedzi i pełne próby; sukces — +1 podpowiedź
 * i +1 próba (do MAX_TRIES); porażka — nic; krytyczna porażka — jedna próba mniej (ostatnia → blokada jak po chybionym haśle).
 * Zwraca { game, lines, lockout }.
 */
export function analyzeOutcome(game, result) {
  const g = { ...game, analyzed: true };
  if (result === "crit-success") return { game: { ...g, hints: (Number(g.hints) || 0) + 2, tries: MAX_TRIES }, lines: [t("> ANALYSIS: +2 HINTS"), t("> ATTEMPTS RESTORED")], lockout: false };
  if (result === "success") {
    const before = Number(g.tries ?? MAX_TRIES) || 0;
    const tries = Math.min(MAX_TRIES, before + 1);
    return { game: { ...g, hints: (Number(g.hints) || 0) + 1, tries }, lines: [t("> ANALYSIS: +1 HINT"), ...(tries > before ? [t("> +1 ATTEMPT")] : [])], lockout: false };
  }
  if (result === "crit-fail") {
    const tries = Math.max(0, (Number(g.tries) || MAX_TRIES) - 1);
    return { game: { ...g, tries }, lines: [t("> ANALYSIS ERROR — ATTEMPT LOST")], lockout: tries <= 0 };
  }
  return { game: g, lines: [t("> ANALYSIS INCONCLUSIVE")], lockout: false };
}

// ---------- zasięg obsługi ----------
/**
 * Przedmioty, z którymi postać obsłuży terminal z dystansu (ft):
 * kabel z PipBucka (Cabling, Universal 10’, s. 218), implant Console Matrix Remote Control Talisman (20 ft, s. 108),
 * kabel iskrowy do zdalnego dostępu (Wire, Spark 25’, s. 240).
 */
export const REMOTE_GEAR = [
  { re: /^cabling,?\s*universal/i, ft: 10 },
  { re: /console matrix remote control/i, ft: 20, implant: true },
  { re: /^wire,?\s*spark/i, ft: 25 }
];

/** Najdłuższy zasięg z przedmiotów postaci: { ft, label } (0 — tylko obok). powered=false — implant bez zasilania nie działa. */
export function remoteReach(actor, { powered = true } = {}) {
  let best = { ft: 0, label: "" };
  for (const i of actor?.items ?? []) {
    const g = REMOTE_GEAR.find(x => x.re.test(String(i?.name ?? "")));
    if (!g || g.ft <= best.ft) continue;
    if (i.type === "feature" && i.system?.active === false) continue;
    if (i.type === "gear" && (Number(i.system?.qty ?? 1) || 0) <= 0) continue;
    if (g.implant && !powered && (Number(i.system?.cyber?.power) || 0) > 0) continue;
    best = { ft: g.ft, label: i.name };
  }
  return best;
}

// ---------- uruchamianie (animacja ASCII) ----------
const MAKERS = tmap({
  office: "ROBRONCO INDUSTRIES", stabletec: "STABLE-TEC",   // en=pl
  cloud: N_("ENCLAVE — CLOUD SERVICES"), unics: "UNICS LABS", portable: "STABLE-TEC"   // en=pl
});

/** Linie wypisywane przy uruchamianiu terminala (przed paskiem ładowania); ministry — dla terminala ministerialnego. */
export function bootLines(kind = "office", brand = "", ministry = "mwt") {
  const min = kind === "military" ? MINISTRIES[ministryOf({ ministry })] : null;
  const head = terminalBrand({ kind, brand, ministry });
  const lines = [
    head,
    `(C) ${min?.name ?? MAKERS[kind] ?? MAKERS.office}`,
    "",
    t("> MEMORY TEST ............ 64K OK"),
    t("> SPELL MATRIX ........... OK"),
    t("> DATA CRYSTALS .......... OK")
  ];
  if (kind === "cloud") lines.push(t("> SKY-LINK UPLINK ........ OK"));
  else if (min) lines.push(min.line);
  else if (kind === "portable") lines.push(t("> SPARK BATTERY .......... 37%"));
  else lines.push(t("> TERMLINK UPLINK ........ OK"));
  lines.push(t("> LOADING SYSTEM"));
  return lines;
}

/** Linia startowa z kropkami → [tekst z kropkami, status] („OK” pojawia się po chwili, jak po prawdziwym teście). */
export function splitStatus(line) {
  const m = /^(.*?\.{3,}\s*)(\S.*)$/.exec(String(line ?? ""));
  return m ? [m[1], m[2]] : [String(line ?? ""), ""];
}

/**
 * Pasek ładowania skokami: [{ pct, wait }] — przyrost zwykle 1–9%, czasem skok 12–30%; przerwa zwykle 50–150 ms,
 * czasem „zawieszenie” 400–900 ms; całość najwyżej maxMs (dłuższe przerwy są proporcjonalnie skracane).
 * Ostatni krok to 100%. rand — generator 0..1 (w testach powtarzalny).
 */
export function bootSteps(rand = Math.random, maxMs = 3200) {
  const steps = [];
  let pct = 0;
  while (pct < 100 && steps.length < 40) {
    const jump = rand() < 0.15 ? 12 + Math.floor(rand() * 19) : 1 + Math.floor(rand() * 9);
    const wait = rand() < 0.12 ? 400 + Math.floor(rand() * 501) : 50 + Math.floor(rand() * 101);
    pct = Math.min(100, pct + jump);
    steps.push({ pct, wait });
  }
  if (steps.at(-1)?.pct !== 100) steps.push({ pct: 100, wait: 120 });
  const total = steps.reduce((n, x) => n + x.wait, 0);
  if (total > maxMs) for (const x of steps) x.wait = Math.round((x.wait * maxMs) / total);
  return steps;
}

/** Pasek ładowania ASCII: „[#####-----]  50% /” (spinner co krok). */
export function bootBar(pct, width = 24, tick = 0) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const full = Math.round((p / 100) * width);
  return `[${"#".repeat(full)}${"-".repeat(width - full)}] ${String(p).padStart(3)}% ${p >= 100 ? " " : "|/-\\"[tick % 4]}`;
}

/** Linia dziennika ekranu z ograniczeniem długości. */
export const pushLog = (log, ...lines) => [...(log ?? []), ...lines].slice(-14);

/** Model danych aktora „terminal”. */
export function terminalDataClass() {
  const F = foundry.data.fields;
  const str = (initial = "") => new F.StringField({ initial, blank: true });
  return class TerminalData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
      return {
        kind: str("office"),
        ministry: str("mwt"),
        brand: str(""),
        security: str("3/4"),
        scienceReq: new F.NumberField({ initial: 0, min: 0, integer: true }),
        password: str(""),
        adminPassword: str(""),
        powered: new F.BooleanField({ initial: true }),
        welcome: str(""),
        notes: str(""),
        trap: new F.SchemaField({
          armed: new F.BooleanField({ initial: false }),
          explosive: str("frag"),
          noticeMfd: str("3/4"),
          screw: str("br")
        }),
        entries: new F.ArrayField(new F.SchemaField({
          id: str(""), title: str("New entry"), body: str(""), access: str("user")
        })),
        commands: new F.ArrayField(new F.SchemaField({
          id: str(""), label: str("New command"), kind: str("door"), action: str("open"), access: str("user"),
          targets: new F.ArrayField(new F.StringField()), text: str("")
        })),
        state: new F.SchemaField({
          access: str("none"),
          lockouts: new F.NumberField({ initial: 0, min: 0, integer: true }),
          booted: new F.BooleanField({ initial: false }),
          trapFound: new F.BooleanField({ initial: false }),
          game: new F.ObjectField({ initial: {}, nullable: true }),
          log: new F.ArrayField(new F.StringField())
        })
      };
    }
  };
}
