/**
 * Magia jednorożców i alikornów (podręcznik rozdz. 5, s. 242–249).
 *   - pula strain = END + INT + 2 (alikorny +5) + cechy; odnawia się 1 na godzinę,
 *   - rzut Magic na rzucenie, drugi rzut na trafienie przy zaklęciach celowanych (przedział zasięgu 20 ft),
 *   - overglow: każda warstwa ×2 efekty i ×2 koszt (maks. 3 warstwy); >1 warstwa = 2 akcje i bez SATS, 1 warstwa = SATS ×3,
 *   - każde podtrzymywane zaklęcie dolicza warstwę kosztu do nowych zaklęć i −1 krok do celności, INT i AGI,
 *   - brak strain: każdy punkt ponad zero = krok MFD trudniej, porażka = wypalenie (1d4 tygodnie bez magii),
 *   - procent nauki: +1% za każde rzucenie; rzut ≤ procent pozwala nauczyć się zaklęcia, którego to jest prekursorem.
 */
import { MFD_STEPS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest, rollDamage, threshold, stepIndex, shiftStep } from "./rolls.mjs";
import { attackWithWeapon } from "./attack.mjs";
import { spendActions } from "./tracker.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

export const COST_LABELS = { 0: "specjalny", 1: "niski (1)", 2: "średni (2)", 3: "wysoki (3)", 4: "bardzo wysoki (4)" };

let cache = null;
/** Lista zaklęć z podręcznika (data/spells.json). */
export function loadSpells() {
  cache ??= fetch(`systems/${game.system.id}/data/spells.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(err => { cache = null; throw err; });
  return cache;
}

/** Wpis z katalogu → dane przedmiotu „spell”. */
export function spellItemData(e) {
  return {
    name: e.name, type: "spell", img: "systems/foe-rpg/icons/spell.svg",
    system: {
      level: e.level, cost: e.cost, costText: e.costText, learn: 0, satsCost: e.sats, targeted: !!e.targeted, maintained: !!e.maintained,
      damage: e.damage || "", ignoreDT: e.ignoreDT || 0, levelReq: e.levelReq || 0, requirements: e.requirements || "",
      precursors: e.precursors || "", precursorFor: e.precursorFor || "",
      description: `<p>${esc(e.desc)}</p>${e.satsText && e.satsText !== String(e.sats) ? `<p><i>SATS: ${esc(e.satsText)}</i></p>` : ""}`
    },
    flags: { [F]: { catalog: e.name } }
  };
}

/** Koszt rzucenia: bazowy × 2^(overglow + podtrzymywane zaklęcia). */
export const castCost = (base, layers, held) => base * 2 ** (layers + held);

/** Ile zaklęć danego poziomu wolno znać (s. 246): poziom 2 — INT, 3 — INT/3, 4 — 1; alikorny bez limitu do poziomu 3. */
export function spellLimits(actor) {
  const int = actor.system.attributes.int.total;
  const savant = actor.items.some(i => i.type === "feature" && /magical savant|arcane devotion/i.test(i.name)) ? 2 : 1;
  const ali = actor.system.alicorn;
  return { 2: ali ? Infinity : int * savant, 3: ali ? Infinity : Math.floor(int / 3) * savant, 4: savant };
}

/** Okno rzucenia zaklęcia i cały jego przebieg. */
export async function castSpell(actor, spell) {
  const sys = actor.system;
  const s = spell.system;
  if (s.tradition === "zebra") return warn(`${spell.name} to receptura zebr — przygotuj ją albo odprawiaj rytuał w zakładce Magia.`);
  if (!sys.caster) return warn(`${actor.name} nie rzuca zaklęć jednorożców (brak umiejętności Magic).`);
  if (sys.burnout) return warn(`${actor.name}: magiczne wypalenie — bez zaklęć, nawet telekinezy (1d4 tygodnie).`);
  if (sys.locations.horn?.status === "maimed") return warn(`${actor.name}: bez rogu nie da się rzucać zaklęć.`);
  const magic = sys.skills.magic;
  const pool = sys.resources.strain.value;
  const held = sys.maintained.filter(m => m.id !== spell.id).length;
  const maxLayers = Math.max(0, 3 - held);
  const sats = sys.resources.sats;

  const extraHtml = `
    <div class="dlg-attack">
      <div class="atk-info">
        <div>Poziom ${s.level} · koszt ${esc(COST_LABELS[s.cost] ?? s.cost)}${s.maintained ? " · podtrzymywane" : ""}${s.targeted ? " · celowane" : ""}</div>
        ${held ? `<div>Podtrzymujesz ${held} ${held === 1 ? "zaklęcie" : "zaklęcia"}: koszt ×${2 ** held}</div>` : ""}
        <div class="spell-cost"></div>
      </div>
      <label class="atk-row">Overglow <select name="layers">${Array.from({ length: maxLayers + 1 }, (_, i) =>
        `<option value="${i}">${i ? `${i} ${i === 1 ? "warstwa" : "warstwy"} — efekty ×${2 ** i}` : "bez overglow"}</option>`).join("")}</select></label>
      ${s.satsCost ? `<label class="atk-row atk-check"><input type="checkbox" name="sats"><span>SATS</span><small class="sats-cost"></small></label>` : ""}
    </div>`;

  const calc = form => {
    const layers = Number(form.elements.layers?.value) || 0;
    const cost = castCost(s.cost, layers, held);
    const deficit = Math.max(0, cost - pool);
    const satsAp = s.satsCost * (layers === 1 ? 3 : 1);
    return { layers, cost, deficit, satsAp, satsOk: layers <= 1 && sats.value >= satsAp };
  };
  const readExtra = form => {
    const c = calc(form);
    const satsOn = !!form.elements.sats?.checked && c.satsOk;
    const notes = [];
    if (c.layers) notes.push(`Overglow ×${2 ** c.layers}`);
    if (c.deficit) notes.push(`Brak strain: ${c.deficit} pkt ponad zero (−${c.deficit} kroki, ryzyko wypalenia)`);
    if (satsOn) notes.push(`SATS −${c.satsAp} AP`);
    return { steps: -c.deficit, mod: 0, notes, data: { ...c, sats: satsOn } };
  };
  const onRender = (form, update) => {
    const sync = () => {
      const c = calc(form);
      const el = form.querySelector(".spell-cost");
      if (el) el.innerHTML = `Koszt: <b>${c.cost} strain</b> (masz ${pool})${c.deficit ? ` — <span class="warn">brakuje ${c.deficit}: rzut o ${c.deficit} kroki trudniejszy, porażka = wypalenie</span>` : ""}`;
      const box = form.elements.sats;
      if (box) {
        box.disabled = !c.satsOk;
        if (!c.satsOk) box.checked = false;
        form.querySelector(".sats-cost").textContent = c.layers > 1 ? "przy 2+ warstwach nie da się w SATS (2 akcje)"
          : `−${c.satsAp} AP${c.layers === 1 ? " (overglow ×3)" : ""} · masz ${sats.value}`;
      }
    };
    form.elements.layers?.addEventListener("change", () => { sync(); update(); });
    sync();
  };

  const rc = rollContext(actor, { kind: "skill", skill: "magic", skillAttr: magic.attr }, { manualMod: magic.mod });
  const r = await promptMfd(`Zaklęcie: ${spell.name}`, magic.tn, rc, { extraHtml, readExtra, onRender });
  if (!r) return null;
  const { extra: ex = {}, ...roll } = r;

  if (ex.sats) await actor.update({ "system.resources.sats.value": actor.system.resources.sats.value - ex.satsAp });
  await spendActions(actor, ex.layers > 1 ? 2 : 1, "zaklęcie");

  const msg = await rollTest(actor, { label: `Zaklęcie: ${spell.name} (Magic)`, baseTn: magic.tn, ...roll });
  const test = msg?.getFlag?.(F, "test") ?? msg?.flags?.[F]?.test ?? {};
  const total = msg?.rolls?.[0]?.total ?? 100;
  const res = test.result ?? "fail";
  const passed = res === "success" || res === "crit-success";
  // próg bez kar za brak strain (do rozstrzygnięcia „rzucone, ale wypalenie”)
  const orig = MFD_STEPS[shiftStep(stepIndex(roll.chosen), (roll.steps ?? 0) + ex.deficit)];
  const passedOrig = res !== "crit-fail" && total <= threshold(magic.tn, orig, roll.mod);

  let cast = passed, burnout = false, spent = 0;
  if (ex.deficit) {
    cast = passed || passedOrig;
    burnout = !passed;
    spent = pool;   // pula spada do zera
  } else {
    spent = passed || res === "crit-fail" ? ex.cost : 0;
  }
  const layers = Math.min(3, ex.layers + (res === "crit-success" && cast ? 1 : 0));

  await actor.update({ "system.resources.strain.value": Math.max(0, pool - spent) });
  if (burnout) await actor.setFlag(F, "burnout", true);

  // Procent nauki: +1% za rzucenie; rzut ≤ procent (+5% za warstwę) pozwala nauczyć się zaklęcia z prekursorem
  const notes = [];
  if (cast) {
    const learn = Math.min(95, (s.learn ?? 0) + 1);
    if (spell.isOwner && spell.update) await spell.update({ "system.learn": learn });
    if (s.precursorFor && total <= (s.learn ?? 0) + 5 * ex.layers) notes.push(`Rzut ≤ procent nauki — możesz nauczyć się jednego z: ${s.precursorFor}`);
  }
  if (cast && s.maintained) {
    const list = sys.maintained.filter(m => m.id !== spell.id).concat({ id: spell.id, name: spell.name, cost: s.cost, layers });
    await actor.setFlag(F, "maintained", list);
    notes.push(`Podtrzymywane: na początku każdej rundy ${s.cost + layers} strain`);
  }
  if (res === "crit-success" && cast && ex.layers < 3) notes.push("Krytyk: darmowa dodatkowa warstwa overglow");

  const outcome = burnout ? (cast ? "Rzucone — WYPALENIE" : "Nie wyszło — WYPALENIE") : cast ? "Zaklęcie rzucone" : res === "crit-fail" ? "Nie wyszło (strain stracony)" : "Nie wyszło";
  const buttons = cast && s.damage
    ? s.targeted
      ? `<button type="button" class="foe-luck" data-action="foeSpellAim"><i class="fa-solid fa-crosshairs"></i> Wyceluj (Magic)</button>`
      : `<button type="button" class="foe-luck" data-action="foeSpellDamage"><i class="fa-solid fa-burst"></i> Rzuć obrażenia</button>`
    : "";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
    <div class="foe-card spell ${cast ? "success" : "fail"}">
      <div class="fc-tag"><span>PIPBUCK // MAGIA</span><span>${layers ? `overglow ${layers}` : `poziom ${s.level}`}</span></div>
      <h3>${esc(spell.name)}</h3>
      <div class="fc-calc">${outcome}</div>
      <div class="fc-meta">Strain: −${spent} → ${Math.max(0, pool - spent)}/${sys.strainMax}${s.damage ? ` · obrażenia ${esc(s.damage)}${layers ? ` ×${2 ** layers}` : ""}` : ""}</div>
      ${burnout ? `<div class="fc-special"><span>Wypalenie: bez magii 1d4 tygodnie (szybciej z pomocą innych jednorożców)</span></div>` : ""}
      ${notes.map(n => `<div class="fc-meta">${esc(n)}</div>`).join("")}
      ${buttons}
    </div>`,
    flags: { [F]: { spell: { actorUuid: actor.uuid, spellUuid: spell.uuid, layers } } }
  });
}

/** Zaklęcie jako broń dla okna celowania. */
function aimItem(spell) {
  const s = spell.system;
  return {
    name: spell.name, uuid: spell.uuid, type: "spell", isOwner: true,
    system: { skill: "magic", damage: s.damage, shots: 1, satsCost: 0, ammo: { value: 0, max: 0 }, rangeInc: 20, range: "20 ft",
      crit: s.crit || "x1", ignoreDT: s.ignoreDT || 0, weight: 0, specials: {}, aoe: { enabled: false }, consumable: false },
    update: async () => null
  };
}

/** Na początku każdej rundy: koszt podtrzymywanych zaklęć; brak strain = zaklęcie gaśnie. */
export async function maintainTick(actor) {
  const list = actor.system.maintained ?? [];
  if (!list.length) return;
  let pool = actor.system.resources.strain.value;
  const kept = [], dropped = [];
  for (const m of list) {
    const c = (m.cost || 0) + (m.layers || 0);
    if (pool >= c) { pool -= c; kept.push(m); } else dropped.push(m);
  }
  await actor.update({ "system.resources.strain.value": pool });
  await actor.setFlag(F, "maintained", kept);
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // PODTRZYMANIE</span><span>${esc(actor.name)}</span></div>
      <div class="fc-meta">${kept.length ? `Podtrzymane: ${kept.map(m => esc(m.name)).join(", ")} · strain ${pool}/${actor.system.strainMax}` : ""}</div>
      ${dropped.length ? `<div class="fc-special"><span>Zgasło (brak strain): ${dropped.map(m => esc(m.name)).join(", ")}</span></div>` : ""}</div>`
  });
}

export async function endMaintained(actor, id) {
  await actor.setFlag(F, "maintained", (actor.system.maintained ?? []).filter(m => m.id !== id));
}

/** Startowe zaklęcia (s. 245): każdy jednorożec — Telekineza; alikorny z Unity — ich lista. */
export async function grantStartingSpells(actor, raceKey = "") {
  if (actor.system.zebraMage && !actor.items.some(i => i.type === "spell")) {
    const n = Math.min(5, Math.floor((actor.system.skills.magic?.rank ?? 0) / 10));
    if (n) ui.notifications.info(`${actor.name}: wybierz w katalogu (zakładka Magia → Receptury zebr) ${n} receptur poziomu 0–1.`);
  }
  if (!actor.system.caster || actor.items.some(i => i.type === "spell")) return;
  let list;
  try { list = await loadSpells(); } catch { return; }
  const names = ["Telekinesis"];
  if (/alicornUnity|alicornPost/.test(raceKey)) names.push("Access Memory", "Magical Arrow", "Mighty Telekinesis I", "Telepathy II", "Teleportation II");
  const items = names.map(n => list.find(e => e.name === n)).filter(Boolean).map(spellItemData);
  if (!items.length) return;
  await actor.createEmbeddedDocuments("Item", items);
  ui.notifications.info(`${actor.name}: dodano ${items.map(i => i.name).join(", ")}. Wybierz w katalogu (zakładka Magia) jedno zaklęcie poziomu 1 — i ewentualnie zaklęcie znaczka.`);
}

export function registerMagicHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const data = message.getFlag(F, "spell");
    if (!data) return;
    const get = async () => {
      const actor = await fromUuid(data.actorUuid);
      const spell = await fromUuid(data.spellUuid);
      if (!actor?.isOwner || !spell) { ui.notifications.warn("Nie jesteś właścicielem tej postaci."); return null; }
      return { actor, spell };
    };
    html.querySelector("[data-action=foeSpellAim]")?.addEventListener("click", async ev => {
      ev.preventDefault();
      const g = await get();
      if (g) await attackWithWeapon(g.actor, aimItem(g.spell), { spell: { layers: data.layers } });
    });
    html.querySelector("[data-action=foeSpellDamage]")?.addEventListener("click", async ev => {
      ev.preventDefault();
      const g = await get();
      if (g) await rollDamage(g.actor, g.spell, { attack: { overglow: data.layers, targets: [...game.user.targets].map(t => t.document?.uuid).filter(Boolean) } });
    });
  });

  // Początek nowej rundy: zapłata za podtrzymywane zaklęcia (liczy jeden aktywny MG)
  Hooks.on("updateCombat", async (combat, changed, options) => {
    if (!("round" in changed) || !game.users.activeGM?.isSelf) return;
    const forward = options?.direction ? options.direction > 0 : changed.round > (combat.previous?.round ?? changed.round);
    if (!forward || changed.round < 2) return;
    const seen = new Set();
    for (const c of combat.combatants) {
      const a = c.actor;
      if (!a || seen.has(a.uuid)) continue;
      seen.add(a.uuid);
      try { await maintainTick(a); } catch (err) { console.error("foe-rpg | podtrzymanie zaklęć", err); }
    }
  });
}
