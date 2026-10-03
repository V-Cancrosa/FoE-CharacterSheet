/**
 * Magia zebr: alchemia, rytuały, talizmany (podręcznik s. 327–332).
 *   - receptury zamiast strain: każde przygotowanie zużywa 1d4+1 składników danej rzadkości (−1 za każde 25 rang Magic, min. 1),
 *   - zamienniki: wyższa rzadkość zastępuje niższą 1:1, cztery składniki o stopień niższe zastępują jeden,
 *   - przygotowanie: mikstury (pić / rzucać / smarować) 5d12 min, talizmany 15 × (poziom)k4 min, zadania rytualne 15d20 min,
 *   - rytuały („Cast”) rzuca się w walce: składniki + rzut Magic, 1 akcja / 40 AP w SATS,
 *   - wyroby w walce: wypicie 15 AP, rzut 35 AP (przedział zasięgu 10 ft, Magic albo Explosives), posmarowanie 25 AP,
 *   - szukanie składników: Survival albo Magic, MFD wg terenu, każdy stopień rzadkości o krok trudniej, 30 min za stopień.
 */
import { MFD_STEPS } from "./data.mjs";
import { rollContext } from "./effects.mjs";
import { promptMfd, rollTest, threshold, stepIndex } from "./rolls.mjs";
import { attackWithWeapon } from "./attack.mjs";
import { spendActions } from "./tracker.mjs";

const F = "foe-rpg";
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

export const RARITY = { 1: "niska", 2: "średnia", 3: "wysoka", 4: "bardzo wysoka" };
export const MODES = {
  Drink: { short: "Wywar", label: "Wywar do picia", ap: 15, category: "potion" },
  Throw: { short: "Do rzucania", label: "Mikstura do rzucania", ap: 35, category: "potion" },
  Apply: { short: "Do smarowania", label: "Do posmarowania / nałożenia", ap: 25, category: "potion" },
  Worn: { short: "Talizman", label: "Talizman / fetysz (noszony)", ap: 0, category: "talisman" },
  Cast: { short: "Rytuał", label: "Rytuał (rzucany)", ap: 40, category: null },
  Task: { short: "Zadanie", label: "Zadanie rytualne (poza walką)", ap: 0, category: "potion" }
};

/** Teren → MFD szukania składników o niskiej rzadkości (tabela XXV). */
export const AREAS = {
  "Wybrzeże / plaża": "1", "Pustynia": "1/2", "Doki / magazyny": "3/4", "Las Everfree": "2", "Fabryka": "1", "Las": "2",
  "Odosobniony budynek": "1", "Duża osada": "3/4", "Obiekt wojskowy": "1", "Góry": "1", "Biurowiec": "1.5",
  "Stare pole bitwy": "1.5", "Wąwóz / dolina": "1.5", "Laboratorium": "1", "Mała osada": "1/2", "Ruiny miasteczka": "1.5",
  "Stajnia (Stable)": "1/2", "Centrum handlowe": "1", "Ruiny przedmieść": "1", "Bocznica kolejowa": "3/4", "Tunele / kanały": "1.5",
  "Ruiny miasta": "3/4", "Pustkowie — zarośla": "1.5", "Pustkowie — badlands": "1", "Pustkowie — przy drogach": "1",
  "Pustkowie — na uboczu": "1.5", "Pustkowie — tundra": "3/4"
};

let cache = null;
export function loadRecipes() {
  cache ??= fetch(`systems/${game.system.id}/data/recipes.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(err => { cache = null; throw err; });
  return cache;
}

/** Sposoby użycia z pola „Usage” (np. „Apply, Drink, Throw”). */
export function modesOf(usage) {
  const u = String(usage ?? "");
  const out = [];
  if (/drink/i.test(u)) out.push("Drink");
  if (/throw/i.test(u)) out.push("Throw");
  if (/apply|integrate/i.test(u)) out.push("Apply");
  if (/worn|wield/i.test(u)) out.push("Worn");
  if (/cast/i.test(u)) out.push("Cast");
  if (!out.length || /^\s*--/.test(u)) out.push("Task");
  return [...new Set(out)];
}

export function recipeItemData(e) {
  return {
    name: e.name, type: "spell", img: "systems/foe-rpg/icons/recipe.svg",
    system: {
      tradition: "zebra", level: e.level, usage: e.usage, rarity: e.rarity || 1, special: e.special || "", school: e.school || "",
      levelReq: e.levelReq || 0, damage: e.damage || "", cost: 0, learn: 0,
      description: `<p>${esc(e.desc)}</p>`
    },
    flags: { [F]: { catalog: e.name } }
  };
}

/** Ile składników zużywa jedno przygotowanie: 1d4+1 − (ranga Magic / 25), min. 1. */
export async function ingredientCount(actor) {
  const r = await new Roll("1d4 + 1").evaluate();
  const less = Math.floor((actor.system.skills.magic?.rank ?? 0) / 25);
  return { roll: r, n: Math.max(1, r.total - less), less };
}

export function ingredientStock(actor) {
  const stock = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const i of actor.items) if (i.type === "gear" && i.system.category === "ingredient" && i.system.rarity) stock[i.system.rarity] += Math.max(0, i.system.qty || 0);
  return stock;
}

/**
 * Plan zapłaty składnikami: najpierw ta sama rzadkość, potem wyższe 1:1, potem o stopień niższe 4:1.
 * Zwraca { ok, use: {rarity: n}, short } (short — ile brakuje).
 */
export function planIngredients(stock, rarity, n) {
  const left = { ...stock };
  const use = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let need = n;
  const take = (r, k) => { const t = Math.min(left[r], k); left[r] -= t; use[r] += t; return t; };
  need -= take(rarity, need);
  for (let r = rarity + 1; r <= 4 && need > 0; r++) need -= take(r, need);
  if (need > 0 && rarity > 1) {
    const can = Math.min(need, Math.floor(left[rarity - 1] / 4));
    take(rarity - 1, can * 4);
    need -= can;
  }
  return { ok: need <= 0, use, short: Math.max(0, need) };
}

const usedText = use => Object.entries(use).filter(([, n]) => n).map(([r, n]) => `${n} × ${RARITY[r]}`).join(", ");

async function payIngredients(actor, use) {
  const updates = [];
  for (const [r, n] of Object.entries(use)) {
    let k = n;
    for (const i of actor.items.filter(x => x.type === "gear" && x.system.category === "ingredient" && x.system.rarity === Number(r))) {
      if (!k) break;
      const t = Math.min(k, i.system.qty || 0);
      if (t) { updates.push({ _id: i.id, "system.qty": i.system.qty - t }); k -= t; }
    }
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}

async function addStack(actor, data, qty) {
  const same = actor.items.find(i => i.type === "gear" && i.name === data.name && i.system.category === data.system.category);
  if (same) return same.update({ "system.qty": (same.system.qty || 0) + qty });
  data.system.qty = qty;
  return actor.createEmbeddedDocuments("Item", [data]);
}

/** Zbiera składniki w zależności od tego, czego wymaga receptura; zwraca opis albo null (brak). */
async function spendFor(actor, recipe) {
  const s = recipe.system;
  const { roll, n, less } = await ingredientCount(actor);
  const plan = planIngredients(ingredientStock(actor), s.rarity || 1, n);
  if (!plan.ok) {
    warn(`${recipe.name}: potrzeba ${n} składników (${RARITY[s.rarity]}) — brakuje ${plan.short}. Szukaj składników albo dodaj je w Ekwipunku.`);
    return null;
  }
  await payIngredients(actor, plan.use);
  return { n, text: `1d4+1 = ${roll.total}${less ? ` − ${less} (Magic)` : ""} → ${n} skł.: ${usedText(plan.use)}`, roll };
}

/** Przygotowanie wyrobu (mikstura, talizman, zadanie rytualne). */
export async function prepareRecipe(actor, recipe, mode) {
  const s = recipe.system;
  const m = MODES[mode] ?? MODES.Drink;
  const paid = await spendFor(actor, recipe);
  if (!paid) return null;
  const lvl = Math.max(1, s.level || 0);
  const timeF = mode === "Worn" ? (s.level ? `15 * ${lvl}d4` : "15") : mode === "Task" ? "15d20" : "5d12";
  const t = await new Roll(timeF).evaluate();
  if (m.category) {
    await addStack(actor, {
      name: recipe.name, type: "gear", img: m.category === "talisman" ? "systems/foe-rpg/icons/talisman.svg" : "systems/foe-rpg/icons/potion.svg",
      system: { category: m.category, usage: mode, damage: mode === "Throw" ? s.damage || "" : "", weight: 0, value: 0, description: s.description },
      flags: { [F]: { recipe: recipe.name } }
    }, 1);
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [paid.roll, t],
    content: `
    <div class="foe-card spell success">
      <div class="fc-tag"><span>PIPBUCK // ALCHEMIA</span><span>${esc(m.label)}</span></div>
      <h3>${esc(recipe.name)}</h3>
      <div class="fc-calc">Przygotowano</div>
      <div class="fc-meta">${esc(paid.text)}</div>
      <div class="fc-meta">Czas: ${esc(timeF)} = ${t.total} min${s.special ? ` · składnik specjalny: ${esc(s.special)}` : ""}</div>
      ${m.category ? `<div class="fc-meta">Wyrób trafił do Ekwipunku (${m.category === "talisman" ? "Talizmany i fetysze" : "Mikstury i wywary zebr"}).</div>` : ""}
    </div>`
  });
}

/** Rytuał w walce: składniki, 1 akcja (40 AP w SATS), rzut Magic. */
export async function castRitual(actor, recipe) {
  const s = recipe.system;
  const magic = actor.system.skills.magic;
  if (!magic || magic.known === false) return warn(`${actor.name} nie zna magii zebr.`);
  const sats = actor.system.resources.sats;
  const extraHtml = `<div class="dlg-attack"><div class="atk-info"><div>Rytuał · składniki: ${RARITY[s.rarity]}${s.special ? ` + ${esc(s.special)}` : ""}</div></div>
    <label class="atk-row atk-check"><input type="checkbox" name="sats" ${sats.value >= 40 ? "" : "disabled"}><span>SATS</span><small>−40 AP (masz ${sats.value})</small></label></div>`;
  const rc = rollContext(actor, { kind: "skill", skill: "magic", skillAttr: magic.attr }, { manualMod: magic.mod });
  const r = await promptMfd(`Rytuał: ${recipe.name}`, magic.tn, rc, {
    extraHtml, readExtra: f => ({ steps: 0, mod: 0, notes: f.elements.sats?.checked ? ["SATS −40 AP"] : [], data: { sats: !!f.elements.sats?.checked } })
  });
  if (!r) return null;
  const { extra: ex = {}, ...roll } = r;
  const paid = await spendFor(actor, recipe);
  if (!paid) return null;
  if (ex.sats) await actor.update({ "system.resources.sats.value": actor.system.resources.sats.value - 40 });
  await spendActions(actor, 1, "rytuał");
  const msg = await rollTest(actor, { label: `Rytuał: ${recipe.name} (Magic)`, baseTn: magic.tn, ...roll });
  const res = msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
  const ok = res === "success" || res === "crit-success";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
    <div class="foe-card spell ${ok ? "success" : "fail"}">
      <div class="fc-tag"><span>PIPBUCK // RYTUAŁ</span><span>poziom ${s.level}</span></div>
      <h3>${esc(recipe.name)}</h3>
      <div class="fc-calc">${ok ? "Rytuał działa" : "Rytuał nie wyszedł"}</div>
      <div class="fc-meta">${esc(paid.text)}</div>
      ${ok && s.damage ? `<button type="button" class="foe-luck" data-action="foeSpellDamage"><i class="fa-solid fa-burst"></i> Rzuć obrażenia</button>` : ""}
    </div>`,
    flags: { [F]: { spell: { actorUuid: actor.uuid, spellUuid: recipe.uuid, layers: 0 } } }
  });
}

/** Użycie wyrobu: wypić, posmarować, założyć albo rzucić (jak granat). */
export async function useProduct(actor, item) {
  if (item.type !== "gear") return warn(`${item.name}: to receptura — najpierw przygotuj wyrób.`);
  const mode = item.system.usage || "Drink";
  const m = MODES[mode] ?? MODES.Drink;
  if ((item.system.qty || 0) < 1) return warn(`${item.name}: nie masz już ani jednej sztuki.`);
  if (mode === "Throw") {
    const sk = actor.system.skills;
    const skill = (sk.magic?.known !== false ? sk.magic.tn : 0) >= sk.explosives.tn ? "magic" : "explosives";
    const pseudo = {
      name: item.name, uuid: item.uuid, type: "gear", isOwner: true,
      system: { skill, damage: item.system.damage || "0", shots: 1, satsCost: m.ap, ammo: { value: 0, max: 0 }, rangeInc: 10, range: "10 ft",
        crit: "x1", ignoreDT: 0, weight: 0, specials: {}, aoe: { enabled: false }, consumable: false },
      update: async () => null
    };
    const msg = await attackWithWeapon(actor, pseudo);
    if (msg) await item.update({ "system.qty": item.system.qty - 1 });
    return msg;
  }
  if (mode === "Worn") {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // TALIZMAN</span><span>1 akcja</span></div><h3>${esc(item.name)}</h3><div class="fc-meta">Działa po pełnej rundzie noszenia. Opis efektu — w przedmiocie.</div></div>` });
  }
  const left = item.system.qty - 1;
  await spendActions(actor, 1, m.label.toLowerCase());
  await item.update({ "system.qty": left });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${mode === "Drink" ? "WYPITO" : "NAŁOŻONO"}</span><span>${m.ap} AP w SATS</span></div>
      <h3>${esc(item.name)}</h3><div class="fc-meta">Zostało: ${left}</div>${item.system.description || ""}</div>`
  });
}

/** Szukanie składników: Survival albo Magic, MFD wg terenu, każdy stopień rzadkości o krok trudniej. */
export async function searchIngredients(actor) {
  const sk = actor.system.skills;
  const content = `
    <div class="foe-dialog">
      <label class="atk-row">Teren <select name="area">${Object.entries(AREAS).map(([k, v]) => `<option value="${v}">${k} (MFD ${v.replace(".", ",")})</option>`).join("")}</select></label>
      <label class="atk-row">Rzadkość <select name="rarity">${Object.entries(RARITY).map(([k, v]) => `<option value="${k}">${v}${k > 1 ? ` (−${k - 1} kr., +${(k - 1) * 30} min)` : ""}</option>`).join("")}</select></label>
      <label class="atk-row">Umiejętność <select name="skill"><option value="survival">Survival (${sk.survival.tn})</option>${sk.magic?.known !== false ? `<option value="magic">Magic (${sk.magic.tn})</option>` : ""}</select></label>
      <p class="hint">Szukanie trwa co najmniej 30 minut (+30 za każdy stopień rzadkości). Sukces daje 1d4 składników — ostateczną liczbę ustala MG.</p>
    </div>`;
  const pick = await DialogV2.wait({
    window: { title: "Szukanie składników" }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, content, rejectClose: false,
    buttons: [{ action: "go", label: "Szukaj", icon: "fa-solid fa-magnifying-glass", default: true,
      callback: (ev, btn) => ({ area: btn.form.elements.area.value, rarity: Number(btn.form.elements.rarity.value), skill: btn.form.elements.skill.value }) }]
  });
  if (!pick) return null;
  const s = sk[pick.skill];
  const idx = Math.min(MFD_STEPS.length - 1, stepIndex(pick.area) + (pick.rarity - 1));
  const msg = await rollTest(actor, { label: `Szukanie składników (${RARITY[pick.rarity]})`, baseTn: s.tn, step: MFD_STEPS[idx].key, mod: s.rollMod ?? 0, notes: [] });
  const res = msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
  if (res !== "success" && res !== "crit-success") return ui.notifications.info(`${actor.name}: nic nie znaleziono (${pick.rarity * 30} min).`);
  const r = await new Roll("1d4").evaluate();
  await addStack(actor, {
    name: `Składniki: ${RARITY[pick.rarity]}`, type: "gear", img: "systems/foe-rpg/icons/ingredient.svg",
    system: { category: "ingredient", rarity: pick.rarity, weight: 0, value: 0, description: "<p>Drobne składniki zebrzej alchemii (zamiennik 4:1 o stopień wyżej, wyższa rzadkość zastępuje niższą 1:1).</p>" }
  }, r.total);
  ui.notifications.info(`${actor.name}: znaleziono ${r.total} składników (${RARITY[pick.rarity]}).`);
  return msg;
}

/** Ile receptur zna zebra na start: ranga Magic / 10 (maks. 5), poziom 0–1 (s. 327). */
export const startingRecipes = actor => Math.min(5, Math.floor((actor.system.skills.magic?.rank ?? 0) / 10));
