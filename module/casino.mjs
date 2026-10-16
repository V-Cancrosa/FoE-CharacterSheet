/**
 * Kasyno w grze: stół do blackjacka (automatyczny krupier) albo Texas Hold'em jako aktor „Stół do gry” z tokenem na
 * mapie. Zasady: casino-data.mjs; okno stołu: casino-sheet.mjs.
 *
 * Gracze mają do stołu dostęp „ograniczony” (nie mogą go zmieniać), więc każdy ruch idzie kanałem systemu do
 * przeglądarki aktywnego MG. Ta wykonuje operacje po kolei (osobno dla każdego stołu), pilnuje kapsli i zapisuje jawny
 * stan stołu. Tajemnice — but, zakryta karta krupiera, talia i karty graczy w pokerze — są tylko w pamięci przeglądarki
 * MG, nigdzie w świecie. Gracz dostaje swoje dwie karty zaszyfrowane kluczem, który zna tylko jego przeglądarka
 * (ECDH P-256 → AES-GCM), więc nikt inny nie podejrzy ich nawet w konsoli. Gdy MG odświeży stronę w trakcie rozdania,
 * tajemnice znikają: rozdanie jest anulowane, a stawki wracają do graczy.
 */
import { F, SOCKET, esc, warn, capsOf, capsText, gridOf, rectOf, tokenOf } from "./give.mjs";
import { isAdjacent } from "./trade-data.mjs";
import * as C from "./casino-data.mjs";

/** Postacie, które mogą siadać przy stole (bez terminali, pojazdów i samych stołów). */
const NOT_PLAYERS = ["terminal", "vehicle", "casino"];
const QUERY = `${F}.casinoHole`;

const SECRETS = new Map();   // MG: uuid stołu → { key, data } — tajemnice bieżącego rozdania (i but blackjacka)
const HOLES = new Map();     // gracz: uuid stołu → { hand, seat, cards } — moje karty w pokerze
const KEYS = new Map();      // MG: id użytkownika → jego klucz publiczny (JWK)
const CHAINS = new Map();    // MG: uuid stołu → kolejka operacji

export const reachOn = () => { try { return game.settings.get(F, "casinoReach") !== false; } catch { return true; } };
const chatOn = () => { try { return game.settings.get(F, "casinoChat") !== false; } catch { return true; } };

export function registerCasinoSettings() {
  game.settings.register(F, "casinoReach", {
    name: "Stoły do gry: siadanie tylko z bliska",
    hint: "Postać siada przy stole (blackjack, poker) tylko, gdy jej token stoi obok tokenu stołu — jak przy wymianie i terminalach. Stół bez tokenu na oglądanej scenie działa bez tego warunku.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "casinoChat", {
    name: "Stoły do gry: wyniki na czacie",
    hint: "Po każdej rundzie blackjacka i każdym rozdaniu pokera krótka karta z wynikami na czacie.",
    scope: "world", config: true, type: Boolean, default: true
  });
}

// ======================================================================
// Stan stołu
// ======================================================================

/** Jawny stan stołu z aktora (świeży, gdy brak albo zmieniono grę). */
export function tableState(table) {
  const sys = table?.system ?? {};
  let st = null;
  try { st = sys.table ? JSON.parse(sys.table) : null; } catch { st = null; }
  if (!st || st.game !== (sys.game || "blackjack")) st = sys.game === "holdem" ? C.heNewState() : C.bjNewState();
  return st;
}
/** Czy trwa rozdanie (są tajemnice w grze). */
export const inPlay = st => (st.game === "holdem" ? C.HE_PLAYING.includes(st.phase) : st.phase === "playing");
const secretKey = st => (st.game === "holdem" ? `he:${st.hand}` : `bj:${st.round}`);
/** Miejsce, które ma teraz ruch (albo null). */
export function turnSeat(st) {
  if (!inPlay(st)) return null;
  return st.game === "holdem" ? st.seats[st.turn] ?? null : st.seats[st.turn?.seat] ?? null;
}

/** Postać, która siada: zaznaczony własny token, potem postać gracza. */
export function userActor() {
  const own = (canvas?.tokens?.controlled ?? []).map(t => t.actor).find(a => a?.isOwner && !NOT_PLAYERS.includes(a.type));
  return own ?? game.user.character ?? null;
}

/** Dokument po uuid bez czekania (null, gdy nie da się go znaleźć od ręki). */
export const docSync = uuid => { try { return fromUuidSync(uuid) ?? null; } catch { return null; } };

/** Czy to miejsce prowadzi ten użytkownik: gracz — swoje postacie, MG — NPC. */
export function controls(seat, user = game.user) {
  if (!seat || seat.leaving) return false;
  if (seat.npc) return !!user.isGM;
  if (seat.user === user.id) return true;
  return !user.isGM && !!docSync(seat.actor)?.testUserPermission?.(user, "OWNER");
}

/**
 * Czy postać sięga stołu: { ok, why }. Zawsze tak: bez tej zasady, u MG i gdy stołu nie ma na oglądanej scenie.
 * Obok = tokeny się stykają (bokiem albo rogiem), jak przy wymianie.
 */
export function tableReach(actor, table) {
  if (!reachOn() || game.user.isGM) return { ok: true };
  const scene = canvas?.ready ? canvas.scene : null;
  const tables = scene && table ? (table.isToken ? [table.token].filter(t => t?.parent?.id === scene.id) : (table.getActiveTokens?.(false, true) ?? [])) : [];
  if (!tables.length) return { ok: true };
  if (!actor) return { ok: false, why: "zaznacz swój token" };
  const me = tokenOf(actor);
  if (!me) return { ok: false, why: `${actor.name} nie ma tokena na tej scenie` };
  const grid = gridOf(scene);
  const mine = rectOf(me, grid.size);
  if (tables.some(t => isAdjacent(mine, rectOf(t, grid.size), grid, [me.elevation, t.elevation]))) return { ok: true };
  return { ok: false, why: "podejdź do stołu (token obok tokenu stołu)" };
}

// ======================================================================
// Szyfrowanie kart (WebCrypto: ECDH P-256 → AES-GCM)
// ======================================================================

const subtle = () => globalThis.crypto?.subtle ?? null;
let MY_KEYS = null;
/** Para kluczy tej przeglądarki (klucz prywatny nie do wyjęcia); null bez WebCrypto (świat bez HTTPS). */
function myKeys() {
  if (!subtle()) return Promise.resolve(null);
  MY_KEYS ??= (async () => {
    const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
    const jwk = await subtle().exportKey("jwk", pair.publicKey);
    return { pair, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
  })().catch(err => { console.warn(`${F} | kasyno: brak szyfrowania`, err); return null; });
  return MY_KEYS;
}
async function aesKey(theirs, usage) {
  const keys = await myKeys();
  if (!keys || !theirs?.x) return null;
  const pub = await subtle().importKey("jwk", { kty: "EC", crv: "P-256", x: theirs.x, y: theirs.y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return subtle().deriveKey({ name: "ECDH", public: pub }, keys.pair.privateKey, { name: "AES-GCM", length: 256 }, false, [usage]);
}
const b64 = buf => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
/** Losowanie do tasowania: kryptograficzne, gdy się da. */
const rand = () => (globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random());

/** Klucz publiczny gracza dotarł do MG. */
const KEY_WAIT = new Map();
function keyArrived(userId, jwk) {
  if (!userId || !jwk?.x) return;
  KEYS.set(userId, jwk);
  for (const res of KEY_WAIT.get(userId) ?? []) res(jwk);
  KEY_WAIT.delete(userId);
}
/** MG: klucz gracza — gdy go brak, poproś o niego i poczekaj chwilę. */
function waitKey(userId, ms = 3000) {
  if (KEYS.has(userId)) return Promise.resolve(KEYS.get(userId));
  return new Promise(res => {
    if (!KEY_WAIT.has(userId)) KEY_WAIT.set(userId, []);
    KEY_WAIT.get(userId).push(res);
    game.socket.emit(SOCKET, { kind: "casino-keyreq", to: userId });
    setTimeout(() => res(KEYS.get(userId) ?? null), ms);
  });
}
/** Gracz: ogłoś swój klucz publiczny (MG zaszyfruje nim karty). */
async function announceKey() {
  const keys = await myKeys();
  if (keys && !game.user.isGM) game.socket.emit(SOCKET, { kind: "casino-key", user: game.user.id, jwk: keys.jwk });
}

/** MG → gracz: jego karty (szyfrowane; bez WebCrypto — zapytaniem tylko do niego). */
async function deliver(userId, msg) {
  if (userId === game.user.id) return receive(msg);
  const user = game.users.get(userId);
  if (!user?.active) return;
  const keys = await myKeys();
  const theirs = keys ? await waitKey(userId) : null;
  if (keys && theirs) {
    try {
      const key = await aesKey(theirs, "encrypt");
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(msg)));
      game.socket.emit(SOCKET, { kind: "casino-hole", to: userId, gk: keys.jwk, iv: b64(iv), ct: b64(ct) });
      return;
    } catch (err) { console.warn(`${F} | kasyno: szyfrowanie kart`, err); }
  }
  if (typeof user.query === "function" && CONFIG.queries?.[QUERY]) {
    try { await user.query(QUERY, msg, { timeout: 8000 }); return; } catch (err) { console.warn(`${F} | kasyno: wysyłka kart`, err); }
  }
  game.socket.emit(SOCKET, { kind: "casino-hole", to: userId, plain: msg });
}

/** Gracz: odszyfruj i zapamiętaj swoje karty (tylko w pamięci tej karty przeglądarki). */
async function receiveHole(p) {
  if (p.to !== game.user.id) return;
  let msg = p.plain ?? null;
  if (!msg && p.ct) {
    try {
      const key = await aesKey(p.gk, "decrypt");
      if (!key) return;
      const plain = await subtle().decrypt({ name: "AES-GCM", iv: unb64(p.iv) }, key, unb64(p.ct));
      msg = JSON.parse(new TextDecoder().decode(plain));
    } catch (err) { console.warn(`${F} | kasyno: nie udało się odczytać kart`, err); return; }
  }
  receive(msg);
}
function receive(msg) {
  if (!msg?.table || !Array.isArray(msg.cards)) return true;
  HOLES.set(msg.table, { hand: msg.hand, seat: msg.seat, cards: msg.cards });
  rerender(msg.table);
  return true;
}

/** Moje karty w bieżącym rozdaniu (albo null). */
export function holeCards(table, st) {
  const h = HOLES.get(table.uuid);
  return h && st.game === "holdem" && h.hand === st.hand ? h : null;
}
/** MG: karty NPC w bieżącym rozdaniu — { seatId: [karty] }. Kart graczy MG nie widzi. */
export function npcHoles(table, st) {
  const sec = SECRETS.get(table.uuid);
  if (!game.user.isGM || st.game !== "holdem" || sec?.key !== secretKey(st)) return {};
  return Object.fromEntries(st.seats.filter(s => s.npc && s.inHand).map(s => [s.id, sec.data.holes?.[s.id] ?? null]));
}
const asked = new Map();
/**
 * Gracz bez swoich kart (np. po odświeżeniu strony) prosi MG o nie. Najpierw chwilę czeka — przy zwykłym rozdaniu
 * karty przychodzą zaraz po stanie stołu — i pyta najwyżej co kilka sekund.
 */
export function requestCards(table, st) {
  const k = `${table.uuid}:${st.hand}`;
  const last = asked.get(table.uuid);
  if (last?.k === k && (last.timer || Date.now() - last.t < 6000)) return;
  const entry = { k, t: Date.now(), timer: null };
  entry.timer = setTimeout(() => {
    entry.timer = null;
    entry.t = Date.now();
    const now = tableState(table);
    if (now.hand === st.hand && inPlay(now) && !holeCards(table, now)) request(table, "key", {}, { quiet: true });
  }, 2500);
  asked.set(table.uuid, entry);
}

function rerender(uuid) {
  for (const app of foundry.applications.instances.values()) if (app.document?.uuid === uuid && app.rendered) app.render();
}

// ======================================================================
// Kanał do MG
// ======================================================================

/** Wyślij operację: aktywny MG wykonuje od razu, reszta przez kanał systemu (z kluczem publicznym do kart). */
export async function request(table, op, data = {}, { quiet = false } = {}) {
  const keys = await myKeys();
  const payload = { kind: "casino", op, uuid: table.uuid, user: game.user.id, data: { ...data, jwk: keys?.jwk ?? null } };
  if (game.users.activeGM?.isSelf) return enqueue(payload);
  if (!game.users.activeGM) return quiet ? null : warn("Stół do gry działa tylko, gdy MG jest zalogowany.");
  game.socket.emit(SOCKET, payload);
  return true;
}

/** Operacje jednego stołu po kolei — każda czyta stan zapisany przez poprzednią. */
function enqueue(payload) {
  const prev = CHAINS.get(payload.uuid) ?? Promise.resolve();
  const next = prev.then(() => applyOp(payload)).catch(err => console.error(`${F} | kasyno`, err));
  CHAINS.set(payload.uuid, next);
  return next;
}

/** Odpowiedź dla gracza (odmowa, informacja). */
function tell(userId, text, level = "warn") {
  if (!text) return;
  if (userId === game.user.id) return ui.notifications[level]?.(text);
  game.socket.emit(SOCKET, { kind: "casino-msg", to: userId, text, level });
}

export function registerCasinoHooks() {
  if (globalThis.CONFIG?.queries) CONFIG.queries[QUERY] = data => receive(data);
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      const kind = payload?.kind;
      if (kind === "casino") { if (game.users.activeGM?.isSelf) enqueue(payload); }
      else if (kind === "casino-hole") receiveHole(payload);
      else if (kind === "casino-key") { if (game.users.activeGM?.isSelf) keyArrived(payload.user, payload.jwk); }
      else if (kind === "casino-keyreq") { if (payload.to === game.user.id) announceKey(); }
      else if (kind === "casino-msg" && payload.to === game.user.id) ui.notifications[payload.level === "info" ? "info" : "warn"](payload.text);
    });
    announceKey();
    // MG po odświeżeniu strony: rozdania w toku straciły tajemnice — anuluj je i zwróć stawki
    if (game.users.activeGM?.isSelf) {
      for (const a of game.actors?.filter(x => x.type === "casino") ?? []) {
        if (inPlay(tableState(a))) enqueue({ kind: "casino", op: "sync", uuid: a.uuid, user: game.user.id, data: {} });
      }
    }
  });
  // MG wszedł do gry: gracze podają mu swoje klucze do kart
  Hooks.on("userConnected", (user, connected) => { if (connected && user.isGM && !game.user.isGM) announceKey(); });
  // nowy stół: gracze widzą go (dostęp ograniczony), token połączony z aktorem, 2×1 pola
  Hooks.on("preCreateActor", (actor, data) => {
    if (actor.type !== "casino") return;
    const L = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
    actor.updateSource({
      img: data.img && !/mystery-man/.test(data.img) ? data.img : `systems/${F}/icons/casino.svg`,
      ownership: { default: Math.max(L, data.ownership?.default ?? 0) },
      prototypeToken: {
        actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0, width: 2, height: 1,
        texture: { src: `systems/${F}/icons/casino-table.svg` }
      }
    });
  });
  // grę zmienia się przy pustym stole (kapsle graczy leżą na stole)
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (actor.type !== "casino") return;
    const g = foundry.utils.getProperty(changes, "system.game");
    if (g === undefined || g === actor.system.game) return;
    if (tableState(actor).seats.length) {
      ui.notifications.warn(`${actor.name}: grę zmienisz, gdy nikt nie siedzi przy stole („Zamknij stół” zwraca kapsle).`);
      delete changes.system.game;
      return;
    }
    foundry.utils.setProperty(changes, "system.table", "");
  });
  // usunięcie stołu z kapslami graczy: zwrot (wykonuje aktywny MG)
  Hooks.on("deleteActor", actor => {
    if (actor.type !== "casino" || !game.users.activeGM?.isSelf) return;
    refundAll(tableState(actor)).catch(err => console.error(`${F} | kasyno: zwrot`, err));
  });
  // twój ruch: krótka informacja, gdy okno stołu jest zamknięte
  const lastTurn = new Map();
  Hooks.on("updateActor", (actor, changes) => {
    if (actor.type !== "casino" || !foundry.utils.hasProperty(changes, "system.table")) return;
    const st = tableState(actor);
    const seat = turnSeat(st);
    if (!seat || !controls(seat) || game.user.isGM) { lastTurn.delete(actor.uuid); return; }
    const key = `${secretKey(st)}:${st.game === "holdem" ? `${st.phase}:${st.turn}:${st.toCall}` : `${seat.id}`}`;
    if (lastTurn.get(actor.uuid) === key) return;
    lastTurn.set(actor.uuid, key);
    if (actor.sheet?.rendered && !actor.sheet.minimized) return;
    ui.notifications.info(`${actor.name}: twój ruch (${seat.name}).`);
  });
}

// ======================================================================
// Wykonanie operacji (aktywny MG)
// ======================================================================

/** Kapsle na karcie postaci (+ dodaje, − zdejmuje). */
async function addCaps(who, n) {
  if (!n) return;
  const a = typeof who === "string" ? await fromUuid(who).catch(() => null) : who;
  if (!a) { console.warn(`${F} | kasyno: nie ma postaci ${who} — ${n} kapsli przepada`); return; }
  await a.update({ "system.caps": Math.max(0, capsOf(a) + n) });
}

/** Zwrot wszystkiego, co leży na stole (zamknięcie, usunięcie stołu). */
async function refundAll(st) {
  for (const s of st.seats) {
    let back = 0;
    if (st.game === "holdem") back = s.stack + (inPlay(st) && s.inHand ? s.contributed : 0);
    else back = s.bet + (st.phase === "playing" && s.inRound ? s.hands.reduce((t, h) => t + h.bet, 0) : 0);
    if (back > 0) await addCaps(s.actor, back);
  }
}

const fail = (ctx, why) => { ctx.fail = why; return null; };
const secretOf = ctx => SECRETS.get(ctx.table.uuid)?.data ?? null;

function bankAdd(ctx, n) {
  if (!n) return;
  ctx.upd["system.profit"] = (ctx.upd["system.profit"] ?? ctx.sys.profit ?? 0) + n;
  if (!ctx.sys.bankUnlimited) ctx.upd["system.bank"] = (ctx.upd["system.bank"] ?? ctx.sys.bank ?? 0) + n;
}

/** Rozdanie bez tajemnic (MG odświeżył stronę albo zmienił się MG): anuluj i zwróć stawki. */
async function voidHand(ctx, st) {
  if (st.game === "holdem") {
    for (const s of st.seats) {
      if (!s.inHand) continue;
      s.stack += s.contributed;
      Object.assign(s, { bet: 0, contributed: 0, folded: false, allIn: false, acted: false, mayRaise: true, inHand: false, hole: null, lastAction: "", best: "" });
    }
    Object.assign(st, { pot: 0, board: [], phase: "waiting", turn: null, toCall: 0, last: null });
  } else {
    for (const s of st.seats) {
      if (!s.inRound) continue;
      await addCaps(s.actor, s.hands.reduce((t, h) => t + h.bet, 0));
      s.hands = []; s.inRound = false;
    }
    Object.assign(st, { dealer: { cards: [], hidden: false, total: 0 }, phase: "betting", turn: null, last: [] });
  }
  SECRETS.delete(ctx.table.uuid);
  ctx.dirty = true;
  ctx.log.push("> ROZDANIE ANULOWANE — stawki wróciły do graczy");
  return st;
}

/** Wynik operacji gry: tajemnice do pamięci MG, dziennik, rozliczenie i karta na czacie. */
async function applyBj(ctx, r) {
  SECRETS.set(ctx.table.uuid, { key: secretKey(r.state), data: r.secret });
  ctx.log.push(...r.log);
  if (r.payouts) {
    for (const p of r.payouts) await addCaps(p.actor, p.amount);
    bankAdd(ctx, r.house);
    ctx.chat.push(bjSummary(r.state));
  }
  return r.state;
}
function applyHe(ctx, r) {
  SECRETS.set(ctx.table.uuid, { key: secretKey(r.state), data: r.secret });
  ctx.log.push(...r.log);
  if (r.done) {
    bankAdd(ctx, r.house ?? 0);
    ctx.chat.push(heSummary(r.state));
  }
  return r.state;
}

/** Miejsce, którym ten użytkownik może grać: gracz — swoje, MG — każde. */
function seatFor(ctx, st, seatId) {
  const seat = st.seats.find(s => s.id === seatId && !s.leaving);
  if (!seat) return fail(ctx, "Nie siedzisz przy tym stole.");
  if (ctx.user.isGM) return seat;
  if (seat.npc) return fail(ctx, "Tym miejscem kieruje MG.");
  if (seat.user === ctx.user.id || docSync(seat.actor)?.testUserPermission?.(ctx.user, "OWNER")) return seat;
  return fail(ctx, "To nie twoje miejsce.");
}
const seated = (ctx, st) => ctx.user.isGM || st.seats.some(s => !s.leaving && !s.npc && (s.user === ctx.user.id || docSync(s.actor)?.testUserPermission?.(ctx.user, "OWNER")));

/** Wstanie od stołu: w trakcie rozdania pas (poker) albo „stoi” (blackjack); kapsle wracają po rozdaniu. */
async function unseat(ctx, st, seatId) {
  let seat = st.seats.find(s => s.id === seatId);
  if (!seat || seat.leaving) return st;
  if (st.game === "holdem") {
    if (inPlay(st) && seat.inHand && !seat.folded && !seat.allIn) {
      const r = C.heFoldOut(st, secretOf(ctx), seat.id);
      if (r.ok) st = applyHe(ctx, r);
    }
  } else {
    if (seat.bet > 0) { await addCaps(seat.actor, seat.bet); seat.bet = 0; }
    if (st.phase === "playing" && seat.inRound) {
      const r = C.bjStandOut(st, secretOf(ctx), seat.id);
      if (r.ok) st = await applyBj(ctx, r);
    }
  }
  seat = st.seats.find(s => s.id === seatId);
  seat.leaving = true;
  ctx.log.push(`> ${seat.name} odchodzi od stołu`);
  return st;
}

/** Po rozdaniu: miejsca odchodzących znikają, ich kapsle wracają na kartę postaci. Rozdający zostaje na swoim miejscu. */
async function cleanup(ctx, st) {
  if (inPlay(st) || !st.seats.some(s => s.leaving)) return st;
  for (const s of st.seats.filter(x => x.leaving)) {
    const back = st.game === "holdem" ? s.stack : s.bet;
    if (back > 0) { await addCaps(s.actor, back); ctx.log.push(`> ${s.name} zabiera ${capsText(back)}`); }
  }
  if (st.game === "holdem") {
    const btn = st.seats[st.button];
    const before = st.seats.slice(0, Math.max(0, st.button)).filter(s => !s.leaving).length;
    st.button = st.button < 0 || !btn ? -1 : btn.leaving ? before - 1 : before;
  }
  st.seats = st.seats.filter(s => !s.leaving);
  return st;
}

const OPS = {
  /** Nic — tylko sprawdzenie, czy rozdanie ma tajemnice (MG po odświeżeniu). */
  async sync() { return null; },

  async sit(ctx, st, d) {
    const { sys, user } = ctx;
    if (!sys.open) return fail(ctx, "Stół jest zamknięty.");
    const actor = await fromUuid(d.actor).catch(() => null);
    if (!actor || NOT_PLAYERS.includes(actor.type)) return fail(ctx, "Wybierz postać, która usiądzie przy stole.");
    if (!user.isGM && !actor.testUserPermission(user, "OWNER")) return fail(ctx, `${actor.name}: to nie twoja postać.`);
    if (st.seats.some(s => s.actor === actor.uuid && !s.leaving)) return fail(ctx, `${actor.name} już siedzi przy tym stole.`);
    if (st.seats.filter(s => !s.leaving).length >= C.MAX_SEATS) return fail(ctx, `Przy stole nie ma wolnych miejsc (${C.MAX_SEATS}).`);
    const npc = !!(d.npc && user.isGM);
    const seat = { id: foundry.utils.randomID(8), actor: actor.uuid, name: actor.name, user: user.id, npc, leaving: false };
    if (st.game === "holdem") {
      const buy = Math.floor(Number(d.buyIn) || 0);
      if (buy < sys.buyInMin || buy > sys.buyInMax) return fail(ctx, `Wpisowe: od ${sys.buyInMin} do ${sys.buyInMax} kapsli.`);
      if (capsOf(actor) >= buy) await addCaps(actor, -buy);
      else if (npc) ctx.log.push(`> ${actor.name}: kapsle na stół wykłada MG`);
      else return fail(ctx, `${actor.name}: za mało kapsli (${capsOf(actor)}).`);
      Object.assign(seat, { stack: buy, bet: 0, contributed: 0, folded: false, allIn: false, acted: false, mayRaise: true, inHand: false, hole: null, lastAction: "", best: "" });
      ctx.log.push(`> ${actor.name} siada do stołu (${capsText(buy)})`);
    } else {
      Object.assign(seat, { bet: 0, lastBet: 0, hands: [], inRound: false });
      ctx.log.push(`> ${actor.name} siada do stołu`);
    }
    st.seats.push(seat);
    return st;
  },

  async leave(ctx, st, d) {
    const seat = seatFor(ctx, st, d.seat);
    return seat ? unseat(ctx, st, seat.id) : null;
  },

  /** Blackjack: stawka przed rozdaniem (kapsle od razu na stół; 0 — wycofanie). */
  async bet(ctx, st, d) {
    const { sys } = ctx;
    if (st.game !== "blackjack") return fail(ctx, "To nie stół do blackjacka.");
    const seat = seatFor(ctx, st, d.seat);
    if (!seat) return null;
    if (st.phase !== "betting") return fail(ctx, "Poczekaj do końca rozdania.");
    const amt = Math.floor(Number(d.amount) || 0);
    if (amt && !sys.open) return fail(ctx, "Stół jest zamknięty.");
    if (amt && (amt < sys.minBet || amt > sys.maxBet)) return fail(ctx, `Stawka od ${sys.minBet} do ${sys.maxBet} kapsli.`);
    const actor = await fromUuid(seat.actor).catch(() => null);
    if (!actor) return fail(ctx, "Nie ma tej postaci.");
    const diff = amt - seat.bet;
    // NPC bez kapsli: stawkę wykłada MG (jak wpisowe w pokerze)
    const house = diff > 0 && capsOf(actor) < diff && seat.npc && ctx.user.isGM;
    if (diff > 0 && capsOf(actor) < diff && !house) return fail(ctx, `${seat.name}: za mało kapsli (${capsOf(actor)}).`);
    if (diff && !house) await addCaps(actor, -diff);
    seat.bet = amt;
    ctx.log.push(amt ? `> ${seat.name} stawia ${amt}${house ? " (wykłada MG)" : ""}` : `> ${seat.name} wycofuje stawkę`);
    return st;
  },

  /** Blackjack: krupier rozdaje wszystkim, którzy postawili. */
  async deal(ctx, st) {
    const { sys } = ctx;
    if (st.game !== "blackjack") return fail(ctx, "To nie stół do blackjacka.");
    if (!seated(ctx, st)) return fail(ctx, "Najpierw usiądź przy stole.");
    if (st.phase !== "betting") return fail(ctx, "Rozdanie już trwa.");
    if (!sys.open) return fail(ctx, "Stół jest zamknięty.");
    const bets = st.seats.filter(s => s.bet > 0 && !s.leaving);
    if (!bets.length) return fail(ctx, "Nikt nie postawił.");
    if (!sys.bankUnlimited) {
      const need = bets.reduce((t, s) => t + Math.floor(s.bet * 1.5), 0);
      if ((sys.bank ?? 0) < need) return fail(ctx, `Bank stołu (${sys.bank}) nie pokryje takich stawek — potrzeba ${need}.`);
    }
    const r = C.bjDeal(st, secretOf(ctx), { decks: sys.decks, rand, paid: Object.fromEntries(bets.map(s => [s.id, s.bet])) });
    if (!r.ok) return fail(ctx, r.why);
    return applyBj(ctx, r);
  },

  /** Ruch gracza: blackjack (hit/stand/double/split) albo poker (fold/check/call/raise/allin). */
  async act(ctx, st, d) {
    const { sys } = ctx;
    const seat = seatFor(ctx, st, d.seat);
    if (!seat) return null;
    if (st.game === "holdem") {
      const r = C.heAct(st, secretOf(ctx), seat.id, d.action, d.amount);
      if (!r.ok) return fail(ctx, r.why);
      return applyHe(ctx, r);
    }
    const legal = C.bjLegal(st, seat.id);
    if (!legal[d.action]) return fail(ctx, "To nie twój ruch albo ruch niedozwolony.");
    let house = false;
    if (d.action === "double" || d.action === "split") {
      const actor = await fromUuid(seat.actor).catch(() => null);
      house = capsOf(actor) < legal.cost && seat.npc && ctx.user.isGM;
      if (capsOf(actor) < legal.cost && !house) return fail(ctx, `${seat.name}: za mało kapsli (potrzeba ${legal.cost}).`);
      if (!sys.bankUnlimited && (sys.bank ?? 0) < C.bjExposure(st, legal.cost)) return fail(ctx, "Bank stołu nie przyjmie wyższej stawki.");
    }
    const r = C.bjAct(st, secretOf(ctx), seat.id, d.action);
    if (!r.ok) return fail(ctx, r.why);
    if (r.charge && !house) await addCaps(seat.actor, -r.charge);
    return applyBj(ctx, r);
  },

  /** Poker: nowe rozdanie (karty graczy idą do nich osobno). */
  async start(ctx, st) {
    const { sys } = ctx;
    if (st.game !== "holdem") return fail(ctx, "To nie stół do pokera.");
    if (!sys.open) return fail(ctx, "Stół jest zamknięty.");
    if (!seated(ctx, st)) return fail(ctx, "Najpierw usiądź przy stole.");
    const r = C.heStart(st, { sb: sys.smallBlind, bb: Math.max(sys.bigBlind, sys.smallBlind), rake: sys.rake, rand });
    if (!r.ok) return fail(ctx, r.why);
    ctx.holes = true;
    return applyHe(ctx, r);
  },

  /** Poker: dokupienie kapsli między rozdaniami (do górnej granicy wpisowego). */
  async rebuy(ctx, st, d) {
    const { sys } = ctx;
    if (st.game !== "holdem") return fail(ctx, "To nie stół do pokera.");
    const seat = seatFor(ctx, st, d.seat);
    if (!seat) return null;
    if (inPlay(st) && seat.inHand) return fail(ctx, "Dokupić można między rozdaniami.");
    const amt = Math.floor(Number(d.amount) || 0);
    if (amt <= 0) return fail(ctx, "Podaj, ile kapsli dokupić.");
    if (seat.stack + amt > sys.buyInMax) return fail(ctx, `Na stole można mieć najwyżej ${sys.buyInMax} kapsli (masz ${seat.stack}).`);
    const actor = await fromUuid(seat.actor).catch(() => null);
    if (actor && capsOf(actor) >= amt) await addCaps(actor, -amt);
    else if (seat.npc && ctx.user.isGM) ctx.log.push(`> ${seat.name}: kapsle dokłada MG`);
    else return fail(ctx, `${seat.name}: za mało kapsli (${capsOf(actor)}).`);
    seat.stack += amt;
    ctx.log.push(`> ${seat.name} dokupuje ${amt} (na stole ${seat.stack})`);
    return st;
  },

  /** Gracz prosi o swoje karty (np. po odświeżeniu strony) — klucz zapisany wyżej. */
  async key(ctx, st) {
    if (st.game === "holdem" && inPlay(st)) ctx.holesFor = ctx.user.id;
    return null;
  },

  // ---------- MG ----------
  async kick(ctx, st, d) {
    if (!ctx.user.isGM) return null;
    return unseat(ctx, st, d.seat);
  },
  async void(ctx, st) {
    if (!ctx.user.isGM || !inPlay(st)) return null;
    return voidHand(ctx, st);
  },
  async close(ctx, st) {
    if (!ctx.user.isGM) return null;
    if (inPlay(st)) st = await voidHand(ctx, st);
    await refundAll(st);
    st.seats = [];
    if (st.game === "holdem") st.button = -1;
    ctx.upd["system.open"] = false;
    ctx.log.push("> STÓŁ ZAMKNIĘTY — kapsle wróciły do graczy");
    return st;
  }
};

async function applyOp(p) {
  const table = await fromUuid(p.uuid).catch(() => null);
  if (table?.type !== "casino") return;
  const user = game.users.get(p.user);
  if (!user) return;
  const d = p.data ?? {};
  if (d.jwk?.x) keyArrived(user.id, d.jwk);
  const ctx = { table, sys: table.system, user, log: [], upd: {}, chat: [], fail: null, dirty: false, holes: false, holesFor: null };
  let st = tableState(table);
  if (inPlay(st) && SECRETS.get(table.uuid)?.key !== secretKey(st)) st = await voidHand(ctx, st);
  const fn = OPS[p.op];
  const out = fn ? await fn(ctx, st, d) : null;
  if (ctx.fail) tell(user.id, ctx.fail);
  if (out) st = out;
  if (!out && !ctx.dirty) {
    if (ctx.holesFor) await sendHoles(table, st, ctx.holesFor);
    return;
  }
  st = await cleanup(ctx, st);
  const log = [...(table.system.log ?? []), ...ctx.log].slice(-40);
  await table.update({ "system.table": JSON.stringify(st), "system.log": log, ...ctx.upd });
  if (ctx.holes || ctx.holesFor) await sendHoles(table, st, ctx.holesFor);
  for (const c of ctx.chat) await chatCard(table, c);
}

/** Karty graczy w pokerze: każdemu jego dwie (NPC zostają u MG). */
async function sendHoles(table, st, only = null) {
  if (st.game !== "holdem" || !inPlay(st)) return;
  const sec = SECRETS.get(table.uuid);
  if (sec?.key !== secretKey(st)) return;
  for (const s of st.seats) {
    if (!s.inHand || s.npc || (only && s.user !== only)) continue;
    const cards = sec.data.holes?.[s.id];
    if (cards) await deliver(s.user, { table: table.uuid, hand: st.hand, seat: s.id, cards });
  }
}

// ======================================================================
// Czat
// ======================================================================

const RESULT = { bj: "blackjack", win: "wygrana", push: "remis", lose: "przegrana", bust: "fura" };
/** Mała karta do wiadomości na czacie. */
export function miniCard(code) {
  const c = C.cardInfo(code);
  return `<span class="cz-mini${c.red ? " red" : ""}" title="${esc(c.title)}">${esc(c.rank)}${c.suit}</span>`;
}

function bjSummary(st) {
  const d = st.dealer;
  const dTotal = C.bjValue(d.cards).total;
  const rows = [`<div class="cz-row dealer"><b>Krupier</b><span>${d.cards.map(miniCard).join("")}</span><em>${d.cards.length === 2 && dTotal === 21 ? "blackjack" : dTotal > 21 ? `fura (${dTotal})` : dTotal}</em></div>`];
  for (const s of st.seats.filter(x => x.inRound)) {
    const net = s.hands.reduce((t, h) => t + h.payout - h.bet, 0);
    rows.push(`<div class="cz-row ${net > 0 ? "win" : net < 0 ? "lose" : "push"}"><b>${esc(s.name)}</b><span>${s.hands.map(h => h.cards.map(miniCard).join("")).join(" · ")}</span><em>${s.hands.map(h => RESULT[h.result] ?? "").join(" / ")} ${net > 0 ? "+" : ""}${net}</em></div>`);
  }
  return { tag: "BLACKJACK", sub: `runda ${st.round}`, body: rows.join("") };
}

function heSummary(st) {
  const L = st.last ?? { winners: [], shown: [] };
  const rows = [];
  if (st.board.length) rows.push(`<div class="cz-row board"><b>Stół</b><span>${st.board.map(miniCard).join("")}</span></div>`);
  for (const sh of L.shown) rows.push(`<div class="cz-row ${L.winners.some(w => w.id === sh.id) ? "win" : "lose"}"><b>${esc(sh.name)}</b><span>${(sh.hole ?? []).map(miniCard).join("")}</span><em>${esc(sh.hand)}</em></div>`);
  for (const w of L.winners) rows.push(`<div class="cz-row win"><b>${esc(w.name)}</b><em>zgarnia ${capsText(w.amount)}${!L.shown.length ? " (reszta spasowała)" : ""}</em></div>`);
  if (L.house) rows.push(`<div class="cz-row"><b>Prowizja kasyna</b><em>${L.house}</em></div>`);
  return { tag: "TEXAS HOLD'EM", sub: `rozdanie ${st.hand}`, body: rows.join("") };
}

/** Wynik przy stole widzą wszyscy — jawnie, niezależnie od trybu rzutu wybranego u MG. */
function chatCard(table, c) {
  if (!chatOn()) return null;
  return ChatMessage.create({
    speaker: { alias: table.name },
    content: `<div class="foe-card casino"><div class="fc-tag"><span>KASYNO // ${c.tag}</span><span>${esc(c.sub)}</span></div><h3>${esc(table.name)}</h3>${c.body}</div>`
  }, { messageMode: "public", rollMode: "publicroll" });
}

// ======================================================================
// Akcje z okna stołu
// ======================================================================

/** Usiądź postacią gracza (poker: z wpisowym). */
export async function sitDown(table, buyIn) {
  const actor = userActor();
  if (!actor) return warn("Zaznacz token swojej postaci albo przypisz postać do gracza.");
  const reach = tableReach(actor, table);
  if (!reach.ok) return warn(`${actor.name}: ${reach.why}.`);
  const sys = table.system;
  if (sys.game === "holdem") {
    const n = Math.floor(Number(buyIn) || 0);
    if (n < sys.buyInMin || n > sys.buyInMax) return warn(`Wpisowe: od ${sys.buyInMin} do ${sys.buyInMax} kapsli.`);
    if (capsOf(actor) < n) return warn(`${actor.name}: za mało kapsli (${capsOf(actor)}).`);
    return request(table, "sit", { actor: actor.uuid, buyIn: n });
  }
  return request(table, "sit", { actor: actor.uuid });
}

/** MG: posadź NPC zaznaczonych na mapie (poker: z kapslami na stół — z ich karty, a gdy brak, od MG). */
export async function seatNpcs(table, buyIn) {
  const actors = [...new Set((canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(a => a && !NOT_PLAYERS.includes(a.type)))];
  if (!actors.length) return warn("Zaznacz na mapie tokeny NPC, którzy mają usiąść przy stole.");
  for (const a of actors) await request(table, "sit", { actor: a.uuid, npc: true, buyIn });
  return true;
}
