/**
 * Drzwi i zamki na mapie (zwykłe drzwi Foundry; z modułem Threshold — także jego bariery).
 *   - wytrych: rzut Lockpicking z karty postaci obok zamkniętych na klucz drzwi (jednorożec z telekinezą — do 5×INT ft,
 *     o ile widzi drzwi) od razu celuje w zamek: MFD zamka w oknie, a wynik rozstrzyga aktywny MG — sukces odblokowuje,
 *     krytyczna porażka psuje zamek (perk Infiltrator: jeszcze jedna próba), przerzut kartą Szczęścia zastępuje wynik,
 *   - zamek drzwi: MG ustawia trudność w oknie ściany; bez ustawienia — z materiału bariery Threshold (stal ½) albo MFD 1,
 *   - terminale: komendy drzwi działają przez Threshold (uchylenie, pole siłowe, zasłony), a bez niego — jak dotąd.
 * Część bez Foundry: doors-data.mjs.
 */
import { afterDice } from "./dice3d.mjs";
import { t } from "./i18n.mjs";
import { SKILLS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest } from "./rolls.mjs";
import { gridOf, rectOf, tokenOf } from "./give.mjs";
import { direction, DIR_NAMES } from "./trade-data.mjs";
import { knowsTK } from "./throw.mjs";
import {
  THR_ID, THR_FLAG, LOCK_FLAG, DS, DOOR, LOCK_CHOICES,
  lockOf, canPick, pickResult, doorReach, wallPoint, thresholdOp, nativeDoorState, thrApi
} from "./doors-data.mjs";
export { thrApi };

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** API Threshold, gdy moduł jest włączony. */
// flagi czytane wprost: getFlag rzuca dla wyłączonego modułu
const barrierOf = wall => wall?.flags?.[THR_ID]?.[THR_FLAG] ?? null;
const lockFlag = wall => wall?.flags?.[F]?.[LOCK_FLAG] ?? {};
const mfdName = key => (key === "1.5" ? t("1.5") : key);
/** Nazwa materiału z tłumaczeń Threshold (gdy moduł jest włączony), inaczej jego id. */
function materialName(id) {
  const key = `THRESHOLD.Material.${id}`;
  const l = game.i18n?.localize?.(key);
  return l && l !== key ? l : id;
}

const hasInfiltrator = actor => (actor?.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && /^infiltrator\b/i.test(i.name));
/** Narzędzia do zamków: spinki, wytrych elektroniczny albo zaklęcie Conjure Tool. */
function lockTools(actor) {
  const items = (actor?.items ?? []).filter(i => i.type === "gear" && /bobby pin|lockpick|spink|wytrych/i.test(i.name) && (Number(i.system?.qty) || 1) > 0);
  const spell = (actor?.items ?? []).find(i => i.type === "spell" && /conjure tool/i.test(i.name));
  return [...items.map(i => `${i.name}${Number(i.system?.qty) > 1 ? ` ×${i.system.qty}` : ""}`), ...(spell ? [spell.name] : [])];
}

/** Czy token widzi drzwi (telekineza wymaga widzenia); bez silnika kolizji — tak. */
function sees(tokenDoc, wall) {
  try {
    const s = tokenDoc.parent?.grid?.size ?? 100;
    const o = { x: tokenDoc.x + (tokenDoc.width * s) / 2, y: tokenDoc.y + (tokenDoc.height * s) / 2 };
    const m = wallPoint(wall.c);
    const len = Math.hypot(o.x - m.x, o.y - m.y) || 1;
    // punkt tuż przed drzwiami — same drzwi nie zasłaniają
    const d = { x: m.x + ((o.x - m.x) / len) * 3, y: m.y + ((o.y - m.y) / len) * 3 };
    const backend = CONFIG.Canvas?.polygonBackends?.sight;
    return !backend?.testCollision?.(o, d, { type: "sight", mode: "any" });
  } catch { return true; }
}

/** Zamknięte na klucz drzwi w zasięgu postaci (najbliższe pierwsze). */
export function locksInReach(actor) {
  const scene = canvas?.ready ? canvas.scene : null;
  const tok = tokenOf(actor);
  if (!scene || !tok) return [];
  const grid = gridOf(scene);
  const rect = rectOf(tok, grid.size);
  const tkFt = knowsTK(actor) ? 5 * (Number(actor.system?.attributes?.int?.total) || 0) : 0;
  const out = [];
  for (const wall of scene.walls ?? []) {
    if (!wall.door || wall.ds !== DS.LOCKED) continue;
    if (wall.door === DOOR.SECRET && !game.user.isGM) continue;   // drzwi ukryte przed graczami
    const reach = doorReach(wall.c, rect, grid, tkFt);
    if (!reach.ok || (reach.how === "tk" && !sees(tok, wall))) continue;
    out.push({ wall, reach, lock: lockOf(lockFlag(wall), barrierOf(wall)), dir: DIR_NAMES[direction(rect, wallPoint(wall.c))] });
  }
  return out.sort((a, b) => a.reach.ft - b.reach.ft);
}

/**
 * Rzut Lockpicking z karty: obok zamkniętych drzwi celuje w ich zamek. Zwraca false, gdy w zasięgu nie ma zamka
 * do otwarcia (wtedy zwykły rzut umiejętności).
 */
export async function rollLockpick(actor) {
  const sk = actor?.system?.skills?.lockpick;
  if (!sk) return false;
  const all = locksInReach(actor);
  if (!all.length) return false;
  const infiltrator = hasInfiltrator(actor);
  const target = all.find(x => canPick(x.lock, infiltrator).ok);
  if (!target) {
    const why = canPick(all[0].lock, infiltrator).why;
    ui.notifications.info(why === "broken" ? t("The lock of the door {dir} is broken — it can't be picked any more.", { dir: all[0].dir })
      : t("The lock of the door {dir} can't be picked — it needs a key or a terminal.", { dir: all[0].dir }));
    return false;
  }
  const { wall, reach, lock, dir } = target;
  const src = lock.source === "material" ? t("from the material: {m}", { m: materialName(lock.material) }) : lock.source === "set" ? t("set by the GM") : t("standard lock");
  const tools = lockTools(actor);
  const info = [
    t("Lock: door {dir} — MFD {m} ({src})", { dir, m: `<b>${mfdName(lock.mfd)}</b>`, src: esc(src) }),
    reach.how === "tk" ? t("Telekinesis: {ft} ft away (up to 5×INT ft, you have to see the door)", { ft: reach.ft }) : t("Next to the door"),
    tools.length ? t("Tools: {list}", { list: esc(tools.join(", ")) }) : t("No lockpicking tools (Bobby Pin, Conjure Tool) — the GM decides whether you can try."),
    t("The door unlocks on a success at the lock's MFD — an easier MFD picked below doesn't count. A critical failure breaks the lock."),
    lock.broken === 1 ? t("The lock is already broken once — Infiltrator lets you try again; another critical failure breaks it for good.") : ""
  ].filter(Boolean).map(l => `<div>${l}</div>`).join("");
  const rc = rollContext(actor, { kind: "skill", skill: "lockpick", skillAttr: sk.attr }, { manualMod: sk.mod });
  const r = await promptMfd(t("Lockpicking: door {dir}", { dir }), sk.tn, rc, {
    defaultStep: lock.mfd, extraHtml: `<div class="dlg-attack"><div class="atk-info">${info}</div></div>`
  });
  if (!r) return true;
  const { extra, ...roll } = r;
  await rollTest(actor, {
    label: `${t("Lockpicking: door {dir}", { dir })} (${SKILLS.lockpick.label})`, baseTn: sk.tn, ...roll,
    lock: { id: foundry.utils.randomID(), wall: wall.uuid, mfd: lock.mfd, dir, how: reach.how }
  });
  return true;
}

/** Odblokowanie drzwi: przez Threshold, gdy ściana ma jego barierę, inaczej zwykły stan drzwi Foundry. */
async function unlock(wall) {
  const api = thrApi(), barrier = barrierOf(wall);
  if (api && barrier && barrier.enabled !== false) return api.barriers.setState(wall, "closed");
  return wall.update({ ds: DS.CLOSED });
}

/** Rozstrzygnięcia tego samego wytrycha (pierwszy rzut, przerzuty) idą po kolei. */
const CHAIN = new Map();
function inOrder(id, fn) {
  const next = (CHAIN.get(id) ?? Promise.resolve()).catch(() => null).then(fn);
  CHAIN.set(id, next);
  next.finally(() => { if (CHAIN.get(id) === next) CHAIN.delete(id); }).catch(() => null);
  return next;
}

/** Wynik wytrycha (aktywny MG): karta testu → zamek. */
export async function resolvePick(msg) {
  const test = msg.flags?.[F]?.test;
  const lk = test?.lock;
  if (!lk?.wall) return null;
  const wall = await fromUuid(lk.wall).catch(() => null);
  const actor = test.actorUuid ? await fromUuid(test.actorUuid).catch(() => null) : null;
  if (!wall || wall.documentName !== "Wall" || !actor) return null;
  const author = msg.author;
  if (author && !author.isGM && !actor.testUserPermission?.(author, "OWNER")) return null;
  if (wall.ds !== DS.LOCKED) return null;   // ktoś już otworzył (np. terminal)

  // zamek według ściany w tej chwili (MG mógł go zmienić po rzucie)
  const flag = lockFlag(wall);
  const base = lockOf(flag, barrierOf(wall));
  // przerzut kartą Szczęścia zastępuje poprzedni wynik — także zepsucie zamka
  const undo = !!test.prevId && flag.brokenBy === test.prevId;
  const lock = { ...base, broken: undo ? Math.max(0, base.broken - 1) : base.broken };
  const mfd = lock.mfd;
  const save = async data => wall.update({ [`flags.${F}.${LOCK_FLAG}`]: data });
  const card = (cls, title, text) => ChatMessage.create({
    speaker: msg.speaker,
    content: `<div class="foe-card test ${cls}"><div class="fc-tag"><span>PIPBUCK // ${t("LOCK")}</span><span>${mfd ? `MFD ${esc(mfdName(mfd))}` : ""}</span></div><h3>${esc(title)}</h3><div class="fc-meta">${esc(text)}</div></div>`
  });

  const can = canPick(lock, hasInfiltrator(actor));
  if (!can.ok) {
    if (undo) await save({ broken: lock.broken, brokenBy: null });
    return card("fail", t("The lock won't budge"), can.why === "broken" ? t("The lock is broken — it can't be picked any more.")
      : t("This lock can't be picked — it needs a key or a terminal."));
  }
  // sukces uratowany kartą szczęścia (krytyczna porażka → sukces) liczy się jak sukces na MFD zamka
  const res = test.luckSave === "success" ? "open" : pickResult({ total: msg.rolls?.[0]?.total, cls: test.result, baseTn: test.baseTn, mod: test.mod, steps: test.steps, lockMfd: mfd });
  if (res === "open") {
    if (undo) await save({ broken: lock.broken, brokenBy: null });
    await unlock(wall);
    return card("success", t("The lock gives way"), t("{name}: the door {dir} is unlocked.", { name: actor.name, dir: lk.dir ?? "" }));
  }
  if (res === "broken") {
    const broken = lock.broken + 1;
    await save({ broken, brokenBy: msg.id });
    return card("crit-fail", t("The lock jams"), broken >= 2 ? t("Critical failure: the lock is broken for good.")
      : t("Critical failure: the lock is broken — it can't be picked any more (Infiltrator: one more try)."));
  }
  if (undo) await save({ broken: lock.broken, brokenBy: null });
  return card("fail", t("The lock holds"), t("The lock needs MFD {m} — you can try again.", { m: mfdName(mfd) }));
}

/**
 * Komenda drzwi z terminala (wykonuje MG). Ściana z barierą Threshold: przez jego API (uchylenie, pole siłowe,
 * zasłony); zwykłe drzwi — stan drzwi Foundry. Zwraca true, gdy terminal ma połączenie z urządzeniem.
 */
export async function doorAction(wall, action) {
  const api = thrApi(), barrier = barrierOf(wall);
  if (api && barrier && barrier.enabled !== false) {
    const isDoor = (barrier.interaction?.door ?? "none") !== "none";
    const op = thresholdOp(action, barrier.state, isDoor);
    if (op && !(op.state === barrier.state && !op.ajar)) {
      if (op.ajar) { if (barrier.state !== "ajar") await api.barriers.setAjar(wall); }
      else await api.barriers.setState(wall, op.state);
    }
    return true;
  }
  if (!wall.door) return false;
  const ds = nativeDoorState(action, wall.ds);
  if (ds !== null && ds !== wall.ds) await wall.update({ ds });
  return true;
}

/** Ściana, którą terminal może sterować: drzwi albo bariera Threshold. */
export const isControllable = wall => (Number(wall?.door) || 0) > 0 || !!barrierOf(wall);

// ---------- okno ściany: zamek ----------
function lockLabel(key, auto) {
  if (key === "") return t("Automatic: MFD {m} ({src})", { m: mfdName(auto.mfd), src: auto.source === "material" ? materialName(auto.material) : t("standard lock") });
  if (key === "none") return t("Can't be picked (key or terminal only)");
  return `MFD ${mfdName(key)}`;
}

function injectLockFields(app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-lock")) return;
  const flag = lockFlag(doc);
  const auto = lockOf({}, barrierOf(doc));
  const broken = lockOf(flag).broken;
  const fs = document.createElement("fieldset");
  fs.className = "foe-lock";
  fs.innerHTML = `
    <legend>${t("Lock (Fallout: Equestria)")}</legend>
    <div class="form-group">
      <label>${t("Lockpicking difficulty")}</label>
      <div class="form-fields"><select name="flags.${F}.${LOCK_FLAG}.mfd">
        ${LOCK_CHOICES.map(k => `<option value="${k}" ${k === (flag.mfd ?? "") ? "selected" : ""}>${esc(lockLabel(k, auto))}</option>`).join("")}
      </select></div>
      <p class="hint">${t("A player standing next to the locked door (a unicorn with telekinesis: up to 5×INT ft) clicks Lockpicking on their sheet; success unlocks the door.")}</p>
    </div>
    <div class="form-group">
      <label>${t("Lock condition")}</label>
      <div class="form-fields"><select name="flags.${F}.${LOCK_FLAG}.broken">
        <option value="0" ${broken === 0 ? "selected" : ""}>${t("working")}</option>
        <option value="1" ${broken === 1 ? "selected" : ""}>${t("broken (Infiltrator: one more try)")}</option>
        <option value="2" ${broken === 2 ? "selected" : ""}>${t("broken for good")}</option>
      </select></div>
    </div>`;
  const doorSel = root.querySelector("[name=door]");
  const anchor = root.querySelector("[name=ds]")?.closest("fieldset") ?? doorSel?.closest("fieldset");
  if (anchor) anchor.after(fs);
  else (root.querySelector("footer, .form-footer")?.before(fs) ?? root.querySelector("form")?.append(fs) ?? root.append(fs));
  // zwykła ściana: pola ukryte i wyłączone — zapis ściany nie dopisuje jej zamka
  const sync = () => {
    const door = Number(doorSel?.value ?? doc.door) > 0;
    fs.style.display = door ? "" : "none";
    for (const el of fs.querySelectorAll("select")) el.disabled = !door;
    app.setPosition?.({ height: "auto" });
  };
  doorSel?.addEventListener("change", sync);
  sync();
}

export function registerDoorHooks() {
  Hooks.on("renderWallConfig", (app, html) => {
    try { injectLockFields(app, html); } catch (err) { console.warn(`${F} | wall lock`, err); }
  });
  Hooks.on("createChatMessage", msg => {
    const lk = msg.flags?.[F]?.test?.lock;
    if (!lk?.id) return;
    const gm = game.users.activeGM;
    if (!gm) {
      if (msg.author?.isSelf) ui.notifications.warn(t("Only the GM can unlock the door — it works while the GM is logged in."));
      return;
    }
    if (!gm.isSelf) return;
    inOrder(lk.id, async () => { await afterDice(msg); return resolvePick(msg); }).catch(err => console.error(`${F} | lockpicking`, err));
  });
}
