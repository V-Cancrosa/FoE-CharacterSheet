/**
 * Jedzenie, picie i promieniowanie z upływem czasu świata (zasady i obliczenia: survival-data.mjs).
 *   - „Zjedz” / „Wypij” przy produktach z kategorii „Jedzenie i picie”: posiłki, nawodnienie, rady (Iron Stomach — połowa,
 *     odporność na promieniowanie), leczenie ran (bez okaleczeń) i dieta rasy; posiłek zdejmuje karę głodu, napój — pragnienia,
 *   - o północy (czas świata; z kalendarzem — każdy dzień) aktywny MG rozlicza postacie graczy: dzień bez pełnego posiłku
 *     to −1 do losowego atrybutu w cesze „Głód” (s. 477), po 3 tygodniach śmierć; dzień bez picia (zasada domowa) — to samo
 *     w cesze „Odwodnienie”, po 3 dniach śmierć (domyślnie wyłączone),
 *   - promieniowanie: tło sceny (konfiguracja sceny), regiony (stała dawka w środku) i źródła — kafelki (pełna dawka przy
 *     źródle, dalej słabnie z kwadratem odległości, do zasięgu); postacie graczy na aktywnej scenie dostają sumę z upływem
 *     czasu (minus odporność); licznik Geigera w zakładce walki i trzaski przy ruchu własnego tokenu.
 */
import { t, tn, N_ } from "./i18n.mjs";
import { ATTRS } from "./data.mjs";
import { healWounds } from "./healing.mjs";
import { toggleStatus } from "./conditions.mjs";
import {
  foodInfo, dietOf, fitsDiet, foodRads, dayOf, freshState, settleDays, ambientRads, exposure, clickCount, STARVE_DEATH, THIRST_DEATH
} from "./survival-data.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const setting = (key, fallback = true) => { try { return game.settings.get(F, key) ?? fallback; } catch { return fallback; } };
const today = () => dayOf(game.time?.worldTime ?? 0);
const stateOf = actor => actor?.flags?.[F]?.survival ?? null;
const traitNames = actor => (actor?.items ?? []).filter(i => i.type === "feature" && i.system?.active !== false).map(i => i.name);
const ownersAndGM = actor => game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
const DIET = { herbivore: N_("diet|herbivore"), omnivore: N_("diet|omnivore"), carnivore: N_("diet|carnivore") };
const d6 = () => Math.ceil((CONFIG.Dice?.randomUniform?.() ?? Math.random()) * 6) || 1;

/** Postacie, których głód i pragnienie liczy system: postacie graczy (nie martwe). */
const tracked = () => (game.actors?.filter?.(a => a.type === "character" && a.hasPlayerOwner && !a.system?.dead) ?? []);

// ---------- kary (cechy „Głód” i „Odwodnienie”) ----------
const PENALTY = {
  starvation: { name: () => t("Starvation"), desc: () => t("Table XXXII (p. 477): every day without a full meal is −1 temporarily to a random attribute. Remove this feature when the character eats (a nourishing meal); non-nourishing food lets you ignore the penalties for 8 hours.") },
  thirst: { name: () => t("Dehydration"), desc: () => t("House rule: every day without a drink is −1 temporarily to a random attribute (like starvation); after 3 days without water the character dies. Drinking removes this feature.") }
};

async function addPenalty(actor, kind, attrs) {
  if (!attrs.length) return;
  const feat = actor.items.find(i => i.type === "feature" && i.flags?.[F]?.[kind]);
  const effects = foundry.utils.deepClone(feat?.system?.effects ?? []);
  for (const a of attrs) {
    const e = effects.find(x => x.type === "tempAttr" && x.target === a);
    if (e) e.value = (Number(e.value) || 0) - 1;
    else effects.push({ type: "tempAttr", target: a, value: -1, when: "" });
  }
  if (feat) await feat.update({ "system.effects": effects });
  else await actor.createEmbeddedDocuments("Item", [{
    name: PENALTY[kind].name(), type: "feature", img: `systems/${F}/icons/food.svg`, flags: { [F]: { [kind]: true } },
    system: { kind: "other", active: true, effects, description: `<p>${PENALTY[kind].desc()}</p>` }
  }]);
}

async function clearPenalty(actor, kind) {
  const feats = actor.items.filter(i => i.type === "feature" && i.flags?.[F]?.[kind]);
  if (feats.length) await actor.deleteEmbeddedDocuments("Item", feats.map(i => i.id));
  return feats.length > 0;
}

// ---------- rozliczenie dni ----------
/** Rozlicz dni od ostatniego rozliczenia do dziś (karta na czacie dla gracza i MG). */
export async function settleActor(actor, day = today()) {
  const hunger = setting("survivalHunger"), thirst = setting("survivalThirst", false);
  const st = stateOf(actor);
  if (!st || day < st.day) return actor.setFlag(F, "survival", freshState(day, st ?? {}));
  if (day === st.day) return null;
  if (!hunger && !thirst) return actor.setFlag(F, "survival", freshState(day, st));
  const res = settleDays(st, day, { thirst, roll: d6 });
  await actor.setFlag(F, "survival", res.state);
  const lines = [];
  if (hunger && res.starve.length) {
    await addPenalty(actor, "starvation", res.starve);
    lines.push(t("Hunger: {n} without a full meal — {list} −1 (feature “Starvation”).", { n: tn(res.starve.length, "{n} day", "{n} days"), list: res.starve.map(a => ATTRS[a]).join(", ") }));
  }
  if (thirst && res.thirst.length) {
    await addPenalty(actor, "thirst", res.thirst);
    lines.push(t("Thirst: {n} without a drink — {list} −1 (feature “Dehydration”).", { n: tn(res.thirst.length, "{n} day", "{n} days"), list: res.thirst.map(a => ATTRS[a]).join(", ") }));
  }
  let death = "";
  if (hunger && res.starvedToDeath) death = t("{name} dies of starvation ({n} days without food).", { name: actor.name, n: STARVE_DEATH });
  else if (thirst && res.diedOfThirst) death = t("{name} dies of thirst ({n} days without water).", { name: actor.name, n: THIRST_DEATH });
  if (death) await toggleStatus(actor, "dead", true);
  if (!lines.length && !death) return null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: ownersAndGM(actor),
    content: `<div class="foe-card wounds"><div class="fc-tag"><span>PIPBUCK // ${t("SURVIVAL")}</span><span>${esc(actor.name)}</span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}
      ${death ? `<div class="fc-meta"><b class="warn">${esc(death)}</b></div>` : `<div class="fc-meta">${t("Days in a row — without food: {h}, without a drink: {d}.", { h: res.state.hungerDays, d: res.state.thirstDays })}</div>`}
    </div>`
  });
}

/** Dzisiejszy stan do karty postaci: „Dziś: posiłki 1/1 · picie 0/1 · bez jedzenia 2 dni”. */
export function survivalNote(actor) {
  if (actor?.type !== "character" || (!setting("survivalHunger") && !setting("survivalThirst", false))) return "";
  const st = stateOf(actor);
  const fresh = !st || st.day !== today();
  const meals = fresh ? 0 : st.meals, drinks = fresh ? 0 : st.drinks, dry = fresh ? 0 : st.dehydrating;
  return [
    t("today:"),
    setting("survivalHunger") ? t("meals {a}/{b}", { a: meals, b: 1 }) : "",
    setting("survivalThirst", false) ? t("drinks {a}/{b}", { a: drinks, b: 1 + dry }) : "",
    st?.hungerDays ? t("without food: {n}", { n: tn(st.hungerDays, "{n} day", "{n} days") }) : "",
    st?.thirstDays ? t("without a drink: {n}", { n: tn(st.thirstDays, "{n} day", "{n} days") }) : ""
  ].filter(Boolean).join(" · ").replace(/: · /, ": ");
}

// ---------- jedzenie ----------
export async function eatItem(actor, item) {
  if (!actor?.isOwner) return ui.notifications.warn(t("You don't own: {name}.", { name: actor?.name ?? "?" }));
  if ((Number(item.system.qty) || 0) < 1) return ui.notifications.warn(t("{name}: you don't have any left.", { name: item.name }));
  const info = foodInfo(item.system.description);
  const traits = traitNames(actor);
  const diet = dietOf(actor.system.race, traits);
  const cannibal = traits.some(x => /^cannibal\b|^kanibal/i.test(x));
  const fits = !setting("survivalDiet") || fitsDiet(info, diet, cannibal);
  const lines = [];

  // dzień: najpierw rozliczenie zaległych (np. MG był niezalogowany)
  await settleActor(actor);
  const st = { ...freshState(today()), ...(stateOf(actor) ?? {}) };
  if (st.day !== today()) Object.assign(st, freshState(today(), st));

  await item.update({ "system.qty": Math.max(0, (Number(item.system.qty) || 0) - 1) });

  const meals = fits ? info.meals : 0;
  if (!fits) lines.push(t("{name} gets no sustenance from it (diet: {diet}).", { name: actor.name, diet: t(DIET[diet]) }));
  if (meals) { st.meals += meals; lines.push(t("Meals +{n} (today {a}/{b}).", { n: meals, a: st.meals, b: 1 })); }
  if (info.hydrate) { st.drinks += 1; lines.push(t("Hydration (drinks today {a}/{b}).", { a: st.drinks, b: 1 + st.dehydrating })); }
  if (info.dehydrating) { st.dehydrating += 1; lines.push(t("Dehydrating: one more drink needed today ({a}/{b}).", { a: st.drinks, b: 1 + st.dehydrating })); }
  await actor.setFlag(F, "survival", st);

  const rads = foodRads(info.rads, { resist: actor.system.radResistTotal ?? 0, ironStomach: traits.some(x => /^iron stomach\b|^żelazny żołądek/i.test(x)) });
  if (rads) {
    const cur = Number(actor.system.resources?.rads?.value) || 0;
    const next = Math.max(0, cur + rads);
    await actor.update({ "system.resources.rads.value": next });
    lines.push(rads > 0 ? t("+{n} rads ({total} in total).", { n: rads, total: next }) : t("Removes {n} rads.", { n: cur - next }));
  }
  if (fits && info.wounds) {
    const healed = await healWounds(actor, info.wounds, { quiet: true, source: item.name });
    if (healed?.healed) lines.push(t("Heals: {list}.", { list: healed.text }));
  }
  if (meals && await clearPenalty(actor, "starvation")) lines.push(t("A full meal: the starvation penalties are gone."));
  if (info.hydrate && await clearPenalty(actor, "thirst")) lines.push(t("A drink: the dehydration penalties are gone."));
  if (info.effects.length) lines.push(t("Effects (the GM applies them): {list}.", { list: info.effects.join("; ") }));

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${info.drink ? t("DRINK") : t("FOOD")}</span><span><i class="fa-solid fa-utensils"></i></span></div>
      <h3>${esc(info.drink ? t("{name} drinks: {item}", { name: actor.name, item: item.name }) : t("{name} eats: {item}", { name: actor.name, item: item.name }))}</h3>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}</div>`
  });
}
/** Etykieta przycisku przy produkcie. */
export const eatLabel = item => (foodInfo(item?.system?.description).drink ? t("Drink") : t("Eat"));

// ---------- promieniowanie: tło sceny, regiony i źródła (kafelki) ----------
export const sceneRads = scene => Math.max(0, Number(scene?.flags?.[F]?.radiation) || 0);
/** Region z promieniowaniem: rady na godzinę w środku. */
export const regionRads = region => Math.max(0, Number(region?.flags?.[F]?.radiation) || 0);
/** Kafelek-źródło: { rate (rad/h przy źródle), range (ft) } albo null. */
export function tileSource(tile) {
  const r = tile?.flags?.[F]?.radiation;
  const rate = Math.max(0, Number(r?.rate) || 0);
  return rate ? { rate, range: Math.max(0, Number(r?.range ?? 30) || 0) } : null;
}
const carry = new Map();

/** Czy token stoi w regionie (Foundry śledzi to przy ruchu; zapasowo — test punktu środka). */
function inRegion(td, region) {
  if (td.regions instanceof Set) return td.regions.has(region);
  const size = td.parent?.grid?.size ?? 100;
  const c = { x: td.x + (td.width * size) / 2, y: td.y + (td.height * size) / 2, elevation: td.elevation ?? 0 };
  try { return !!(region.testPoint?.(c) ?? region.object?.testPoint?.(c, c.elevation)); } catch { return false; }
}

/** Dawka (rad/h) dla tokenu na jego scenie: { total, parts }. */
export function tokenExposure(td) {
  const scene = td?.parent;
  if (!scene) return { total: 0, parts: [] };
  const grid = { size: Number(scene.grid?.size) || 100, distance: Number(scene.grid?.distance) || 5 };
  const token = { x: Number(td.x) || 0, y: Number(td.y) || 0, w: (Number(td.width) || 1) * grid.size, h: (Number(td.height) || 1) * grid.size };
  const regions = [...(scene.regions ?? [])].filter(r => regionRads(r) && inRegion(td, r)).map(r => ({ rate: regionRads(r), name: r.name }));
  const sources = [...(scene.tiles ?? [])].map(tl => ({ tl, src: tileSource(tl) })).filter(x => x.src)
    .map(({ tl, src }) => ({ rect: { x: Number(tl.x) || 0, y: Number(tl.y) || 0, w: Number(tl.width) || 0, h: Number(tl.height) || 0 }, rate: src.rate, range: src.range, name: tl.texture?.src?.split("/").pop() ?? "" }));
  return exposure({ token, grid, ambient: sceneRads(scene), regions, sources });
}

/** Postacie graczy na aktywnej scenie z dawką (najwyższą z ich tokenów). */
function exposedOnActive() {
  const scene = game.scenes?.active;
  const out = new Map();
  for (const td of scene?.tokens ?? []) {
    const a = td.actor;
    if (a?.type !== "character" || !a.hasPlayerOwner || a.system?.dead) continue;
    const e = tokenExposure(td);
    if (!out.has(a) || out.get(a).total < e.total) out.set(a, e);
  }
  return out;
}

async function irradiate(dt) {
  if (!(dt > 0)) return;
  for (const [a, e] of exposedOnActive()) {
    if (!e.total) continue;
    const r = ambientRads(e.total, dt, a.system.radResistTotal ?? 0, carry.get(a.uuid) ?? 0);
    carry.set(a.uuid, r.carry);
    if (r.rads) await a.update({ "system.resources.rads.value": (Number(a.system.resources?.rads?.value) || 0) + r.rads });
  }
}

// ---------- licznik Geigera ----------
function geigerText() {
  const scene = game.scenes?.active;
  const exp = [...exposedOnActive()].filter(([a, e]) => e.total > 0 && (game.user.isGM || a.isOwner));
  const amb = sceneRads(scene);
  if (!exp.length && !amb) return null;
  const who = exp.sort((x, y) => y[1].total - x[1].total).slice(0, game.user.isGM ? 4 : 2)
    .map(([a, e]) => `${a.name} ${t("{n} rads/h", { n: e.total })}`);
  const title = exp.map(([a, e]) => `${a.name}: ${e.parts.map(p => p.kind === "scene" ? t("scene {n}", { n: p.rate })
    : p.kind === "region" ? t("region {name} {n}", { name: p.name, n: p.rate }) : t("source {ft} ft away {n}", { ft: p.ft, n: p.rate })).join(" + ")}`);
  return {
    html: `<i class="fa-solid fa-radiation"></i> ${esc([amb ? t("scene {n} rads/h", { n: amb }) : "", ...who].filter(Boolean).join(" · "))}`,
    title: [t("Radiation on the active scene: characters get it as time passes (minus their radiation resistance)."), ...title].join("\n")
  };
}

function geiger(root) {
  if (!root.querySelector(".foe-rads")) {
    const el = document.createElement("div");
    el.className = "foe-rads";
    (root.querySelector(".combat-tracker-header, header") ?? root).append(el);
  }
  refreshGeiger(root);
}

/** Odśwież licznik w zakładce walki (bez przerysowania całej zakładki). */
export function refreshGeiger(root = document) {
  const g = geigerText();
  for (const el of root.querySelectorAll?.(".foe-rads") ?? []) {
    el.style.display = g ? "" : "none";
    el.innerHTML = g?.html ?? "";
    el.title = g?.title ?? "";
  }
}
let geigerQueued = false;
const queueGeiger = () => {
  if (geigerQueued) return;
  geigerQueued = true;
  setTimeout(() => { geigerQueued = false; refreshGeiger(); }, 100);
};

/** Trzaski licznika Geigera po ruchu własnego tokenu w promieniowaniu (Web Audio, bez plików). */
let AC = null;
function clicks(rate) {
  const n = clickCount(rate);
  if (!n || !setting("geigerSound", true)) return;
  const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctx) return;
  AC ??= new Ctx();
  if (AC.state === "suspended") AC.resume().catch(() => null);
  let vol = 0.5;
  try { vol = Number(game.settings.get("core", "globalInterfaceVolume")); } catch { /* domyślna */ }
  const peak = Math.max(0.0002, Math.min(1, Number.isFinite(vol) ? vol : 0.5) * 0.25);
  let at = AC.currentTime + 0.02;
  const span = Math.max(0.25, 1.4 - rate / 200);   // im silniej, tym gęściej
  for (let i = 0; i < n; i++) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(2600 + Math.random() * 1600, at);
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.006);
    o.connect(g).connect(AC.destination);
    o.start(at);
    o.stop(at + 0.01);
    at += (span / n) * (0.3 + Math.random() * 1.4);
  }
}

// ---------- pola w oknach konfiguracji ----------
function insertGroup(root, group, selectors) {
  const anchor = selectors.map(s => root.querySelector(s)).find(Boolean);
  if (anchor?.matches?.(".tab")) anchor.append(group);
  else if (anchor) anchor.after(group);
  else (root.querySelector("footer, .form-footer")?.before(group) ?? root.append(group));
}

function sceneField(app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-scene-rads")) return;
  const group = document.createElement("div");
  group.className = "form-group foe-scene-rads";
  group.innerHTML = `<label>${t("Radiation (Fallout: Equestria)")}</label>
    <div class="form-fields"><input type="number" name="flags.${F}.radiation" value="${sceneRads(doc)}" min="0" step="1"> <span>${t("rads/h")}</span></div>
    <p class="hint">${t("Characters on this scene (when it is the active one) get this many rads per hour of world time, minus their radiation resistance. 0 — no radiation.")}</p>`;
  const weather = root.querySelector("[name=weather]")?.closest(".form-group");
  if (weather) weather.after(group);
  else insertGroup(root, group, ['.tab[data-tab="ambience"]', '.tab[data-tab="basics"]']);
}

function tileField(app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-tile-rads")) return;
  const src = doc.flags?.[F]?.radiation ?? {};
  const fs = document.createElement("fieldset");
  fs.className = "foe-tile-rads";
  fs.innerHTML = `<legend>${t("Radiation source (Fallout: Equestria)")}</legend>
    <div class="form-group"><label>${t("At the source")}</label>
      <div class="form-fields"><input type="number" name="flags.${F}.radiation.rate" value="${Math.max(0, Number(src.rate) || 0)}" min="0" step="1"> <span>${t("rads/h")}</span></div></div>
    <div class="form-group"><label>${t("Range")}</label>
      <div class="form-fields"><input type="number" name="flags.${F}.radiation.range" value="${Math.max(0, Number(src.range ?? 30) || 0)}" min="0" step="5"> <span>ft</span></div></div>
    <p class="hint">${t("A token touching the tile (or within one square of it) gets the full dose; further away it fades with the square of the distance — 2 squares ¼, 3 squares 1/9 — and stops at the range. Characters get it as time passes, minus their radiation resistance. A hidden tile still emits. 0 — not a source.")}</p>`;
  insertGroup(root, fs, ['.tab[data-tab="basic"]', '.tab[data-tab="basics"]', '.tab[data-tab="appearance"]']);
  app.setPosition?.({ height: "auto" });
}

function regionField(app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-region-rads")) return;
  const group = document.createElement("div");
  group.className = "form-group foe-region-rads";
  group.innerHTML = `<label>${t("Radiation (Fallout: Equestria)")}</label>
    <div class="form-fields"><input type="number" name="flags.${F}.radiation" value="${regionRads(doc)}" min="0" step="1"> <span>${t("rads/h")}</span></div>
    <p class="hint">${t("Characters standing inside this region get this many rads per hour of world time (minus their radiation resistance), on top of the scene's radiation. 0 — none.")}</p>`;
  insertGroup(root, group, ['.tab[data-tab="identity"]', '.tab[data-tab="area"]']);
}

// ---------- ustawienia i haki ----------
export function registerSurvivalSettings() {
  game.settings.register(F, "survivalHunger", {
    name: "Hunger: a day without a full meal (p. 477)",
    hint: "At midnight of world time (the calendar) every player character who hasn't eaten a full meal that day gets −1 to a random attribute (feature “Starvation”); after 3 weeks of starvation the character dies. Eating a meal (the “Eat” button by food) removes the penalties.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "survivalThirst", {
    name: "Thirst: a day without a drink (house rule)",
    hint: "Like hunger: a day without a drink (one more for each dehydrating thing eaten) is −1 to a random attribute (feature “Dehydration”), after 3 days without water — death. Drinking removes the penalties.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "geigerSound", {
    name: "Geiger counter clicks",
    hint: "Clicks when your character's token moves within radiation (a radiating tile, region or scene) — the stronger the dose, the more clicks.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "survivalDiet", {
    name: "Food: the race's diet matters",
    hint: "Ponies, zebras, buffalo and donkeys don't get sustenance from meat (unless Cannibal or Omnivore), griffins, dogs and minotaurs eat everything. Off — any food feeds anyone.",
    scope: "world", config: true, type: Boolean, default: true
  });
}

export function registerSurvivalHooks() {
  Hooks.on("updateWorldTime", (worldTime, dt) => {
    if (!game.users.activeGM?.isSelf) return;
    const day = dayOf(worldTime);
    (async () => {
      await irradiate(Number(dt) || 0);
      for (const a of tracked()) {
        const st = stateOf(a);
        if (!st || st.day !== day) await settleActor(a, day);
      }
    })().catch(err => console.error(`${F} | survival`, err));
  });
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (root) geiger(root);
  });
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.active && (foundry.utils.hasProperty(changes, `flags.${F}.radiation`) || "active" in changes)) queueGeiger();
  });
  for (const h of ["createTile", "updateTile", "deleteTile", "createRegion", "updateRegion", "deleteRegion"]) Hooks.on(h, doc => { if (doc.parent?.active) queueGeiger(); });
  // ruch tokenu: licznik i trzaski u gracza tej postaci (u MG — przy zaznaczonym tokenie)
  Hooks.on("updateToken", (td, changes) => {
    if (!["x", "y", "elevation", "width", "height"].some(k => k in changes)) return;
    if (td.parent?.active) queueGeiger();
    const a = td.actor;
    const mine = game.user.isGM ? td.object?.controlled : a?.isOwner && a.type === "character";
    if (mine) setTimeout(() => clicks(tokenExposure(td).total), 250);
  });
  Hooks.on("renderSceneConfig", (app, html) => {
    try { sceneField(app, html); } catch (err) { console.warn(`${F} | scene radiation`, err); }
  });
  Hooks.on("renderTileConfig", (app, html) => {
    try { tileField(app, html); } catch (err) { console.warn(`${F} | tile radiation`, err); }
  });
  Hooks.on("renderRegionConfig", (app, html) => {
    try { regionField(app, html); } catch (err) { console.warn(`${F} | region radiation`, err); }
  });
}
