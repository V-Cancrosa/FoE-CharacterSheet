/**
 * Bestiariusz (podręcznik s. 490–576, „My Little Monster Manual”): potwory, roboty i NPC z gotowymi statystykami.
 *   - strefy trafień potworów (czułki, szczypce, ogon…) z własnym DT i MFD celowania mapują się na lokacje systemu,
 *     a karta, okno ataku i nanoszenie obrażeń pokazują ich nazwy,
 *   - progi okaleczenia/utraty i obrażenia na ranę są wprost z bloku statystyk,
 *   - broń z bloku ma obrażenia już z premiami („flat” — system nic nie dolicza),
 *   - wpisy bez statystyk (w v1.22 część stworzeń ma tylko opis) tworzą NPC z opisem do uzupełnienia.
 */
import { SKILLS, LOCATIONS } from "./data.mjs";
import { armorItem } from "./catalog-data.mjs";
import { vehicleAreas } from "./vehicle-data.mjs";

const F = "foe-rpg";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export const BESTIARY_KINDS = {
  animal: "Zwierzęta i mutanty", plant: "Rośliny", magic: "Magiczne stworzenia", robot: "Roboty i wieżyczki",
  faction: "Kucyki i frakcje", ghoul: "Ghule", other: "Alikorny, piekielne psy, podmieńcy"
};

// ---------- strefy trafień ----------
/** Nazwa strefy z bloku → klucz lokacji systemu. */
export function areaLoc(label) {
  const s = String(label).toLowerCase();
  if (/wing|leaves/.test(s)) return "wings";
  if (/\bhead|heads\b/.test(s) && !/talisman/.test(s)) return "head";
  if (/torso|thorax|body|hull|roots/.test(s)) return "torso";
  if (/horn|antenna|tongue|tail|stinger|talisman|vines/.test(s)) return "horn";
  const front = /claw|\bfl\b|\bfr\b|fore|front|leg, f[lr]|f[lr] leg/.test(s);
  const left = /\bl\b|, ?l$|\bfl\b|\bbl\b|\brl\b|\bml\b|left|l leg|leg, l/.test(s);
  const right = /\br\b|, ?r$|\bfr\b|\bbr\b|\brr\b|\bmr\b|right|r leg|leg, r/.test(s);
  if (/claw/.test(s)) return /, ?r$|\br\b/.test(s) ? "frLeg" : "flLeg";
  if (/leg/.test(s)) {
    if (front) return right ? "frLeg" : "flLeg";
    return right && !left ? "rrLeg" : left && !right ? "rlLeg" : "rlLeg";
  }
  return "torso";
}

/** Strefy aktora (flaga z importu): [{ label, loc, mfd, dt }]. */
export const areasOf = actor => (actor?.type === "vehicle" ? vehicleAreas(actor.system?.vehicle?.kind)
  : actor?.flags?.[F]?.areas ?? actor?.getFlag?.(F, "areas") ?? []);
/** loc → „Szczypce L / Szczypce P” (kilka stref może trafiać w jedną lokację). */
export function areaLabels(actor) {
  const out = {};
  for (const a of areasOf(actor)) out[a.loc] = out[a.loc] ? `${out[a.loc]} / ${a.label}` : a.label;
  return out;
}

// ---------- dane do aktora ----------
const firstNum = v => Number(String(v ?? "0").match(/\d+/)?.[0] ?? 0);
/**
 * Naturalne DT z zapisu w bloku. Gdy lokację osłania pancerz z katalogu: „26+3” → 3, „5/8”, „25*” → naturalne z bloku (natDT) albo 0.
 * Gdy pancerza nie ma (nie znaleziono w katalogu albo nie osłania lokacji) — całe DT z bloku („26+3” → 29).
 */
function naturalDt(v, entry, covered) {
  const s = String(v ?? "0");
  const plus = s.match(/^\s*(\d+)\s*\+\s*(\d+)/);
  if (covered) return plus ? Number(plus[2]) : entry.natDT ?? 0;
  return plus ? Number(plus[1]) + Number(plus[2]) : firstNum(s);
}

const SKILL_KEYS = Object.fromEntries(Object.entries(SKILLS).flatMap(([k, s]) => s.label.split(" / ").map(l => [l.toLowerCase(), k])).concat([
  ["small guns", "smallGuns"], ["big guns", "bigGuns"], ["lock picking", "lockpick"], ["lockpicking", "lockpick"], ["melee", "melee"]
]));

/** Formuła obrażeń z bloku → { damage, shots, splash }: „5d8/3+7” → seria 3, „6d12/6d12” → wybuch z drugim promieniem. */
function parseDamage(s) {
  const t = String(s ?? "").replace(/\s+/g, "");
  let m = t.match(/^(\d+d\d+)\/(\d+d\d+)(.*)$/);
  if (m) return { damage: `${m[1]}${m[3]}`, shots: 1, splash: m[2] };
  m = t.match(/^(\d+d\d+)\/(\d+)(.*)$/);
  if (m) return { damage: `${m[1]}${m[3]}`, shots: Number(m[2]), splash: "" };
  return { damage: t.replace(/\+/g, " + ") || "0", shots: 1, splash: "" };
}

function weaponSkill(w, explicit, catalogW) {
  if (explicit) return explicit;
  if (catalogW?.skill) return catalogW.skill;
  const [name, , , range, , , , , notes] = w;
  if (/big guns/i.test(notes)) return "bigGuns";
  if (/grenade|explosion|mine|dynamite/i.test(name)) return "explosives";
  if (/beam|pulse|laser|plasma|magical/i.test(name)) return "energy";
  if (range) return "smallGuns";
  if (/sword|knife|spear|hammer|sledge|iron|machete|blade|axe|club|shishkebab|bat\b/i.test(name)) return "melee";
  return "unarmed";
}

function specialsOf(notes, name) {
  const n = `${notes} ${name}`;
  const sp = {};
  if (/fire/i.test(n)) sp.fire = /if it breaks dt/i.test(n) ? "hit" : "hit";
  if (/disintegrat/i.test(n)) sp.disintegrate = "hit";
  if (/\brads?\b|radiation/i.test(n)) sp.rads = true;
  if (/electric/i.test(n)) sp.electric = true;
  if (/radscorpion poison/i.test(n)) sp.poison = "radscorpion";
  if (/manticore poison/i.test(n)) sp.poison = "manticore";
  if (/scoped/i.test(n)) sp.scoped = true;
  return sp;
}

const norm = s => String(s ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Buduje dane aktora (typ npc) i przedmioty z wpisu bestiariusza.
 * catalog — data/catalog.json (dla pancerzy i parametrów znanej broni), spells/maneuvers — listy z data/.
 */
export function buildNpc(e, { catalog = {}, spells = [], maneuvers = [], spellItemData = null, maneuverItemData = null } = {}) {
  const has = !!e.a;
  const notes = [
    `<p><i>${esc(BESTIARY_KINDS[e.kind] ?? "")}${e.group && e.group !== e.name ? ` · ${esc(e.group)}` : ""}${e.p ? ` · podręcznik s. ${e.p}` : ""}${e.lvl ? ` · poziom trudności ${esc(e.lvl)}` : ""}</i></p>`,
    `<p>${esc(e.desc)}</p>`,
    e.ab ? `<h3>Zdolności</h3><p>${esc(e.ab)}</p>` : "",
    e.mv ? `<p><b>Ruch:</b> ${Object.entries(e.mv).map(([k, v]) => `${{ ground: "ziemia", fly: "lot", dig: "kopanie", swim: "pływanie", sneak: "skradanie" }[k] ?? k} ${v} ft`).join(", ")}</p>` : "",
    e.loot ? `<p><b>Łup:</b> ${esc(e.loot)}</p>` : "",
    e.eqAlt?.length ? `<p><b>Pancerz zamiennie:</b> ${esc(e.eqAlt.join(", "))}</p>` : "",
    has ? "" : `<p><b>Podręcznik v1.22 nie podaje statystyk tego stworzenia</b> — uzupełnij je albo użyj kreatora NPC (przycisk KREATOR na karcie).</p>`
  ].filter(Boolean).join("");

  const system = { notes, race: e.race ?? (e.pony ? "Kucyk ziemski / jednorożec (Earth Pony / Unicorn)" : e.group ?? e.name) };
  const items = [];
  const flags = { [F]: { bestiary: e.name } };
  if (!has) return { actor: { name: e.name, type: "npc", system, flags, prototypeToken: { disposition: -1, actorLink: false } }, items };

  const level = Math.max(1, firstNum(e.lvl) || 1);
  system.level = level;
  system.attributes = Object.fromEntries(Object.entries(e.a).map(([k, v]) => [k, { value: Math.max(0, Number(v) || 0), mod: 0 }]));
  const luck = Number(e.a.luck) || 0;
  // rangi jak w bloku: ranga = baza (2×atrybut + Szczęście/2 + 2, min. 5) + premia
  const skills = {};
  for (const k of Object.keys(SKILLS)) skills[k] = { known: false, tag: false, points: 0, bonus: 0, mod: 0 };
  for (const [label, attr, rank, mod] of e.sk ?? []) {
    const k = SKILL_KEYS[String(label).toLowerCase()];
    if (!k) continue;
    const base = Math.max(5, 2 * (Number(e.a[attr]) || 0) + Math.floor(luck / 2) + 2);
    skills[k] = { known: true, tag: false, points: 0, bonus: rank - base, mod: Number(mod) || 0, attr };
  }
  system.skills = skills;
  system.woundBonus = (Number(e.dw) || 10) - Math.min(20, 10 + Math.floor(level / 3));
  system.woundLimits = { cripple: Number(e.cr) || 0, maim: Number(e.mm) || 0 };
  const agi = Number(e.a.agi) || 0;
  if (e.mv?.ground !== undefined) system.speedBonus = e.mv.ground - Math.floor((2.5 * agi) / 5) * 5;
  if (e.strain) system.resources = { strain: { value: e.strain, max: e.strain } };

  // pancerz z katalogu (kucyki i frakcje)
  const armorByName = new Map((catalog.armor ?? []).map(a => [norm(a.name), a]));
  const covered = new Set();
  for (const name of e.eq ?? []) {
    const a = armorByName.get(norm(name)) ?? [...armorByName.entries()].find(([k]) => k.startsWith(norm(name)) || norm(name).startsWith(k))?.[1];
    if (!a) continue;
    const d = armorItem(a);
    for (const [k, on] of Object.entries(d.system.cover)) if (on) covered.add(k);
    d.system.equipped = true;
    items.push(d);
  }
  // strefy → lokacje i naturalne DT
  const areas = (e.ar ?? []).map(([label, dt, mfd]) => ({ label: String(label).replace(/^\((.*)\)$/, "$1"), loc: areaLoc(label), mfd: String(mfd), dt: String(dt) }));
  const locations = {};
  for (const k of Object.keys(LOCATIONS)) locations[k] = { wounds: 0, dt: 0, crippled: false };
  for (const a of areas) locations[a.loc].dt = Math.max(locations[a.loc].dt, naturalDt(a.dt, e, covered.has(a.loc)));
  system.locations = locations;
  if (!e.pony) flags[F].areas = areas;

  // broń
  const weaponsByName = new Map((catalog.weapons ?? []).map(w => [norm(w.name), w]));
  for (const w of e.w ?? []) {
    const [name, dmg, crit, range, ammo, mag, reload, wt, notes, skill] = w;
    const cat = weaponsByName.get(norm(name));
    const d = parseDamage(dmg);
    const aoeInc = /^-?\d+d\d+$/.test(String(crit ?? "")) ? String(crit) : "";
    const aoe = !!(d.splash || aoeInc);
    const ign = Number(String(notes).match(/ignores (\d+) dt/i)?.[1] ?? 0);
    const magN = Number(mag) || 0;
    items.push({
      name, type: "weapon", img: undefined,
      system: {
        skill: weaponSkill(w, skill, cat), kind: cat?.kind ?? "", damage: d.damage, shots: d.shots, flat: true,
        satsCost: cat?.sats ?? 20, ammo: { value: magN, max: magN }, ammoType: ammo || "", reload: reload || "",
        range: range ? `${range} ft` : "", rangeInc: Number(String(range).match(/\d+/)?.[0] ?? 0) || 0,
        crit: aoeInc ? "x1" : (crit || "x1").replace(/^X/, "x"), ignoreDT: ign,
        aoe: { enabled: aoe, splash: d.splash || (aoeInc ? d.damage : ""), inc: aoeInc, radius: "" },
        specials: specialsOf(notes, name), weight: Number(wt) || 0,
        description: notes ? `<p>${esc(notes)}</p>` : ""
      }
    });
  }
  for (const it of items) if (it.img === undefined) delete it.img;

  // zaklęcia (z katalogu) i własne zdolności magiczne
  for (const n of e.spells ?? []) {
    const s = spells.find(x => norm(x.name) === norm(n));
    if (s && spellItemData) items.push(spellItemData(s));
    else items.push({ name: n, type: "feature", system: { kind: "spell", active: true, effects: [], description: `<p>Zaklęcie z bloku statystyk (s. ${e.p}).</p>` } });
  }
  for (const [n, mfd, cost, desc] of e.sp ?? []) {
    items.push({ name: n, type: "feature", system: { kind: "spell", active: true, effects: [], description: `<p>${mfd ? `MFD ${esc(mfd)}` : ""}${cost ? ` · koszt ${esc(cost)}` : ""}</p><p>${esc(desc)}</p>` } });
  }
  for (const [n, mfd] of e.mn ?? []) {
    const m = maneuvers.find(x => norm(x.name) === norm(n));
    if (m && maneuverItemData) {
      const d = maneuverItemData(m);
      d.system.learned = true;
      if (mfd) d.system.mfd = mfd;
      items.push(d);
    }
  }
  if (e.ab) items.push({ name: "Zdolności (bestiariusz)", type: "feature", system: { kind: "other", active: true, effects: [], description: `<p>${esc(e.ab)}</p>` } });

  return { actor: { name: e.name, type: "npc", system, flags, prototypeToken: { disposition: -1, actorLink: false, name: e.name } }, items };
}

let cache = null;
export function loadBestiary() {
  cache ??= fetch(`systems/${game.system.id}/data/bestiary.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(err => { cache = null; throw err; });
  return cache;
}

/** Tworzy NPC w świecie (folder „Bestiariusz FoE”) i otwiera kartę. */
export async function importCreature(e, deps) {
  if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn("Tylko MG (albo gracz z uprawnieniem tworzenia aktorów) może dodawać stworzenia z bestiariusza.");
  const { actor, items } = buildNpc(e, deps);
  let folder = game.folders?.find(f => f.type === "Actor" && f.name === "Bestiariusz FoE");
  if (!folder && game.user.isGM) folder = await Folder.create({ name: "Bestiariusz FoE", type: "Actor", color: "#1f6b3f" });
  actor.folder = folder?.id ?? null;
  const created = await Actor.implementation.create(actor);
  if (!created) return null;
  if (items.length) await created.createEmbeddedDocuments("Item", items);
  ui.notifications.info(`Bestiariusz: dodano ${created.name}${e.a ? "" : " (bez statystyk — tylko opis)"}. Przeciągnij aktora na scenę.`);
  created.sheet.render(true);
  return created;
}
