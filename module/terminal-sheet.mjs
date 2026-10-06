/**
 * Karta terminala. MG widzi konfigurację (typ, zabezpieczenie, hasła, wpisy, komendy, pułapka, stan) i może przełączyć
 * na podgląd ekranu; gracz (dostęp ograniczony) widzi tylko ekran komputera. Logika: terminal.mjs.
 */
import {
  TERMINAL_KINDS, TERMINAL_SECURITY, ACCESS_LABELS, TRAP_EXPLOSIVES, COMMAND_KINDS, COMMAND_ACTIONS,
  terminalAccess, canSee, effectiveState, memoryDump
} from "./terminal-data.mjs";
import { request, bootTerminal, inspectTrap, login, hackTerminal, guess, downloadEntry, userActor, minigameOn } from "./terminal.mjs";
import { MFD_STEPS } from "./data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const P = "systems/foe-rpg/templates";
const opt = (obj, cur) => Object.entries(obj).map(([value, l]) => ({ value, label: typeof l === "string" ? l : l.label, sel: value === cur }));

export class FoeTerminalSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["foe-rpg", "actor", "terminal"],
    position: { width: 760, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleView: FoeTerminalSheet.#onToggleView,
      addEntry: FoeTerminalSheet.#onAddEntry,
      delEntry: FoeTerminalSheet.#onDelEntry,
      addCommand: FoeTerminalSheet.#onAddCommand,
      delCommand: FoeTerminalSheet.#onDelCommand,
      pickTargets: FoeTerminalSheet.#onPickTargets,
      clearTargets: FoeTerminalSheet.#onClearTargets,
      resetTerminal: FoeTerminalSheet.#onReset,
      boot: FoeTerminalSheet.#onBoot,
      inspect: FoeTerminalSheet.#onInspect,
      disarm: FoeTerminalSheet.#onDisarm,
      login: FoeTerminalSheet.#onLogin,
      hack: FoeTerminalSheet.#onHack,
      guess: FoeTerminalSheet.#onGuess,
      hint: FoeTerminalSheet.#onHint,
      abortGame: FoeTerminalSheet.#onAbort,
      logout: FoeTerminalSheet.#onLogout,
      openEntry: FoeTerminalSheet.#onOpenEntry,
      back: FoeTerminalSheet.#onBack,
      download: FoeTerminalSheet.#onDownload,
      command: FoeTerminalSheet.#onCommand
    }
  };

  static PARTS = { body: { template: `${P}/actor/terminal.hbs`, scrollable: [".term-config", ".term-body"] } };

  /** Podgląd ekranu u MG i otwarty wpis — tylko w tym oknie. */
  #screen = false;
  #entry = null;

  get #config() { return game.user.isGM && !this.#screen; }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.document;
    const t = actor.system;
    const st = t.state;
    ctx.actor = actor;
    ctx.t = t;
    ctx.isGM = game.user.isGM;
    ctx.config = this.#config;
    if (ctx.config) {
      ctx.kinds = opt(TERMINAL_KINDS, t.kind);
      ctx.security = opt(TERMINAL_SECURITY, t.security);
      ctx.explosives = opt(TRAP_EXPLOSIVES, t.trap.explosive);
      ctx.mfds = MFD_STEPS.map(s => ({ value: s.key, label: `MFD ${s.name} (${s.desc})`, sel: s.key === t.trap.noticeMfd }));
      ctx.accessStates = opt({ none: "brak (ekran logowania)", user: "zalogowany", admin: "administrator" }, st.access);
      ctx.entries = t.entries.map((e, i) => ({ ...e, i, access: opt(ACCESS_LABELS, e.access) }));
      ctx.commands = t.commands.map((c, i) => ({
        ...c, i,
        kinds: opt(COMMAND_KINDS, c.kind), actions: opt(COMMAND_ACTIONS[c.kind] ?? {}, c.action), access: opt(ACCESS_LABELS, c.access),
        isMessage: c.kind === "message",
        targetNames: (c.targets ?? []).map(u => {
          const d = fromUuidSync(u);
          return d ? (d.name || (d.documentName === "Wall" ? `drzwi ${d.id}` : d.id)) : "(usunięte)";
        }).join(", ")
      }));
      ctx.minigame = minigameOn();
      return ctx;
    }
    ctx.screen = this.#screenContext();
    return ctx;
  }

  #screenContext() {
    const t = this.document.system;
    const st = effectiveState(t);
    const actor = userActor();
    const acc = terminalAccess(actor, t);
    const s = {
      brand: t.brand || TERMINAL_KINDS[t.kind]?.brand || "TERMLINK", kind: t.kind, name: this.document.name, welcome: t.welcome,
      log: st.log ?? [], who: actor?.name ?? (game.user.isGM ? "MG (zaznacz token postaci, żeby działać za nią)" : "brak postaci — zaznacz swój token"),
      why: acc.why, canHack: acc.hack, minigame: minigameOn(), trapFound: st.trapFound && t.trap.armed, admin: st.access === "admin"
    };
    if (!t.powered) s.mode = "off";
    else if ((st.lockouts ?? 0) >= 2) s.mode = "locked";
    else if (!acc.use) s.mode = "denied";
    else if (!st.booted) s.mode = "boot";
    else if (st.game?.words?.length) s.mode = "game";
    else if (st.access === "none" || !st.access) s.mode = "login";
    else s.mode = "menu";
    s.lockedOnce = (st.lockouts ?? 0) === 1;
    s.entries = t.entries.filter(e => canSee(e.access, st)).map(e => ({ id: e.id, title: e.title, access: e.access }));
    s.commands = t.commands.filter(c => canSee(c.access, st)).map(c => ({ id: c.id, label: c.label }));
    if (this.#entry) {
      const e = t.entries.find(x => x.id === this.#entry && canSee(x.access, st));
      if (e && ["menu", "login"].includes(s.mode)) { s.entry = { ...e, lines: String(e.body ?? "").split(/\n/) }; s.mode = "entry"; }
      else this.#entry = null;
    }
    if (s.mode === "game") {
      const g = st.game;
      const removed = new Set(g.removed ?? []);
      const rows = memoryDump(g).map(r => ({ addr: r.addr, parts: r.parts.map(p => ({ t: p.t, word: p.word && !removed.has(p.word) ? p.word : null, dud: p.word && removed.has(p.word) })) }));
      const half = Math.ceil(rows.length / 2);
      s.game = { cols: [rows.slice(0, half), rows.slice(half)], tries: Array.from({ length: g.tries }), triesN: g.tries, hints: g.hints };
    }
    return s;
  }

  /** Gracz nie jest właścicielem — formularz byłby wyłączony; ekran działa na przyciskach, więc go nie blokujemy. */
  _toggleDisabled(disabled) {
    if (!this.#config) return;
    return super._toggleDisabled?.(disabled);
  }

  /** Ekran nie zapisuje formularza (gracz nie może zmieniać terminala; hasło idzie przez „Zaloguj”). */
  _onChangeForm(formConfig, event) {
    if (!this.#config) return;
    return super._onChangeForm(formConfig, event);
  }
  async _onSubmitForm(formConfig, event) {
    if (!this.#config) { event?.preventDefault?.(); return; }
    return super._onSubmitForm(formConfig, event);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!this.#config) for (const el of this.element.querySelectorAll(".term-screen input, .term-screen button")) el.disabled = false;
    const pw = this.element.querySelector(".term-screen input[name=password]");
    pw?.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      ev.stopPropagation();
      login(this.document, pw.value);
    });
  }

  /** Wpisy i komendy z formularza (pola te.N.* i tc.N.*) → pełne tablice w system. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    if (!this.#config) return {};
    const t = this.document.system;
    const te = data.te, tc = data.tc;
    delete data.te; delete data.tc;
    data.system ??= {};
    if (te) data.system.entries = t.entries.map((e, i) => ({ ...e, ...(te[i] ?? {}) }));
    if (tc) data.system.commands = t.commands.map((c, i) => {
      const n = { ...c, ...(tc[i] ?? {}) };
      if (n.kind !== c.kind) { n.action = Object.keys(COMMAND_ACTIONS[n.kind] ?? {})[0] ?? ""; n.targets = []; }
      return n;
    });
    return data;
  }

  // ---------- MG ----------
  static #onToggleView() { this.#screen = !this.#screen; this.render(); }
  static #onAddEntry() {
    return this.document.update({ "system.entries": [...this.document.system.entries, { id: foundry.utils.randomID(), title: "Nowy wpis", body: "", access: "user" }] });
  }
  static #onDelEntry(ev, el) {
    const i = Number(el.dataset.i);
    return this.document.update({ "system.entries": this.document.system.entries.filter((_, k) => k !== i) });
  }
  static #onAddCommand() {
    return this.document.update({ "system.commands": [...this.document.system.commands, { id: foundry.utils.randomID(), label: "Otwórz drzwi", kind: "door", action: "open", access: "user", targets: [], text: "" }] });
  }
  static #onDelCommand(ev, el) {
    const i = Number(el.dataset.i);
    return this.document.update({ "system.commands": this.document.system.commands.filter((_, k) => k !== i) });
  }
  /** Dodaj zaznaczone na scenie: drzwi (warstwa ścian) albo tokeny. */
  static #onPickTargets(ev, el) {
    const i = Number(el.dataset.i);
    const cmds = foundry.utils.deepClone(this.document.system.commands);
    const c = cmds[i];
    if (!c) return;
    const picked = c.kind === "door"
      ? (canvas?.walls?.controlled ?? []).filter(w => w.document.door > 0).map(w => w.document.uuid)
      : (canvas?.tokens?.controlled ?? []).filter(t => t.actor !== this.document).map(t => t.document.uuid);
    if (!picked.length) return ui.notifications.warn(c.kind === "door" ? "Zaznacz drzwi na scenie (warstwa ścian, klik z Shift dla kilku)." : "Zaznacz tokeny na scenie.");
    c.targets = [...new Set([...(c.targets ?? []), ...picked])];
    ui.notifications.info(`${c.label}: połączono ${picked.length}.`);
    return this.document.update({ "system.commands": cmds });
  }
  static #onClearTargets(ev, el) {
    const cmds = foundry.utils.deepClone(this.document.system.commands);
    if (cmds[Number(el.dataset.i)]) cmds[Number(el.dataset.i)].targets = [];
    return this.document.update({ "system.commands": cmds });
  }
  static #onReset() { this.#entry = null; return request(this.document, "reset"); }

  // ---------- ekran ----------
  static #onBoot() { return bootTerminal(this.document); }
  static #onInspect() { return inspectTrap(this.document, "inspect"); }
  static #onDisarm() { return inspectTrap(this.document, "disarm"); }
  static #onLogin() { return login(this.document, this.element.querySelector(".term-screen input[name=password]")?.value ?? ""); }
  static #onHack() { return hackTerminal(this.document); }
  static #onGuess(ev, el) { return guess(this.document, el.dataset.word); }
  static #onHint() { return request(this.document, "hint", { who: userActor()?.name }); }
  static #onAbort() { return request(this.document, "abortGame", { who: userActor()?.name }); }
  static #onLogout() { this.#entry = null; return request(this.document, "logout", { who: userActor()?.name }); }
  static #onOpenEntry(ev, el) { this.#entry = el.dataset.id; this.render(); }
  static #onBack() { this.#entry = null; this.render(); }
  static #onDownload(ev, el) { return downloadEntry(this.document, el.dataset.id); }
  static #onCommand(ev, el) { return request(this.document, "command", { id: el.dataset.id, who: userActor()?.name }); }
}
