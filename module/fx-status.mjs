/**
 * Animacje stanów na tokenach: płomienie (płonie), iskry (porażony prądem), bąbelki (zatruty), zielona poświata
 * (choroba popromienna), krople krwi (krwawi), gwiazdki (ogłuszony), drżąca obwódka (przerażony), kryształ (paraliż),
 * łańcuchy (unieruchomiony), Zzz (nieprzytomny), dym (wypalenie magii), przerywany krąg (w ukryciu), cień (w locie)
 * i gwiazdki wokół jednorożca, który utrzymuje zaklęcia.
 *
 * Każdy klient rysuje je u siebie z ikon stanów tokena — nic nie zapisuje się w świecie. Z modułami Sequencer i JB2A
 * stany z pasującym znacznikiem JB2A w pętli dostają go (efekt tymczasowy, tylko lokalny), pozostałe — wygląd
 * wbudowany: rysunek PIXI przypięty do tokena (porusza się i znika razem z nim). Martwy token — bez animacji.
 */
import { STATUS_FX, statusFxKeys, rng, customMagic, magicColorOf, hexInt } from "./fx-data.mjs";
import { D, V8, ADD, setting, sequencerOk, pick } from "./fx.mjs";

const F = "foe-rpg";
const shown = new Map();   // id tokena → Map(klucz efektu → uchwyt)
const sigs = new Map();    // id tokena → podpis pokazanych stanów
const pending = new Map(); // id tokena → odroczona synchronizacja

export function registerFxStatusSettings() {
  game.settings.register(F, "fxStatuses", {
    name: "Status animations on tokens",
    hint: "Flames, sparks, poison bubbles, a radiation glow, blood drops, stars, chains and more on tokens with FoE statuses, and stars around a unicorn maintaining spells. They follow the token's status icons. Each player decides for themselves.",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => resyncAll()
  });
}

export function registerFxStatusHooks() {
  Hooks.on("canvasReady", () => { shown.clear(); sigs.clear(); resyncAll(); });
  Hooks.on("canvasTearDown", () => { shown.clear(); sigs.clear(); live.clear(); stopTicker(); });
  Hooks.on("drawToken", token => queue(token));
  Hooks.on("refreshToken", token => { if (signature(token) !== sigs.get(token.id)) queue(token); });
  Hooks.on("deleteToken", doc => drop(doc.id));
  for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(h, effect => actorChanged(effect?.parent));
  Hooks.on("updateActor", actor => actorChanged(actor));
  Hooks.on("foeFxEngine", () => resyncAll());
}

/** Po zmianie wyglądu animacji walki (JB2A / PipBuck) — stany od nowa. */
export function resyncAll() {
  for (const id of [...shown.keys()]) drop(id);
  sigs.clear();
  if (!canvas?.ready) return;
  for (const token of canvas.tokens?.placeables ?? []) syncToken(token);
}

function actorChanged(actor) {
  if (!actor?.getActiveTokens || !canvas?.ready) return;
  for (const token of actor.getActiveTokens(false, false)) queue(token);
}

const maintainedOf = actor => (Array.isArray(actor?.system?.maintained) ? actor.system.maintained.length : 0);
const wanted = token => (setting("fxStatuses") === false ? [] : statusFxKeys(token.actor?.statuses, maintainedOf(token.actor)));
const signature = token => wanted(token).join(",");

// stany aktora przeliczają się chwilę po zmianie efektu — synchronizacja po krótkiej przerwie, raz na token
function queue(token) {
  if (!token?.id) return;
  clearTimeout(pending.get(token.id));
  pending.set(token.id, setTimeout(() => { pending.delete(token.id); syncToken(token); }, 40));
}

function drop(id) {
  for (const h of shown.get(id)?.values() ?? []) h.stop();
  shown.delete(id);
  sigs.delete(id);
}

function syncToken(token) {
  if (!token || token.destroyed || !canvas?.ready || token.document?.parent?.id !== canvas.scene?.id) return;
  const want = wanted(token);
  sigs.set(token.id, want.join(","));
  const cur = shown.get(token.id) ?? new Map();
  for (const [k, h] of cur) if (!want.includes(k) || h.dead()) { h.stop(); cur.delete(k); }
  const seq = sequencerOk() && typeof globalThis.Sequence === "function";
  for (const k of want) if (!cur.has(k)) cur.set(k, start(token, k, seq));
  if (cur.size) shown.set(token.id, cur); else shown.delete(token.id);
}

function start(token, key, seq) {
  const def = STATUS_FX[key];
  // gwiazdki utrzymywanych zaklęć we własnym kolorze magii rysuje system (JB2A ma stały kolor)
  const file = seq && !(key === "maintained" && customMagic(token.actor)) ? pick(def.jb2a) : null;
  return (file && startSequencer(token, key, def, file)) || startBuiltin(token, key, def);
}

// ---------- Sequencer + JB2A ----------
function startSequencer(token, key, def, file) {
  const name = `foe-status-${key}-${token.id}`;
  try {
    const seq = new globalThis.Sequence({ moduleName: F, softFail: true });
    const e = seq.effect();
    // bez .temporary() trwały efekt zapisałby się w danych tokena — wtedy wygląd wbudowany
    if (typeof e.temporary !== "function") return null;
    e.file(file).attachTo(token, def.offsetY ? { offset: { x: 0, y: def.offsetY }, gridUnits: true } : {})
      .scaleToObject(def.scale ?? 1.4).opacity(def.opacity ?? 0.9).fadeIn(400).fadeOut(400)
      .persist().temporary().locally().name(name);
    if (def.below) e.belowTokens();
    if (def.tint) e.tint(def.tint);
    seq.play({ local: true }).catch(() => {});
  } catch (err) {
    console.warn(`${F} | status animation`, err);
    return null;
  }
  return {
    stop() { try { globalThis.Sequencer?.EffectManager?.endEffects({ name, object: token }, false); } catch { /* już zniknął */ } },
    dead: () => false
  };
}

// ---------- wygląd wbudowany (PIXI, dziecko tokena) ----------
const live = new Set();
let ticking = false;

function startTicker() {
  if (ticking || !canvas?.app?.ticker) return;
  canvas.app.ticker.add(tick);
  ticking = true;
}
function stopTicker() {
  if (ticking) canvas?.app?.ticker?.remove(tick);
  ticking = false;
}

function tick() {
  const now = performance.now();
  for (const h of live) {
    if (h.g.destroyed) { live.delete(h); continue; }
    const t = (now - h.t0) / 1000;
    const fade = h.stopAt ? 1 - (now - h.stopAt) / 400 : Math.min(1, t / 0.4);
    if (fade <= 0) { h.destroy(); continue; }
    h.g.alpha = fade;
    h.g.clear();
    try { h.draw(h.g, t, h); } catch (err) { console.warn(`${F} | status animation`, err); h.destroy(); }
  }
  if (!live.size) stopTicker();
}

function startBuiltin(token, key, def) {
  const draw = DRAW[key];
  if (!draw || !globalThis.PIXI) return { stop() {}, dead: () => false };
  const g = new PIXI.Graphics();
  if (!def.normal) g.blendMode = ADD();
  g.eventMode = "none";
  // pod paskami, imieniem i ikonami stanów tokena (grafika tokena jest w innej warstwie, niżej)
  token.addChildAt(g, 0);
  const h = {
    g, t0: performance.now(), stopAt: 0, w: token.w, h: token.h, seed: `${token.id}:${key}`,
    draw: (gr, time) => {
      h.w = token.w; h.h = token.h; h.count = maintainedOf(token.actor); h.color = hexInt(magicColorOf(token.actor));
      draw(gr, time, h);
    },
    destroy() { live.delete(h); if (!g.destroyed) g.destroy({ children: true }); },
    stop() { if (!h.stopAt) h.stopAt = performance.now(); if (g.destroyed) live.delete(h); },
    dead: () => g.destroyed
  };
  INIT[key]?.(h);
  live.add(h);
  startTicker();
  return h;
}

const TAU = Math.PI * 2;
const frac = x => x - Math.floor(x);
const geo = h => ({ cx: h.w / 2, cy: h.h / 2, R: Math.min(h.w, h.h) / 2 });
const pt = (x, y) => ({ x, y });
// stałe losowe parametry cząstek (te same w każdej klatce)
const particles = (h, n) => (h.parts ??= Array.from({ length: n }, (_, i) => { const r = rng(`${h.seed}:${i}`); return { a: r(), b: r(), c: r() }; }));

/** Gwiazdka 5-ramienna (punkty do wielokąta). */
function star(c, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr);
  }
  return pts;
}
/** Kropla (szpic do góry). */
function teardrop(c, r) {
  const pts = [c.x, c.y - r * 2.1];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI * 0.15 + (i / 10) * Math.PI * 1.3;
    pts.push(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
  }
  return pts;
}

// Napisy Zzz (nieprzytomny)
const INIT = {
  unconscious(h) {
    const R = Math.min(h.w, h.h) / 2;
    const style = { fontFamily: "Signika, sans-serif", fontWeight: "bold", fontSize: Math.max(14, Math.round(R * 0.42)), fill: 0xdcdcff, stroke: 0x000000, strokeThickness: 4 };
    h.texts = [0, 1, 2].map(() => {
      const tx = V8() ? new PIXI.Text({ text: "Z", style: { ...style, stroke: { color: 0x000000, width: 4 } } }) : new PIXI.Text("Z", style);
      tx.anchor.set(0.5);
      h.g.addChild(tx);
      return tx;
    });
  }
};

const DRAW = {
  burning(g, t, h) {
    const { cx, cy, R } = geo(h);
    // żar u dołu
    D.ellipse(g, pt(cx, cy + h.h * 0.38), h.w * 0.34, h.h * 0.08, 0xff5a1a, 0.35 + 0.1 * Math.sin(t * 7));
    for (const [i, p] of particles(h, 26).entries()) {
      const life = 0.7 + p.c * 0.5, age = frac(t / life + p.a);
      const x = cx + (p.b - 0.5) * h.w * 0.8 + Math.sin(t * 7 + i) * h.w * 0.03;
      const y = cy + h.h * 0.45 - age * h.h * (0.6 + 0.4 * p.c);
      const color = age < 0.25 ? 0xffe066 : age < 0.55 ? 0xff9a1a : 0xe8401a;
      D.poly(g, teardrop(pt(x, y), R * (0.19 - 0.13 * age)), color, 0.8 * (1 - age));
    }
  },
  shock(g, t, h) {
    const { cx, cy, R } = geo(h);
    D.ring(g, pt(cx, cy), R * 1.02, R * 0.12, 0x7fd0ff, 0.12 + 0.08 * Math.sin(t * 9));
    const step = Math.floor(t * 9), r = rng(`${h.seed}:${step}`);
    if (r() < 0.15) return;   // migotanie
    for (let k = 0; k < 3; k++) {
      const a0 = r() * TAU, span = 0.6 + r() * 0.8;
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const a = a0 + (span * i) / 7, rr = R * (0.85 + r() * 0.3);
        pts.push(pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
      }
      for (let i = 0; i < pts.length - 1; i++) {
        D.line(g, pts[i], pts[i + 1], 4, 0x7fd0ff, 0.6);
        D.line(g, pts[i], pts[i + 1], 1.5, 0xffffff, 0.95);
      }
    }
  },
  poison(g, t, h) {
    const { cx, cy, R } = geo(h);
    for (const [i, p] of particles(h, 11).entries()) {
      const life = 1.4 + p.c * 0.6, age = frac(t / life + p.a);
      const x = cx + (p.b - 0.5) * h.w * 0.6 + Math.sin(t * 3 + i) * h.w * 0.04;
      const y = cy + h.h * 0.35 - age * h.h * 0.7;
      const r = R * (0.07 + 0.06 * p.b) * (age > 0.9 ? 1 + (age - 0.9) * 6 : 1);
      D.dot(g, pt(x, y), r, 0x7dff4d, 0.25 * (1 - age));
      D.ring(g, pt(x, y), r, 2, 0x9dff6d, 0.85 * (1 - age));
    }
  },
  irradiated(g, t, h) {
    const { cx, cy, R } = geo(h);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    D.ring(g, pt(cx, cy), R * 1.02, R * 0.2, 0x9dff4d, 0.1 + 0.12 * pulse);
    D.ring(g, pt(cx, cy), R * 0.92, 2, 0xc8ff7a, 0.2 + 0.3 * pulse);
    for (let i = 0; i < 8; i++) {
      const a = t * 0.8 + (i * TAU) / 8 + Math.sin(t + i) * 0.2, rr = R * (0.95 + 0.08 * Math.sin(t * 2 + i));
      D.dot(g, pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr), R * 0.035, 0xd8ff9a, 0.85);
    }
  },
  bleeding(g, t, h) {
    const { cx, cy, R } = geo(h);
    for (const p of particles(h, 5)) {
      const life = 1.1 + p.c * 0.5, age = frac(t / life + p.a);
      const x = cx + (p.b - 0.5) * h.w * 0.55;
      const y = cy - h.h * 0.05 + age * age * h.h * 0.55;
      if (age < 0.85) D.poly(g, teardrop(pt(x, y), R * 0.08), 0xb3001b, 0.95 * (1 - age * 0.4), { width: 1, color: 0x400008, alpha: 0.8 });
      else D.ellipse(g, pt(x, cy + h.h * 0.5), R * 0.16 * (age - 0.6) * 3, R * 0.06, 0x8a0014, Math.min(0.85, (1 - age) * 6));
    }
  },
  stun(g, t, h) {
    const { cx, cy, R } = geo(h);
    const c = pt(cx, cy - h.h * 0.5), rx = R * 0.6, ry = R * 0.17;
    D.ellipse(g, c, rx, ry, null, 1, { width: 1.5, color: 0xffe066, alpha: 0.25 });
    for (let i = 0; i < 4; i++) {
      const a = t * 2.6 + (i * TAU) / 4, depth = Math.sin(a);
      const s = pt(c.x + Math.cos(a) * rx, c.y + depth * ry);
      D.poly(g, star(s, R * (0.13 + 0.03 * depth), t * 3 + i), 0xffe066, depth < 0 ? 0.55 : 0.95, { width: 1, color: 0x6a4a00, alpha: 0.6 });
    }
  },
  fear(g, t, h) {
    const { cx, cy, R } = geo(h);
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i * TAU) / 48, rr = R * (1.0 + 0.04 * Math.sin(a * 6 + t * 9) + 0.02 * Math.sin(t * 23 + i));
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    D.poly(g, pts, null, 1, { width: 2.5, color: 0xb48cff, alpha: 0.6 });
    // krople potu przy głowie
    for (let i = 0; i < 2; i++) {
      const age = frac(t / 1.3 + i * 0.5), side = i ? 1 : -1;
      D.poly(g, teardrop(pt(cx + side * R * 0.45, cy - h.h * 0.3 + age * h.h * 0.15), R * 0.045), 0x9fd8ff, 0.85 * (1 - age));
    }
  },
  paralysis(g, t, h) {
    const { cx, cy, R } = geo(h);
    const hex = (rr, rot) => Array.from({ length: 6 }, (_, i) => [cx + Math.cos(rot + (i * TAU) / 6) * rr, cy + Math.sin(rot + (i * TAU) / 6) * rr]).flat();
    D.poly(g, hex(R * 1.05, t * 0.3), null, 1, { width: 3, color: 0x9fe3ff, alpha: 0.45 + 0.2 * Math.sin(t * 4) });
    D.poly(g, hex(R * 0.9, -t * 0.2), null, 1, { width: 1.5, color: 0xd8f6ff, alpha: 0.3 });
    if (Math.floor(t * 3) % 2) {
      const r = rng(`${h.seed}:${Math.floor(t * 3)}`), v = hex(R * 1.05, t * 0.3);
      const i = Math.floor(r() * 6), j = (i + 1) % 6;
      D.line(g, pt(v[i * 2], v[i * 2 + 1]), pt(v[j * 2], v[j * 2 + 1]), 4, 0xffffff, 0.8);
    }
  },
  restrain(g, t, h) {
    const { cx, cy, R } = geo(h);
    const c = pt(cx, cy + h.h * 0.1), rx = R * 1.0, ry = R * 0.35;
    for (let i = 0; i < 16; i++) {
      const a = t * 0.25 + (i * TAU) / 16, p = pt(c.x + Math.cos(a) * rx, c.y + Math.sin(a) * ry);
      const flat = i % 2 === 0;
      D.ellipse(g, p, flat ? R * 0.09 : R * 0.05, flat ? R * 0.05 : R * 0.08, null, 1, { width: 3.5, color: 0x303030, alpha: 0.9 });
      D.ellipse(g, p, flat ? R * 0.09 : R * 0.05, flat ? R * 0.05 : R * 0.08, null, 1, { width: 1.5, color: 0xd0d0d0, alpha: 0.95 });
    }
  },
  unconscious(g, t, h) {
    const { cx, cy } = geo(h);
    for (const [i, tx] of (h.texts ?? []).entries()) {
      const age = frac(t / 2.4 + i / 3);
      tx.position.set(cx + h.w * 0.22 + age * h.w * 0.15, cy - h.h * 0.32 - age * h.h * 0.45);
      tx.scale.set(0.6 + 0.6 * age);
      tx.alpha = age < 0.2 ? age / 0.2 : 1 - (age - 0.2) / 0.8;
    }
  },
  burnout(g, t, h) {
    const { cx, cy, R } = geo(h);
    for (const [i, p] of particles(h, 6).entries()) {
      const age = frac(t / 2 + p.a);
      const x = cx + Math.sin(t * 1.5 + i) * h.w * 0.12, y = cy - h.h * 0.3 - age * h.h * 0.6;
      D.dot(g, pt(x, y), R * (0.1 + 0.18 * age), 0x9a7fd0, 0.6 * (1 - age));
      D.dot(g, pt(x, y), R * (0.04 + 0.05 * age), 0xd8c8ff, 0.5 * (1 - age));
    }
  },
  hidden(g, t, h) {
    const { cx, cy, R } = geo(h);
    const n = 16, len = (TAU / n) * 0.55, a = 0.35 + 0.15 * Math.sin(t * 2);
    for (let i = 0; i < n; i++) {
      const a0 = t * 0.5 + (i * TAU) / n;
      D.arc(g, pt(cx, cy), R * 1.08, a0, a0 + len, 2.5, 0x9adfb0, a);
    }
  },
  fly(g, t, h) {
    const { cx, cy, R } = geo(h);
    const s = Math.sin(t * 2);
    D.ellipse(g, pt(cx, cy + h.h * 0.56), h.w * 0.32 * (1 + 0.06 * s), h.h * 0.07 * (1 + 0.06 * s), 0x000000, 0.3 - 0.06 * s);
    for (let k = 0; k < 2; k++) {
      const off = frac(t * 0.8 + k * 0.5);
      for (const side of [-1, 1]) {
        const base = side < 0 ? Math.PI * 0.8 : Math.PI * 0.2;
        const a0 = base - side * off * 0.5;
        D.arc(g, pt(cx, cy), R * (1.1 + 0.1 * off), Math.min(a0, a0 + 0.35 * side), Math.max(a0, a0 + 0.35 * side), 2, 0xeef6ff, 0.45 * (1 - off));
      }
    }
  },
  maintained(g, t, h) {
    const { cx, cy, R } = geo(h);
    const k = Math.max(1, Math.min(3, h.count ?? 1)), color = h.color ?? 0xc9b2ff;
    D.ring(g, pt(cx, cy), R * 1.12, 1.5, color, 0.15);
    for (let j = 0; j < k; j++) {
      for (let m = 0; m < 6; m++) {
        const a = t * 1.2 + (j * TAU) / k - m * 0.09;
        D.dot(g, pt(cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12), R * (0.06 - m * 0.008), color, 0.9 - m * 0.14);
      }
      const a = t * 1.2 + (j * TAU) / k;
      D.dot(g, pt(cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12), R * 0.025, 0xffffff, 0.95);
    }
  }
};

/** Do testów: stany z wyglądem wbudowanym. */
export const BUILTIN_STATUS_FX = Object.keys(DRAW);
