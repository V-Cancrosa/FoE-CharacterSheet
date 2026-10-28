/**
 * Animacje walki — część bez Foundry (sprawdzana w testach):
 *   - rodzaj efektu broni (kula, śrut, laser, plazma, ogień, granat, cios…) zapisywany w karcie ataku,
 *   - punkt pudła obok celu: liczony z identyfikatora wiadomości, więc każdy gracz widzi kulę w tym samym miejscu,
 *     a przerzut kartą Szczęścia wie, skąd ma odbić się rykoszet,
 *   - miejsce trafienia zależne od lokacji (głowa wyżej, nogi niżej),
 *   - plan animacji: grupy kroków (strzał/cios → trafienie, ziemia albo wybuch), po kolei; kroki w grupie naraz.
 * Odtwarza to module/fx.mjs (Sequencer + JB2A albo wbudowany wygląd PipBucka).
 */
import { N_ } from "./i18n.mjs";

// ---------- deterministyczny los ----------
/** FNV-1a (32 bity) z tekstu. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (const ch of String(str ?? "")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Generator liczb 0..1 (mulberry32) z ziarna tekstowego. */
export function rng(seed) {
  let a = hashSeed(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- rodzaje efektów ----------
// style: tracer (smuga kuli), bolt (świecący pocisk), beam (wiązka), lob (rzut łukiem), stream (strumień ognia), swing (cios)
// shot/impact/blast — ścieżki z bazy Sequencera (JB2A, darmowa i płatna wersja mają te same); pierwsza istniejąca wygrywa
const HIT = ["jb2a.impact.010.orange", "jb2a.impact.005.orange"];
const HIT_BLUE = ["jb2a.impact.004.blue", "jb2a.impact.001.blue"];
const HIT_FIRE = ["jb2a.impact.fire.01.orange", "jb2a.impact.010.orange"];
export const GOLD = 0xffd700;

export const FX = {
  bullet:  { style: "tracer", color: 0xffd27a, shot: ["jb2a.bullet.01.orange", "jb2a.bullet.02.orange"], impact: HIT },
  shotgun: { style: "tracer", color: 0xffc46b, pellets: true, shot: ["jb2a.bullet.02.orange", "jb2a.bullet.01.orange"], impact: HIT },
  rail:    { style: "beam", color: 0x9fe3ff, shot: ["jb2a.bullet.Snipe.blue", "jb2a.bullet.03.blue"], impact: HIT_BLUE },
  arrow:   { style: "tracer", speed: 1100, color: 0xd9c9a3, shot: ["jb2a.arrow.physical.white.01", "jb2a.arrow.physical.blue"], impact: HIT },
  bolt:    { style: "tracer", speed: 1300, color: 0xd9a35a, shot: ["jb2a.bolt.physical.orange", "jb2a.arrow.physical.white.01"], impact: HIT },
  dart:    { style: "tracer", speed: 1000, color: 0x9be36b, shot: ["jb2a.arrow.poison.green.01", "jb2a.arrow.physical.white.01"], impact: HIT },
  laser:   { style: "beam", color: 0xff3b3b, shot: ["jb2a.lasershot.red"], impact: HIT, tint: 0xff5a4d },
  pulse:   { style: "bolt", color: 0x5fb8ff, shot: ["jb2a.lasershot.blue"], impact: HIT_BLUE },
  plasma:  { style: "bolt", color: 0x6cff6c, shot: ["jb2a.ranged.04.projectile.01.green", "jb2a.lasershot.green"], impact: HIT, tint: 0x6cff6c },
  disintegrate: { style: "beam", color: 0x7dff4d, shot: ["jb2a.disintegrate.green", "jb2a.lasershot.green"], impact: HIT, tint: 0x7dff4d },
  shock:   { style: "beam", color: 0x7fd0ff, shot: ["jb2a.chain_lightning.primary.blue", "jb2a.witch_bolt.blue", "jb2a.lasershot.blue"], impact: HIT_BLUE },
  sonic:   { style: "beam", color: 0xb0f0ff, shot: ["jb2a.energy_beam.normal.blue.01", "jb2a.lasershot.blue"], impact: HIT_BLUE },
  rainbow: { style: "beam", color: 0xff7de0, shot: ["jb2a.energy_beam.normal.bluepink.03", "jb2a.lasershot.red"], impact: HIT_BLUE, tint: 0xff7de0 },
  star:    { style: "bolt", color: 0xffb547, shot: ["jb2a.lasershot.orange"], impact: HIT },
  flare:   { style: "bolt", color: 0xff6a2a, shot: ["jb2a.fire_bolt.orange"], impact: HIT_FIRE },
  flame:   { style: "stream", color: 0xff8a2a, shot: ["jb2a.breath_weapons.fire.line.orange"], impact: HIT_FIRE },
  missile: { style: "bolt", speed: 900, color: 0xffd27a, explodes: true, shot: ["jb2a.throwable.launch.missile.01.blue"], impact: HIT },
  shell:   { style: "lob", color: 0x8a8a8a, shot: ["jb2a.throwable.launch.cannon_ball.01.black"], impact: HIT },
  grenade: { style: "lob", color: 0x4a5a3a, explodes: true, shot: ["jb2a.throwable.throw.bomb.01.black"], impact: HIT },
  throw:   { style: "lob", color: 0x9a8a7a, shot: ["jb2a.throwable.throw.bomb.01.black"], impact: HIT },
  melee:   { style: "swing", color: 0xf0f0f0, shot: ["jb2a.melee_generic.slash.01.orange"], impact: HIT },
  blunt:   { style: "swing", color: 0xe0d0b0, shot: ["jb2a.melee_attack.02.club.01", "jb2a.melee_generic.slash.01.orange"], impact: HIT },
  hammer:  { style: "swing", color: 0xe0d0b0, shot: ["jb2a.melee_attack.02.hammer.01", "jb2a.melee_attack.02.club.01"], impact: HIT },
  wrench:  { style: "swing", color: 0xe0d0b0, shot: ["jb2a.melee_attack.02.wrench.01", "jb2a.melee_attack.02.club.01"], impact: HIT },
  axe:     { style: "swing", color: 0xf0f0f0, shot: ["jb2a.melee_attack.02.handaxe.01", "jb2a.melee_generic.slash.01.orange"], impact: HIT },
  claw:    { style: "swing", color: 0xff5a4d, shot: ["jb2a.melee_generic.creature_attack.claw.001.red", "jb2a.melee_generic.slash.01.orange"], impact: HIT },
  pincer:  { style: "swing", color: 0xff5a4d, shot: ["jb2a.melee_generic.creature_attack.pincer.001.red", "jb2a.melee_generic.slash.01.orange"], impact: HIT },
  hoof:    { style: "swing", color: 0xd8e8ff, shot: ["jb2a.unarmed_strike.physical.01.blue", "jb2a.melee_generic.slash.01.orange"], impact: HIT },
  magic:   { style: "bolt", color: 0xc9b2ff, shot: ["jb2a.eldritch_blast.purple", "jb2a.magic_missile.purple"], impact: HIT_BLUE, tint: 0xc9b2ff }
};

/** Wybuchy: plik JB2A, zabarwienie i kolor wbudowanego wyglądu. */
export const BLASTS = {
  frag:     { files: ["jb2a.explosion.01.orange", "jb2a.explosion.08.orange"], color: 0xff8a2a },
  fire:     { files: ["jb2a.explosion.01.orange", "jb2a.explosion.08.orange"], color: 0xff6a1a },
  plasma:   { files: ["jb2a.explosion.01.orange"], tint: 0x6cff6c, color: 0x6cff6c },
  pulse:    { files: ["jb2a.explosion.04.blue", "jb2a.explosion.02.blue"], color: 0x5fb8ff },
  flash:    { files: ["jb2a.explosion.03.blueyellow", "jb2a.explosion.01.orange"], color: 0xfff2b0 },
  gas:      { files: ["jb2a.smoke.plumes.01.grey", "jb2a.smoke.puff.centered.grey"], tint: 0xa8d860, color: 0xa8d860, smoke: true },
  frost:    { files: ["jb2a.impact.frost.white.01", "jb2a.explosion.02.blue"], color: 0xcfefff },
  balefire: { files: ["jb2a.explosion.01.orange"], tint: 0x9dff4d, color: 0x9dff4d, big: true }
};

/** Pozostałe pliki: szczęście, zacięcie, ziemia przy pudle. */
export const EXTRA = {
  luck: ["jb2a.twinkling_stars.points07.orange", "jb2a.twinkling_stars.points07.white"],
  luckFlash: ["jb2a.impact.006.yellow", "jb2a.impact.007.yellow"],
  smoke: ["jb2a.smoke.puff.centered.grey", "jb2a.smoke.puff.side.grey"]
};

const has = (re, s) => re.test(s);

/** Rodzaj wybuchu z nazwy ładunku. */
export function blastOf(name) {
  const n = String(name ?? "").toLowerCase();
  if (has(/balefire/, n)) return "balefire";
  if (has(/plasma|plazm/, n)) return "plasma";
  if (has(/pulse|\bemp\b|impuls/, n)) return "pulse";
  if (has(/flash|stun|sparkle|błysk|ogłusz|iskier/, n)) return "flash";
  if (has(/\bgas\b|bio-gas|gaz/, n)) return "gas";
  if (has(/windigo|frost|mróz|lodow/, n)) return "frost";
  if (has(/incendiar|fire|napalm|zapalaj|ogni/, n)) return "fire";
  return "frag";
}

/**
 * Rodzaj efektu broni: { k, b? } (b — wybuch). „placed” — mina/ładunek kładziony: bez animacji przy ataku.
 * w — system broni (skill, kind, ammoType, specials, consumable), name — nazwa przedmiotu.
 */
export function weaponFx(w, name, { spell = false, close = false, aoe = false } = {}) {
  const n = `${name ?? ""} ${w?.ammoType ?? ""}`.toLowerCase();
  const sk = w?.skill ?? "";
  const sp = w?.specials ?? {};
  if (spell) return { k: "magic" };
  if (close || sk === "melee" || sk === "unarmed") {
    if (has(/claw|talon|szpon|pazur|bite|fang|jaw|ugryz|kły|zęb/, n)) return { k: "claw" };
    if (has(/pincer|szczyp|kleszcz/, n)) return { k: "pincer" };
    if (has(/hammer|sledge|młot/, n)) return { k: "hammer" };
    if (has(/wrench|tire iron|klucz/, n)) return { k: "wrench" };
    if (has(/\baxe|hatchet|topór|topor|siekier/, n)) return { k: "axe" };
    if (sk === "unarmed") return { k: "hoof" };
    if (has(/\bbat\b|club|pipe|baton|cane|\bcue\b|staff|board|rolling pin|shovel|pickaxe|rebar|9-iron|pałk|kij|rur|łopat|kilof|wałek|laska/, n)) return { k: "blunt" };
    return { k: "melee" };
  }
  if (sp.placed || has(/\(placed\)|\bmine\b|\bmina\b|satchel|ładunek/, n)) return { k: "placed" };
  if (has(/flare|raca|flar/, n)) return { k: "flare" };
  if (has(/flamer|flame|incinerator|fuel|miotacz ognia|paliwo|spalacz/, n)) return { k: "flame" };
  if (w?.kind === "explosive" || sk === "explosives") {
    if (has(/\brock\b|kamie|cegł|brick/, n)) return { k: "throw" };
    return { k: "grenade", b: blastOf(n) };
  }
  const energy = sk === "energy" || has(/\bmfc\b|me-?cell|\bspc\b|gem cell|solar cell|energy cell|laser|plasma|beam/, n);
  if (energy || sp.electric || sp.disintegrate) {
    if (has(/plasma|plazm/, n)) return { k: "plasma" };
    if (sp.disintegrate || has(/disintegr|dezintegr|atomiz/, n)) return { k: "disintegrate" };
    if (sp.electric || has(/shock|tesla|\bzap\b|porażen|wstrząs|elektr/, n)) return { k: "shock" };
    if (has(/sonic|sonicz|dźwięk|screech/, n)) return { k: "sonic" };
    if (has(/rainbow|tęcz|\brcw\b/, n)) return { k: "rainbow" };
    if (has(/pulse|impuls/, n)) return { k: "pulse" };
    if (has(/\bstar\b|gwiezd|celestial|solar|słoneczn/, n)) return { k: "star" };
    if (has(/gauss|gaus/, n)) return { k: "rail" };
    return { k: "laser" };
  }
  if (has(/missile|rocket|rakiet/, n)) return { k: "missile", b: blastOf(n) };
  if (has(/40mm|grenade|granat|120mm|shell|howitzer|haubic|cannon|działo|balefire|\bjunk\b|złom|rock-it/, n)) {
    return aoe ? { k: "shell", b: blastOf(n) } : { k: "shell" };
  }
  if (has(/arrow|\bbow\b|łuk|strzał(?!k)/, n)) return { k: "arrow" };
  if (has(/\bbolts?\b|crossbow|bełt|kusz/, n)) return { k: "bolt" };
  if (has(/\bdarts?\b|blowgun|strzałk|dmuchaw/, n)) return { k: "dart" };
  if (has(/\brail|gauss|gaus/, n)) return { k: "rail" };
  if (has(/gauge|shotgun|strzelb|śrut/, n)) return { k: "shotgun" };
  return { k: "bullet" };
}

/** Rodzaj z karty ataku (starsze karty bez fx: z walki wręcz / obszaru). */
export function fxKind(atk) {
  const k = atk?.fx?.k;
  if (k === "placed") return "placed";
  if (FX[k]) return k;
  return atk?.melee ? "melee" : atk?.aoe ? "grenade" : "bullet";
}

/** Napisy nad tokenami (tłumaczone przy wyświetlaniu). */
export const TEXTS = {
  crit: N_("Critical!"),
  luck: N_("Lucky!"),
  miss: N_("fx|Miss"),
  jam: N_("Jammed!"),
  fumble: N_("Fumble!"),
  fizzle: N_("Fizzle!"),
  dud: N_("Dud!")
};

/** Napis krytycznej porażki: broń palna/energetyczna się zacina, cios — potknięcie, czar gaśnie, granat — niewypał. */
export function fumbleText(kind) {
  const style = FX[kind]?.style;
  if (kind === "magic") return "fizzle";
  if (style === "swing") return "fumble";
  if (kind === "grenade" || kind === "throw") return "dud";
  return "jam";
}

// ---------- geometria ----------
const round = p => ({ x: Math.round(p.x), y: Math.round(p.y) });

/**
 * Punkt pudła obok celu: kula przelatuje bokiem i ląduje trochę za celem; cios — tuż obok;
 * rzut łukiem — rozrzut wokół celu. src/tgt — środki tokenów ({x, y}, tgt także w/h w px), grid — pole w px.
 */
export function missPoint(src, tgt, grid, seed, style = "tracer") {
  const r = rng(seed);
  const dx = tgt.x - src.x, dy = tgt.y - src.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = d > 0.5 ? dx / d : 1, uy = d > 0.5 ? dy / d : 0;
  const px = -uy, py = ux;
  const half = Math.max(tgt.w ?? grid, tgt.h ?? grid) / 2;
  const side = r() < 0.5 ? -1 : 1;
  if (style === "lob") {
    const a = r() * 2 * Math.PI, dist = half + grid * (0.6 + r() * 1.2);
    return round({ x: tgt.x + Math.cos(a) * dist, y: tgt.y + Math.sin(a) * dist });
  }
  if (style === "swing") {
    const lat = half * 0.9 + grid * 0.15;
    return round({ x: tgt.x + px * side * lat, y: tgt.y + py * side * lat });
  }
  const lat = half + grid * (0.2 + r() * 0.45);
  const along = grid * (0.2 + r() * 0.9);
  return round({ x: tgt.x + px * side * lat + ux * along, y: tgt.y + py * side * lat + uy * along });
}

// przesunięcie trafienia w tokenie (ułamek szerokości/wysokości): głowa i róg wyżej, nogi niżej
export const LOC_OFFSET = {
  head: [0, -0.28], horn: [0, -0.38], wings: [0, -0.12], torso: [0, 0],
  flLeg: [-0.2, 0.3], frLeg: [0.2, 0.3], rlLeg: [-0.25, 0.32], rrLeg: [0.25, 0.32]
};

/** Miejsce trafienia: środek tokena przesunięty do lokacji; kolejne kule serii lekko rozrzucone. */
export function hitPoint(tgt, loc, seed, i = 0, spread = 0.12) {
  const [ox, oy] = LOC_OFFSET[loc] ?? [0, 0];
  const w = tgt.w ?? 100, h = tgt.h ?? 100;
  let x = tgt.x + ox * w, y = tgt.y + oy * h;
  if (i > 0) {
    const r = rng(`${seed}:${i}`);
    x += (r() * 2 - 1) * spread * w;
    y += (r() * 2 - 1) * spread * h;
  }
  return round({ x, y });
}

/** Rozrzut kolejnych kul wokół punktu (pudło serią, śrut). */
export function scatter(p, grid, seed, i, spread = 0.25) {
  if (i === 0) return p;
  const r = rng(`${seed}:s${i}`);
  return round({ x: p.x + (r() * 2 - 1) * spread * grid, y: p.y + (r() * 2 - 1) * spread * grid });
}

/** Ile pocisków pokazać: seria do 5, wiązki do 3, śrut 3–5, reszta 1. */
export function shotsFor(kind, used) {
  const d = FX[kind];
  const u = Math.max(1, Number(used) || 1);
  if (!d || d.style === "swing" || d.style === "lob" || d.style === "stream" || d.explodes) return 1;
  if (d.pellets) return Math.min(5, 2 + u);
  if (d.style === "beam") return Math.min(3, u);
  return Math.min(5, u);
}

const center = list => {
  const n = list.length;
  const x = list.reduce((s, p) => s + p.x, 0) / n, y = list.reduce((s, p) => s + p.y, 0) / n;
  return { x, y, w: list[0].w, h: list[0].h };
};

/**
 * Plan animacji ataku.
 * o: { result, atk (dane ataku z karty), src {x, y, hidden}, targets [{x, y, w, h}], grid, seed (id wiadomości),
 *      rerolls, prev {seed, result} | null (karta przed przerzutem) }
 * Zwraca grupy kroków; krok strzału/ciosu ma `then` — co się dzieje, gdy pocisk doleci.
 * Kroki: shot, swing, impact, ground, explode, luck, jam, text.
 */
export function planAttack(o) {
  const atk = o.atk ?? {};
  const kind = fxKind(atk);
  if (kind === "placed") return [];
  const def = FX[kind];
  const style = def.style;
  const grid = o.grid || 100;
  const hit = o.result === "success" || o.result === "crit-success";
  const crit = o.result === "crit-success";
  const explodes = !!(def.explodes || (atk.aoe && kind === "shell"));
  const blast = atk.fx?.b ?? (explodes ? "frag" : null);
  const src = o.src;
  const showSrc = !src?.hidden;
  // obszar: jeden ładunek w środek celów; inaczej do 3 celów osobno
  const targets = !o.targets?.length ? [] : explodes ? [center(o.targets)] : o.targets.slice(0, 3);
  const groups = [];
  const top = tg => ({ x: tg.x, y: tg.y - (tg.h ?? grid) / 2 });

  // przerzut kartą Szczęścia: rykoszet z miejsca, w które trafiła poprzednia kula
  let origins = null;
  if ((o.rerolls ?? 0) > 0) {
    const ricochet = o.prev && o.prev.result !== "crit-fail" && style !== "swing" && style !== "stream" && targets.length;
    if (ricochet) {
      origins = targets.map((tg, i) => missPoint(src, tg, grid, `${o.prev.seed}:${i}`, style));
      groups.push([...origins.map(at => ({ t: "luck", at })), { t: "text", at: origins[0], text: "luck" }]);
    } else {
      const at = style === "swing" && targets[0] ? targets[0] : src;
      groups.push([{ t: "luck", at: { x: at.x, y: at.y } }, { t: "text", at: { x: at.x, y: at.y }, text: "luck" }]);
    }
  }

  if (o.result === "crit-fail") {
    if (showSrc) groups.push([{ t: "jam", kind, at: { x: src.x, y: src.y } }, { t: "text", at: { x: src.x, y: src.y }, text: fumbleText(kind) }]);
    return groups;
  }
  if (!targets.length) return groups;

  const fire = [];
  targets.forEach((tg, ti) => {
    const from = origins?.[ti] ?? { x: src.x, y: src.y };
    const n = shotsFor(kind, atk.used);
    const miss = hit ? null : missPoint(src, tg, grid, `${o.seed}:${ti}`, style);
    for (let i = 0; i < n; i++) {
      const delay = ti * 160 + (def.pellets ? i * 25 : i * 110);
      const to = hit
        ? (explodes ? { x: Math.round(tg.x), y: Math.round(tg.y) } : hitPoint(tg, atk.hit?.loc, `${o.seed}:${ti}`, i, def.pellets ? 0.22 : 0.12))
        : scatter(miss, grid, `${o.seed}:${ti}`, i, def.pellets ? 0.35 : 0.25);
      const then = [];
      if (explodes) { if (i === 0) then.push({ t: "explode", kind, blast, at: to, big: crit }); }
      else if (hit) then.push({ t: "impact", kind, at: to, big: crit && i === 0 });
      else if (style !== "swing") then.push({ t: "ground", kind, at: to });
      if (i === 0 && hit && crit) then.push({ t: "text", at: top(tg), text: "crit" });
      if (i === 0 && !hit && ti === 0) then.push({ t: "text", at: top(tg), text: "miss" });
      // ukryty strzelec: gracze widzą tylko, co doleciało
      if (!showSrc && !origins) fire.push(...then.map(s => ({ ...s, delay })));
      else fire.push({ t: style === "swing" ? "swing" : "shot", kind, style, from, to, hit, luck: !!origins, delay, then });
    }
  });
  groups.push(fire);
  return groups;
}
