/**
 * Chemikalia, alkohol i uzależnienia (podręcznik s. 182–186, tabele XVII i XVIII).
 *   - użycie: efekt działa przez czas z tabeli (game.time.worldTime), potem znika sam,
 *   - uzależnienie: rzut END MFD 1 i INT MFD 1 z karą = szansa uzależnienia; dwie porażki = uzależnienie
 *     (Addictive Personality — INT zawsze nieudany; D.A.R.E.ing Do / Canterlot Gourmet dodają premię),
 *     każdy inny działający środek +10 do kary; zasada opcjonalna: kara × liczba dawek grupy w ostatnich 72 h,
 *   - grupy (Alcohol, Dash, Mint-als…): uzależnienie od grupy, każdy środek z grupy łagodzi odstawienie,
 *   - Fixer znosi odstawienie, Mint-als zaostrzają je po każdym użyciu w uzależnieniu,
 *   - Dash + alkohol („krew ghula”): rzut END ½ albo zawał.
 */
import { tint } from "./dice3d.mjs";
import { rollTest } from "./rolls.mjs";
import { activeChems, addictionsOf, worldTime } from "./body.mjs";
import { clearCondition, conditionsOf } from "./conditions.mjs";
import { healWounds } from "./healing.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const H72 = 72 * 3600;

let cache = null;
export function loadChems() {
  cache ??= fetch(`systems/${game.system.id}/data/chems.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(err => { cache = null; throw err; });
  return cache;
}

const norm = s => String(s ?? "").toLowerCase().replace(/[*’']/g, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
/** Dane chemikaliów pasujące do przedmiotu (po nazwie z katalogu albo nazwie bazowej). */
export async function chemFor(item) {
  const list = await loadChems();
  const key = item.getFlag?.(F, "catalog") ?? item.flags?.[F]?.catalog ?? item.name;
  return list.find(c => c.name === key) ?? list.find(c => norm(c.name) === norm(item.name) || norm(c.base) === norm(item.name)) ?? null;
}

export function formatLeft(sec) {
  if (sec <= 0) return "kończy się";
  if (sec < 60) return `${Math.ceil(sec)} s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)} min`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ${Math.ceil((sec % 3600) / 60)} min`;
  return `${Math.floor(sec / 86400)} d ${Math.floor((sec % 86400) / 3600)} h`;
}

/** Premia do rzutów przeciw uzależnieniu z cech (efekty attrRoll „…uzależ…”). */
function addictionBonus(actor, attr) {
  let n = 0;
  for (const i of actor.items) {
    if (i.type !== "feature" || i.system?.active === false) continue;
    for (const e of i.system?.effects ?? []) {
      if (e.type === "attrRoll" && /uzależ|addict/i.test(e.when ?? "") && String(e.target).split(",").map(s => s.trim()).includes(attr)) n += Number(e.value) || 0;
    }
  }
  return n;
}

/** Rzuty przeciw uzależnieniu od jednej grupy; zwraca { addicted, lines }. */
async function addictionCheck(actor, chem, group, penalty) {
  const sys = actor.system;
  const notes = [`szansa uzależnienia −${penalty}`];
  const endB = addictionBonus(actor, "end");
  const endMsg = await rollTest(actor, { label: `Uzależnienie (${group}): END`, baseTn: sys.attributes.end.tn, step: "1", mod: endB - penalty, notes: [...notes, ...(endB ? [`cechy +${endB}`] : [])] });
  const res = m => m?.getFlag?.(F, "test")?.result ?? m?.flags?.[F]?.test?.result ?? "fail";
  const endOk = ["success", "crit-success"].includes(res(endMsg));
  if (endOk) return { addicted: false, line: `${group}: END zdany — bez uzależnienia` };
  const personality = actor.items.some(i => i.type === "feature" && i.system?.active !== false && /addictive personality/i.test(i.name));
  if (personality) return { addicted: true, line: `${group}: END nieudany, INT przepada (Addictive Personality) — UZALEŻNIENIE` };
  const intB = addictionBonus(actor, "int");
  const intMsg = await rollTest(actor, { label: `Uzależnienie (${group}): INT`, baseTn: sys.attributes.int.tn, step: "1", mod: intB - penalty, notes: [...notes, ...(intB ? [`cechy +${intB}`] : [])] });
  const intOk = ["success", "crit-success"].includes(res(intMsg));
  return intOk ? { addicted: false, line: `${group}: END nieudany, INT zdany — bez uzależnienia` } : { addicted: true, line: `${group}: oba rzuty nieudane — UZALEŻNIENIE` };
}

/** Użycie środka z ekwipunku (zużywa sztukę). */
export async function useChem(actor, item) {
  if ((item.system.qty || 0) < 1) return warn(`${item.name}: nie masz już ani jednej sztuki.`);
  const chem = await chemFor(item);
  if (!chem) return warn(`${item.name}: brak danych o działaniu — opisz efekt ręcznie (cechy z efektami albo notatki).`);
  const sys = actor.system;
  const now = worldTime();
  const before = activeChems(actor, now);
  const lines = [];
  await item.update({ "system.qty": item.system.qty - 1 });

  // efekty natychmiastowe
  if (chem.rads) {
    await actor.update({ "system.resources.rads.value": (sys.resources.rads.value || 0) + chem.rads });
    lines.push(`+${chem.rads} radów`);
  }
  if (chem.radaway) {
    const amt = Math.max(50, Math.min(200, 2 * (sys.skills.medicine?.rank ?? 0)));
    const cur = sys.resources.rads.value || 0;
    await actor.update({ "system.resources.rads.value": Math.max(0, cur - amt) });
    lines.push(`usuwa ${Math.min(cur, amt)} radów (2× Medicine, 50–200)`);
  }
  if (chem.cure) {
    const c = conditionsOf(actor);
    const keys = ["poisoned", "paralyzed"].filter(k => c[k]);
    for (const k of keys) await clearCondition(actor, k);
    lines.push(keys.length ? "trucizna zneutralizowana" : chem.cure === "natural" ? "leczy naturalne trucizny" : "leczy trucizny");
  }
  if (chem.heal) {
    const r = tint(await new Roll(chem.heal).evaluate(), "heal");
    const healed = await healWounds(actor, r.total, { source: item.name, quiet: true });
    lines.push(`leczy ${r.total} ${r.total === 1 ? "ranę" : "ran"}${healed?.text ? ` (${healed.text})` : ""}`);
  }

  // efekt trwający
  const fx = [...(chem.fx ?? [])];
  if (chem.dtMedicine) {
    const dt = Math.floor((sys.skills.medicine?.rank ?? 0) / 5);
    if (dt) fx.push({ type: "dt", target: "all", value: dt, when: "" });
  }
  // ponowna dawka tego samego środka odnawia czas działania (efekty się nie sumują)
  const chems = [...(actor.getFlag(F, "chems") ?? []).filter(c => (!c.until || c.until > now) && c.name !== chem.base)];
  if (chem.duration > 0 && (fx.length || chem.fixer || chem.note)) {
    chems.push({ id: foundry.utils.randomID(), name: chem.base, groups: chem.groups, until: now + chem.duration, fx, fixer: !!chem.fixer, note: chem.note ?? "" });
  }
  // uzależnienie
  let addictions = [...addictionsOf(actor)];
  const uses = [...(actor.getFlag(F, "chemUses") ?? []).filter(u => now - u.at < H72), ...chem.groups.map(g => ({ group: g, at: now }))];
  if (chem.addictive) {
    let frequent = false;
    try { frequent = !!game.settings.get(F, "addictionFrequency"); } catch { /* domyślnie wyłączone */ }
    const others = new Set(before.filter(c => !(c.groups ?? []).some(g => chem.groups.includes(g))).map(c => c.name)).size;
    for (const group of chem.groups.slice(0, chem.rolls || 1)) {
      const have = addictions.find(a => a.group === group);
      if (have) {
        if (chem.escalate) { have.level = (have.level || 0) + 1; lines.push(`${group}: już uzależniony — odstawienie silniejsze (${have.level + 1})`); }
        else lines.push(`${group}: już uzależniony — środek łagodzi odstawienie`);
        continue;
      }
      const doses = frequent ? uses.filter(u => u.group === group).length : 1;
      const penalty = chem.chance * doses + 10 * others;
      const r = await addictionCheck(actor, chem, group, penalty);
      lines.push(r.line);
      if (r.addicted) addictions.push({ group, since: now, wfx: chem.wfx ?? [], withdrawal: chem.withdrawal, level: 0 });
    }
  }
  await actor.update({ [`flags.${F}.chems`]: chems, [`flags.${F}.addictions`]: addictions, [`flags.${F}.chemUses`]: uses });

  // krew ghula: Dash + alkohol
  const groupsNow = new Set(chems.flatMap(c => c.groups ?? []));
  if (groupsNow.has("Dash") && groupsNow.has("Alcohol") && (chem.groups.includes("Dash") || chem.groups.includes("Alcohol"))) {
    lines.push("Dash + alkohol („krew ghula”): rzut END ½ — porażka to zawał bez natychmiastowej pomocy");
    await rollTest(actor, { label: "Krew ghula: zawał serca (END)", baseTn: sys.attributes.end.tn, step: "1/2", mod: 0, notes: ["Dash + alkohol"] });
  }

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
    <div class="foe-card spell success">
      <div class="fc-tag"><span>PIPBUCK // ${chem.addictive ? "CHEMIA" : "LEK"}</span><span>${esc(chem.durationText || "")}</span></div>
      <h3>${esc(chem.base)}</h3>
      <div class="fc-meta">${esc(chem.benefits)}${chem.note ? ` · ${esc(chem.note)}` : ""}</div>
      ${lines.length ? `<ul class="fc-list">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      ${chem.addictive ? `<div class="fc-meta">Odstawienie: ${esc(chem.withdrawal)}</div>` : ""}
    </div>`
  });
}

export async function endChem(actor, id) {
  const chems = (actor.getFlag(F, "chems") ?? []).filter(c => c.id !== id);
  await actor.setFlag(F, "chems", chems);
}

/** Leczenie uzależnienia (zaklęcie Cleanse Poison, wywar zebr, talizman — decyduje MG). */
export async function cureAddiction(actor, group) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Wyleczyć uzależnienie?" },
    content: `<p>Usunąć uzależnienie od <b>${esc(group)}</b>? (Cleanse Poison, wywar oczyszczający zebr, 2 ładunki talizmanu leczniczego; uzależnienie dłuższe niż miesiąc wymaga detoksu — s. 186.)</p>`
  });
  if (!ok) return null;
  await actor.setFlag(F, "addictions", addictionsOf(actor).filter(a => a.group !== group));
  ui.notifications.info(`${actor.name}: wyleczono uzależnienie od ${group}.`);
  return true;
}

/** Wiersze do karty: aktywne środki i uzależnienia. */
export function chemRows(actor) {
  const now = worldTime();
  const act = activeChems(actor, now);
  const fixer = act.some(c => c.fixer);
  return {
    active: act.map(c => ({ id: c.id, name: c.name, left: c.until ? formatLeft(c.until - now) : "", note: c.note,
      fx: (c.fx ?? []).map(e => `${e.value > 0 ? "+" : ""}${e.value} ${e.type === "tempAttr" ? e.target.toUpperCase() : { sats: "AP", initiative: "inicjatywa", dt: "DT", damage: "obr.", accuracy: "celność", satsRegen: "AP/rundę", radResist: "% odp. rad", wound: "obr./ranę", speed: "ft", attrRoll: "END (trucizny)" }[e.type] ?? e.type}`).join(", ") })),
    addictions: addictionsOf(actor).map(a => {
      const on = !fixer && !act.some(c => (c.groups ?? []).includes(a.group));
      const days = Math.floor((now - (a.since ?? now)) / 86400);
      return { group: a.group, on, withdrawal: a.withdrawal + (a.level ? ` (zaostrzone o ${a.level})` : ""), long: days >= 30, days };
    })
  };
}

/** Sprzątanie po upływie czasu (MG): usuwa wygasłe efekty i stare dawki, informuje na czacie. */
export function registerChemHooks() {
  Hooks.on("updateWorldTime", async worldTimeNow => {
    if (!game.users.activeGM?.isSelf) return;
    for (const actor of game.actors) {
      const chems = actor.getFlag(F, "chems");
      if (!chems?.length) continue;
      const gone = chems.filter(c => c.until && c.until <= worldTimeNow);
      if (!gone.length) continue;
      await actor.setFlag(F, "chems", chems.filter(c => !c.until || c.until > worldTimeNow));
      const addicted = addictionsOf(actor).filter(a => gone.some(c => (c.groups ?? []).includes(a.group)));
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id),
        content: `<div class="foe-card spell"><div class="fc-tag"><span>PIPBUCK // CHEMIA</span><span>koniec działania</span></div><h3>${esc(actor.name)}</h3>
          <div class="fc-meta">Przestaje działać: ${gone.map(c => esc(c.name)).join(", ")}.${addicted.length ? ` Wraca odstawienie: ${addicted.map(a => esc(a.group)).join(", ")}.` : ""}</div></div>`
      });
    }
  });
}

export function registerChemSettings() {
  game.settings.register(F, "addictionFrequency", {
    name: "Częste dawki zwiększają uzależnienie",
    hint: "Zasada opcjonalna (s. 182): kara do rzutów przeciw uzależnieniu × liczba dawek tej grupy w ostatnich 72 godzinach.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(F, "radiationPenalties", {
    name: "Kary choroby popromiennej",
    hint: "Od 200 radów kary do END, AGI i STR (progi z karty postaci). Ghule ich nie mają, Rad Tolerance znosi lekką chorobę.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => { for (const a of game.actors) a.prepareData(); for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render(); }
  });
}
