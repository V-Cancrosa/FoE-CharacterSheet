/**
 * Kasyno — czyste zasady (bez Foundry): talia, blackjack z automatycznym krupierem i Texas Hold'em.
 * Podręcznik (s. 220): w talii damą kier jest Celestia, damą trefl Luna, damą karo Cadance, damą pik Nightmare Moon,
 * jokery to Discord i Chrysalis (w tych grach nieużywane). Ziemskie kucyki i pegazy zagrają w blackjacka i w Hold'em —
 * inne odmiany pokera to domena gryfów i jednorożców. Same zasady gier są jak w kasynach (zasada domowa).
 *
 * Stan stołu jest jawny (zapisany w aktorze), a tajemnice — but z kartami, zakryta karta krupiera, karty graczy w
 * pokerze — trzyma tylko przeglądarka MG (obiekt `secret`). Funkcje nie zmieniają argumentów: zwracają nowy stan.
 */
import { t, isPL, N_, tmap } from "./i18n.mjs";

export const RANKS = "23456789TJQKA";
export const SUITS = ["S", "H", "D", "C"];
export const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_NAME = tmap({ S: N_("card|spades"), H: N_("card|hearts"), D: N_("card|diamonds"), C: N_("card|clubs") });
export const QUEENS = { H: "Celestia", C: "Luna", D: "Cadance", S: "Nightmare Moon" };
// figury: po angielsku J/Q/K, po polsku W(alet)/D(ama)/K(ról)
const RANK_SHORT = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
const RANK_SHORT_PL = { T: "10", J: "W", Q: "D", K: "K", A: "A" };
const RANK_NAME = tmap({ 2: N_("card|two"), 3: N_("card|three"), 4: N_("card|four"), 5: N_("card|five"), 6: N_("card|six"), 7: N_("card|seven"), 8: N_("card|eight"), 9: N_("card|nine"), T: N_("card|ten"), J: N_("card|jack"), Q: N_("card|queen"), K: N_("card|king"), A: N_("card|ace") });
const RANK_PLURAL_EN = { 2: "twos", 3: "threes", 4: "fours", 5: "fives", 6: "sixes", 7: "sevens", 8: "eights", 9: "nines", T: "tens", J: "jacks", Q: "queens", K: "kings", A: "aces" };
// odmiana po polsku (mianownik l. mn. i miejscownik) — do nazw układów
const RANK_PLURAL = { 2: "dwójki", 3: "trójki", 4: "czwórki", 5: "piątki", 6: "szóstki", 7: "siódemki", 8: "ósemki", 9: "dziewiątki", T: "dziesiątki", J: "walety", Q: "damy", K: "króle", A: "asy" };   // pl-ok
const RANK_LOCATIVE = { 2: "dwójkach", 3: "trójkach", 4: "czwórkach", 5: "piątkach", 6: "szóstkach", 7: "siódemkach", 8: "ósemkach", 9: "dziewiątkach", T: "dziesiątkach", J: "waletach", Q: "damach", K: "królach", A: "asach" };   // pl-ok
export const MAX_SEATS = 6;

const clone = x => structuredClone(x);
const RV = r => RANKS.indexOf(r) + 2;            // 2..14
const RCHAR = v => RANKS[v - 2];

/** Opis karty do wyświetlenia: { code, rank, suit, red, title }. „??” — karta zakryta. */
export function cardInfo(code) {
  if (!code || code === "??") return { code: "??", rank: "", suit: "", red: false, hidden: true, queen: "", title: t("face-down card") };
  const r = code[0], s = code[1];
  const queen = r === "Q" ? ` — ${QUEENS[s]}` : "";
  const short = (isPL() ? RANK_SHORT_PL : RANK_SHORT)[r] ?? r;
  return { code, rank: short, suit: SUIT_SYMBOL[s], red: s === "H" || s === "D", hidden: false, queen: r === "Q" ? QUEENS[s] : "", title: `${t("{rank} of {suit}", { rank: RANK_NAME[r], suit: SUIT_NAME[s] })}${queen}` };
}

export function newDeck(decks = 1) {
  const out = [];
  for (let d = 0; d < Math.max(1, decks); d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

/** Tasowanie Fishera–Yatesa; rand() ∈ [0,1). */
export function shuffle(cards, rand = Math.random) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ======================================================================
// Blackjack
// ======================================================================

/** Wartość ręki: { total, soft } — as liczy się za 11, dopóki nie przebije 21. */
export function bjValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards ?? []) {
    const r = c[0];
    if (r === "A") { aces++; total += 11; } else if ("TJQK".includes(r)) total += 10; else total += Number(r);
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
const tenValue = c => "TJQK".includes(c?.[0]);
const sameValue = (a, b) => a?.[0] === b?.[0] || (tenValue(a) && tenValue(b));
/** Blackjack z rozdania: as i dziesiątka na pierwszych dwóch kartach (nie po rozdzieleniu). */
export const bjNatural = hand => !hand.split && hand.cards.length === 2 && bjValue(hand.cards).total === 21;
/** Krupier dobiera poniżej 17 i staje na każdych 17 (także miękkich). */
export const dealerHits = cards => bjValue(cards).total < 17;

export function bjNewState() {
  return { game: "blackjack", phase: "betting", round: 0, seats: [], dealer: { cards: [], hidden: false, total: 0 }, turn: null, shoeLeft: 0, shoeSize: 0, last: [] };
}

const newHand = (bet, cards = []) => ({ cards, bet, done: false, doubled: false, split: false, splitAces: false, result: "", payout: 0 });

/** Pierwsza ręka czekająca na ruch: { seat, hand } albo null. */
function bjFindTurn(state) {
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (!s.inRound) continue;
    for (let h = 0; h < s.hands.length; h++) if (!s.hands[h].done) return { seat: i, hand: h };
  }
  return null;
}

/** Co może zrobić gracz przy swojej ręce: { hit, stand, double, split } (bez sprawdzania kapsli). */
export function bjLegal(state, seatId) {
  const t = state.turn;
  const seat = t ? state.seats[t.seat] : null;
  if (state.phase !== "playing" || !seat || seat.id !== seatId) return { hit: false, stand: false, double: false, split: false };
  const hand = seat.hands[t.hand];
  const two = hand.cards.length === 2;
  return {
    hit: true, stand: true,
    double: two && !hand.splitAces,
    split: two && seat.hands.length === 1 && sameValue(hand.cards[0], hand.cards[1]),
    cost: hand.bet
  };
}

/**
 * Ile najwięcej kasyno może stracić na rękach w grze (wygrane ponad stawkę): blackjack z rozdania 3:2, reszta 1:1.
 * `extra` — dodatkowa stawka (podwojenie, rozdzielenie), która też może wygrać 1:1. Bank z limitem musi to pokryć.
 */
export function bjExposure(state, extra = 0) {
  let sum = Math.max(0, extra);
  for (const s of state.seats ?? []) {
    if (!s.inRound) continue;
    for (const h of s.hands ?? []) if (!h.result) sum += bjNatural(h) ? Math.floor(h.bet * 1.5) : h.bet;
  }
  return sum;
}

/** Rozliczenie ręki: { result, payout } — payout to kapsle do oddania graczowi (ze stawką). */
export function bjSettleHand(hand, dealerCards, dealerBJ) {
  const p = bjValue(hand.cards).total;
  if (p > 21) return { result: "bust", payout: 0 };
  const natural = bjNatural(hand);
  if (dealerBJ) return natural ? { result: "push", payout: hand.bet } : { result: "lose", payout: 0 };
  if (natural) return { result: "bj", payout: hand.bet + Math.floor(hand.bet * 1.5) };
  const d = bjValue(dealerCards).total;
  if (d > 21 || p > d) return { result: "win", payout: hand.bet * 2 };
  if (p === d) return { result: "push", payout: hand.bet };
  return { result: "lose", payout: 0 };
}

/** Krupier odkrywa kartę, dobiera do 17 i rozlicza stół. Zwraca { payouts: [{ seatId, actor, amount }], house }. */
function bjFinish(state, secret, log, { dealerBJ = false } = {}) {
  const d = state.dealer;
  if (secret.hole) { d.cards.push(secret.hole); secret.hole = null; }
  d.hidden = false;
  const hands = state.seats.filter(s => s.inRound).flatMap(s => s.hands);
  const needDraw = !dealerBJ && hands.some(h => bjValue(h.cards).total <= 21 && !bjNatural(h));
  if (needDraw) while (dealerHits(d.cards)) d.cards.push(secret.shoe.shift());
  d.total = bjValue(d.cards).total;
  const payouts = [];
  let staked = 0, paid = 0;
  for (const s of state.seats) {
    if (!s.inRound) continue;
    let sum = 0;
    for (const h of s.hands) {
      const r = bjSettleHand(h, d.cards, dealerBJ);
      h.result = r.result; h.payout = r.payout; h.done = true;
      sum += r.payout; staked += h.bet;
    }
    paid += sum;
    if (sum) payouts.push({ seatId: s.id, actor: s.actor, amount: sum });
  }
  log.push(dealerBJ ? t("> DEALER: BLACKJACK") : d.total > 21 ? t("> DEALER: BUST ({n})", { n: d.total }) : t("> DEALER: {n}", { n: d.total }));
  for (const s of state.seats.filter(x => x.inRound)) {
    const words = s.hands.map(h => ({ bj: "BLACKJACK", win: t("win"), push: t("push"), lose: t("loss"), bust: t("bust") }[h.result]));
    const net = s.hands.reduce((t, h) => t + h.payout - h.bet, 0);
    log.push(`> ${s.name}: ${words.join(" / ")} (${net >= 0 ? "+" : ""}${net})`);
  }
  state.turn = null;
  state.phase = "betting";
  state.last = state.seats.filter(s => s.inRound).map(s => ({ name: s.name, net: s.hands.reduce((t, h) => t + h.payout - h.bet, 0), results: s.hands.map(h => h.result) }));
  return { payouts, house: staked - paid };
}

/**
 * Rozdanie. paid — { seatId: pobrana stawka } (kapsle już zdjęte z kart postaci). Zwraca
 * { ok, state, secret, log, payouts?, house? } — rozliczenie od razu, gdy krupier ma blackjacka albo nikt nie ma ruchu.
 */
export function bjDeal(state0, secret0, { decks = 2, rand = Math.random, paid = {} } = {}) {
  const state = clone(state0), secret = { shoe: [...(secret0?.shoe ?? [])], hole: null };
  const log = [];
  if (state.phase !== "betting") return { ok: false, why: t("a round is already in progress") };
  const players = state.seats.filter(s => (paid[s.id] ?? 0) > 0);
  if (!players.length) return { ok: false, why: t("nobody has placed a bet") };
  const size = Math.max(1, decks) * 52;
  if (secret.shoe.length < Math.max(15, Math.floor(size * 0.25))) {
    secret.shoe = shuffle(newDeck(decks), rand);
    state.shoeSize = size;
    log.push(t("> NEW SHOE — SHUFFLING"));
  }
  const draw = () => secret.shoe.shift();
  for (const s of state.seats) { s.hands = []; s.inRound = false; }
  for (const s of players) { s.inRound = true; s.hands = [newHand(paid[s.id])]; s.lastBet = paid[s.id]; s.bet = 0; }
  state.dealer = { cards: [], hidden: true, total: 0 };
  for (let k = 0; k < 2; k++) {
    for (const s of players) s.hands[0].cards.push(draw());
    if (k === 0) state.dealer.cards.push(draw()); else secret.hole = draw();
  }
  state.round += 1;
  state.phase = "playing";
  log.push(t("> ROUND {n}: {players}", { n: state.round, players: players.map(s => `${s.name} (${s.hands[0].bet})`).join(", ") }));
  for (const s of players) if (bjNatural(s.hands[0])) { s.hands[0].done = true; log.push(`> ${s.name}: BLACKJACK!`); }
  // krupier zagląda pod kartę przy asie albo dziesiątce
  const up = state.dealer.cards[0];
  if ((up[0] === "A" || tenValue(up)) && bjValue([up, secret.hole]).total === 21) {
    const fin = bjFinish(state, secret, log, { dealerBJ: true });
    state.shoeLeft = secret.shoe.length;
    return { ok: true, state, secret, log, ...fin };
  }
  state.turn = bjFindTurn(state);
  if (!state.turn) {
    const fin = bjFinish(state, secret, log);
    state.shoeLeft = secret.shoe.length;
    return { ok: true, state, secret, log, ...fin };
  }
  state.shoeLeft = secret.shoe.length;
  return { ok: true, state, secret, log };
}

/**
 * Ruch gracza: hit | stand | double | split. Przy double i split `charge` to dodatkowa stawka, którą warstwa Foundry
 * musi zdjąć z kapsli (sprawdza je przed wywołaniem). Zwraca { ok, state, secret, log, charge?, payouts?, house? }.
 */
export function bjAct(state0, secret0, seatId, action) {
  const state = clone(state0), secret = { shoe: [...(secret0?.shoe ?? [])], hole: secret0?.hole ?? null };
  const legal = bjLegal(state, seatId);
  if (!legal[action]) return { ok: false, why: t("it's not your turn or the move isn't allowed") };
  const log = [];
  const seat = state.seats[state.turn.seat];
  const hand = seat.hands[state.turn.hand];
  const draw = () => secret.shoe.shift();
  let charge = 0;
  const closeIf21 = h => { const v = bjValue(h.cards).total; if (v >= 21) h.done = true; return v; };
  if (action === "hit") {
    hand.cards.push(draw());
    const v = closeIf21(hand);
    log.push(t("> {name}: hits — {v}", { name: seat.name, v: v > 21 ? t("BUST ({n})", { n: v }) : v }));
  } else if (action === "stand") {
    hand.done = true;
    log.push(t("> {name}: stands on {n}", { name: seat.name, n: bjValue(hand.cards).total }));
  } else if (action === "double") {
    charge = hand.bet;
    hand.bet *= 2; hand.doubled = true;
    hand.cards.push(draw());
    hand.done = true;
    log.push(t("> {name}: doubles — {n}", { name: seat.name, n: bjValue(hand.cards).total }));
  } else if (action === "split") {
    charge = hand.bet;
    const [a, b] = hand.cards;
    const aces = a[0] === "A";
    const h1 = { ...newHand(hand.bet, [a, draw()]), split: true, splitAces: aces };
    const h2 = { ...newHand(hand.bet, [b, draw()]), split: true, splitAces: aces };
    seat.hands = [h1, h2];
    for (const h of seat.hands) { if (aces) h.done = true; else closeIf21(h); }
    log.push(aces ? t("> {name}: splits aces (one card each)", { name: seat.name }) : t("> {name}: splits", { name: seat.name }));
  }
  state.turn = bjFindTurn(state);
  if (!state.turn) {
    const fin = bjFinish(state, secret, log);
    state.shoeLeft = secret.shoe.length;
    return { ok: true, state, secret, log, charge, ...fin };
  }
  state.shoeLeft = secret.shoe.length;
  return { ok: true, state, secret, log, charge };
}

/** Gracz odchodzi w trakcie rozdania (albo MG go wyprasza): jego ręce stoją, gra toczy się dalej. */
export function bjStandOut(state0, secret0, seatId) {
  const state = clone(state0), secret = { shoe: [...(secret0?.shoe ?? [])], hole: secret0?.hole ?? null };
  const seat = state.seats.find(s => s.id === seatId);
  if (!seat) return { ok: false, why: t("no such seat") };
  if (state.phase !== "playing" || !seat.inRound || seat.hands.every(h => h.done)) return { ok: true, state, secret, log: [] };
  for (const h of seat.hands) h.done = true;
  const log = [t("> {name}: stands", { name: seat.name })];
  state.turn = bjFindTurn(state);
  if (!state.turn) {
    const fin = bjFinish(state, secret, log);
    state.shoeLeft = secret.shoe.length;
    return { ok: true, state, secret, log, ...fin };
  }
  return { ok: true, state, secret, log };
}

// ======================================================================
// Texas Hold'em
// ======================================================================

/** Ocena 5 kart: [kategoria, …rozstrzygające] (większe lepsze). */
export function evaluate5(cards) {
  const vals = cards.map(c => RV(c[0])).sort((a, b) => b - a);
  const flush = cards.every(c => c[1] === cards[0][1]);
  const uniq = [...new Set(vals)];
  let straight = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straight = vals[0];
    else if (vals.join() === "14,5,4,3,2") straight = 5;   // strit od asa (koło)
  }
  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const g = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  if (straight && flush) return [8, straight];
  if (g[0][1] === 4) return [7, g[0][0], g[1][0]];
  if (g[0][1] === 3 && g[1][1] === 2) return [6, g[0][0], g[1][0]];
  if (flush) return [5, ...vals];
  if (straight) return [4, straight];
  if (g[0][1] === 3) return [3, g[0][0], ...g.slice(1).map(x => x[0])];
  if (g[0][1] === 2 && g[1][1] === 2) return [2, g[0][0], g[1][0], g[2][0]];
  if (g[0][1] === 2) return [1, g[0][0], ...g.slice(1).map(x => x[0])];
  return [0, ...vals];
}

export function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Najlepsze 5 z 5–7 kart: { score, cards, name }. */
export function evaluateBest(cards) {
  let best = null;
  const n = cards.length;
  const pick = (start, chosen) => {
    if (chosen.length === 5) {
      const score = evaluate5(chosen);
      if (!best || compareScore(score, best.score) > 0) best = { score, cards: [...chosen] };
      return;
    }
    for (let i = start; i <= n - (5 - chosen.length); i++) pick(i + 1, [...chosen, cards[i]]);
  };
  pick(0, []);
  return best ? { ...best, name: handName(best.score) } : null;
}

/**
 * Nazwa układu w języku gracza: „Two pair, kings and sevens”, „Full house, aces over tens” —
 * po polsku „Dwie pary: króle i siódemki”, „Full: asy na dziesiątkach”.
 */
export function handName(score) {
  const [cat, a, b] = score;
  if (!isPL()) {
    const P = v => RANK_PLURAL_EN[RCHAR(v)], N = v => RANK_NAME[RCHAR(v)];
    switch (cat) {
      case 8: return a === 14 ? "Royal flush" : `Straight flush, ${N(a)} high`;
      case 7: return `Four of a kind, ${P(a)}`;
      case 6: return `Full house, ${P(a)} over ${P(b)}`;
      case 5: return `Flush, ${N(a)} high`;
      case 4: return `Straight, ${N(a)} high`;
      case 3: return `Three of a kind, ${P(a)}`;
      case 2: return `Two pair, ${P(a)} and ${P(b)}`;
      case 1: return `Pair of ${P(a)}`;
      default: return `High card, ${N(a)}`;
    }
  }
  const P = v => RANK_PLURAL[RCHAR(v)], LOC = v => RANK_LOCATIVE[RCHAR(v)], S = v => RANK_SHORT_PL[RCHAR(v)] ?? RCHAR(v);
  // pl-ok — nazwy układów po polsku
  switch (cat) {
    case 8: return a === 14 ? "Poker królewski" : `Poker do ${S(a)}`;   // pl-ok
    case 7: return `Kareta: ${P(a)}`;   // pl-ok
    case 6: return `Full: ${P(a)} na ${LOC(b)}`;   // pl-ok
    case 5: return `Kolor do ${S(a)}`;   // pl-ok
    case 4: return `Strit do ${S(a)}`;   // pl-ok
    case 3: return `Trójka: ${P(a)}`;   // pl-ok
    case 2: return `Dwie pary: ${P(a)} i ${P(b)}`;   // pl-ok
    case 1: return `Para: ${P(a)}`;   // pl-ok
    default: return `Wysoka karta: ${S(a)}`;   // pl-ok
  }
}

/**
 * Pule przy all-in: wpłaty [{ id, amount, folded }] → [{ amount, eligible: [id] }] — główna i boczne.
 * Do każdej puli wchodzą wpłaty do jej poziomu; walczą o nią niespasowani, którzy wpłacili co najmniej tyle.
 */
export function buildPots(entries) {
  const levels = [...new Set(entries.filter(e => e.amount > 0).map(e => e.amount))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const lvl of levels) {
    const amount = entries.reduce((t, e) => t + Math.min(e.amount, lvl) - Math.min(e.amount, prev), 0);
    const eligible = entries.filter(e => !e.folded && e.amount >= lvl).map(e => e.id);
    prev = lvl;
    if (!amount) continue;
    const last = pots.at(-1);
    if (!eligible.length) { if (last) last.amount += amount; else pots.push({ amount, eligible }); continue; }
    if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

export function heNewState() {
  return { game: "holdem", phase: "waiting", hand: 0, seats: [], board: [], pot: 0, toCall: 0, minRaise: 0, button: -1, turn: null, sb: 0, bb: 0, rake: 0, last: null };
}

/** Fazy licytacji (rozdanie trwa). */
export const HE_PLAYING = ["preflop", "flop", "turn", "river"];
const live = st => st.seats.filter(s => s.inHand && !s.folded);
const canAct = s => s.inHand && !s.folded && !s.allIn;
/** Następne miejsce (indeks) po `from`, które spełnia warunek; -1 gdy brak. */
function nextIdx(st, from, pred) {
  const n = st.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (pred(st.seats[i])) return i;
  }
  return -1;
}

/**
 * Ile gracz musi dołożyć, żeby sprawdzić. Gdy nikt poza nim nie może już licytować (reszta va banque), wystarczy
 * wyrównać do najwyższej stawki pozostałych — reszta i tak by wróciła (np. krótka duża ciemna va banque).
 */
function owed(st, seat) {
  const others = st.seats.filter(s => s !== seat && s.inHand && !s.folded);
  const target = others.some(canAct) ? st.toCall : Math.min(st.toCall, Math.max(0, ...others.map(s => s.bet)));
  return Math.max(0, target - seat.bet);
}

function pay(seat, amount) {
  const p = Math.max(0, Math.min(seat.stack, Math.floor(amount)));
  seat.stack -= p; seat.bet += p; seat.contributed += p;
  if (seat.stack === 0) seat.allIn = true;
  return p;
}

/**
 * Co może zrobić gracz: { fold, check, call, callAmount, raise, minRaiseTo, maxRaiseTo, allIn }.
 * Podbicie: gdy ktoś jeszcze może odpowiedzieć i gracz nie stracił prawa do podbicia (niepełne podbicie va banque
 * nie otwiera licytacji tym, którzy już się wypowiedzieli — mogą tylko sprawdzić albo spasować).
 */
export function heLegal(st, seatId) {
  const none = { fold: false, check: false, call: false, callAmount: 0, raise: false, minRaiseTo: 0, maxRaiseTo: 0, allIn: false };
  if (!HE_PLAYING.includes(st.phase) || st.turn === null) return none;
  const seat = st.seats[st.turn];
  if (!seat || seat.id !== seatId || !canAct(seat)) return none;
  const toCall = owed(st, seat);
  const maxTo = seat.bet + seat.stack;
  const minTo = st.toCall + Math.max(st.minRaise, st.bb);
  const others = st.seats.filter(s => s !== seat && canAct(s)).length;
  const raise = others > 0 && maxTo > st.toCall && seat.mayRaise !== false;
  return {
    fold: true, check: toCall === 0, call: toCall > 0, callAmount: Math.min(toCall, seat.stack),
    raise, minRaiseTo: Math.min(minTo, maxTo), maxRaiseTo: maxTo, allIn: seat.stack > 0 && (raise || seat.stack <= toCall)
  };
}

/**
 * Nowe rozdanie: rozdający przesuwa się, ciemne, po dwie karty dla każdego (do `secret.holes`).
 * Grają miejsca z kapslami na stole (stack > 0), które nie wstają. Zwraca { ok, state, secret, log }.
 */
export function heStart(st0, { sb = 5, bb = 10, rake = 0, rand = Math.random } = {}) {
  const st = clone(st0);
  if (st.phase !== "waiting") return { ok: false, why: t("a hand is in progress") };
  const ids = st.seats.filter(s => s.stack > 0 && !s.leaving).map(s => s.id);
  if (ids.length < 2) return { ok: false, why: t("at least two players with caps on the table are needed") };
  const log = [];
  for (const s of st.seats) Object.assign(s, { bet: 0, contributed: 0, folded: false, allIn: false, acted: false, mayRaise: true, inHand: ids.includes(s.id), hole: null, lastAction: "", best: "" });
  st.board = []; st.pot = 0; st.sb = sb; st.bb = bb; st.last = null;
  st.rake = Math.max(0, Math.min(10, Math.floor(Number(rake) || 0)));
  st.button = nextIdx(st, st.button < 0 ? -1 : st.button, s => s.inHand);
  const heads = ids.length === 2;
  const sbIdx = heads ? st.button : nextIdx(st, st.button, s => s.inHand);
  const bbIdx = nextIdx(st, sbIdx, s => s.inHand);
  pay(st.seats[sbIdx], sb); st.seats[sbIdx].lastAction = t("small blind {n}", { n: st.seats[sbIdx].bet });
  pay(st.seats[bbIdx], bb); st.seats[bbIdx].lastAction = t("big blind {n}", { n: st.seats[bbIdx].bet });
  st.toCall = bb; st.minRaise = bb;
  const deck = shuffle(newDeck(1), rand);
  const holes = {};
  for (let k = 0; k < 2; k++) {
    let i = st.button;
    for (let c = 0; c < ids.length; c++) { i = nextIdx(st, i, s => s.inHand); (holes[st.seats[i].id] ??= []).push(deck.shift()); }
  }
  st.hand += 1;
  st.phase = "preflop";
  log.push(t("> HAND {n}: {name} deals; blinds {sb}/{bb}", { n: st.hand, name: st.seats[st.button].name, sb, bb }));
  const secret = { deck, holes };
  // pierwszy ruch: pierwszy po dużej ciemnej (heads-up to rozdający z małą ciemną); duża ciemna ma głos na końcu
  st.turn = bbIdx;
  const out = heResolve(st, secret, log);
  return { ok: true, ...out };
}

/** Akcja gracza: fold | check | call | raise (amount = łączna stawka w tej rundzie) | allin. */
export function heAct(st0, secret0, seatId, action, amount = 0) {
  const st = clone(st0);
  const secret = { deck: [...(secret0?.deck ?? [])], holes: { ...(secret0?.holes ?? {}) } };
  const legal = heLegal(st, seatId);
  const seat = st.seats[st.turn ?? -1];
  if (!seat || seat.id !== seatId) return { ok: false, why: t("it's not your turn") };
  const log = [];
  if (action === "fold") { seat.folded = true; seat.lastAction = t("folds"); }
  else if (action === "check") { if (!legal.check) return { ok: false, why: t("you can't check — call or fold") }; seat.lastAction = t("checks"); }
  else if (action === "call") {
    if (!legal.call) return { ok: false, why: t("there is nothing to call") };
    const p = pay(seat, legal.callAmount);
    seat.lastAction = seat.allIn ? t("all-in {n}", { n: p }) : t("calls {n}", { n: p });
  } else if (action === "raise" || action === "allin") {
    if (!legal[action === "allin" ? "allIn" : "raise"]) return { ok: false, why: action === "allin" ? t("all-in is not allowed") : t("you can't raise") };
    let to = action === "allin" ? seat.bet + seat.stack : Math.floor(Number(amount) || 0);
    to = Math.min(to, seat.bet + seat.stack);
    if (action === "raise" && to < legal.minRaiseTo) return { ok: false, why: t("raise at least to {n}", { n: legal.minRaiseTo }) };
    if (to <= st.toCall || !legal.raise) {
      // va banque za nie więcej niż do sprawdzenia — to sprawdzenie za wszystko
      const p = pay(seat, Math.min(to - seat.bet, legal.callAmount));
      seat.lastAction = t("all-in {n}", { n: p });
    } else {
      const prevTo = st.toCall;
      pay(seat, to - seat.bet);
      const raiseBy = to - prevTo;
      const full = raiseBy >= st.minRaise;
      if (full) st.minRaise = raiseBy;
      st.toCall = to;
      // pełne podbicie otwiera licytację wszystkim; niepełne (va banque) — tylko trzeba je wyrównać
      for (const o of st.seats) if (o !== seat && canAct(o)) {
        if (full) { o.acted = false; o.mayRaise = true; } else if (o.bet < to) o.acted = false;
      }
      seat.lastAction = seat.allIn ? t("all-in to {n}", { n: to }) : t("raises to {n}", { n: to });
    }
  } else return { ok: false, why: t("unknown action") };
  seat.acted = true;
  seat.mayRaise = false;
  log.push(`> ${seat.name}: ${seat.lastAction}`);
  return { ok: true, ...heResolve(st, secret, log) };
}

/** Pas poza kolejką — gracz odchodzi od stołu albo MG go wyprasza. Kto miał ruch, ten go zachowuje. */
export function heFoldOut(st0, secret0, seatId) {
  const st = clone(st0);
  const secret = { deck: [...(secret0?.deck ?? [])], holes: { ...(secret0?.holes ?? {}) } };
  const seat = st.seats.find(s => s.id === seatId);
  if (!seat) return { ok: false, why: t("no such seat") };
  if (!HE_PLAYING.includes(st.phase) || !canAct(seat)) return { ok: true, state: st, secret, log: [] };
  const wasTurn = st.seats[st.turn] === seat;
  seat.folded = true; seat.acted = true; seat.lastAction = t("folds");
  return { ok: true, ...heResolve(st, secret, [t("> {name}: folds", { name: seat.name })], { keep: !wasTurn }) };
}

/** Po ruchu: wygrana przez pasy, następny gracz, koniec rundy licytacji, kolejna ulica albo pokazanie kart. */
function heResolve(st, secret, log, { keep = false } = {}) {
  const L = live(st);
  if (L.length === 1) return heWinByFold(st, secret, log, L[0]);
  const actors = L.filter(s => !s.allIn);
  const waiting = s => canAct(s) && (!s.acted || owed(st, s) > 0);
  const maxBet = Math.max(0, ...L.map(s => s.bet));
  // runda skończona: nikt nie czeka na ruch albo licytować może już tylko jeden, który wyrównał najwyższą stawkę
  const roundDone = !actors.some(waiting) || (actors.length <= 1 && actors.every(s => s.bet >= maxBet));
  if (!roundDone) {
    const cur = st.seats[st.turn ?? -1];
    if (!(keep && cur && waiting(cur))) st.turn = nextIdx(st, st.turn ?? st.button, waiting);
    return { state: st, secret, log };
  }
  // koniec rundy licytacji: zakłady do puli
  for (const s of st.seats) { st.pot += s.bet; s.bet = 0; s.acted = false; s.mayRaise = true; }
  st.toCall = 0; st.minRaise = st.bb;
  const deal = n => { secret.deck.shift(); for (let i = 0; i < n; i++) st.board.push(secret.deck.shift()); };   // jedna karta spalona
  const next = { preflop: ["flop", 3], flop: ["turn", 1], turn: ["river", 1] }[st.phase];
  if (!next) return heShowdown(st, secret, log);
  const runOut = live(st).filter(s => !s.allIn).length <= 1;
  if (runOut) {
    while (st.phase !== "river") { const [ph, n] = { preflop: ["flop", 3], flop: ["turn", 1], turn: ["river", 1] }[st.phase]; deal(n); st.phase = ph; }
    log.push(t("> BOARD: {cards}", { cards: st.board.map(c => cardInfo(c).rank + cardInfo(c).suit).join(" ") }));
    return heShowdown(st, secret, log);
  }
  deal(next[1]);
  st.phase = next[0];
  log.push(`> ${{ flop: "FLOP", turn: "TURN", river: "RIVER" }[st.phase]}: ${st.board.map(c => cardInfo(c).rank + cardInfo(c).suit).join(" ")}`);
  for (const s of st.seats) if (s.inHand && !s.folded) s.lastAction = s.allIn ? t("all-in") : "";
  st.turn = nextIdx(st, st.button, canAct);
  return { state: st, secret, log };
}

function heEnd(st) {
  st.phase = "waiting";
  st.turn = null;
  st.toCall = 0;
  for (const s of st.seats) { s.bet = 0; s.acted = false; s.allIn = false; }
}

/** Prowizja kasyna od puli (procent ze stołu, tylko gdy padł flop — „bez flopa bez prowizji”). */
const rakeOf = (st, amount) => (st.board.length >= 3 && st.rake > 0 ? Math.floor(amount * st.rake / 100) : 0);

function heWinByFold(st, secret, log, winner) {
  for (const s of st.seats) { st.pot += s.bet; s.bet = 0; }
  const house = rakeOf(st, st.pot);
  const amount = st.pot - house;
  winner.stack += amount;
  st.pot = 0;
  st.last = { winners: [{ id: winner.id, name: winner.name, amount, hand: "" }], shown: [], house };
  log.push(`${t("> {name} takes {n} (everyone else folded)", { name: winner.name, n: amount })}${house ? ` · ${t("house rake {n}", { n: house })}` : ""}`);
  heEnd(st);
  return { state: st, secret, log, done: true, house };
}

/** Pokazanie kart i podział puli (z bocznymi pulami). */
export function heShowdown(st, secret, log = []) {
  for (const s of st.seats) { st.pot += s.bet; s.bet = 0; }
  const L = live(st);
  const scores = {};
  for (const s of L) {
    s.hole = secret.holes?.[s.id] ?? null;
    const best = s.hole ? evaluateBest([...s.hole, ...st.board]) : null;
    scores[s.id] = best?.score ?? [-1];
    s.best = best?.name ?? "";
  }
  const pots = buildPots(st.seats.filter(s => s.inHand).map(s => ({ id: s.id, amount: s.contributed, folded: s.folded })));
  const won = new Map(), back = new Map();
  let house = 0;
  for (const pot of pots) {
    // nadwyżka, której nikt nie sprawdził (jedyny uprawniony) — wraca do właściciela
    if (pot.eligible.length === 1) {
      const s = st.seats.find(x => x.id === pot.eligible[0]);
      s.stack += pot.amount;
      back.set(s.id, (back.get(s.id) ?? 0) + pot.amount);
      continue;
    }
    const elig = pot.eligible.length ? pot.eligible : L.map(s => s.id);
    // pula, o którą nikt nie walczy (np. nadwyżka va banque), wraca bez prowizji
    const rake = elig.length > 1 ? rakeOf(st, pot.amount) : 0;
    house += rake;
    const amount = pot.amount - rake;
    let top = null;
    for (const id of elig) if (!top || compareScore(scores[id], top) > 0) top = scores[id];
    const winners = elig.filter(id => compareScore(scores[id], top) === 0);
    const share = Math.floor(amount / winners.length);
    let rest = amount - share * winners.length;
    // reszta (nieparzysty kapsel) — pierwszemu zwycięzcy po rozdającym
    const n = st.seats.length, dist = i => (i - st.button - 1 + n) % n;
    const order = winners.map(id => st.seats.findIndex(s => s.id === id)).sort((a, b) => dist(a) - dist(b));
    for (const idx of order) {
      const s = st.seats[idx];
      const amt = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      s.stack += amt;
      won.set(s.id, (won.get(s.id) ?? 0) + amt);
    }
  }
  st.pot = 0;
  st.last = {
    winners: [...won.entries()].map(([id, amount]) => { const s = st.seats.find(x => x.id === id); return { id, name: s.name, amount, hand: s.best }; }),
    shown: L.map(s => ({ id: s.id, name: s.name, hole: s.hole, hand: s.best })),
    returned: [...back.entries()].map(([id, amount]) => ({ id, name: st.seats.find(x => x.id === id).name, amount })),
    house
  };
  for (const s of L) log.push(`> ${s.name}: ${(s.hole ?? []).map(c => cardInfo(c).rank + cardInfo(c).suit).join(" ")} — ${s.best}`);
  for (const w of st.last.winners) log.push(`${t("> {name} takes {n}", { name: w.name, n: w.amount })}${w.hand ? ` (${w.hand})` : ""}`);
  for (const b of st.last.returned) log.push(t("> {name}: uncalled bet returned {n}", { name: b.name, n: b.amount }));
  if (house) log.push(t("> house rake: {n}", { n: house }));
  heEnd(st);
  return { state: st, secret, log, done: true, house };
}

// ======================================================================
// Aktor „Stół do gry” (Foundry: pola tworzone dopiero przy rejestracji)
// ======================================================================

export const GAMES = { blackjack: "Blackjack", holdem: "Texas Hold'em" };

export function casinoDataClass() {
  const F = foundry.data.fields;
  const int = (initial, min = 0, max) => new F.NumberField({ initial, min, max, integer: true, nullable: false });
  return class CasinoData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
      return {
        game: new F.StringField({ initial: "blackjack", choices: Object.keys(GAMES) }),
        dealer: new F.StringField({ initial: "", blank: true }),
        open: new F.BooleanField({ initial: true }),
        // blackjack
        minBet: int(5, 1), maxBet: int(100, 1), decks: int(2, 1, 8),
        // Hold'em
        smallBlind: int(5, 1), bigBlind: int(10, 1), buyInMin: int(100, 1), buyInMax: int(500, 1), rake: int(0, 0, 10),
        // bank kasyna: bez limitu albo z kwotą, którą można rozbić; bilans — zysk kasyna od ostatniego zerowania
        bankUnlimited: new F.BooleanField({ initial: true }),
        bank: new F.NumberField({ initial: 1000, integer: true, nullable: false }),
        profit: new F.NumberField({ initial: 0, integer: true, nullable: false }),
        // jawny stan stołu (JSON) i dziennik krupiera; tajemnice tylko w pamięci MG
        table: new F.StringField({ initial: "", blank: true }),
        log: new F.ArrayField(new F.StringField())
      };
    }
  };
}
