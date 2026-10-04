/**
 * Cybernetyka w grze: montaż implantów i protez, zasilanie klejnotami, samonaprawa talizmanem,
 * wewnętrzny magazyn energii. Zasady: cyber-data.mjs.
 */
import { LOCATIONS, ATTRS } from "./data.mjs";
import { cyberItemData, cyberWarnings, cyberItems, powerState, feedUntil, gemHours, isGem, isScrap, planRegen, LEG_LOCS } from "./cyber-data.mjs";
import { energyCost } from "./saddle.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const now = () => game.time?.worldTime ?? 0;
const card = (actor, tag, title, body) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>cybernetyka</span></div><h3>${esc(title)}</h3>${body}</div>`
});

/** Montaż implantu albo protezy z katalogu: wybór nogi / atrybutu, ostrzeżenia, opcjonalnie nowa kończyna zamiast utraconej. */
export async function installCyber(actor, e) {
  if (!actor.isOwner) return warn("Nie jesteś właścicielem tej postaci.");
  const needLoc = e.slot === "leg";
  const needAttr = e.slot === "attr";
  const where = needLoc ? null : e.slot && e.slot !== "attr" ? e.slot : null;
  const lostAt = l => (actor.system.locations?.[l]?.wounds ?? 0) > 0;
  const pre = cyberWarnings(actor, e, {});
  const content = `<div class="foe-dialog">
    <div class="atk-info"><div>${esc(e.desc)}</div></div>
    ${needLoc ? `<label class="atk-row">Noga <select name="loc">${LEG_LOCS.map(l => `<option value="${l}">${LOCATIONS[l]}${lostAt(l) ? ` (rany: ${actor.system.locations[l].wounds})` : ""}</option>`).join("")}</select></label>` : ""}
    ${needAttr ? `<label class="atk-row">Atrybut <select name="attr">${Object.entries(ATTRS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>` : ""}
    ${e.kind === "limb" ? `<label class="atk-row atk-check"><input type="checkbox" name="fresh"><span>Zastępuje utraconą albo okaleczoną kończynę</span><small>rany na tej lokacji znikają (nowa część)</small></label>` : ""}
    ${pre.filter(x => !/wybierz/.test(x)).map(x => `<p class="hint warn">${esc(x)}</p>`).join("")}
    <p class="hint">Podręcznik: implanty wszczepia lekarz albo Auto-Doc (zwykle za opłatą) — MG decyduje, co jest dostępne.</p></div>`;
  const pick = await DialogV2.wait({
    window: { title: `Montaż: ${e.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false, content,
    buttons: [{ action: "ok", label: "Zamontuj", icon: "fa-solid fa-microchip", default: true, callback: (ev, btn) => ({
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
  ui.notifications[warns.length ? "warn" : "info"](`${actor.name}: zamontowano ${data.name}${warns.length ? ` (uwaga: ${warns.join("; ")})` : ""}.`);
  return item;
}

/** Zasilanie: zjedzenie klejnotu z ekwipunku przedłuża pracę cybernetyki (godziny ÷ liczba kończyn). */
export async function feedCyber(actor) {
  const gems = actor.items.filter(i => isGem(i) && (i.system.qty || 0) > 0);
  if (!gems.length) return warn("Brak klejnotów w ekwipunku (Gem: Small / Medium / Large, Crushed Gemstone Dust, Cyberpony Cakes — katalog, Ekwipunek → Różne).");
  const st = powerState(actor, now(), true);
  const units = st.units || 1;
  const pick = await DialogV2.wait({
    window: { title: `Zasilanie: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 440 }, rejectClose: false,
    content: `<div class="foe-dialog">
      <div class="atk-info"><div>Cybernetyka zużywa <b>${st.units}</b> ${st.units === 1 ? "jednostkę" : "jednostki"} (kończyna 1, tułów 2, implant ¼).${st.until > now() ? ` Zasilanie jeszcze na ${st.hoursLeft} h.` : ""}</div></div>
      <label class="atk-row">Klejnot <select name="gem">${gems.map(g => `<option value="${g.id}">${esc(g.name)} ×${g.system.qty} — ${Math.round((gemHours(g.name) / units) * 10) / 10} h</option>`).join("")}</select></label>
      <p class="hint">Wartości z podręcznika są dla jednej cyber-kończyny; przy kilku kończynach klejnot starcza proporcjonalnie krócej (s. 178).</p></div>`,
    buttons: [{ action: "ok", label: "Zjedz", icon: "fa-solid fa-gem", default: true, callback: (ev, btn) => btn.form.elements.gem.value }]
  });
  const gem = pick ? actor.items.get(pick) : null;
  if (!gem) return null;
  const until = feedUntil(st, gemHours(gem.name), now());
  await gem.update({ "system.qty": gem.system.qty - 1 });
  await actor.setFlag(F, "cyberPower", { until });
  const hours = Math.round(((until - now()) / 3600) * 10) / 10;
  return card(actor, "ZASILANIE", actor.name, `<div class="fc-calc">${esc(gem.name)} → zasilanie na <b>${hours} h</b> (${st.units} jedn.)</div>`);
}

/** Samonaprawa: talizman naprawczy (złom) i Phoenix Monocyte Breeder po upływie podanego czasu. */
export async function selfRepair(actor, { seconds = null, silent = false } = {}) {
  if (seconds === null) {
    const m = await DialogV2.wait({
      window: { title: `Samonaprawa: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
      content: `<div class="foe-dialog"><label class="atk-row">Ile minut odpoczynku <input type="number" name="min" value="60" min="15" step="15"></label>
        <p class="hint">Talizman naprawczy: 1 rana na 15 minut na lokacji protezy, za 1 złom (Scrap Metal / Electronics). Phoenix Monocyte Breeder: 1 rana na godzinę.
        Gdy MG przesuwa czas gry, dzieje się to samo automatycznie.</p></div>`,
      buttons: [{ action: "ok", label: "Naprawiaj", icon: "fa-solid fa-screwdriver-wrench", default: true, callback: (ev, btn) => Number(btn.form.elements.min.value) || 0 }]
    });
    if (!m) return null;
    seconds = m * 60;
  }
  const scrapItems = actor.items.filter(i => isScrap(i) && (i.system.qty || 0) > 0);
  const scrap = scrapItems.reduce((t, i) => t + (i.system.qty || 0), 0);
  const carry = actor.getFlag(F, "cyberRegen") ?? {};
  const plan = planRegen(actor, seconds, carry, scrap);
  const upd = Object.fromEntries(Object.entries(plan.wounds).map(([k, v]) => [`system.locations.${k}.wounds`, v]));
  if (Object.keys(upd).length) await actor.update(upd);
  let left = plan.scrapUsed;
  for (const it of scrapItems) {
    if (!left) break;
    const t = Math.min(left, it.system.qty);
    await it.update({ "system.qty": it.system.qty - t });
    left -= t;
  }
  await actor.setFlag(F, "cyberRegen", plan.carry);
  if (!plan.notes.length) {
    if (!silent) ui.notifications.info(`${actor.name}: nic się nie naprawiło${scrap ? "" : " (brak złomu dla talizmanu)"}.`);
    return null;
  }
  return card(actor, "SAMONAPRAWA", actor.name, `<div class="fc-meta">${plan.notes.map(esc).join(" · ")}</div>`);
}

/** Wewnętrzny magazyn energii: przelewa ogniwa z ekwipunku do implantu (ogniwo 2 pkt, MFC 4, gem cell 1). */
export async function chargeReservoir(actor, implant) {
  const cap = implant.system.cyber.capacity;
  const have = implant.system.cyber.charges;
  if (have >= cap) return ui.notifications.info(`${implant.name}: magazyn pełny (${have}/${cap}).`);
  const cells = actor.items.filter(i => i.type === "gear" && i.system.category === "ammo" && (i.system.qty || 0) > 0 && energyCost(i.system.ammoType || i.name));
  if (!cells.length) return warn("Brak ogniw energii w ekwipunku (Energy Cells, Microfusion Cells, Gem Cells).");
  const pick = await DialogV2.wait({
    window: { title: `Ładowanie: ${implant.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false,
    content: `<div class="foe-dialog"><div class="atk-info"><div>Magazyn: <b>${have}/${cap}</b> pkt</div></div>
      <label class="atk-row">Ogniwa <select name="cell">${cells.map(c => `<option value="${c.id}">${esc(c.name)} ×${c.system.qty} (${energyCost(c.system.ammoType || c.name)} pkt/szt.)</option>`).join("")}</select></label></div>`,
    buttons: [{ action: "ok", label: "Przelej", icon: "fa-solid fa-bolt", default: true, callback: (ev, btn) => btn.form.elements.cell.value }]
  });
  const cell = pick ? actor.items.get(pick) : null;
  if (!cell) return null;
  const per = energyCost(cell.system.ammoType || cell.name);
  const n = Math.min(cell.system.qty, Math.floor((cap - have) / per));
  if (n <= 0) return warn("Za mało miejsca w magazynie na choćby jedno ogniwo tego rodzaju.");
  await cell.update({ "system.qty": cell.system.qty - n });
  await implant.update({ "system.cyber.charges": have + n * per });
  ui.notifications.info(`${implant.name}: +${n * per} pkt (${n} × ${cell.name}) → ${have + n * per}/${cap}.`);
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
    name: "Zasilanie cybernetyki klejnotami",
    hint: "Zasada z podręcznika (s. 105, 178): protezy i implanty trzeba „karmić” klejnotami jak jedzeniem. Włączone — bez zasilania implanty nie działają, a protezy są jak okaleczone. Wyłączone — jedzenie klejnotów niczego nie liczy (jak zwykłe jedzenie).",
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
      try { await selfRepair(actor, { seconds: delta, silent: true }); } catch (err) { console.error("foe-rpg | samonaprawa", err); }
    }
  });
}
