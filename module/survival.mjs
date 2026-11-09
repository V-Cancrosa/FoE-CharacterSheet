/**
 * Jedzenie, picie i promieniowanie z upływem czasu świata (zasady i obliczenia: survival-data.mjs).
 *   - „Zjedz” / „Wypij” przy produktach z kategorii „Jedzenie i picie”: posiłki, nawodnienie, rady (Iron Stomach — połowa,
 *     odporność na promieniowanie), leczenie ran (bez okaleczeń) i dieta rasy; posiłek zdejmuje karę głodu, napój — pragnienia,
 *   - o północy (czas świata; z kalendarzem — każdy dzień) aktywny MG rozlicza postacie graczy: dzień bez pełnego posiłku
 *     to −1 do losowego atrybutu w cesze „Głód” (s. 477), po 3 tygodniach śmierć; dzień bez picia (zasada domowa) — to samo
 *     w cesze „Odwodnienie”, po 3 dniach śmierć (domyślnie wyłączone),
 *   - promieniowanie sceny: MG wpisuje rady na godzinę w konfiguracji sceny; postacie graczy na aktywnej scenie dostają je
 *     z upływem czasu (minus odporność), a zakładka walki pokazuje licznik Geigera.
 */
import { t, tn, N_ } from "./i18n.mjs";
import { ATTRS } from "./data.mjs";
import { healWounds } from "./healing.mjs";
import { toggleStatus } from "./conditions.mjs";
import {
  foodInfo, dietOf, fitsDiet, foodRads, dayOf, freshState, settleDays, ambientRads, STARVE_DEATH, THIRST_DEATH
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

// ---------- promieniowanie sceny ----------
export const sceneRads = scene => Math.max(0, Number(scene?.flags?.[F]?.radiation) || 0);
const carry = new Map();

async function irradiate(dt) {
  const scene = game.scenes?.active;
  const rate = sceneRads(scene);
  if (!rate || !(dt > 0)) return;
  const actors = new Set((scene.tokens ?? []).map(td => td.actor).filter(a => a?.type === "character" && a.hasPlayerOwner && !a.system?.dead));
  for (const a of actors) {
    const r = ambientRads(rate, dt, a.system.radResistTotal ?? 0, carry.get(a.uuid) ?? 0);
    carry.set(a.uuid, r.carry);
    if (r.rads) await a.update({ "system.resources.rads.value": (Number(a.system.resources?.rads?.value) || 0) + r.rads });
  }
}

function geiger(root) {
  root.querySelector(".foe-rads")?.remove();
  const rate = sceneRads(game.scenes?.active);
  if (!rate) return;
  const el = document.createElement("div");
  el.className = "foe-rads";
  el.title = t("Radiation on the active scene: characters get it as time passes (minus their radiation resistance).");
  el.innerHTML = `<i class="fa-solid fa-radiation"></i> ${esc(t("{n} rads/h", { n: rate }))}`;
  (root.querySelector(".combat-tracker-header, header") ?? root).append(el);
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
  const anchor = root.querySelector("[name=weather]")?.closest(".form-group")
    ?? root.querySelector('.tab[data-tab="ambience"], .tab[data-tab="basics"]')?.lastElementChild;
  if (anchor) anchor.after(group);
  else (root.querySelector("footer, .form-footer")?.before(group) ?? root.append(group));
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
    if (scene.active && (foundry.utils.hasProperty(changes, `flags.${F}.radiation`) || "active" in changes)) ui.combat?.render?.();
  });
  Hooks.on("renderSceneConfig", (app, html) => {
    try { sceneField(app, html); } catch (err) { console.warn(`${F} | scene radiation`, err); }
  });
}
