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
  hasPipbuckTech, canSee, effectiveState, pushLog, analyzeOutcome, remoteReach
} from "./terminal-data.mjs";
import { gridOf, rectOf, tokenOf as tokenDocOf } from "./give.mjs";
import { isAdjacent, tokenDistance } from "./trade-data.mjs";
import { powerState } from "./cyber-data.mjs";
import { t } from "./i18n.mjs";

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
export const reachOn = () => { try { return game.settings.get(F, "terminalReach") !== false; } catch { return true; } };
export const bootAnimOn = () => { try { return game.settings.get(F, "terminalBootAnim") !== false; } catch { return true; } };

export function registerTerminalSettings() {
  game.settings.register(F, "terminalMinigame", {
    name: "Terminals: hacking minigame (house rule)",
    hint: "Instead of a Science roll the player guesses the password from a memory dump like in the Fallout games: 4 attempts, letter likeness, and Science gives hints (removing a dud). Running out of attempts locks the terminal like a critical failure.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "terminalReach", {
    name: "Terminals: use only up close",
    hint: "A player can use a terminal only while their character's token stands next to the terminal's token (as for trading). From further away — with a Cabling, Universal cable (10 ft), a Console Matrix Remote Control Talisman implant (20 ft) or Wire, Spark (25 ft). A terminal without a token on the viewed scene works as before.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "terminalBootAnim", {
    name: "Terminals: boot animation",
    hint: "A short ASCII animation (boot text and a loading bar) when a terminal turns on. A click skips it.",
    scope: "client", config: true, type: Boolean, default: true
  });
}

/**
 * Czy postać sięga terminala: { ok, why, via, dist }.
 * Zawsze tak: bez tej zasady, u MG i gdy terminala nie ma na oglądanej scenie. Obok = tokeny się stykają (jak przy
 * wymianie); dalej — tylko z przedmiotem z REMOTE_GEAR (kabel, implant zdalnej kontroli, kabel iskrowy).
 */
export function terminalReach(actor, terminal) {
  if (!reachOn() || game.user.isGM) return { ok: true };
  const scene = canvas?.ready ? canvas.scene : null;
  const terms = scene && terminal ? (terminal.isToken ? [terminal.token].filter(t => t?.parent?.id === scene.id) : (terminal.getActiveTokens?.(false, true) ?? [])) : [];
  if (!terms.length) return { ok: true };
  if (!actor) return { ok: false, why: t("select your token") };
  const me = tokenDocOf(actor);
  if (!me) return { ok: false, why: t("{name} has no token on this scene", { name: actor.name }) };
  const grid = gridOf(scene);
  const mine = rectOf(me, grid.size);
  let dist = Infinity, adjacent = false;
  for (const t of terms) {
    const r = rectOf(t, grid.size), elev = [me.elevation, t.elevation];
    if (isAdjacent(mine, r, grid, elev)) adjacent = true;
    dist = Math.min(dist, tokenDistance(mine, r, grid, elev));
  }
  if (adjacent) return { ok: true, dist };
  const rem = remoteReach(actor, { powered: powerState(actor).powered });
  if (rem.ft && dist <= rem.ft) return { ok: true, dist, via: rem.label };
  return { ok: false, dist, why: `${t("too far ({dist} ft) — walk up to the terminal", { dist })}${rem.ft ? ` ${t("or to {ft} ft ({label})", { ft: rem.ft, label: rem.label })}` : ""}` };
}

/** Ostrzeżenie, gdy postać gracza nie sięga terminala; zwraca true, gdy może działać. */
function inReach(terminal, actor = userActor()) {
  const r = terminalReach(actor, terminal);
  if (r.ok) return true;
  ui.notifications.warn(`${actor?.name ?? t("Character")}: ${r.why}.`);
  return false;
}

// ======================================================================
// Kanał do MG
// ======================================================================

/** Wyślij operację: MG wykonuje od razu, gracz przez kanał systemu. */
export async function request(terminal, op, data = {}) {
  const payload = { kind: "terminal", op, uuid: terminal.uuid, data, user: game.user.id };
  if (game.user.isGM) return applyOp(payload);
  if (!inReach(terminal)) return null;
  if (!game.users.activeGM) return warn(t("The terminal works only while the GM is logged in."));
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
  // ekran terminala zależy od tego, czy postać stoi obok — odśwież po ruchu jej tokenu (albo terminala) i zmianie zaznaczenia
  const rerender = foundry.utils.debounce(() => {
    for (const app of foundry.applications.instances.values()) if (app.document?.type === "terminal" && app.rendered) app.render();
  }, 150);
  Hooks.on("updateToken", (doc, changes) => {
    if (game.user.isGM || !reachOn() || !["x", "y", "elevation"].some(k => k in changes)) return;
    if (doc.actor?.type === "terminal" || doc.actor === userActor()) rerender();
  });
  Hooks.on("controlToken", () => { if (!game.user.isGM && reachOn()) rerender(); });
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
  const ts = terminal.system;
  const st = ts.state;
  const who = esc(data.who ?? game.users.get(user)?.name ?? "?");
  const upd = {};
  let log = [...(st.log ?? [])];
  const say = (...lines) => { log = pushLog(log, ...lines); };

  switch (op) {
    case "boot": {
      if (ts.trap.armed) {
        upd["system.trap.armed"] = false;
        upd["system.state.booted"] = true;
        upd["system.powered"] = false;
        say(t("> {who}: booting…", { who }), t("> !!! POWER FAULT — CHARGE !!!"));
        await explode(terminal, data.token);
      } else {
        upd["system.state.booted"] = true;
        say(t("> {who}: terminal started", { who }));
      }
      break;
    }
    case "trap": {
      // wynik oględzin / rozbrajania
      if (data.step === "inspect") {
        if (data.result === "crit-fail" && ts.trap.armed) { upd["system.trap.armed"] = false; upd["system.state.booted"] = true; upd["system.powered"] = false; await explode(terminal, data.token); say(t("> {who}: casing disturbed — EXPLOSION", { who })); }
        else if (["success", "crit-success"].includes(data.result)) { upd["system.state.trapFound"] = true; if (!ts.trap.armed) say(t("> {who}: casing clean — no charge", { who })); }
      } else if (data.step === "disarm") {
        if (["success", "crit-success"].includes(data.result)) { upd["system.trap.armed"] = false; say(t("> {who}: charge disarmed", { who })); }
        else if (data.result === "crit-fail") { upd["system.trap.armed"] = false; upd["system.state.booted"] = true; upd["system.powered"] = false; await explode(terminal, data.token); say(t("> {who}: disarming failed — EXPLOSION", { who })); }
      }
      break;
    }
    case "login": {
      if ((st.lockouts ?? 0) >= 2) break;
      const lvl = loginOutcome(ts, data.password);
      if (lvl) { upd["system.state.access"] = lvl; say(`> LOGON ${who}`, lvl === "admin" ? t("> ADMINISTRATOR ACCESS") : t("> ACCESS GRANTED")); }
      else say(`> LOGON ${who}`, t("> WRONG PASSWORD"));
      break;
    }
    case "hack": {
      const out = hackOutcome(data.result, { kind: ts.kind, tech: !!data.tech });
      if (out.lockout) {
        upd["system.state.lockouts"] = (st.lockouts ?? 0) + 1;
        upd["system.state.game"] = null;
        say(t("> {who}: hack — CRITICAL ERROR", { who }), (st.lockouts ?? 0) + 1 >= 2 ? t("> TERMINAL LOCKED FOR GOOD") : t("> TERMINAL LOCKED"));
      } else if (out.access) {
        if ((({ none: 0, user: 1, admin: 2 })[st.access] ?? 0) < (out.access === "admin" ? 2 : 1)) upd["system.state.access"] = out.access;
        upd["system.state.game"] = null;
        say(t("> {who}: hack successful", { who }), out.access === "admin" ? t("> ADMINISTRATOR ACCESS") : t("> ACCESS GRANTED"));
      } else say(t("> {who}: hack failed", { who }));
      break;
    }
    case "startGame": {
      if (st.game?.words?.length) break;
      const g = newGame(await words(), ts.security, { scienceRank: data.rank ?? 0, seed: Math.floor(Math.random() * 2 ** 31) });
      if (!g) break;
      g.tech = !!data.tech;
      upd["system.state.game"] = g;
      say(t("> {who}: loading memory dump…", { who }), t("> ATTEMPTS: {tries} · HINTS: {hints}", { tries: g.tries, hints: g.hints }));
      break;
    }
    case "guess": {
      const g = st.game;
      if (!g?.words?.length || (g.removed ?? []).includes(data.word)) break;
      const r = guessWord(g, data.word);
      say(`> ${String(data.word).toUpperCase()}`);
      if (r.correct) {
        upd["system.state.game"] = null;
        const lvl = ts.kind === "stabletec" && (g.tech || data.tech) ? "admin" : "user";
        if ((({ none: 0, user: 1, admin: 2 })[st.access] ?? 0) < (lvl === "admin" ? 2 : 1)) upd["system.state.access"] = lvl;
        say(t("> PASSWORD ACCEPTED"), lvl === "admin" ? t("> ADMINISTRATOR ACCESS") : t("> ACCESS GRANTED"));
      } else if (r.lockout) {
        upd["system.state.game"] = null;
        upd["system.state.lockouts"] = (st.lockouts ?? 0) + 1;
        say(t("> ACCESS DENIED"), t("> LIKENESS={n}", { n: r.likeness }), (st.lockouts ?? 0) + 1 >= 2 ? t("> TERMINAL LOCKED FOR GOOD") : t("> TERMINAL LOCKED"));
      } else {
        upd["system.state.game"] = { ...g, tries: r.tries, removed: [...(g.removed ?? []), String(data.word).toUpperCase()] };
        say(t("> ACCESS DENIED"), t("> LIKENESS={n}", { n: r.likeness }));
      }
      break;
    }
    case "hint": {
      const g = st.game;
      if (!g?.words?.length || !(g.hints > 0)) break;
      const dud = pickDud(g);
      if (!dud) break;
      upd["system.state.game"] = { ...g, hints: g.hints - 1, removed: [...(g.removed ?? []), dud] };
      say(t("> DUD REMOVED"));
      break;
    }
    case "analyze": {
      const g = st.game;
      if (!g?.words?.length || g.analyzed) break;
      const out = analyzeOutcome(g, data.result);
      say(t("> {who}: dump analysis (Science)", { who }), ...out.lines);
      if (out.lockout) {
        upd["system.state.game"] = null;
        upd["system.state.lockouts"] = (st.lockouts ?? 0) + 1;
        say((st.lockouts ?? 0) + 1 >= 2 ? t("> TERMINAL LOCKED FOR GOOD") : t("> TERMINAL LOCKED"));
      } else upd["system.state.game"] = out.game;
      break;
    }
    case "abortGame": {
      upd["system.state.game"] = null;
      say(t("> {who}: aborted", { who }));
      break;
    }
    case "logout": {
      upd["system.state.access"] = "none";
      say(t("> {who}: logged out", { who }));
      break;
    }
    case "command": {
      const c = ts.commands.find(x => x.id === data.id);
      if (!c || !canSee(c.access, effectiveState(ts))) break;
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
      content: `<div class="foe-card spell"><div class="fc-tag"><span>TERMINAL // ${esc(terminal.name)}</span><span>${t("message")}</span></div><h3>${esc(c.label)}</h3>${c.text ? `<div class="fc-meta">${esc(c.text)}</div>` : ""}</div>`
    });
    return [t("> SENT")];
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
  out.push(ok ? t("> DONE ({n})", { n: ok }) : t("> NO CONNECTION TO THE DEVICE"));
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
      <div class="fc-tag"><span>${t("PIPBUCK // TRAP")}</span><span>${esc(ex.formula)}</span></div>
      <h3>${esc(t("{name}: rigged terminal", { name: terminal.name }))}</h3>
      <div class="fc-main"><div class="fc-roll">${roll.total}<small>${t("DMG")}</small></div><div class="fc-outcome">${t("Explosion")}</div><div class="fc-sum">${esc(roll.formula)}</div></div>
      <div class="fc-meta"><div>${esc(t("{label} — like {name} (p. 597). Explosion: each exposed location separately. Others in the radius — the GM.", { label: ex.label, name: ex.name }))}</div></div>
      <button type="button" class="foe-luck" data-action="foeApply"><i class="fa-solid fa-heart-crack"></i> ${t("Apply damage")}</button>
    </div>`,
    flags: { [F]: { damage: {
      specials: {}, shockWounds: 0, actorUuid: null, itemUuid: null, itemName: t("{name}: trap", { name: terminal.name }), total: roll.total, pre: roll.total,
      critMult: 1, crit: false, aoe: true, loc: null, called: null, table: null, ignoreDT: 0, targets: tokenUuid ? [tokenUuid] : []
    } } }
  });
}

// ======================================================================
// Akcje gracza (ekran terminala)
// ======================================================================

/** Postać, która używa terminala: zaznaczony własny token, potem postać gracza. */
export function userActor() {
  const own = (canvas?.tokens?.controlled ?? []).map(t => t.actor).find(a => a?.isOwner && !["terminal", "vehicle", "casino"].includes(a.type));
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
  if (!actor) return warn(t("Select your token or assign a character to the player."));
  if (!inReach(terminal, actor)) return null;
  const mfd = terminal.system.trap.noticeMfd || "3/4";
  const result = await skillRoll(actor, "explosives", mfd, step === "inspect" ? t("Inspecting the terminal: {name}", { name: terminal.name }) : t("Disarming the charge: {name}", { name: terminal.name }));
  if (!result) return null;
  return request(terminal, "trap", { step, result, who: actor.name, token: tokenOf(actor) });
}

export async function login(terminal, password) {
  const actor = userActor();
  return request(terminal, "login", { password, who: actor?.name ?? game.user.name });
}

export async function hackTerminal(terminal) {
  const actor = userActor();
  if (!actor) return warn(t("Select your token or assign a character to the player."));
  if (!inReach(terminal, actor)) return null;
  const ts = terminal.system;
  const acc = terminalAccess(actor, ts);
  if (!acc.hack) return warn(`${actor.name}: ${acc.why.join("; ") || t("cannot hack")}.`);
  const tech = hasPipbuckTech(actor);
  if (minigameOn()) return request(terminal, "startGame", { who: actor.name, rank: actor.system.skills?.science?.rank ?? 0, tech });
  const mfd = TERMINAL_SECURITY[ts.security]?.mfd ?? "3/4";
  const result = await skillRoll(actor, "science", mfd, t("Hacking: {name}", { name: terminal.name }));
  if (!result) return null;
  return request(terminal, "hack", { result, who: actor.name, tech });
}

export const guess = (terminal, word) => request(terminal, "guess", { word, who: userActor()?.name, tech: hasPipbuckTech(userActor()) });

/** Analiza zrzutu w minigrze: rzut Science z trudnością terminala, raz na grę (analyzeOutcome). */
export async function analyzeDump(terminal) {
  const actor = userActor();
  if (!actor) return warn(t("Select your token or assign a character to the player."));
  if (!inReach(terminal, actor)) return null;
  const g = terminal.system.state.game;
  if (!g?.words?.length) return null;
  if (g.analyzed) return warn(t("This memory dump has already been analyzed."));
  const mfd = TERMINAL_SECURITY[terminal.system.security]?.mfd ?? "1";
  const result = await skillRoll(actor, "science", mfd, t("Memory dump analysis: {name}", { name: terminal.name }));
  if (!result) return null;
  return request(terminal, "analyze", { result, who: actor.name });
}

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
  if (!actor) return warn(t("Select your token or assign a character to the player."));
  if (!inReach(terminal, actor)) return null;
  const e = terminal.system.entries.find(x => x.id === entryId);
  if (!e || !canSee(e.access, effectiveState(terminal.system))) return null;
  const blank = actor.items.find(isBlankHolotape);
  if (!blank) return warn(t("{name}: you need a blank holotape (“Holotape” from the catalog). Recorded holotapes are not overwritten.", { name: actor.name }));
  if ((Number(blank.system.qty) || 0) > 1) await blank.update({ "system.qty": blank.system.qty - 1 });
  else await blank.delete();
  const body = String(e.body ?? "").split(/\n/).map(l => `<p>${esc(l)}</p>`).join("");
  await actor.createEmbeddedDocuments("Item", [{
    name: t("Holotape: {title}", { title: e.title }), type: "gear", img: blank.img, flags: { [F]: { holotape: { terminal: terminal.name, entry: e.id, title: e.title } } },
    system: { category: blank.system.category ?? "misc", qty: 1, weight: blank.system.weight ?? 0, value: 0, description: `<p><b>${esc(terminal.name)}</b></p>${body}` }
  }]);
  ui.notifications.info(t("{name}: “{title}” copied to a holotape.", { name: actor.name, title: e.title }));
  return true;
}
