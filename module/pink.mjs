/**
 * Różowa chmura na mapie i na postaci (logika: pink-data.mjs).
 *   - Gęstość na scenie i w regionach (pole w konfiguracji, jak promieniowanie): rzednie o 1 poziom na godzinę od
 *     ustawienia, chyba że zaznaczono „stała” (np. Canterlot).
 *   - Upływ czasu (aktywny MG): postać gracza z tokenem w chmurze na aktywnej scenie dostaje rany za każdą rundę
 *     (6 s) — karta na czacie; śmierć od chmury → decyzja MG: END 1/10, INT ¾ — ghul z Canterlotu (opcja świata
 *     „Zamiana w ghula”).
 *   - Opcje z Project Horizons (osobne ustawienia świata, domyślnie wyłączone): korozja pancerza, zrastanie się
 *     z otoczeniem, rzut END o tempo umierania, nabyta odporność po przeżyciu, wycie PipBucka, alikorny tylko odporniejsze.
 */
import { t } from "./i18n.mjs";
import { attrTest, passed } from "./attr-test.mjs";
import { deadly, registerConfirmAction } from "./confirm.mjs";
import { toggleStatus } from "./conditions.mjs";
import { isGhoul } from "./body.mjs";
import { devices } from "./skins.mjs";
import { LOCATIONS } from "./data.mjs";
import { slowFeral } from "./mind.mjs";
import { PINK_LEVELS, PINK_STEP, ROUND, effectiveDensity, pinkWounds, scaleWounds, corrosionPerRound, densityFor, sumWounds } from "./pink-data.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const setting = (key, fallback = false) => { try { return game.settings.get(F, key) ?? fallback; } catch { return fallback; } };
const now = () => Number(game.time?.worldTime) || 0;
const ownersAndGM = actor => game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
const rng = n => Math.floor(Math.random() * n) + 1;
const feat = (actor, key) => actor.items.find(i => i.flags?.[F]?.pink === key);

// ---------- strefy ----------
export const zoneOf = doc => doc?.flags?.[F]?.pink ?? null;
function inRegion(td, region) {
  if (td.regions instanceof Set) return td.regions.has(region);
  const size = td.parent?.grid?.size ?? 100;
  const c = { x: td.x + (td.width * size) / 2, y: td.y + (td.height * size) / 2, elevation: td.elevation ?? 0 };
  try { return !!(region.testPoint?.(c) ?? region.object?.testPoint?.(c, c.elevation)); } catch { return false; }
}
/** Gęstość chmury w miejscu tokenu (scena i regiony, największa). */
export function pinkAt(td, w = now()) {
  const scene = td?.parent;
  if (!scene) return 0;
  let d = effectiveDensity(zoneOf(scene), w);
  for (const r of scene.regions ?? []) if (zoneOf(r)?.density && inRegion(td, r)) d = Math.max(d, effectiveDensity(zoneOf(r), w));
  return d;
}

// ---------- postać ----------
const isCanterlot = actor => /canterlot/i.test(String(actor.system?.race ?? "")) || actor.items.some(i => i.flags?.[F]?.canterlot || (i.type === "feature" && /canterlot ghoul|ghul z canterlotu/i.test(i.name)));
const isImpAlicorn = actor => /alicorn|alikorn/i.test(String(actor.system?.race ?? "")) && !/2nd|gen|drugiego/i.test(String(actor.system?.race ?? ""));
const hasResist = actor => !!feat(actor, "resist");
const armors = actor => actor.items.filter(i => i.type === "armor" && i.system?.equipped);
const covers = (a, k) => !!a.system?.cover?.[k] && (Number(a.system.dt) || 0) - (Number(a.system.wear?.[k]) || 0) > 0;
/** Lokacje odsłonięte (bez pancerza, który jeszcze trzyma). */
export const exposedOf = actor => Object.keys(actor.system?.locations ?? {}).filter(k => !armors(actor).some(a => covers(a, k)));
/** Aparat oddechowy: pancerz wspomagany (szczelny, póki tułów trzyma) albo rebreather / kombinezon ochronny. Maska — nie. */
function breathes(actor) {
  return armors(actor).some(a => (a.system.category === "power" && covers(a, "torso")) || /rebreather|hazmat|environment(al)? suit|sealed/i.test(a.name));
}

function card(actor, lines, { warn = "" } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: ownersAndGM(actor),
    content: `<div class="foe-card wounds"><div class="fc-tag"><span>PIPBUCK // ${esc(t("PINK CLOUD"))}</span><span>${esc(actor.name)}</span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}
      ${warn ? `<div class="fc-meta"><b class="warn">${esc(warn)}</b></div>` : ""}</div>`
  });
}

async function setScream(actor, on) {
  const f = feat(actor, "scream");
  if (on && !f) await actor.createEmbeddedDocuments("Item", [{
    name: t("Screaming PipBuck"), type: "feature", img: `systems/${F}/icons/pipbuck.svg`, flags: { [F]: { pink: "scream" } },
    system: { kind: "other", active: true, effects: [{ type: "tempAttr", target: "per", value: -1, when: "" }],
      description: `<p>${esc(t("Project Horizons: the pink cloud reacts with the PipBuck's magic — it shrieks like Enervation. −1 PER while in the cloud; the GM may deal head wounds to anyone close by."))}</p>` }
  }]);
  if (!on && f) await actor.deleteEmbeddedDocuments("Item", [f.id]);
}

/** Upływ czasu (aktywny MG). */
export async function pinkTick(actor, w = now(), dt = 0) {
  if (!setting("pinkCloud", true) || actor.type !== "character" || actor.system?.dead || actor.statuses?.has?.("dead")) return;
  const tokens = [...(game.scenes?.active?.tokens ?? [])].filter(td => td.actor === actor);
  const raw = tokens.reduce((m, td) => Math.max(m, pinkAt(td, w)), 0);
  const st = { carry: 0, round: 0, took: 0, in: false, ...(actor.flags?.[F]?.pinkState ?? {}) };
  const d = densityFor(raw, {
    canterlot: isCanterlot(actor), radGhoul: isGhoul(actor) && !isCanterlot(actor), impAlicorn: isImpAlicorn(actor),
    alicornsResistOnly: setting("pinkAlicorns"), resist: setting("pinkResist") && hasResist(actor)
  });
  if (!d) {
    if (st.in) {
      await actor.setFlag(F, "pinkState", { ...st, in: false, carry: 0, took: 0 });
      await setScream(actor, false);
      if (setting("pinkResist") && st.took > 0 && !hasResist(actor)) await deadly(actor, "pink-resist", {}, {
        title: t("{name} survived the pink cloud.", { name: actor.name }),
        text: t("Project Horizons (Goldenblood after Littlehorn): grant partial resistance? The cloud then acts one density level lower on this character.")
      });
    }
    return;
  }
  const total = (Number(st.carry) || 0) + Math.max(0, Number(dt) || 0);
  const n = Math.min(600, Math.floor(total / ROUND));
  const next = { ...st, in: true, carry: total - n * ROUND };
  if (!n) return actor.setFlag(F, "pinkState", next);
  const lines = [t("Pink cloud, density {d}: {n} rounds.", { d, n })];
  if (raw !== d) lines.push(t("Resistance: acts as density {d} (cloud {r}).", { d, r: raw }));
  // korozja (PH): pancerz traci DT na zakrytych lokacjach
  const cor = setting("pinkCorrode") ? corrosionPerRound(d) * n : 0;
  if (cor) {
    for (const a of armors(actor)) {
      const upd = {};
      for (const k of Object.keys(a.system.cover ?? {})) if (a.system.cover[k]) upd[`system.wear.${k}`] = Math.min(Number(a.system.dt) || 0, (Number(a.system.wear?.[k]) || 0) + cor);
      if (Object.keys(upd).length) await a.update(upd);
    }
    lines.push(t("The cloud corrodes armour: −{n} DT on covered locations.", { n: cor }));
  }
  let wounds = pinkWounds(d, n, { exposed: exposedOf(actor), breathe: breathes(actor), roundStart: Number(st.round) || 0, rng });
  next.round = (Number(st.round) || 0) + n;
  // różne tempo umierania (PH): END według gęstości
  if (setting("pinkVariable") && sumWounds(wounds)) {
    const res = await attrTest(actor, "end", t("Pink cloud: holding on (END {s})", { s: PINK_STEP[d] }), PINK_STEP[d], { notes: [t("critical success — no wounds this time; success — half (Project Horizons)")] });
    wounds = scaleWounds(wounds, res);
  }
  const upd = {};
  for (const [k, v] of Object.entries(wounds)) upd[`system.locations.${k}.wounds`] = (Number(actor.system.locations?.[k]?.wounds) || 0) + v;
  if (Object.keys(upd).length) await actor.update(upd);
  next.took = (Number(st.took) || 0) + sumWounds(wounds);
  lines.push(sumWounds(wounds) ? t("Wounds: {list}.", { list: Object.entries(wounds).map(([k, v]) => `${LOCATIONS[k] ?? k} ${v}`).join(", ") }) : t("No wounds this time."));
  // zrastanie (PH): gęstość 4+, END ½
  if (setting("pinkFuse") && d >= 4 && !feat(actor, "fused") && !actor.system.dead) {
    if (!passed(await attrTest(actor, "end", t("Pink cloud: not fusing (END ½)"), "1/2", { notes: [t("failure — fuses with the armour and the ground (Project Horizons)")] }))) {
      await actor.createEmbeddedDocuments("Item", [{
        name: t("Fused (pink cloud)"), type: "feature", img: `systems/${F}/icons/feature.svg`, flags: { [F]: { pink: "fused" } },
        system: { kind: "other", active: true, effects: [], description: `<p>${esc(t("Hide fused to the armour, the floor or whatever it touched (Project Horizons). Can't move until cut free (the GM decides how — and what it costs). Remove this feature when freed."))}</p>` }
      }]);
      await toggleStatus(actor, CONFIG.statusEffects?.some(s => s.id === "restrain") ? "restrain" : "paralysis", true);
      lines.push(t("{name} fuses with the surroundings and can't move!", { name: actor.name }));
    }
  }
  if (setting("pinkScream") && d >= 2 && devices(actor).pipbuck) {
    if (!feat(actor, "scream")) lines.push(t("The PipBuck shrieks like Enervation (−1 PER)."));
    await setScream(actor, true);
  }
  await actor.setFlag(F, "pinkState", next);
  await card(actor, lines);
  if (actor.system.dead) await deadly(actor, "pink-death", {}, {
    title: t("{name} is dying in the pink cloud.", { name: actor.name }),
    text: t("Handbook p. 611: END 1/10 — success: the soul holds on (INT ¾, +25 with Fixation) and becomes a Canterlot ghoul; failure: death.")
  });
}

async function playPinkDeath(actor) {
  if (!actor.system.dead) return card(actor, [t("{name} has been saved in the meantime — nothing happens.", { name: actor.name })]);
  const ghoul = setting("ghoulification", true) && !isGhoul(actor);
  const soul = ghoul ? await attrTest(actor, "end", t("Pink cloud: END 1/10 (p. 611)"), "1/10") : "fail";
  if (!passed(soul)) {
    await toggleStatus(actor, "dead", true);
    return card(actor, [], { warn: t("{name} dies in the pink cloud.", { name: actor.name }) });
  }
  const fix = actor.items.some(i => i.type === "feature" && i.system?.active !== false && /fixation|fiksacj/i.test(i.name));
  const mind = await attrTest(actor, "int", t("Canterlot ghoul: INT ¾ to keep the mind"), "3/4", { mod: fix ? 25 : 0, notes: [fix ? t("Fixation +25") : "", t("critical failure — feral at once; failure — goes feral over the next few days")].filter(Boolean) });
  const L = actor.system.locations;
  await actor.update({
    "system.race": t("Canterlot ghoul (was: {race})", { race: String(actor.system.race ?? "") }),
    "system.locations.head.wounds": Math.min(L.head.wounds, Math.max(0, (L.head.limit ?? 1) - 1)),
    "system.locations.torso.wounds": Math.min(L.torso.wounds, Math.max(0, (L.torso.limit ?? 1) - 1))
  });
  const feral = mind === "crit-fail", slow = mind === "fail";
  const desc = feral ? t("A feral ghoul: higher brain functions are gone — the GM takes over the character (p. 614).")
    : slow ? t("Survived as a ghoul, but will slowly go feral over the next few days (p. 611). Only a new Purpose might stop it — the GM decides.")
    : t("A Canterlot ghoul: immune to the pink cloud and to corrupted broadcasters; can exhale the cloud as an attack, unicorns cast it as a spell (p. 611). Fused gear stays fused.");
  await actor.createEmbeddedDocuments("Item", [{ name: feral ? t("Feral ghoul") : slow ? t("Going feral") : t("Canterlot ghoul"), type: "feature",
    system: { kind: "other", active: true, effects: [], description: `<p>${esc(desc)}</p>` }, flags: { [F]: { canterlot: true, ghoul: feral ? "feral" : slow ? "going" : "sentient" } } }]);
  if (slow) await slowFeral(actor);
  await setScream(actor, false);
  return card(actor, [t("{name} should have died in the pink cloud — but the soul holds on: a Canterlot ghoul.", { name: actor.name }), desc]);
}

async function playResist(actor) {
  if (hasResist(actor)) return null;
  await actor.createEmbeddedDocuments("Item", [{
    name: t("Partial pink cloud resistance"), type: "feature", img: `systems/${F}/icons/feature.svg`, flags: { [F]: { pink: "resist" } },
    system: { kind: "trait", active: true, effects: [], description: `<p>${esc(t("Project Horizons: a partial exposure survived — the pink cloud acts one density level lower (house rule)."))}</p>` }
  }]);
  return card(actor, [t("{name} gains partial resistance to the pink cloud.", { name: actor.name })]);
}

/** Wiersz na karcie (sekcja zdrowia). */
export function pinkRow(actor) {
  const st = actor?.flags?.[F]?.pinkState;
  if (!st?.in) return null;
  return { name: t("Pink cloud"), desc: t("inside the cloud — wounds every round; masks don't help"), alert: true };
}

// ---------- konfiguracja sceny i regionu ----------
function zoneField(app, html, kind) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app?.document;
  if (!root || !doc || root.querySelector(".foe-pink-zone")) return;
  const z = zoneOf(doc) ?? {};
  const cur = Math.round(Number(z.density) || 0);
  const g = document.createElement("div");
  g.className = "form-group foe-pink-zone";
  g.innerHTML = `<label>${esc(t("Pink cloud (Fallout: Equestria)"))}</label>
    <div class="form-fields"><select name="flags.${F}.pink.density" data-dtype="Number">${PINK_LEVELS.map(l => `<option value="${l.d}" ${l.d === cur ? "selected" : ""}>${esc(t(l.label))}</option>`).join("")}</select>
    <label class="checkbox"><input type="checkbox" name="flags.${F}.pink.persistent" ${z.persistent ? "checked" : ""}> ${esc(t("persistent"))}</label></div>
    <p class="hint">${esc(kind === "scene" ? t("Characters on this scene (when it is the active one) take wounds every round. The cloud thins by one level an hour from when you set it, unless persistent (e.g. Canterlot). Levels 1, 2, 3 and 5 are a house rule.")
      : t("Characters inside this region take wounds every round, on top of the scene's cloud. Thins by one level an hour unless persistent."))}</p>`;
  const anchor = root.querySelector(kind === "scene" ? ".foe-scene-taint, .foe-scene-provided, .foe-scene-rads" : ".foe-region-rads");
  if (anchor) anchor.after(g); else (root.querySelector("form .tab.active, form") ?? root).append(g);
}

export function registerPink() {
  game.settings.register(F, "pinkCloud", {
    name: "Pink cloud",
    hint: "Scenes and regions can hold the pink cloud (a density level): characters inside take wounds every round; death in the cloud — END 1/10 for a Canterlot ghoul (p. 611). Levels 1, 2, 3 and 5 are a house rule.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "pinkCorrode", {
    name: "Pink cloud (Project Horizons): corrosion",
    hint: "The cloud eats armour and clothing: covered locations lose DT every round (1 at density 2–3, 2 from 4); a location whose armour is gone is exposed.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "pinkFuse", {
    name: "Pink cloud (Project Horizons): fusing",
    hint: "From density 4: END ½ every exposure — failure: the character fuses with the armour and the ground and can't move.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "pinkVariable", {
    name: "Pink cloud (Project Horizons): it kills some slower",
    hint: "Every exposure an END roll (harder with density): critical success — no wounds, success — half.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "pinkResist", {
    name: "Pink cloud (Project Horizons): acquired resistance",
    hint: "Who survives the cloud with wounds can get (a GM decision) partial resistance: the cloud acts one level lower.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "pinkScream", {
    name: "Pink cloud (Project Horizons): screaming PipBucks",
    hint: "From density 2 a worn PipBuck shrieks like Enervation: −1 PER while in the cloud (and screen interference on the sheet).",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "pinkAlicorns", {
    name: "Pink cloud (Project Horizons): alicorns only resist",
    hint: "IMP alicorns are not immune — the cloud acts two levels lower on them.",
    scope: "world", config: true, type: Boolean, default: false
  });
  registerConfirmAction("pink-death", playPinkDeath);
  registerConfirmAction("pink-resist", playResist);
  // ustawienie gęstości — chmura rzednie od tej chwili
  const stamp = (doc, changes) => {
    const p = changes?.flags?.[F]?.pink;
    if (p && "density" in p) foundry.utils.setProperty(changes, `flags.${F}.pink.since`, now());
  };
  Hooks.on("preUpdateScene", stamp);
  Hooks.on("preUpdateRegion", stamp);
  Hooks.on("renderSceneConfig", (app, html) => { try { zoneField(app, html, "scene"); } catch (err) { console.warn(`${F} | pink cloud`, err); } });
  Hooks.on("renderRegionConfig", (app, html) => { try { zoneField(app, html, "region"); } catch (err) { console.warn(`${F} | pink cloud`, err); } });
}
