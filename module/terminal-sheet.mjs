/**
 * Karta terminala. MG widzi konfigurację (typ, zabezpieczenie, hasła, wpisy, komendy, pułapka, stan) i może przełączyć
 * na podgląd ekranu; gracz (dostęp ograniczony) widzi tylko ekran komputera. Logika: terminal.mjs.
 */
import {
  TERMINAL_KINDS, TERMINAL_SECURITY, ACCESS_LABELS, TRAP_EXPLOSIVES, TRAP_SCREWS, COMMAND_KINDS, COMMAND_ACTIONS, MINISTRIES,
  terminalAccess, canSee, effectiveState, memoryDump, bootLines, bootBar, bootSteps, splitStatus, trapScrew, ministryOf, terminalBrand
} from "./terminal-data.mjs";
import { bootLogo } from "./terminal-logos.mjs";
import {
  request, bootTerminal, inspectTrap, login, hackTerminal, guess, analyzeDump, downloadEntry, userActor, minigameOn,
  terminalReach, reachOn, bootAnimOn
} from "./terminal.mjs";
import { MFD_STEPS } from "./data.mjs";
import { t } from "./i18n.mjs";

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
      analyze: FoeTerminalSheet.#onAnalyze,
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
  /** Ostatnio widziany stan „włączony” ekranu (animacja tylko przy przejściu z wyłączonego). */
  #lastOn = null;

  get #config() { return game.user.isGM && !this.#screen; }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.document;
    const ts = actor.system;
    const st = ts.state;
    ctx.actor = actor;
    ctx.t = ts;
    ctx.isGM = game.user.isGM;
    ctx.config = this.#config;
    if (ctx.config) {
      ctx.kinds = opt(TERMINAL_KINDS, ts.kind);
      ctx.isMinistry = ts.kind === "military";
      ctx.ministries = opt(MINISTRIES, ministryOf(ts));
      ctx.security = opt(TERMINAL_SECURITY, ts.security);
      ctx.explosives = opt(TRAP_EXPLOSIVES, ts.trap.explosive);
      ctx.screws = opt(TRAP_SCREWS, trapScrew(ts));
      ctx.screwClick = TRAP_SCREWS[trapScrew(ts)].click;
      ctx.mfds = MFD_STEPS.map(s => ({ value: s.key, label: `MFD ${s.name} (${s.desc})`, sel: s.key === ts.trap.noticeMfd }));
      ctx.accessStates = opt({ none: t("none (login screen)"), user: t("logged in"), admin: t("administrator") }, st.access);
      ctx.entries = ts.entries.map((e, i) => ({ ...e, i, access: opt(ACCESS_LABELS, e.access) }));
      ctx.commands = ts.commands.map((c, i) => ({
        ...c, i,
        kinds: opt(COMMAND_KINDS, c.kind), actions: opt(COMMAND_ACTIONS[c.kind] ?? {}, c.action), access: opt(ACCESS_LABELS, c.access),
        isMessage: c.kind === "message",
        targetNames: (c.targets ?? []).map(u => {
          const d = fromUuidSync(u);
          return d ? (d.name || (d.documentName === "Wall" ? t("door {id}", { id: d.id }) : d.id)) : t("(deleted)");
        }).join(", ")
      }));
      ctx.minigame = minigameOn();
      ctx.reach = reachOn();
      return ctx;
    }
    ctx.screen = this.#screenContext();
    return ctx;
  }

  #screenContext() {
    const ts = this.document.system;
    const st = effectiveState(ts);
    const actor = userActor();
    const acc = terminalAccess(actor, ts);
    const s = {
      brand: terminalBrand(ts), kind: ts.kind, ministry: ts.kind === "military" ? ministryOf(ts) : null, name: this.document.name, welcome: ts.welcome,
      log: st.log ?? [], who: actor?.name ?? (game.user.isGM ? t("GM (select a character token to act as that character)") : t("no character — select your token")),
      why: acc.why, canHack: acc.hack, minigame: minigameOn(), trapFound: st.trapFound && ts.trap.armed, admin: st.access === "admin"
    };
    if (!ts.powered) s.mode = "off";
    else if ((st.lockouts ?? 0) >= 2) s.mode = "locked";
    else if (!acc.use) s.mode = "denied";
    else if (!st.booted) s.mode = "boot";
    else if (st.game?.words?.length) s.mode = "game";
    else if (st.access === "none" || !st.access) s.mode = "login";
    else s.mode = "menu";
    // za daleko: gracz nie widzi treści ekranu (tylko nagłówek i prośbę, by podejść)
    const reach = terminalReach(actor, this.document);
    if (!reach.ok) { s.mode = "far"; s.farWhy = reach.why; s.log = []; this.#entry = null; }
    else if (reach.via) s.via = `${reach.via} (${reach.dist} ft)`;
    // ukryta śrubka (wybiera MG, o tym, gdzie kliknąć, mówi graczom): oględziny obudowy (Explosives), po wykryciu — rozbrajanie
    const hot = s.mode !== "boot" ? null : !st.trapFound ? "inspect" : s.trapFound ? "disarm" : null;
    s.screws = Object.fromEntries(Object.keys(TRAP_SCREWS).map(k => [k, k === trapScrew(ts) ? hot : null]));
    s.lockedOnce = (st.lockouts ?? 0) === 1;
    s.entries = ts.entries.filter(e => canSee(e.access, st)).map(e => ({ id: e.id, title: e.title, access: e.access }));
    s.commands = ts.commands.filter(c => canSee(c.access, st)).map(c => ({ id: c.id, label: c.label }));
    if (s.mode === "far") { s.entries = []; s.commands = []; }
    if (this.#entry) {
      const e = ts.entries.find(x => x.id === this.#entry && canSee(x.access, st));
      if (e && ["menu", "login"].includes(s.mode)) { s.entry = { ...e, lines: String(e.body ?? "").split(/\n/) }; s.mode = "entry"; }
      else this.#entry = null;
    }
    if (s.mode === "game") {
      const g = st.game;
      const removed = new Set(g.removed ?? []);
      const rows = memoryDump(g).map(r => ({ addr: r.addr, parts: r.parts.map(p => ({ t: p.t, word: p.word && !removed.has(p.word) ? p.word : null, dud: p.word && removed.has(p.word) })) }));
      const half = Math.ceil(rows.length / 2);
      s.game = { cols: [rows.slice(0, half), rows.slice(half)], tries: Array.from({ length: g.tries }), triesN: g.tries, hints: g.hints, analyzed: !!g.analyzed };
    }
    return s;
  }

  /**
   * Animacja ASCII przy uruchamianiu: tekst startowy wypisywany po literze (status testu po chwili), pasek ładowania
   * skokami o losowe wartości, a na koniec logo producenta z hasłem (terminal-logos.mjs).
   * Nakładka siedzi w treści okna (poza częścią szablonu), więc przeżywa odświeżenie ekranu; kliknięcie ją pomija.
   */
  #playBoot() {
    const host = this.element.querySelector(".window-content") ?? this.element;
    host.querySelector(".term-boot")?.remove();
    const ts = this.document.system;
    const kind = ts.kind;
    const box = document.createElement("div");
    box.className = `term-boot kind-${kind}${kind === "military" ? ` min-${ministryOf(ts)}` : ""}`;
    box.innerHTML = `<pre></pre>`;
    host.append(box);
    const pre = box.querySelector("pre");
    let over = false, spin = null;
    const live = () => !over && box.isConnected;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const done = () => {
      if (over) return;
      over = true;
      clearInterval(spin);
      box.classList.add("out");
      setTimeout(() => box.remove(), 250);
    };
    box.addEventListener("click", done);
    const run = async () => {
      // 1. tekst: po kilka liter, status testu po chwili, krótka przerwa po każdej linii
      let text = "";
      for (const line of bootLines(kind, ts.brand, ts.ministry)) {
        const [head, status] = splitStatus(line);
        for (let i = 3; i < head.length + 3; i += 3) {
          if (!live()) return;
          pre.textContent = `${text}${head.slice(0, i)}█`;
          await sleep(between(24, 40));
        }
        if (status) await sleep(between(150, 380));
        text += `${line}\n`;
        pre.textContent = `${text}█`;
        await sleep(between(70, 160));
      }
      // 2. pasek: skoki o losowe wartości z losowymi przerwami, wskaźnik kręci się cały czas
      let pct = 0, tick = 0;
      const bar = () => { pre.textContent = `${text}${bootBar(pct, 24, tick)}`; };
      spin = setInterval(() => {
        if (!live()) return clearInterval(spin);   // okno zamknięte albo animacja zaczęta od nowa
        tick++;
        bar();
      }, 110);
      for (const step of bootSteps()) {
        await sleep(step.wait);
        if (!live()) return;
        pct = step.pct;
        bar();
      }
      clearInterval(spin);
      pre.textContent = `${text}${bootBar(100, 24, 0)}\n${t("> READY")}█`;
      await sleep(550);
      if (!live()) return;
      // 3. logo producenta: wiersz po wierszu, potem hasło po literze i migający kursor
      const logo = bootLogo(kind, ministryOf(ts));
      box.classList.add("logo");
      box.innerHTML = `<pre class="art"></pre><pre class="tag"></pre>`;
      const art = box.querySelector(".art"), tag = box.querySelector(".tag");
      art.style.setProperty("--w", logo.width);
      art.style.setProperty("--h", logo.art.length + logo.tagline.length + 3);
      const blank = " ".repeat(logo.width);
      for (let n = 1; n <= logo.art.length; n++) {
        if (!live()) return;
        art.textContent = logo.art.map((l, i) => (i < n ? l : blank)).join("\n");
        await sleep(55);
      }
      const words = logo.tagline.join("\n");
      for (let i = 1; i <= words.length; i++) {
        if (!live()) return;
        tag.textContent = `${words.slice(0, i)}█`;
        await sleep(28);
      }
      tag.textContent = words;
      const cur = document.createElement("span");
      cur.className = "cur";
      cur.textContent = "_";
      tag.append(cur);
      await sleep(1600);
      done();
    };
    run().catch(err => { console.error("foe-rpg | terminal boot animation", err); done(); });
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
    // słowo przełamane między wierszami (albo kolumnami): podświetl wszystkie jego kawałki
    for (const a of this.element.querySelectorAll(".term-dump a.w")) {
      const parts = () => this.element.querySelectorAll(`.term-dump a.w[data-word="${CSS.escape(a.dataset.word ?? "")}"]`);
      a.addEventListener("mouseenter", () => parts().forEach(x => x.classList.add("hover")));
      a.addEventListener("mouseleave", () => parts().forEach(x => x.classList.remove("hover")));
    }
    // animacja uruchamiania: tylko gdy terminal właśnie się włączył (a postać stoi przy nim)
    const ts = this.document.system;
    const on = !!(ts.state.booted && ts.powered);
    if (this.#config || !context.screen) this.#lastOn = null;
    else {
      if (on && this.#lastOn === false && context.screen.mode !== "far" && bootAnimOn()) this.#playBoot();
      this.#lastOn = on;
    }
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
    const ts = this.document.system;
    const te = data.te, tc = data.tc;
    delete data.te; delete data.tc;
    data.system ??= {};
    if (te) data.system.entries = ts.entries.map((e, i) => ({ ...e, ...(te[i] ?? {}) }));
    if (tc) data.system.commands = ts.commands.map((c, i) => {
      const n = { ...c, ...(tc[i] ?? {}) };
      if (n.kind !== c.kind) { n.action = Object.keys(COMMAND_ACTIONS[n.kind] ?? {})[0] ?? ""; n.targets = []; }
      return n;
    });
    return data;
  }

  // ---------- MG ----------
  static #onToggleView() { this.#screen = !this.#screen; this.render(); }
  static #onAddEntry() {
    return this.document.update({ "system.entries": [...this.document.system.entries, { id: foundry.utils.randomID(), title: t("New entry"), body: "", access: "user" }] });
  }
  static #onDelEntry(ev, el) {
    const i = Number(el.dataset.i);
    return this.document.update({ "system.entries": this.document.system.entries.filter((_, k) => k !== i) });
  }
  static #onAddCommand() {
    return this.document.update({ "system.commands": [...this.document.system.commands, { id: foundry.utils.randomID(), label: t("Open the door"), kind: "door", action: "open", access: "user", targets: [], text: "" }] });
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
      : (canvas?.tokens?.controlled ?? []).filter(ts => ts.actor !== this.document).map(ts => ts.document.uuid);
    if (!picked.length) return ui.notifications.warn(c.kind === "door" ? t("Select doors on the scene (walls layer, Shift-click for several).") : t("Select tokens on the scene."));
    c.targets = [...new Set([...(c.targets ?? []), ...picked])];
    ui.notifications.info(t("{label}: linked {n}.", { label: c.label, n: picked.length }));
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
  static #onAnalyze() { return analyzeDump(this.document); }
  static #onAbort() { return request(this.document, "abortGame", { who: userActor()?.name }); }
  static #onLogout() { this.#entry = null; return request(this.document, "logout", { who: userActor()?.name }); }
  static #onOpenEntry(ev, el) { this.#entry = el.dataset.id; this.render(); }
  static #onBack() { this.#entry = null; this.render(); }
  static #onDownload(ev, el) { return downloadEntry(this.document, el.dataset.id); }
  static #onCommand(ev, el) { return request(this.document, "command", { id: el.dataset.id, who: userActor()?.name }); }
}
