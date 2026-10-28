/**
 * Okno stołu do gry. Wszyscy widzą stół (karty krupiera i graczy, pulę, dziennik krupiera); siedzący gracz ma pod
 * spodem swoje przyciski. MG ma dodatkowo ustawienia stołu, sadzanie NPC (i ich karty), wypraszanie i anulowanie
 * rozdania. Logika: casino.mjs, zasady: casino-data.mjs.
 */
import * as C from "./casino-data.mjs";
import {
  request, tableState, inPlay, turnSeat, controls, holeCards, npcHoles, requestCards, userActor, tableReach, reachOn,
  sitDown, seatNpcs, docSync
} from "./casino.mjs";
import { capsOf, capsText, esc } from "./give.mjs";
import { t, tn } from "./i18n.mjs";
import { onPortrait } from "./portrait.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const P = "systems/foe-rpg/templates";
const opt = (obj, cur) => Object.entries(obj).map(([value, label]) => ({ value, label, sel: value === cur }));
const result = r => ({ bj: "BLACKJACK", win: t("win"), push: t("push"), lose: t("loss"), bust: t("bust") })[r] ?? "";

/** Karta jako HTML: awers (ranga, kolor, imię damy) albo rewers; `anim` — „deal” (rozdanie) albo „flip” (odkrycie). */
function cardHtml(code, { anim = "", delay = 0, extra = "" } = {}) {
  const c = C.cardInfo(code);
  const cls = ["cz-card", c.hidden ? "back" : "", c.red ? "red" : "", anim, extra].filter(Boolean).join(" ");
  const style = anim ? ` style="--d:${(delay * 0.13).toFixed(2)}s"` : "";
  if (c.hidden) return `<span class="${cls}"${style} title="${esc(c.title)}"></span>`;
  const queen = c.queen === "Nightmare Moon" ? "N. Moon" : c.queen;
  return `<span class="${cls}"${style} title="${esc(c.title)}"><i>${esc(c.rank)}</i><u>${c.suit}</u>${queen ? `<small>${esc(queen)}</small>` : ""}</span>`;
}

/** Wartość ręki w blackjacku do wyświetlenia: „7/17” (miękka, w trakcie gry), „BJ”, „fura (24)”. */
function bjLabel(cards, { natural = false, final = false } = {}) {
  if (!cards?.length) return "";
  const v = C.bjValue(cards);
  if (v.total > 21) return t("bust ({n})", { n: v.total });
  if (natural && cards.length === 2 && v.total === 21) return "BJ";
  if (v.soft && v.total < 21 && !final) return `${v.total - 10}/${v.total}`;
  return String(v.total);
}

export class FoeCasinoSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "actor", "casino"],
    position: { width: 900, height: 700 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      portrait: onPortrait,
      toggleView: FoeCasinoSheet.#onToggleView,
      sit: FoeCasinoSheet.#onSit,
      leave: FoeCasinoSheet.#onLeave,
      bet: FoeCasinoSheet.#onBet,
      deal: FoeCasinoSheet.#onDeal,
      act: FoeCasinoSheet.#onAct,
      raise: FoeCasinoSheet.#onRaise,
      start: FoeCasinoSheet.#onStart,
      rebuy: FoeCasinoSheet.#onRebuy,
      seatNpc: FoeCasinoSheet.#onSeatNpc,
      kick: FoeCasinoSheet.#onKick,
      force: FoeCasinoSheet.#onForce,
      voidHand: FoeCasinoSheet.#onVoid,
      closeTable: FoeCasinoSheet.#onClose,
      resetProfit: FoeCasinoSheet.#onResetProfit,
      clearLog: FoeCasinoSheet.#onClearLog
    }
  };

  static PARTS = { body: { template: `${P}/actor/casino.hbs`, scrollable: [".cz-config"] } };

  /** MG: widok ustawień (null — sam wybiera: ustawienia dla nowego, pustego stołu). */
  #cfg = null;
  /** Co leżało na każdym miejscu na karty przy poprzednim odświeżeniu (nowe karty wjeżdżają, odkrywane się obracają). */
  #shown = new Map();
  #round = null;
  #primed = false;
  /** Wpisane, a jeszcze niewysłane kwoty (stawka, podbicie, wpisowe) — przeżywają odświeżenie okna. */
  #drafts = new Map();

  #isConfig(st) {
    if (!game.user.isGM) return false;
    this.#cfg ??= !st.seats.length && !(st.round || st.hand);
    return this.#cfg;
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const table = this.document;
    const sys = table.system;
    const st = tableState(table);
    ctx.actor = table;
    ctx.sys = sys;
    ctx.isGM = game.user.isGM;
    ctx.config = this.#isConfig(st);
    if (ctx.config) {
      ctx.games = opt(C.GAMES, sys.game);
      ctx.locked = st.seats.length > 0;
      ctx.bj = sys.game === "blackjack";
      ctx.he = sys.game === "holdem";
      ctx.playing = inPlay(st);
      ctx.reach = reachOn();
      ctx.seatCount = st.seats.length;
      return ctx;
    }
    ctx.v = this.#tableView(st);
    return ctx;
  }

  /** Widok stołu: krupier / wspólne karty, miejsca, przyciski tego, kto patrzy. */
  #tableView(st) {
    const table = this.document;
    const sys = table.system;
    const bj = st.game === "blackjack";
    const playing = inPlay(st);
    const turn = turnSeat(st);
    const round = bj ? `bj${st.round}` : `he${st.hand}`;
    if (round !== this.#round) {
      this.#round = round;
      this.#shown.clear();
      for (const k of [...this.#drafts.keys()]) if (k.startsWith("cz-raise")) this.#drafts.delete(k);
    }
    // miejsca na karty: pos — stałe miejsce, order — kolejność rozdawania (nowe karty wjeżdżają po kolei)
    const slots = [];
    const card = (code, pos, order, extra = "") => {
      const slot = { code, pos, order, extra, html: "" };
      slots.push(slot);
      return slot;
    };
    const html = list => list.map(x => x.html).join("");
    const v = {
      bj, he: !bj, name: table.name, gameLabel: C.GAMES[st.game], open: sys.open, playing,
      stakes: bj ? [t("stakes {min}–{max} caps", { min: sys.minBet, max: sys.maxBet }), tn(sys.decks, "{n} deck", "{n} decks"), t("dealer stands on 17"), t("BJ pays 3:2")].join(" · ")
        : [t("blinds {sb}/{bb}", { sb: sys.smallBlind, bb: Math.max(sys.bigBlind, sys.smallBlind) }), t("buy-in {min}–{max}", { min: sys.buyInMin, max: sys.buyInMax }), sys.rake ? t("rake {n}%", { n: sys.rake }) : ""].filter(Boolean).join(" · "),
      bank: sys.bankUnlimited ? "" : t("table bank: {n} caps", { n: sys.bank }),
      profit: game.user.isGM ? `${(sys.profit ?? 0) > 0 ? "+" : ""}${sys.profit ?? 0}` : null,
      log: (sys.log ?? []).slice(-14)
    };
    const mineHole = holeCards(table, st);
    const npcCards = npcHoles(table, st);

    const inRound = st.seats.filter(s => (bj ? s.inRound : s.inHand));
    const n = Math.max(1, inRound.length);
    let dealerCards = [], board = [];
    if (bj) {
      const d = st.dealer;
      // kolejność jak przy stole: pierwsza karta graczy, odkryta krupiera, druga graczy, zakryta krupiera, potem dobierane
      dealerCards = d.cards.map((c, i) => card(c, `d${i}`, i === 0 ? n : i === 1 ? 2 * n + 1 : 1000 + i));
      if (d.hidden && d.cards.length) dealerCards.push(card("??", "d1", 2 * n + 1));
      v.dealer = { name: sys.dealer || t("Dealer"), total: !d.cards.length ? "" : d.hidden ? `${bjLabel(d.cards, { final: true })} + ?` : bjLabel(d.cards, { natural: true, final: true }) };
    } else {
      board = st.board.map((c, i) => card(c, `b${i}`, 100 + i));
      const pot = (st.pot ?? 0) + st.seats.reduce((t, s) => t + (s.bet ?? 0), 0);
      v.pot = pot || playing ? pot : null;
      v.dealerName = sys.dealer || t("Dealer");
    }

    v.seats = st.seats.map((s, idx) => {
      const me = controls(s);
      const row = { id: s.id, name: s.name, npc: s.npc, me, leaving: s.leaving, turn: turn?.id === s.id };
      if (bj) {
        Object.assign(row, {
          bet: s.bet, betDefault: s.bet || s.lastBet || sys.minBet,
          betting: st.phase === "betting" && me && sys.open,
          hands: (s.hands ?? []).map((h, hi) => ({
            slots: h.cards.map((c, i) => card(c, `${s.id}:${hi}:${i}`, i < 2 && !h.split ? i * (n + 1) + inRound.indexOf(s) : 500 + inRound.indexOf(s) * 20 + hi * 5 + i)),
            total: bjLabel(h.cards, { natural: !h.split, final: !!h.result || h.done }), stake: h.bet, doubled: h.doubled,
            active: playing && st.turn?.seat === idx && st.turn?.hand === hi,
            result: h.result, resultLabel: result(h.result), net: h.result ? h.payout - h.bet : null
          }))
        });
        const net = row.hands.reduce((t, h) => t + (h.net ?? 0), 0);
        row.net = row.hands.some(h => h.result) ? `${net > 0 ? "+" : ""}${net}` : "";
        row.netCls = net > 0 ? "win" : net < 0 ? "lose" : "push";
      } else {
        const won = st.last?.winners?.find(w => w.id === s.id);
        let cards = [];
        if (s.inHand) {
          const known = s.hole ?? (mineHole?.seat === s.id ? mineHole.cards : null) ?? npcCards[s.id] ?? null;
          // karty od lewej strony rozdającego, po jednej na kolejkę
          const from = (idx - st.button - 1 + st.seats.length) % st.seats.length;
          if (known) cards = known.map((c, i) => card(c, `${s.id}:${i}`, i * n + from, s.folded ? "dim" : ""));
          else if (!s.folded) cards = [0, 1].map(i => card("??", `${s.id}:${i}`, i * n + from));
          // moje karty zginęły (odświeżona strona) — poproś MG o nie
          if (me && !s.npc && playing && !s.folded && !known) requestCards(table, st);
        }
        Object.assign(row, {
          stack: s.stack, bet: s.bet, lastAction: s.lastAction, folded: s.folded, allIn: s.allIn, inHand: s.inHand,
          button: idx === st.button && st.hand > 0, cards, best: s.best, won: won ? won.amount : 0,
          secret: s.npc && game.user.isGM && playing && !!npcCards[s.id],
          canRebuy: me && !(playing && s.inHand) && s.stack < sys.buyInMax,
          rebuyMax: Math.max(0, sys.buyInMax - s.stack), canLeave: me
        });
        row.rebuyDefault = Math.min(row.rebuyMax, sys.buyInMin);
      }
      return row;
    });

    // animacje: nowe karty wjeżdżają w kolejności rozdawania, odkrywane (rewers → awers) się obracają;
    // przy pierwszym otwarciu okna nic nie jedzie
    const moving = [];
    for (const sl of slots) {
      const prev = this.#shown.get(sl.pos);
      if (this.#primed && prev === undefined) sl.anim = "deal";
      else if (this.#primed && prev === "??" && sl.code !== "??") sl.anim = "flip";
      else if (prev !== undefined && prev !== sl.code && sl.code !== "??") sl.anim = "flip";
      if (sl.anim) moving.push(sl);
      this.#shown.set(sl.pos, sl.code);
    }
    moving.sort((a, b) => a.order - b.order).forEach((sl, k) => { sl.delay = k; });
    for (const sl of slots) sl.html = cardHtml(sl.code, { anim: sl.anim, delay: sl.delay ?? 0, extra: sl.extra });
    if (bj) v.dealer.cards = html(dealerCards);
    else v.board = html(board) + `<span class="cz-card slot"></span>`.repeat(Math.max(0, 5 - board.length));
    for (const row of v.seats) {
      if (bj) for (const h of row.hands) h.cards = html(h.slots);
      else row.cards = html(row.cards);
    }
    this.#primed = true;

    // przyciski: kto patrzy, czym gra
    const mine = st.seats.filter(s => controls(s) && !s.npc);
    const ctl = { status: "" };
    if (!game.user.isGM && sys.open && !mine.length && st.seats.filter(s => !s.leaving).length < C.MAX_SEATS) {
      const actor = userActor();
      const reach = tableReach(actor, table);
      ctl.sit = {
        who: actor?.name ?? "", caps: actor ? capsOf(actor) : 0, capsLabel: capsText(actor ? capsOf(actor) : 0), ok: !!actor && reach.ok,
        why: !actor ? t("Select your character's token (or assign a character to the player).") : reach.ok ? "" : `${actor.name}: ${reach.why}.`,
        buyIn: !bj, buyMin: sys.buyInMin, buyMax: Math.min(sys.buyInMax, Math.max(sys.buyInMin, actor ? capsOf(actor) : 0)),
        buyDefault: Math.min(sys.buyInMax, Math.max(sys.buyInMin, Math.min(actor ? capsOf(actor) : 0, sys.buyInMin * 2)))
      };
    }
    const anySeat = mine.length > 0 || game.user.isGM;
    if (bj) {
      if (st.phase === "betting") {
        const bets = st.seats.filter(s => s.bet > 0 && !s.leaving);
        ctl.deal = anySeat && sys.open && bets.length > 0;
        ctl.status = !sys.open ? t("Table closed.") : bets.length ? t("Bets: {list}. The dealer deals when someone clicks “Deal”.", { list: bets.map(s => `${s.name} ${s.bet}`).join(", ") }) : t("Place your bets.");
      } else if (turn) {
        const legal = C.bjLegal(st, turn.id);
        const hand = turn.hands[st.turn.hand];
        const caps = capsOf(docSync(turn.actor));
        if (controls(turn)) {
          ctl.bjTurn = {
            seat: turn.id, name: turn.name, hit: legal.hit, stand: legal.stand, double: legal.double, split: legal.split, cost: legal.cost,
            short: (legal.double || legal.split) && caps < legal.cost,
            hand: turn.hands.length > 1 ? t("hand {n} of {m}", { n: st.turn.hand + 1, m: turn.hands.length }) : "", total: bjLabel(hand.cards)
          };
        } else if (game.user.isGM) ctl.force = { seat: turn.id, name: turn.name, act: "stand", label: t("Force: stand") };
        ctl.status = `${t("Turn: {name}", { name: turn.name })}${turn.hands.length > 1 ? ` ${t("(hand {n})", { n: st.turn.hand + 1 })}` : ""}.`;
      }
    } else if (!playing) {
      const ready = st.seats.filter(s => s.stack > 0 && !s.leaving);
      ctl.start = anySeat && sys.open && ready.length >= 2;
      ctl.status = !sys.open ? t("Table closed.") : ready.length >= 2 ? t("Between hands — “New hand” starts the game.") : t("At least two players with caps on the table are needed.");
    } else if (turn) {
      const legal = C.heLegal(st, turn.id);
      if (controls(turn)) {
        ctl.heTurn = {
          seat: turn.id, name: turn.name, fold: legal.fold, check: legal.check, call: legal.call, callAmount: legal.callAmount,
          raise: legal.raise, minTo: legal.minRaiseTo, maxTo: legal.maxRaiseTo, allIn: legal.allIn, allInTo: turn.bet + turn.stack,
          raiseLabel: st.toCall > 0 ? t("Raise to") : t("he|Bet")
        };
      } else if (game.user.isGM) ctl.force = { seat: turn.id, name: turn.name, act: legal.check ? "check" : "fold", label: legal.check ? t("Force: check") : t("Force: fold") };
      ctl.status = `${{ preflop: t("Pre-flop"), flop: "Flop", turn: "Turn", river: "River" }[st.phase]} — ${t("turn: {name}", { name: turn.name })}${st.toCall ? ` ${t("(to call: {n})", { n: st.toCall })}` : ""}.`;
    }
    if (game.user.isGM) {
      ctl.gm = { npcBuy: !bj, buyMin: sys.buyInMin, buyMax: sys.buyInMax, playing };
    }
    v.ctl = ctl;
    return v;
  }

  /** Gracz nie jest właścicielem stołu — formularz byłby wyłączony; stół działa na przyciskach, więc go nie blokujemy. */
  _toggleDisabled(disabled) {
    if (!this.#isConfig(tableState(this.document))) return;
    return super._toggleDisabled?.(disabled);
  }

  /** Widok stołu nie zapisuje formularza (pola stawek idą przyciskami). */
  _onChangeForm(formConfig, event) {
    if (!this.#isConfig(tableState(this.document))) return;
    return super._onChangeForm(formConfig, event);
  }
  async _onSubmitForm(formConfig, event) {
    if (!this.#isConfig(tableState(this.document))) { event?.preventDefault?.(); return; }
    return super._onSubmitForm(formConfig, event);
  }

  /** Ustawienia: granice muszą mieć sens (max ≥ min, duża ciemna ≥ mała). */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const s = data.system;
    if (!s) return data;
    const cur = this.document.system;
    const v = k => Number(s[k] ?? cur[k]) || 0;
    if (v("maxBet") < v("minBet")) s.maxBet = v("minBet");
    if (v("bigBlind") < v("smallBlind")) s.bigBlind = v("smallBlind");
    if (v("buyInMax") < v("buyInMin")) s.buyInMax = v("buyInMin");
    return data;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!context.config) for (const el of root.querySelectorAll(".cz-table input, .cz-table button")) el.disabled = false;
    // wpisana, a niewysłana kwota przeżywa odświeżenie (ruch innego gracza przerysowuje stół)
    for (const inp of root.querySelectorAll(".cz-table input[name]")) {
      const d = this.#drafts.get(inp.name);
      if (d !== undefined) inp.value = d;
      inp.addEventListener("input", () => this.#drafts.set(inp.name, inp.value));
    }
    const log = root.querySelector(".cz-log");
    if (log) log.scrollTop = log.scrollHeight;
    // Enter w polu = przycisk obok
    for (const inp of root.querySelectorAll(".cz-table input[data-enter]")) {
      inp.addEventListener("keydown", ev => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        ev.stopPropagation();
        root.querySelector(inp.dataset.enter)?.click();
      });
    }
  }

  // ---------- przyciski ----------
  static #onToggleView() {
    this.#cfg = !this.#isConfig(tableState(this.document));
    this.render();
  }
  static #onSit() {
    const v = this.element.querySelector("input[name=cz-buyin]")?.value;
    this.#drafts.delete("cz-buyin");
    return sitDown(this.document, v);
  }
  static async #onLeave(ev, el) {
    const st = tableState(this.document);
    const seat = st.seats.find(s => s.id === el.dataset.seat);
    if (!seat) return null;
    const busy = inPlay(st) && (seat.inHand && !seat.folded || seat.inRound);
    if (busy && !await DialogV2.confirm({
      window: { title: t("{name}: leave the table?", { name: seat.name }) },
      content: `<p>${st.game === "holdem" ? t("A hand is in progress — leaving means folding. The caps on the table come back after the hand.") : t("A round is in progress — your hands stay as they are, and any winnings still go to the character sheet.")}</p>`
    })) return null;
    return request(this.document, "leave", { seat: seat.id });
  }
  static #onBet(ev, el) {
    const seat = el.dataset.seat;
    const amount = el.dataset.amount !== undefined ? Number(el.dataset.amount) : Number(this.element.querySelector(`input[name="cz-bet-${seat}"]`)?.value);
    this.#drafts.delete(`cz-bet-${seat}`);
    const st = tableState(this.document);
    const s = st.seats.find(x => x.id === seat);
    const actor = s ? docSync(s.actor) : null;
    if (amount > 0 && actor && capsOf(actor) + (s.bet ?? 0) < amount) return ui.notifications.warn(t("{name}: not enough caps ({n}).", { name: s.name, n: capsOf(actor) }));
    return request(this.document, "bet", { seat, amount });
  }
  static #onDeal() { return request(this.document, "deal"); }
  static #onStart() { return request(this.document, "start"); }
  static #onAct(ev, el) { return request(this.document, "act", { seat: el.dataset.seat, action: el.dataset.act }); }
  static #onRaise(ev, el) {
    const amount = Number(this.element.querySelector("input[name=cz-raise]")?.value);
    this.#drafts.delete("cz-raise");
    return request(this.document, "act", { seat: el.dataset.seat, action: "raise", amount });
  }
  static #onRebuy(ev, el) {
    const seat = el.dataset.seat;
    const amount = Number(this.element.querySelector(`input[name="cz-rebuy-${seat}"]`)?.value);
    this.#drafts.delete(`cz-rebuy-${seat}`);
    return request(this.document, "rebuy", { seat, amount });
  }
  static #onSeatNpc() {
    return seatNpcs(this.document, Number(this.element.querySelector("input[name=cz-npcbuy]")?.value) || this.document.system.buyInMin);
  }
  static async #onKick(ev, el) {
    const s = tableState(this.document).seats.find(x => x.id === el.dataset.seat);
    if (!s || !await DialogV2.confirm({ window: { title: t("Remove from the table?") }, content: `<p>${esc(t("{name} leaves the table; the caps on the table go back to the character sheet (during a hand — a fold).", { name: s.name }))}</p>` })) return null;
    return request(this.document, "kick", { seat: s.id });
  }
  static #onForce(ev, el) { return request(this.document, "act", { seat: el.dataset.seat, action: el.dataset.act }); }
  static async #onVoid() {
    if (!await DialogV2.confirm({ window: { title: t("Void the hand?") }, content: `<p>${t("All stakes from this hand will go back to the players.")}</p>` })) return null;
    return request(this.document, "void");
  }
  static async #onClose() {
    if (!await DialogV2.confirm({ window: { title: t("Close the table?") }, content: `<p>${t("The current hand will be voided and all the caps on the table will go back to the players. You can open the table again in the settings.")}</p>` })) return null;
    return request(this.document, "close");
  }
  static #onResetProfit() { return this.document.update({ "system.profit": 0 }); }
  static #onClearLog() { return this.document.update({ "system.log": [] }); }
}
