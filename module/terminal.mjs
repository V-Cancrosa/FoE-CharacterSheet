/**
 * Terminale w grze: logowanie, hakowanie (rzut Science albo minigra), wpisy, komendy (drzwi, tokeny, komunikaty),
 * holotaśmy i terminal-pułapka. Zasady: terminal-data.mjs.
 *
 * Gracze mają do terminala dostęp „ograniczony” — nie mogą go zmieniać, więc każda zmiana stanu (odblokowanie, blokada,
 * komendy) idzie przez kanał systemu do przeglądarki aktywnego MG, który ją zapisuje. Rzuty robi gracz u siebie.
 */
import { tint } from "./dice3d.mjs";
import { SKILLS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";
import {
  TERMINAL_SECURITY, TRAP_EXPLOSIVES, terminalAccess, hackOutcome, loginOutcome, newGame, guessWord, pickDud,
  hasPipbuckTech, canSee, effectiveState, pushLog
} from "./terminal-data.mjs";

const F = "foe-rpg";
const SOCKET = `system.${F}`;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const resultOf = msg => msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";

let WORDS = null;
async function words() {
  WORDS ??= await (await fetch(`systems/${F}/data/terminal-words.json`)).json();
  return WORDS;
}

export const minigameOn = () => { try { return !!game.settings.get(F, "terminalMinigame"); } catch { return false; } };

export function registerTerminalSettings() {
  game.settings.register(F, "terminalMinigame", {
    name: "Terminale: minigra hakowania (zasada domowa)",
    hint: "Zamiast rzutu Science gracz zgaduje hasło ze zrzutu pamięci jak w grach Fallout: 4 próby, podobieństwo liter, a Science daje podpowiedzi (usunięcie atrapy). Wyczerpanie prób blokuje terminal jak krytyczna porażka.",
    scope: "world", config: true, type: Boolean, default: false
  });
}

// ======================================================================
// Kanał do MG
// ======================================================================

/** Wyślij operację: MG wykonuje od razu, gracz przez kanał systemu. */
export async function request(terminal, op, data = {}) {
  const payload = { kind: "terminal", op, uuid: terminal.uuid, data, user: game.user.id };
  if (game.user.isGM) return applyOp(payload);
  if (!game.users.activeGM) return warn("Terminal działa tylko, gdy MG jest zalogowany.");
  game.socket.emit(SOCKET, payload);
  return true;
}

export function registerTerminalHooks() {
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, payload => {
      if (payload?.kind !== "terminal" || !game.users.activeGM?.isSelf) return;
      applyOp(payload).catch(err => console.error("foe-rpg | terminal", err));
    });
  });
  // nowy terminal: gracze widzą ekran (dostęp ograniczony), token połączony z aktorem
  Hooks.on("preCreateActor", (actor, data) => {
    if (actor.type !== "terminal") return;
    const L = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
    actor.updateSource({
      img: data.img && !/mystery-man/.test(data.img) ? data.img : `systems/${F}/icons/terminal.svg`,
      ownership: { default: Math.max(L, data.ownership?.default ?? 0) },
      prototypeToken: { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0, texture: { src: `systems/${F}/icons/terminal.svg` } }
    });
  });
}

/** Wykonanie operacji (tylko MG). */
async function applyOp({ op, uuid, data, user }) {
  const terminal = await fromUuid(uuid);
  if (!terminal || terminal.type !== "terminal") return;
  const t = terminal.system;
  const st = t.state;
  const who = esc(data.who ?? game.users.get(user)?.name ?? "?");
  const upd = {};
  let log = [...(st.log ?? [])];
  const say = (...lines) => { log = pushLog(log, ...lines); };

  switch (op) {
    case "boot": {
      if (t.trap.armed) {
        upd["system.trap.armed"] = false;
        upd["system.state.booted"] = true;
        upd["system.powered"] = false;
        say(`> ${who}: włączanie…`, "> !!! BŁĄD ZASILANIA — ŁADUNEK !!!");
        await explode(terminal, data.token);
      } else {
        upd["system.state.booted"] = true;
        say(`> ${who}: uruchomiono terminal`);
      }
      break;
    }
    case "trap": {
      // wynik oględzin / rozbrajania
      if (data.step === "inspect") {
        if (data.result === "crit-fail" && t.trap.armed) { upd["system.trap.armed"] = false; upd["system.state.booted"] = true; upd["system.powered"] = false; await explode(terminal, data.token); say(`> ${who}: obudowa poruszona — WYBUCH`); }
        else if (["success", "crit-success"].includes(data.result)) { upd["system.state.trapFound"] = true; if (!t.trap.armed) say(`> ${who}: obudowa czysta — brak ładunku`); }
      } else if (data.step === "disarm") {
        if (["success", "crit-success"].includes(data.result)) { upd["system.trap.armed"] = false; say(`> ${who}: ładunek rozbrojony`); }
        else if (data.result === "crit-fail") { upd["system.trap.armed"] = false; upd["system.state.booted"] = true; upd["system.powered"] = false; await explode(terminal, data.token); say(`> ${who}: rozbrajanie nieudane — WYBUCH`); }
      }
      break;
    }
    case "login": {
      if ((st.lockouts ?? 0) >= 2) break;
      const lvl = loginOutcome(t, data.password);
      if (lvl) { upd["system.state.access"] = lvl; say(`> LOGON ${who}`, lvl === "admin" ? "> DOSTĘP ADMINISTRATORA" : "> DOSTĘP PRZYZNANY"); }
      else say(`> LOGON ${who}`, "> BŁĘDNE HASŁO");
      break;
    }
    case "hack": {
      const out = hackOutcome(data.result, { kind: t.kind, tech: !!data.tech });
      if (out.lockout) {
        upd["system.state.lockouts"] = (st.lockouts ?? 0) + 1;
        upd["system.state.game"] = null;
        say(`> ${who}: włamanie — KRYTYCZNY BŁĄD`, (st.lockouts ?? 0) + 1 >= 2 ? "> TERMINAL ZABLOKOWANY NA STAŁE" : "> TERMINAL ZABLOKOWANY");
      } else if (out.access) {
        if ((({ none: 0, user: 1, admin: 2 })[st.access] ?? 0) < (out.access === "admin" ? 2 : 1)) upd["system.state.access"] = out.access;
        upd["system.state.game"] = null;
        say(`> ${who}: włamanie udane`, out.access === "admin" ? "> DOSTĘP ADMINISTRATORA" : "> DOSTĘP PRZYZNANY");
      } else say(`> ${who}: włamanie nieudane`);
      break;
    }
    case "startGame": {
      if (st.game?.words?.length) break;
      const g = newGame(await words(), t.security, { scienceRank: data.rank ?? 0, seed: Math.floor(Math.random() * 2 ** 31) });
      if (!g) break;
      g.tech = !!data.tech;
      upd["system.state.game"] = g;
      say(`> ${who}: ładowanie zrzutu pamięci…`, `> PRÓBY: ${g.tries} · PODPOWIEDZI: ${g.hints}`);
      break;
    }
    case "guess": {
      const g = st.game;
      if (!g?.words?.length || (g.removed ?? []).includes(data.word)) break;
      const r = guessWord(g, data.word);
      say(`> ${String(data.word).toUpperCase()}`);
      if (r.correct) {
        upd["system.state.game"] = null;
        const lvl = t.kind === "stabletec" && (g.tech || data.tech) ? "admin" : "user";
        if ((({ none: 0, user: 1, admin: 2 })[st.access] ?? 0) < (lvl === "admin" ? 2 : 1)) upd["system.state.access"] = lvl;
        say("> HASŁO PRZYJĘTE", lvl === "admin" ? "> DOSTĘP ADMINISTRATORA" : "> DOSTĘP PRZYZNANY");
      } else if (r.lockout) {
        upd["system.state.game"] = null;
        upd["system.state.lockouts"] = (st.lockouts ?? 0) + 1;
        say("> ODMOWA DOSTĘPU", `> PODOBIEŃSTWO=${r.likeness}`, (st.lockouts ?? 0) + 1 >= 2 ? "> TERMINAL ZABLOKOWANY NA STAŁE" : "> TERMINAL ZABLOKOWANY");
      } else {
        upd["system.state.game"] = { ...g, tries: r.tries, removed: [...(g.removed ?? []), String(data.word).toUpperCase()] };
        say("> ODMOWA DOSTĘPU", `> PODOBIEŃSTWO=${r.likeness}`);
      }
      break;
    }
    case "hint": {
      const g = st.game;
      if (!g?.words?.length || !(g.hints > 0)) break;
      const dud = pickDud(g);
      if (!dud) break;
      upd["system.state.game"] = { ...g, hints: g.hints - 1, removed: [...(g.removed ?? []), dud] };
      say("> ATRAPA USUNIĘTA");
      break;
    }
    case "abortGame": {
      upd["system.state.game"] = null;
      say(`> ${who}: przerwano`);
      break;
    }
    case "logout": {
      upd["system.state.access"] = "none";
      say(`> ${who}: wylogowano`);
      break;
    }
    case "command": {
      const c = t.commands.find(x => x.id === data.id);
      if (!c || !canSee(c.access, effectiveState(t))) break;
      say(`> ${who}: ${String(c.label).toUpperCase()}`, ...(await runCommand(terminal, c)));
      break;
    }
    // MG
    case "reset": {
      Object.assign(upd, { "system.state.access": "none", "system.state.lockouts": 0, "system.state.game": null, "system.state.booted": false, "system.state.trapFound": false });
      log = [];
      break;
    }
    default: return;
  }
  upd["system.state.log"] = log;
  return terminal.update(upd);
}

/** Komenda: drzwi, tokeny albo komunikat. Zwraca linie dziennika. */
async function runCommand(terminal, c) {
  const out = [];
  if (c.kind === "message") {
    await ChatMessage.create({
      speaker: { alias: terminal.name },
      content: `<div class="foe-card spell"><div class="fc-tag"><span>TERMINAL // ${esc(terminal.name)}</span><span>komunikat</span></div><h3>${esc(c.label)}</h3>${c.text ? `<div class="fc-meta">${esc(c.text)}</div>` : ""}</div>`
    });
    return ["> WYSŁANO"];
  }
  let ok = 0;
  for (const u of c.targets ?? []) {
    const doc = await fromUuid(u);
    if (!doc) continue;
    if (c.kind === "door" && doc.documentName === "Wall") {
      const S = CONST.WALL_DOOR_STATES;
      const ds = { open: S.OPEN, close: S.CLOSED, lock: S.LOCKED, unlock: S.CLOSED, toggle: doc.ds === S.OPEN ? S.CLOSED : S.OPEN }[c.action];
      if (ds !== undefined) { await doc.update({ ds }); ok++; }
    } else if (c.kind === "token" && doc.documentName === "Token") {
      const D = CONST.TOKEN_DISPOSITIONS;
      if (c.action === "friendly") await doc.update({ disposition: D.FRIENDLY });
      else if (c.action === "hostile") await doc.update({ disposition: D.HOSTILE });
      else await doc.actor?.toggleStatusEffect?.("unconscious", { active: c.action === "off" });
      ok++;
    }
  }
  out.push(ok ? `> WYKONANO (${ok})` : "> BRAK POŁĄCZENIA Z URZĄDZENIEM");
  return out;
}

/** Wybuch terminala-pułapki: karta obrażeń obszarowych z przyciskiem „Nanieś obrażenia” dla tego, kto go włączył. */
async function explode(terminal, tokenUuid) {
  const ex = TRAP_EXPLOSIVES[terminal.system.trap.explosive] ?? TRAP_EXPLOSIVES.frag;
  const roll = tint(await new Roll(ex.formula).evaluate(), "trap");
  return ChatMessage.create({
    speaker: { alias: terminal.name },
    rolls: [roll],
    content: `
    <div class="foe-card damage">
      <div class="fc-tag"><span>PIPBUCK // PUŁAPKA</span><span>${esc(ex.formula)}</span></div>
      <h3>${esc(terminal.name)}: terminal-pułapka</h3>
      <div class="fc-main"><div class="fc-roll">${roll.total}<small>OBR.</small></div><div class="fc-outcome">Wybuch</div><div class="fc-sum">${esc(roll.formula)}</div></div>
      <div class="fc-meta"><div>${esc(ex.label)} — jak ${esc(ex.name)} (s. 597). Wybuch: każda odsłonięta lokacja osobno. Inni w promieniu — MG.</div></div>
      <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> Nanieś obrażenia</button>
    </div>`,
    flags: { [F]: { damage: {
      specials: {}, shockWounds: 0, actorUuid: null, itemUuid: null, itemName: `${terminal.name}: pułapka`, total: roll.total, pre: roll.total,
      critMult: 1, crit: false, aoe: true, loc: null, called: null, table: null, ignoreDT: 0, targets: tokenUuid ? [tokenUuid] : []
    } } }
  });
}

// ======================================================================
// Akcje gracza (ekran terminala)
// ======================================================================

/** Postać, która używa terminala: zaznaczony własny token, potem postać gracza. */
export function userActor() {
  const own = (canvas?.tokens?.controlled ?? []).map(t => t.actor).find(a => a?.isOwner && a.type !== "terminal" && a.type !== "vehicle");
  return own ?? game.user.character ?? null;
}
const tokenOf = actor => (canvas?.tokens?.controlled ?? []).find(t => t.actor === actor)?.document?.uuid
  ?? actor?.getActiveTokens?.()?.[0]?.document?.uuid ?? null;

async function skillRoll(actor, skill, mfd, label) {
  const sk = actor.system.skills?.[skill];
  if (!sk) return null;
  const rc = rollContext(actor, { kind: "skill", skill, skillAttr: sk.attr }, { manualMod: sk.mod });
  const r = await promptMfd(label, sk.tn, rc, { defaultStep: mfd });
  if (!r) return null;
  const { extra, ...roll } = r;
  return resultOf(await rollTest(actor, { label: `${label} (${SKILLS[skill].label})`, baseTn: sk.tn, ...roll }));
}

export async function bootTerminal(terminal) {
  const actor = userActor();
  return request(terminal, "boot", { who: actor?.name, token: tokenOf(actor) });
}

export async function inspectTrap(terminal, step = "inspect") {
  const actor = userActor();
  if (!actor) return warn("Zaznacz swój token albo przypisz postać do gracza.");
  const mfd = terminal.system.trap.noticeMfd || "3/4";
  const result = await skillRoll(actor, "explosives", mfd, step === "inspect" ? `Oględziny terminala: ${terminal.name}` : `Rozbrajanie ładunku: ${terminal.name}`);
  if (!result) return null;
  return request(terminal, "trap", { step, result, who: actor.name, token: tokenOf(actor) });
}

export async function login(terminal, password) {
  const actor = userActor();
  return request(terminal, "login", { password, who: actor?.name ?? game.user.name });
}

export async function hackTerminal(terminal) {
  const actor = userActor();
  if (!actor) return warn("Zaznacz swój token albo przypisz postać do gracza.");
  const t = terminal.system;
  const acc = terminalAccess(actor, t);
  if (!acc.hack) return warn(`${actor.name}: ${acc.why.join("; ") || "nie można hakować"}.`);
  const tech = hasPipbuckTech(actor);
  if (minigameOn()) return request(terminal, "startGame", { who: actor.name, rank: actor.system.skills?.science?.rank ?? 0, tech });
  const mfd = TERMINAL_SECURITY[t.security]?.mfd ?? "3/4";
  const result = await skillRoll(actor, "science", mfd, `Hakowanie: ${terminal.name}`);
  if (!result) return null;
  return request(terminal, "hack", { result, who: actor.name, tech });
}

export const guess = (terminal, word) => request(terminal, "guess", { word, who: userActor()?.name, tech: hasPipbuckTech(userActor()) });

/**
 * Pusta holotaśma: dokładnie „Holotape” (z katalogu) albo „Holotaśma” / „… (pusta)”, bez nagrania.
 * Holotaśmy z treścią (nagrane tu, z opisem albo nazwane przez MG, np. „Holotape – wiadomość nadzorcy”) się nie liczą.
 */
export function isBlankHolotape(i) {
  if (i?.type !== "gear" || (Number(i.system?.qty) || 0) <= 0) return false;
  if (i.flags?.[F]?.holotape || i.getFlag?.(F, "holotape")) return false;
  if (String(i.system?.description ?? "").replace(/<[^>]+>/g, "").trim()) return false;   // ma treść — nie jest pusta
  return /^(holotape|holota[sś]ma)(\s*\((blank|empty|pusta)\))?$|^pusta holota[sś]ma$/i.test(String(i.name ?? "").trim());
}

/** Zgraj wpis na holotaśmę: zużywa pustą „Holotape” z ekwipunku i tworzy przedmiot z treścią. */
export async function downloadEntry(terminal, entryId) {
  const actor = userActor();
  if (!actor) return warn("Zaznacz swój token albo przypisz postać do gracza.");
  const e = terminal.system.entries.find(x => x.id === entryId);
  if (!e || !canSee(e.access, effectiveState(terminal.system))) return null;
  const blank = actor.items.find(isBlankHolotape);
  if (!blank) return warn(`${actor.name}: potrzebna pusta holotaśma („Holotape” z katalogu). Nagrane holotaśmy nie są nadpisywane.`);
  if ((Number(blank.system.qty) || 0) > 1) await blank.update({ "system.qty": blank.system.qty - 1 });
  else await blank.delete();
  const body = String(e.body ?? "").split(/\n/).map(l => `<p>${esc(l)}</p>`).join("");
  await actor.createEmbeddedDocuments("Item", [{
    name: `Holotaśma: ${e.title}`, type: "gear", img: blank.img, flags: { [F]: { holotape: { terminal: terminal.name, entry: e.id, title: e.title } } },
    system: { category: blank.system.category ?? "misc", qty: 1, weight: blank.system.weight ?? 0, value: 0, description: `<p><b>${esc(terminal.name)}</b></p>${body}` }
  }]);
  ui.notifications.info(`${actor.name}: zgrano „${e.title}” na holotaśmę.`);
  return true;
}
