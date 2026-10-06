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

export const TERMINAL_KINDS = {
  office: { label: "Biurowy (zielony terminal)", brand: "M.A.S. TERMLINK PROTOCOL v2.1" },
  stabletec: { label: "Stable-Tec", brand: "STABLE-TEC UNIFIED OPERATING SYSTEM" },
  military: { label: "Wojskowy / ministerialny", brand: "MINISTRY OF WARTIME TECHNOLOGY — SECURE TERMLINK" },
  cloud: { label: "Chmurowy (Enclave)", brand: "ENCLAVE CLOUD TERMINAL // SKY-LINK" },
  unics: { label: "Unics", brand: "UNICS 3.4 — MULTI-USER SYSTEM" },
  portable: { label: "Przenośny", brand: "PORTABLE TERMINAL — SPARK BATTERY MODE" }
};

/** Zabezpieczenie: MFD hakowania i długość słów w minigrze. */
export const TERMINAL_SECURITY = {
  none: { label: "Brak (otwarty)", mfd: null, len: [4, 5], penalty: 0 },
  "1": { label: "Łatwe (MFD 1)", mfd: "1", len: [4, 5], penalty: 0 },
  "3/4": { label: "Przeciętne (MFD ¾)", mfd: "3/4", len: [6, 7], penalty: 1 },
  "1/2": { label: "Trudne (MFD ½)", mfd: "1/2", len: [8, 9, 10], penalty: 2 },
  "1/4": { label: "Bardzo trudne (MFD ¼)", mfd: "1/4", len: [11, 12], penalty: 3 }
};

export const ACCESS = { none: 0, user: 1, admin: 2 };
export const ACCESS_LABELS = { public: "publiczny", user: "po zalogowaniu", admin: "administrator" };
export const TRAP_EXPLOSIVES = {
  frag: { label: "Granat odłamkowy (6d12)", formula: "6d12", name: "Frag Grenade" },
  satchel: { label: "Ładunek (10d12)", formula: "10d12", name: "Satchel Charge" },
  sparkle: { label: "Sparkle grenade (10d20)", formula: "10d20", name: "Sparkle Grenade" }
};
export const COMMAND_KINDS = { door: "Drzwi", token: "Tokeny (wieżyczki, roboty)", message: "Komunikat na czacie" };
export const COMMAND_ACTIONS = {
  door: { open: "otwórz", close: "zamknij", lock: "zarygluj", unlock: "odrygluj", toggle: "przełącz" },
  token: { off: "wyłącz", on: "włącz", friendly: "przeciw wrogom (sojusznicze)", hostile: "wrogie" },
  message: { say: "wyślij" }
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
  if (!term.powered) { use = false; why.push("terminal nie ma zasilania"); }
  if (term.kind === "cloud" && actor && !actor.system?.flier) { use = false; why.push("terminal chmurowy — obsłużą go tylko latający"); }
  if (lockouts >= 2) { use = false; why.push("terminal zablokowany na stałe"); }
  if (!use) return { use, hack: false, login: false, why };
  if (term.security === "none") { hack = false; }
  if (isIlliterate(actor)) { hack = false; why.push("postać nie umie czytać (Illiterate)"); }
  const rank = actor?.system?.skills?.science?.rank ?? 0;
  if ((Number(term.scienceReq) || 0) > rank) { hack = false; why.push(`wymaga Science ${term.scienceReq} (postać: ${rank})`); }
  if (lockouts === 1 && !hasComputerWhiz(actor)) { hack = false; why.push("terminal zablokowany po krytycznej porażce — tylko hasło (albo Computer Whiz)"); }
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
/** Podobieństwo: liczba liter na tych samych miejscach. */
export const likeness = (a, b) => [...String(a)].reduce((n, ch, i) => n + (ch === String(b)[i] ? 1 : 0), 0);

/**
 * Nowa gra: { words, answer, tries, hints, removed, seed, len }.
 * Podpowiedzi (usunięcie atrapy) = ranga Science / 25 minus trudność; próby 4 (jak w grach).
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
  return { words, answer, tries: 4, hints: Math.max(0, Math.floor(scienceRank / 25) - sec.penalty), removed: [], seed, len };
}

/** Strzał w minigrze: { correct, likeness, tries, lockout }. */
export function guessWord(game, word) {
  const w = String(word ?? "").toUpperCase();
  if (w === game.answer) return { correct: true, likeness: w.length, tries: game.tries, lockout: false };
  const tries = Math.max(0, (game.tries ?? 4) - 1);
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
          noticeMfd: str("3/4")
        }),
        entries: new F.ArrayField(new F.SchemaField({
          id: str(""), title: str("Nowy wpis"), body: str(""), access: str("user")
        })),
        commands: new F.ArrayField(new F.SchemaField({
          id: str(""), label: str("Nowa komenda"), kind: str("door"), action: str("open"), access: str("user"),
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
