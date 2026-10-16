/**
 * Cybernetyka w grze: montaż implantów i protez, zasilanie klejnotami, samonaprawa talizmanem,
 * wewnętrzny magazyn energii. Zasady: cyber-data.mjs.
 */
import { LOCATIONS, ATTRS } from "./data.mjs";
import { cyberItemData, cyberWarnings, cyberItems, powerState, feedUntil, gemHours, isGem, isScrap, planRegen, LEG_LOCS } from "./cyber-data.mjs";
import { energyCost } from "./saddle.mjs";
import { t, tdata } from "./i18n.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const now = () => game.time?.worldTime ?? 0;
const card = (actor, tag, title, body) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>${t("cybernetics")}</span></div><h3>${esc(title)}</h3>${body}</div>`
});

/** Montaż implantu albo protezy z katalogu: wybór nogi / atrybutu, ostrzeżenia, opcjonalnie nowa kończyna zamiast utraconej. */
export async function installCyber(actor, e) {
  if (!actor.isOwner) return warn(t("You don't own this character."));
  const needLoc = e.slot === "leg";
  const needAttr = e.slot === "attr";
  const where = needLoc ? null : e.slot && e.slot !== "attr" ? e.slot : null;
  const lostAt = l => (actor.system.locations?.[l]?.wounds ?? 0) > 0;
  const pre = cyberWarnings(actor, e, {});
  const content = `<div class="foe-dialog">
    <div class="atk-info"><div>${esc(tdata(e, "desc"))}</div></div>
    ${needLoc ? `<label class="atk-row">${t("Leg")} <select name="loc">${LEG_LOCS.map(l => `<option value="${l}">${LOCATIONS[l]}${lostAt(l) ? ` ${t("(wounds: {n})", { n: actor.system.locations[l].wounds })}` : ""}</option>`).join("")}</select></label>` : ""}
    ${needAttr ? `<label class="atk-row">${t("Attribute")} <select name="attr">${Object.entries(ATTRS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>` : ""}
    ${e.kind === "limb" ? `<label class="atk-row atk-check"><input type="checkbox" name="fresh"><span>${t("Replaces a lost or crippled limb")}</span><small>${t("wounds on this location disappear (a new part)")}</small></label>` : ""}
    ${pre.filter(x => x !== t("choose an attribute") && x !== t("choose a leg")).map(x => `<p class="hint warn">${esc(x)}</p>`).join("")}
    <p class="hint">${t("Rulebook: implants are installed by a doctor or an Auto-Doc (usually for a fee) — the GM decides what is available.")}</p></div>`;
  const pick = await DialogV2.wait({
    window: { title: t("Installation: {name}", { name: tdata(e, "name") }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false, content,
    buttons: [{ action: "ok", label: t("Install"), icon: "fa-solid fa-microchip", default: true, callback: (ev, btn) => ({
      loc: btn.form.elements.loc?.value ?? "", attr: btn.form.elements.attr?.value ?? "", fresh: !!btn.form.elements.fresh?.checked
    }) }]
  });
  if (!pick) return null;
  const warns = cyberWarnings(actor, e, pick);
  const data = cyberItemData(e, pick);
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  const loc = data.system.cyber.loc || where;
  if (pick.fresh && loc && actor.system.locations?.[loc]) {
    await actor.update({ [`system.locations.${loc}.wounds`]: 0, [`system.locations.${loc}.crippled`]: false });
  }
  ui.notifications[warns.length ? "warn" : "info"](warns.length ? t("{name}: installed {item} (note: {w}).", { name: actor.name, item: data.name, w: warns.join("; ") }) : t("{name}: installed {item}.", { name: actor.name, item: data.name }));
  return item;
}

/** Zasilanie: zjedzenie klejnotu z ekwipunku przedłuża pracę cybernetyki (godziny ÷ liczba kończyn). */
export async function feedCyber(actor) {
  const gems = actor.items.filter(i => isGem(i) && (i.system.qty || 0) > 0);
  if (!gems.length) return warn(t("No gems in the inventory (Gem: Small / Medium / Large, Crushed Gemstone Dust, Cyberpony Cakes — catalog, Gear → Miscellaneous)."));
  const st = powerState(actor, now(), true);
  const units = st.units || 1;
  const pick = await DialogV2.wait({
    window: { title: t("Power: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <div class="atk-info"><div>${st.units === 1 ? t("Cybernetics uses {n} unit (limb 1, torso 2, implant ¼).", { n: `<b>${st.units}</b>` }) : t("Cybernetics uses {n} units (limb 1, torso 2, implant ¼).", { n: `<b>${st.units}</b>` })}${st.until > now() ? ` ${t("Power left for {n} h.", { n: st.hoursLeft })}` : ""}</div></div>
      <label class="atk-row">${t("Gem")} <select name="gem">${gems.map(g => `<option value="${g.id}">${esc(g.name)} ×${g.system.qty} — ${Math.round((gemHours(g.name) / units) * 10) / 10} h</option>`).join("")}</select></label>
      <p class="hint">${t("The rulebook values are for one cyberlimb; with several limbs a gem lasts proportionally shorter (p. 178).")}</p></div>`,
    buttons: [{ action: "ok", label: t("Eat"), icon: "fa-solid fa-gem", default: true, callback: (ev, btn) => btn.form.elements.gem.value }]
  });
  const gem = pick ? actor.items.get(pick) : null;
  if (!gem) return null;
  const until = feedUntil(st, gemHours(gem.name), now());
  await gem.update({ "system.qty": gem.system.qty - 1 });
  await actor.setFlag(F, "cyberPower", { until });
  const hours = Math.round(((until - now()) / 3600) * 10) / 10;
  return card(actor, t("POWER"), actor.name, `<div class="fc-calc">${esc(gem.name)} → ${t("power for {h}", { h: `<b>${hours} h</b>` })} (${st.units} ${t("units")})</div>`);
}

/** Samonaprawa: talizman naprawczy (złom) i Phoenix Monocyte Breeder po upływie podanego czasu. */
export async function selfRepair(actor, { seconds = null, silent = false } = {}) {
  if (seconds === null) {
    const m = await DialogV2.wait({
      window: { title: t("Self-repair: {name}", { name: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
      content: `<div class="foe-dialog"><label class="atk-row">${t("How many minutes of rest")} <input type="number" name="min" value="60" min="15" step="15"></label>
        <p class="hint">${t("Repair talisman: 1 wound per 15 minutes on the cyberlimb's location, for 1 scrap (Scrap Metal / Electronics). Phoenix Monocyte Breeder: 1 wound per hour. When the GM advances game time, the same happens automatically.")}</p></div>`,
      buttons: [{ action: "ok", label: t("btn|Repair"), icon: "fa-solid fa-screwdriver-wrench", default: true, callback: (ev, btn) => Number(btn.form.elements.min.value) || 0 }]
    });
    if (!m) return null;
    seconds = m * 60;
  }
  const scrapItems = actor.items.filter(i => isScrap(i) && (i.system.qty || 0) > 0);
  const scrap = scrapItems.reduce((sum, i) => sum + (i.system.qty || 0), 0);
  const carry = actor.getFlag(F, "cyberRegen") ?? {};
  const plan = planRegen(actor, seconds, carry, scrap);
  const upd = Object.fromEntries(Object.entries(plan.wounds).map(([k, v]) => [`system.locations.${k}.wounds`, v]));
  if (Object.keys(upd).length) await actor.update(upd);
  let left = plan.scrapUsed;
  for (const it of scrapItems) {
    if (!left) break;
    const take = Math.min(left, it.system.qty);
    await it.update({ "system.qty": it.system.qty - take });
    left -= take;
  }
  await actor.setFlag(F, "cyberRegen", plan.carry);
  if (!plan.notes.length) {
    if (!silent) ui.notifications.info(scrap ? t("{name}: nothing was repaired.", { name: actor.name }) : t("{name}: nothing was repaired (no scrap for the talisman).", { name: actor.name }));
    return null;
  }
  return card(actor, t("SELF-REPAIR"), actor.name, `<div class="fc-meta">${plan.notes.map(esc).join(" · ")}</div>`);
}

/** Wewnętrzny magazyn energii: przelewa ogniwa z ekwipunku do implantu (ogniwo 2 pkt, MFC 4, gem cell 1). */
export async function chargeReservoir(actor, implant) {
  const cap = implant.system.cyber.capacity;
  const have = implant.system.cyber.charges;
  if (have >= cap) return ui.notifications.info(t("{name}: reservoir full ({v}/{max}).", { name: implant.name, v: have, max: cap }));
  const cells = actor.items.filter(i => i.type === "gear" && i.system.category === "ammo" && (i.system.qty || 0) > 0 && energyCost(i.system.ammoType || i.name));
  if (!cells.length) return warn(t("No energy cells in the inventory (Energy Cells, Microfusion Cells, Gem Cells)."));
  const pick = await DialogV2.wait({
    window: { title: t("Charging: {name}", { name: implant.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog"><div class="atk-info"><div>${t("Reservoir: {v} pts", { v: `<b>${have}/${cap}</b>` })}</div></div>
      <label class="atk-row">${t("Cells")} <select name="cell">${cells.map(c => `<option value="${c.id}">${esc(c.name)} ×${c.system.qty} ${t("({n} pts each)", { n: energyCost(c.system.ammoType || c.name) })}</option>`).join("")}</select></label></div>`,
    buttons: [{ action: "ok", label: t("Transfer"), icon: "fa-solid fa-bolt", default: true, callback: (ev, btn) => btn.form.elements.cell.value }]
  });
  const cell = pick ? actor.items.get(pick) : null;
  if (!cell) return null;
  const per = energyCost(cell.system.ammoType || cell.name);
  const n = Math.min(cell.system.qty, Math.floor((cap - have) / per));
  if (n <= 0) return warn(t("Not enough room in the reservoir for even one cell of this type."));
  await cell.update({ "system.qty": cell.system.qty - n });
  await implant.update({ "system.cyber.charges": have + n * per });
  ui.notifications.info(t("{name}: +{p} pts ({n} × {cell}) → {v}/{max}.", { name: implant.name, p: n * per, n, cell: cell.name, v: have + n * per, max: cap }));
  return true;
}

/** Magazyn energii implantu jako rezerwa przy przeładowaniu broni energetycznej (attack.mjs → reloadWeapon). */
export function implantReserve(actor, ammoType) {
  const per = energyCost(ammoType);
  if (!per) return null;
  const st = powerState(actor);
  const it = cyberItems(actor).find(i => i.system.active !== false && (i.system.cyber?.capacity || 0) > 0 && (i.system.cyber?.charges || 0) >= per);
  if (!it) return null;
  return { kind: "implant", item: it, per, rounds: Math.floor(it.system.cyber.charges / per), pts: it.system.cyber.charges, cap: it.system.cyber.capacity, field: "system.cyber.charges", powered: st.powered };
}

export function registerCyberSettings() {
  game.settings.register(F, "cyberPower", {
    name: "Powering cybernetics with gems",
    hint: "Rulebook rule (p. 105, 178): cyberlimbs and implants must be “fed” gems like food. On — without power implants don't work and cyberlimbs act as crippled. Off — eating gems counts nothing (like ordinary food).",
    scope: "world", config: true, type: Boolean, default: false
  });
}

export function registerCyberHooks() {
  // samonaprawa i regeneracja, gdy MG przesuwa czas gry (liczy jeden aktywny MG)
  Hooks.on("updateWorldTime", async (worldTime, delta) => {
    if (!game.users.activeGM?.isSelf || !(delta > 0)) return;
    for (const actor of game.actors) {
      const items = cyberItems(actor);
      if (!items.some(i => i.system.cyber?.talisman || i.system.cyber?.regen)) continue;
      if (!Object.values(actor.system.locations ?? {}).some(L => L.wounds > 0)) continue;
      try { await selfRepair(actor, { seconds: delta, silent: true }); } catch (err) { console.error("foe-rpg | self-repair", err); }
    }
  });
}
