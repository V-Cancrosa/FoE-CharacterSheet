/**
 * Animacje walki na mapie: strzały i ciosy, trafienie w token (w miejsce lokacji), pudło obok celu, rykoszet
 * po przerzucie kartą Szczęścia (kula odbija się od miejsca, w które trafiła poprzednio), krytyki i zacięcia.
 *
 * Każdy klient odtwarza animację u siebie z karty ataku na czacie, gdy kości wylądują (Dice So Nice) — ta sama karta
 * daje ten sam przebieg u wszystkich (punkt pudła liczony z identyfikatora wiadomości). Rzuty ukryte przed graczem
 * (tylko dla MG, na ślepo) nie mają animacji; ukryty token strzelca nie zdradza, skąd padł strzał.
 *
 * Wygląd: z modułami Sequencer i JB2A (darmowa albo płatna wersja) — grafiki JB2A; bez nich albo z opcją
 * „Wygląd PipBucka” — wbudowane efekty rysowane na mapie (PIXI). Opcje są osobne dla każdego gracza.
 */
import { t, tn } from "./i18n.mjs";
import { FX, BLASTS, EXTRA, GOLD, TEXTS, SPELL_TEXTS, WOUND_TEXTS, planAttack, planSpell, planWounds, hexInt, rng } from "./fx-data.mjs";

const F = "foe-rpg";
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
export const setting = key => { try { return game.settings.get(F, key); } catch { return undefined; } };

export function registerFxSettings() {
  game.settings.register(F, "fxCombat", {
    name: "Combat and spell animations",
    hint: "Shots and blows on the map: a hit lands on the target token, a miss next to it, a Luck card reroll ricochets from where the previous shot landed; criticals and jams get their own effect. Spells glow on the horn in the unicorn's magic color and reach their targets (healing, shields, telekinesis…). They play after the dice land. Each player decides for themselves.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "fxEngine", {
    name: "Combat animations: look",
    hint: "With the Sequencer and JB2A modules active the animations use JB2A graphics; without them (or with the second option) a built-in PipBuck-style version that needs no modules.",
    scope: "client", config: true, type: String, default: "auto",
    choices: { auto: "JB2A (Sequencer) when available", builtin: "PipBuck style (built-in)" },
    onChange: () => Hooks.callAll("foeFxEngine")   // animacje stanów rysują się od nowa (fx-status.mjs)
  });
}

export function registerFxHooks() {
  Hooks.on("createChatMessage", msg => {
    const f = msg.flags?.[F];
    if (f?.test?.attack) playAttack(msg).catch(err => console.warn(`${F} | combat animation`, err));
    else if (f?.spell?.fx) playSpell(msg).catch(err => console.warn(`${F} | spell animation`, err));
    else if (f?.wounds?.fx) playWounds(msg).catch(err => console.warn(`${F} | damage animation`, err));
  });
  Hooks.on("canvasTearDown", () => { layer = null; });
}

// ---------- karta ataku → plan ----------
const onScene = doc => !!doc?.parent?.id && doc.parent.id === canvas.scene?.id;
const hiddenFor = tk => !game.user.isGM && !!tk.document?.hidden;
const geom = tk => ({ x: tk.center.x, y: tk.center.y, w: tk.w, h: tk.h });
const alive = tk => tk && !tk.destroyed && tk.center;

function syncDoc(uuid) {
  try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; }
}
const activeToken = actor => actor?.getActiveTokens?.(false, false)?.[0] ?? null;

/** Token strzelca na oglądanej scenie: pojazd (broń pokładowa), mówca karty albo pierwszy token aktora. */
function shooterOf(msg, test, atk) {
  if (atk.vehicle) {
    const tk = activeToken(syncDoc(atk.vehicle));
    if (tk) return tk;
  }
  const sp = msg.speaker ?? {};
  if (sp.token && sp.scene === canvas.scene?.id) {
    const tk = canvas.tokens?.get(sp.token);
    if (tk) return tk;
  }
  return activeToken(syncDoc(test.actorUuid));
}

function targetTokens(atk) {
  return (atk.targets ?? []).map(syncDoc).filter(onScene).map(d => d.object).filter(tk => alive(tk) && !hiddenFor(tk));
}

/** Czeka, aż kości Dice So Nice wylądują (najwyżej 12 s); bez modułu — od razu. */
async function afterDice(msg) {
  const d3 = game.dice3d;
  if (!d3?.waitFor3DAnimationByMessageID || !msg.rolls?.length) return;
  try { await Promise.race([d3.waitFor3DAnimationByMessageID(msg.id), sleep(12000)]); } catch { /* bez czekania */ }
}

async function playAttack(msg) {
  if (setting("fxCombat") === false || !canvas?.ready || !canvas.scene) return;
  if (!(msg.isContentVisible ?? msg.visible)) return;
  const test = msg.flags[F].test;
  const atk = test.attack;
  if (!shooterOf(msg, test, atk)) return;
  await afterDice(msg);
  // pozycje po wylądowaniu kości (ktoś mógł się ruszyć)
  if (!canvas?.ready) return;
  const shooter = shooterOf(msg, test, atk);
  if (!alive(shooter)) return;
  const prevTest = test.prevId ? game.messages.get(test.prevId)?.flags?.[F]?.test : null;
  const plan = planAttack({
    result: test.result, atk, grid: canvas.grid?.size ?? 100, seed: msg.id, rerolls: test.rerolls ?? 0,
    prev: prevTest ? { seed: test.prevId, result: prevTest.result } : null,
    src: { ...geom(shooter), hidden: hiddenFor(shooter) },
    targets: targetTokens(atk).map(geom)
  });
  if (plan.length) await runPlan(plan, rendererFor(plan));
}

/** Karta wyniku zaklęcia: blask rogu, wiązka i skutek przy celu, w kolorze magii rzucającego. */
async function playSpell(msg) {
  if (setting("fxCombat") === false || !canvas?.ready || !canvas.scene) return;
  if (!(msg.isContentVisible ?? msg.visible)) return;
  const sp = msg.flags[F].spell;
  const fx = sp.fx;
  const who = { actorUuid: sp.actorUuid };
  if (!shooterOf(msg, who, {})) return;
  // karta testu Magic jest tuż przed tą — czekamy, aż jej kości wylądują
  const test = fx.testId ? game.messages.get(fx.testId) : null;
  if (test) await afterDice(test);
  if (!canvas?.ready) return;
  const caster = shooterOf(msg, who, {});
  if (!alive(caster)) return;
  const plan = planSpell({
    kind: fx.kind, cast: fx.cast, res: fx.res, burnout: fx.burnout, layers: sp.layers,
    color: hexInt(fx.c), grid: canvas.grid?.size ?? 100,
    src: { ...geom(caster), hidden: hiddenFor(caster) },
    targets: targetTokens({ targets: fx.targets }).map(geom)
  });
  if (plan.length) await runPlan(plan, SPELL);
}

/** Karta ran: krew, iskry albo odbicie od pancerza przy każdym celu, śmierć, dezintegracja, wrak, przewrócenie. */
async function playWounds(msg) {
  if (setting("fxCombat") === false || !canvas?.ready || !canvas.scene) return;
  if (!(msg.isContentVisible ?? msg.visible)) return;
  const w = msg.flags[F].wounds;
  await afterDice(msg);   // elektryczność przeciw maszynie: 6d12 na tej karcie
  if (!canvas?.ready) return;
  const list = (w.fx ?? []).map(e => {
    const doc = syncDoc(e.token);
    const tk = onScene(doc) ? doc.object : null;
    return alive(tk) && !hiddenFor(tk) ? { ...e, tg: geom(tk) } : null;
  }).filter(Boolean);
  if (!list.length) return;
  const plan = planWounds(list, { grid: canvas.grid?.size ?? 100, seed: msg.id, kind: w.kind });
  if (plan.length) await runPlan(plan, WOUND);
}

async function runPlan(plan, R) {
  for (const group of plan) await Promise.all(group.map(s => runStep(s, R)));
}

async function runStep(s, R) {
  if (s.delay) await sleep(s.delay);
  if (s.t === "text") return showText(s);
  if (s.t === "shot" || s.t === "swing" || s.t === "beam") {
    await R[s.t](s);   // kończy się, gdy pocisk doleci / cios dosięgnie
    return Promise.all((s.then ?? []).map(x => runStep(x, R)));
  }
  return R[s.t]?.(s);
}

// ---------- napisy nad tokenami ----------
const TEXT_COLORS = {
  crit: 0xff4a3d, luck: GOLD, miss: 0xd8d8d8, jam: 0xff9a5a, fumble: 0xff9a5a, fizzle: 0xc9b2ff, dud: 0xff9a5a, burnout: 0xb98cff,
  wounds: 0xff4a3d, graze: 0xffb547, deflect: 0xb0d8ff, dead: 0xff2a2a, unconscious: 0xdcdcff, wreck: 0xff8a2a, knocked: 0xd8c8a8
};
const BIG_TEXT = new Set(["crit", "luck", "overglow", "dead", "disintegrated", "wreck"]);
const textOf = s => s.label ?? (s.text === "wounds" ? tn(s.n, "−{n} wound", "−{n} wounds")
  : t(TEXTS[s.text] ?? SPELL_TEXTS[s.text] ?? WOUND_TEXTS[s.text] ?? s.text));

function showText(s) {
  const iface = canvas?.interface;
  if (!iface?.createScrollingText) return;
  const big = BIG_TEXT.has(s.text);
  const A = CONST.TEXT_ANCHOR_POINTS;
  try {
    iface.createScrollingText(s.at, textOf(s), {
      anchor: A.TOP, direction: A.TOP, distance: (canvas.grid?.size ?? 100) * 0.6,
      duration: s.duration ?? (big ? 1800 : 1300), jitter: 0,
      fontSize: big ? 34 : 26, fill: s.fill ?? TEXT_COLORS[s.text] ?? (s.label ? 0xff9a5a : 0xffffff), stroke: 0x000000, strokeThickness: 4
    });
  } catch (err) { console.warn(`${F} | combat text`, err); }
}

// ---------- Sequencer + JB2A ----------
export function sequencerOk() {
  if (setting("fxEngine") === "builtin") return false;
  if (!game.modules.get("sequencer")?.active || typeof globalThis.Sequence !== "function" || !globalThis.Sequencer?.Database) return false;
  // Sequencer może zabraniać graczom odtwarzania efektów (ustawienie modułu) — wtedy wygląd wbudowany
  try { if (game.user.role <= game.settings.get("sequencer", "permissions-effect-create")) return false; } catch { /* brak ustawienia */ }
  return true;
}
const exists = p => { try { return !!globalThis.Sequencer.Database.entryExists(p); } catch { return false; } };
export const pick = list => (list ?? []).find(exists) ?? null;

function filesFor(s) {
  switch (s.t) {
    case "shot": case "swing": return FX[s.kind]?.shot;
    case "impact": return FX[s.kind]?.impact;
    case "explode": return (BLASTS[s.blast] ?? BLASTS.frag).files;
    case "ground": case "jam": return EXTRA.smoke;
    case "luck": return EXTRA.luck;
    default: return null;
  }
}

/** JB2A, gdy każdy plik planu jest w bazie Sequencera; inaczej (albo z opcją gracza) wygląd wbudowany. */
function rendererFor(plan) {
  if (!sequencerOk()) return BUILTIN;
  const steps = plan.flat().flatMap(s => [s, ...(s.then ?? [])]);
  // własny kolor magii: grafiki JB2A mają stałe kolory — rysuje system
  if (steps.some(s => s.color !== undefined)) return BUILTIN;
  return steps.every(s => !filesFor(s) || pick(filesFor(s))) ? SEQ : BUILTIN;
}

/** Sekwencja tylko u tego gracza; kończy się po thenDo (doleciało) albo po czasie. */
function sqRun(build, max) {
  return new Promise(resolve => {
    let done = false;
    const end = () => { if (!done) { done = true; resolve(); } };
    try {
      const seq = new globalThis.Sequence({ moduleName: F, softFail: true });
      build(seq);
      seq.thenDo(() => end());
      seq.play({ local: true }).then(end, end);
    } catch (err) { console.warn(`${F} | Sequencer`, err); end(); }
    setTimeout(end, max);
  });
}
function sqFire(build) {
  try {
    const seq = new globalThis.Sequence({ moduleName: F, softFail: true });
    build(seq);
    seq.play({ local: true }).catch(() => {});
  } catch (err) { console.warn(`${F} | Sequencer`, err); }
}

// ile ms przed końcem pliku JB2A pocisk dolatuje / cios trafia
const ARRIVE = { tracer: -350, bolt: -350, beam: -600, lob: -250, stream: -500, swing: -650 };

const SEQ = {
  shot(s) {
    const def = FX[s.kind];
    return sqRun(seq => {
      const e = seq.effect().file(pick(def.shot)).atLocation(s.from).stretchTo(s.to).locally();
      if (s.luck) e.tint(GOLD);
      e.waitUntilFinished(ARRIVE[def.style] ?? -350);
    }, 3000);
  },
  swing(s) {
    const def = FX[s.kind];
    return sqRun(seq => {
      const e = seq.effect().file(pick(def.shot)).atLocation(s.from).stretchTo(s.to).locally();
      if (s.luck) e.tint(GOLD);
      e.waitUntilFinished(ARRIVE.swing);
    }, 2500);
  },
  impact(s) {
    const def = FX[s.kind];
    const file = pick(def.impact);
    sqFire(seq => {
      const e = seq.effect().file(file).atLocation(s.at).size(s.big ? 1.6 : 0.9, { gridUnits: true }).locally();
      if (def.tint) e.tint(def.tint);
      if (s.big) seq.effect().file(file).atLocation(s.at).size(2.4, { gridUnits: true }).opacity(0.7).delay(120).locally();
    });
    return sleep(250);
  },
  ground(s) {
    sqFire(seq => seq.effect().file(pick(EXTRA.smoke)).atLocation(s.at).size(0.45, { gridUnits: true }).opacity(0.85).belowTokens().locally());
    return sleep(150);
  },
  explode(s) {
    const b = BLASTS[s.blast] ?? BLASTS.frag;
    sqFire(seq => {
      const e = seq.effect().file(pick(b.files)).atLocation(s.at).size((b.big ? 3.4 : 2.6) * (s.big ? 1.25 : 1), { gridUnits: true }).locally();
      if (b.tint) e.tint(b.tint);
    });
    return sleep(400);
  },
  luck(s) {
    sqFire(seq => {
      seq.effect().file(pick(EXTRA.luck)).atLocation(s.at).size(1.2, { gridUnits: true }).locally();
      const flash = pick(EXTRA.luckFlash);
      if (flash) seq.effect().file(flash).atLocation(s.at).size(0.8, { gridUnits: true }).locally();
    });
    return sleep(650);
  },
  jam(s) {
    sqFire(seq => seq.effect().file(pick(EXTRA.smoke)).atLocation(s.at).size(0.8, { gridUnits: true }).locally());
    return sleep(500);
  }
};

// ---------- wygląd wbudowany (PIXI) ----------
let layer = null;
function fxLayer() {
  if (!canvas?.ready || !globalThis.PIXI) return null;
  if (!layer || layer.destroyed || !layer.parent) {
    layer = new PIXI.Container();
    layer.eventMode = "none";
    (canvas.interface ?? canvas.stage).addChild(layer);
  }
  return layer;
}
export const V8 = () => Number(String(globalThis.PIXI?.VERSION ?? "7").split(".")[0]) >= 8;
export const ADD = () => globalThis.PIXI?.BLEND_MODES?.ADD ?? "add";

// rysowanie zgodne z PIXI 7 (Foundry 13) i PIXI 8
export const D = {
  line(g, a, b, width, color, alpha = 1) {
    if (V8()) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha, cap: "round" });
    else { g.lineStyle({ width, color, alpha, cap: PIXI.LINE_CAP.ROUND }); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineStyle(0); }
  },
  dot(g, c, r, color, alpha = 1) {
    if (r <= 0 || alpha <= 0) return;
    if (V8()) g.circle(c.x, c.y, r).fill({ color, alpha });
    else { g.lineStyle(0); g.beginFill(color, alpha); g.drawCircle(c.x, c.y, r); g.endFill(); }
  },
  ring(g, c, r, width, color, alpha = 1) {
    if (r <= 0 || alpha <= 0) return;
    if (V8()) g.circle(c.x, c.y, r).stroke({ width, color, alpha });
    else { g.lineStyle(width, color, alpha); g.drawCircle(c.x, c.y, r); g.lineStyle(0); }
  },
  arc(g, c, r, a0, a1, width, color, alpha = 1) {
    if (alpha <= 0 || a1 <= a0) return;
    const s = { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r };
    if (V8()) g.moveTo(s.x, s.y).arc(c.x, c.y, r, a0, a1).stroke({ width, color, alpha, cap: "round" });
    else { g.lineStyle({ width, color, alpha, cap: PIXI.LINE_CAP.ROUND }); g.moveTo(s.x, s.y); g.arc(c.x, c.y, r, a0, a1); g.lineStyle(0); }
  },
  // wielokąt: pts = [x0, y0, x1, y1, …]; fill — kolor wypełnienia (albo null), stroke — { width, color, alpha }
  poly(g, pts, fill, alpha = 1, stroke = null) {
    if (alpha <= 0 && !stroke) return;
    if (V8()) {
      g.poly(pts);
      if (fill !== null && fill !== undefined) g.fill({ color: fill, alpha });
      if (stroke) g.stroke({ ...stroke, join: "round" });
    } else {
      g.lineStyle(stroke ? { ...stroke, join: PIXI.LINE_JOIN.ROUND } : 0);
      if (fill !== null && fill !== undefined) g.beginFill(fill, alpha);
      g.drawPolygon(pts);
      if (fill !== null && fill !== undefined) g.endFill();
      g.lineStyle(0);
    }
  },
  ellipse(g, c, rx, ry, color, alpha = 1, stroke = null) {
    if (rx <= 0 || ry <= 0) return;
    if (V8()) {
      g.ellipse(c.x, c.y, rx, ry);
      if (color !== null) g.fill({ color, alpha });
      if (stroke) g.stroke(stroke);
    } else {
      g.lineStyle(stroke ?? 0);
      if (color !== null) g.beginFill(color, alpha);
      g.drawEllipse(c.x, c.y, rx, ry);
      if (color !== null) g.endFill();
      g.lineStyle(0);
    }
  }
};

/** Klatki animacji: draw(g, p), p od 0 do 1; kończy się po `ms`. */
function animate(ms, draw, { add = true } = {}) {
  const parent = fxLayer();
  const ticker = canvas?.app?.ticker;
  if (!parent || !ticker) return Promise.resolve();
  const g = new PIXI.Graphics();
  if (add) g.blendMode = ADD();
  parent.addChild(g);
  const t0 = performance.now();
  return new Promise(resolve => {
    const tick = () => {
      if (g.destroyed) { ticker.remove(tick); resolve(); return; }
      let p = Math.min(1, (performance.now() - t0) / ms);
      g.clear();
      try { draw(g, p); } catch (err) { console.warn(`${F} | combat animation`, err); p = 1; }
      if (p >= 1) { ticker.remove(tick); g.destroy(); resolve(); }
    };
    ticker.add(tick);
    tick();
  });
}

const grid = () => canvas.grid?.size ?? 100;
const lerp = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toward = (c, a, d) => ({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d });
const easeOut = p => 1 - (1 - p) ** 2;
const colorOf = s => (s.luck ? GOLD : s.color ?? FX[s.kind]?.color ?? 0xffffff);

function muzzle(at, color) {
  const g0 = grid();
  animate(140, (g, p) => {
    D.dot(g, at, g0 * 0.2 * (1 - p), color, 0.5 * (1 - p));
    D.dot(g, at, g0 * 0.09 * (1 - p), 0xfff4d0, 0.9 * (1 - p));
  });
}

const BUILTIN = {
  shot(s) {
    const def = FX[s.kind];
    const c = colorOf(s), g0 = grid(), d = dist(s.from, s.to);
    if (def.style !== "lob" && !s.luck) muzzle(s.from, c);
    if (def.style === "beam") {
      animate(420, (g, p) => {
        const end = lerp(s.from, s.to, Math.min(1, p / 0.12));
        const a = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7;
        D.line(g, s.from, end, g0 * 0.16, c, 0.35 * a);
        D.line(g, s.from, end, g0 * 0.05, 0xffffff, 0.9 * a);
      });
      return sleep(60);
    }
    if (def.style === "lob") {
      const T = clamp((d / 650) * 1000, 450, 1100), h = Math.min(d * 0.25, g0 * 2.5);
      animate(T, (g, p) => {
        const q = lerp(s.from, s.to, p);
        D.dot(g, q, g0 * 0.1 * (1 - 0.4 * Math.sin(Math.PI * p)), 0x000000, 0.3);   // cień na ziemi
        q.y -= 4 * h * p * (1 - p);
        D.dot(g, q, g0 * 0.13, c, 1);
        D.ring(g, q, g0 * 0.13, 3, s.luck ? GOLD : 0x101010, 0.9);
        D.dot(g, { x: q.x - g0 * 0.04, y: q.y - g0 * 0.04 }, g0 * 0.035, 0xffffff, 0.5);
      }, { add: false });
      return sleep(T);
    }
    if (def.style === "stream") {
      const T = clamp((d / 900) * 1000, 200, 600), emit = 380, total = emit + T + 150;
      const r = rng(`${s.from.x}:${s.from.y}:${s.to.x}:${s.to.y}`);
      const parts = Array.from({ length: 14 }, (_, i) => ({ t0: (i / 14) * emit, j: (r() * 2 - 1) * 0.15 }));
      const ux = (s.to.x - s.from.x) / (d || 1), uy = (s.to.y - s.from.y) / (d || 1);
      animate(total, (g, p) => {
        const now = p * total;
        for (const q of parts) {
          const k = (now - q.t0) / T;
          if (k < 0 || k > 1.2) continue;
          const pt = lerp(s.from, s.to, Math.min(1, k));
          const side = q.j * g0 * Math.min(1, k) * 2;
          pt.x += -uy * side; pt.y += ux * side;
          const a = k > 1 ? (1.2 - k) / 0.2 : 0.8;
          D.dot(g, pt, g0 * (0.06 + 0.24 * Math.min(1, k)), k < 0.35 ? 0xffd060 : c, 0.75 * a);
          D.dot(g, pt, g0 * (0.03 + 0.08 * Math.min(1, k)), 0xfff2c0, 0.6 * a);
        }
      });
      return sleep(T);
    }
    // smuga kuli (tracer) albo świecący pocisk (bolt)
    const bolt = def.style === "bolt";
    const speed = def.speed ?? (bolt ? 1400 : 2600);
    const T = clamp((d / speed) * 1000, 110, 800), fade = 140;
    const len = Math.min(1, (g0 * (bolt ? 0.15 : 0.55)) / Math.max(d, 1));
    animate(T + fade, (g, p) => {
      const now = p * (T + fade);
      const head = Math.min(1, now / T), back = clamp(now / T - len, 0, 1);
      const a = now > T ? 1 - (now - T) / fade : 1;
      const A = lerp(s.from, s.to, back), B = lerp(s.from, s.to, head);
      if (bolt) {
        D.line(g, A, B, g0 * 0.08, c, 0.45 * a);
        D.dot(g, B, g0 * 0.14, c, 0.35 * a);
        D.dot(g, B, g0 * 0.065, 0xffffff, 0.9 * a);
      } else {
        D.line(g, A, B, g0 * 0.12, c, 0.4 * a);
        D.line(g, A, B, g0 * 0.04, 0xffffff, 0.95 * a);
      }
    });
    return sleep(T);
  },
  swing(s) {
    const c = colorOf(s), g0 = grid();
    const base = Math.atan2(s.from.y - s.to.y, s.from.x - s.to.x);   // strona atakującego
    const R = g0 * 0.55, a0 = base - 1.2, a1 = base + 1.2;
    animate(360, (g, p) => {
      const sweep = Math.min(1, p / 0.45), fade = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
      const end = a0 + (a1 - a0) * sweep, start = Math.max(a0, end - 1.4);
      D.arc(g, s.to, R, start, end, g0 * 0.14, c, 0.35 * fade);
      D.arc(g, s.to, R, start, end, g0 * 0.05, 0xffffff, 0.9 * fade);
    });
    return sleep(170);
  },
  impact(s) {
    const c = s.color ?? FX[s.kind]?.color ?? 0xffffff, g0 = grid(), k = s.big ? 1.7 : 1;
    animate(s.big ? 520 : 320, (g, p) => {
      const e = easeOut(p);
      D.dot(g, s.at, g0 * (0.12 + 0.2 * e) * k, c, 0.6 * (1 - p));
      D.dot(g, s.at, g0 * 0.08 * k * (1 - p), 0xffffff, 0.9 * (1 - p));
      D.ring(g, s.at, g0 * (0.1 + 0.45 * e) * k, 3, c, 0.8 * (1 - p));
      if (s.big) D.ring(g, s.at, g0 * (0.2 + 0.9 * e), 2, 0xffffff, 0.6 * (1 - p));
    });
    return sleep(200);
  },
  ground(s) {
    const g0 = grid(), r = rng(`${s.at.x},${s.at.y}`);
    const rays = Array.from({ length: 6 }, () => [r() * Math.PI * 2, 0.6 + r() * 0.6]);
    animate(380, (g, p) => {
      const e = easeOut(p);
      for (const [a, l] of rays) D.line(g, toward(s.at, a, g0 * 0.05), toward(s.at, a, g0 * (0.08 + 0.25 * l * e)), 2, 0xffe2a0, 0.9 * (1 - p));
    });
    animate(700, (g, p) => D.dot(g, s.at, g0 * (0.1 + 0.18 * p), 0x9a9a9a, 0.45 * (1 - p)), { add: false });
    return sleep(150);
  },
  explode(s) {
    const b = BLASTS[s.blast] ?? BLASTS.frag, g0 = grid(), k = (b.big ? 1.3 : 1) * (s.big ? 1.25 : 1);
    if (!b.smoke) {
      animate(650, (g, p) => {
        const e = 1 - (1 - p) ** 3;
        D.dot(g, s.at, g0 * 1.3 * k * e, b.color, 0.75 * (1 - p));
        D.dot(g, s.at, g0 * 0.6 * k * e, 0xfff2c0, 0.8 * (1 - p) ** 2);
        D.ring(g, s.at, g0 * 1.6 * k * e, 4, b.color, 0.7 * (1 - p));
      });
    }
    animate(b.smoke ? 1800 : 1300, (g, p) => {
      const e = easeOut(p), r = rng(`${s.at.x}:${s.at.y}:smoke`);
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2, d = g0 * 0.6 * k * r() * e;
        const q = toward(s.at, a, d);
        q.y -= g0 * 0.3 * p;
        // dym gęstnieje, gdy kula ognia przygasa, potem rzednie
        const fade = b.smoke ? 1 - p : p < 0.3 ? 0 : p < 0.5 ? (p - 0.3) / 0.2 : (1 - p) / 0.5;
        D.dot(g, q, g0 * (0.3 + 0.4 * e) * k, b.smoke ? b.color : 0x5a5a5a, 0.35 * fade);
      }
    }, { add: false });
    return sleep(350);
  },
  luck(s) {
    const g0 = grid();
    animate(750, (g, p) => {
      const e = easeOut(p), rot = p * 0.8;
      for (let i = 0; i < 8; i++) {
        const a = rot + (i * Math.PI) / 4;
        D.line(g, toward(s.at, a, g0 * 0.15 * e), toward(s.at, a, g0 * (0.25 + 0.4 * e)), 3, GOLD, 0.9 * (1 - p));
      }
      D.ring(g, s.at, g0 * (0.1 + 0.5 * e), 3, GOLD, 0.8 * (1 - p));
    });
    // czterolistna koniczyna
    animate(750, (g, p) => {
      const a = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      for (let i = 0; i < 4; i++) D.dot(g, toward(s.at, Math.PI / 4 + (i * Math.PI) / 2, g0 * 0.08), g0 * 0.075, 0x3fbf5a, 0.95 * a);
      D.dot(g, s.at, g0 * 0.03, GOLD, a);
    }, { add: false });
    return sleep(450);
  },
  jam(s) {
    const g0 = grid();
    animate(220, (g, p) => {
      D.dot(g, s.at, g0 * 0.2 * (1 - p), 0xffb547, 0.8 * (1 - p));
      D.dot(g, s.at, g0 * 0.08 * (1 - p), 0xffffff, 0.9 * (1 - p));
    });
    animate(1100, (g, p) => {
      for (let i = 0; i < 4; i++) {
        const q = (p - i * 0.12) / (1 - i * 0.12);
        if (q <= 0) continue;
        D.dot(g, { x: s.at.x + (i % 2 ? 1 : -1) * g0 * 0.1 * q, y: s.at.y - g0 * (0.1 + 0.6 * q) }, g0 * (0.12 + 0.22 * q), 0xb4b4b4, 0.75 * (1 - q));
      }
    }, { add: false });
    return sleep(500);
  }
};

// ---------- czary: wygląd wbudowany w kolorze magii, JB2A — białe grafiki „TMFX” zabarwione tym kolorem ----------
const TAU = Math.PI * 2;
/** Kolor rozjaśniony bielą (w — udział bieli 0..1). */
const mix = (c, w = 0.5) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r + (255 - r) * w) << 16) | (Math.round(g + (255 - g) * w) << 8) | Math.round(b + (255 - b) * w);
};
/** Iskra o 4 ramionach (punkty wielokąta). */
const sparkle4 = (c, r, rot = 0) => Array.from({ length: 8 }, (_, i) => {
  const rr = i % 2 ? r * 0.3 : r, a = rot + (i * Math.PI) / 4;
  return [c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr];
}).flat();
const radius = s => s.r ?? grid() / 2;
const fadeIO = (p, a = 0.2, b = 0.7) => (p < a ? p / a : p > b ? (1 - p) / (1 - b) : 1);

const SPELL_BUILTIN = {
  cast(s) {   // energia zbiera się na rogu
    const g0 = grid(), c = s.color, k = 1 + 0.35 * (s.layers ?? 0);
    animate(700, (g, p) => {
      const e = easeOut(p), a = p < 0.7 ? 1 : (1 - p) / 0.3;
      for (let i = 0; i < 8; i++) D.dot(g, toward(s.at, (i * TAU) / 8 + p * 1.5, g0 * 0.45 * (1 - e) * k), g0 * 0.035, mix(c, 0.4), 0.9 * (1 - p * 0.5));
      D.dot(g, s.at, g0 * (0.08 + 0.12 * e) * k, c, 0.55 * a);
      D.dot(g, s.at, g0 * 0.05 * k, 0xffffff, 0.9 * a);
      for (let l = 0; l < (s.layers ?? 0); l++) D.ring(g, s.at, g0 * (0.2 + 0.12 * l) * e, 2, c, 0.7 * (1 - p));
    });
    return sleep(450);
  },
  beam(s) {   // strumień magii od rogu do celu, z falującymi iskrami
    const g0 = grid(), c = s.color, d = dist(s.from, s.to), T = clamp((d / 1600) * 1000, 150, 500), fade = 350;
    const ux = (s.to.x - s.from.x) / (d || 1), uy = (s.to.y - s.from.y) / (d || 1);
    animate(T + fade, (g, p) => {
      const now = p * (T + fade), head = Math.min(1, now / T), a = now > T ? 1 - (now - T) / fade : 1;
      const B = lerp(s.from, s.to, head);
      D.line(g, s.from, B, g0 * 0.14, c, 0.3 * a);
      D.line(g, s.from, B, g0 * 0.045, mix(c, 0.6), 0.9 * a);
      for (let i = 0; i < 5; i++) {
        const f = ((now / 400 + i / 5) % 1) * head, q = lerp(s.from, s.to, f), w = Math.sin(f * 12 + i) * g0 * 0.08;
        D.dot(g, { x: q.x - uy * w, y: q.y + ux * w }, g0 * 0.05, mix(c, 0.3), 0.8 * a);
      }
    });
    return sleep(T);
  },
  heal(s) {   // unoszące się krzyżyki i ciepła poświata
    const c = s.color, R = radius(s), r = rng(`${s.at.x}:${s.at.y}:heal`);
    const parts = Array.from({ length: 12 }, () => [r(), r()]);
    animate(1400, (g, p) => {
      D.dot(g, s.at, R * (0.9 + 0.2 * p), c, 0.28 * (1 - p));
      for (const [a, d] of parts) {
        const age = clamp((p - d * 0.4) / 0.6, 0, 1);
        if (age <= 0) continue;
        const q = { x: s.at.x + (a - 0.5) * R * 1.6, y: s.at.y + R * 0.6 - age * R * 1.6 }, z = R * 0.13 * (1 - age * 0.3);
        D.line(g, { x: q.x - z, y: q.y }, { x: q.x + z, y: q.y }, 5, c, 0.6 * (1 - age));
        D.line(g, { x: q.x, y: q.y - z }, { x: q.x, y: q.y + z }, 5, c, 0.6 * (1 - age));
        D.line(g, { x: q.x - z, y: q.y }, { x: q.x + z, y: q.y }, 2.5, mix(c, 0.6), 1 - age);
        D.line(g, { x: q.x, y: q.y - z }, { x: q.x, y: q.y + z }, 2.5, mix(c, 0.6), 1 - age);
      }
    });
    return sleep(300);
  },
  shield(s) {   // bańka
    const c = s.color, R = radius(s) * 1.2;
    animate(1500, (g, p) => {
      const e = 1 - (1 - Math.min(1, p / 0.25)) ** 2, fade = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      D.dot(g, s.at, R * e, c, 0.12 * fade);
      D.ring(g, s.at, R * e, 3, mix(c, 0.4), 0.8 * fade);
      for (let i = 0; i < 6; i++) { const a = p * 2 + (i * TAU) / 6; D.arc(g, s.at, R * e * 0.9, a, a + 0.5, 2, mix(c, 0.7), 0.5 * fade); }
    });
    return sleep(350);
  },
  tk(s) {   // poświata telekinezy, iskry unoszą się
    const c = s.color, R = radius(s);
    animate(1400, (g, p) => {
      const fade = fadeIO(p), pulse = 0.5 + 0.5 * Math.sin(p * 20);
      D.ring(g, s.at, R * 1.02, R * 0.16, c, (0.25 + 0.15 * pulse) * fade);
      D.ring(g, s.at, R * 0.95, 2, mix(c, 0.5), 0.8 * fade);
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8, up = (p * 1.5 + i / 8) % 1;
        D.dot(g, { x: s.at.x + Math.cos(a) * R * 0.9, y: s.at.y + Math.sin(a) * R * 0.5 - up * R * 0.6 }, R * 0.05, mix(c, 0.4), 0.8 * fade * (1 - up));
      }
    });
    return sleep(300);
  },
  mind(s) {   // fale zbiegają się do głowy
    const c = s.color, R = radius(s), head = { x: s.at.x, y: s.at.y - R * 0.35 };
    animate(1100, (g, p) => {
      for (let i = 0; i < 3; i++) {
        const q = clamp(p * 1.4 - i * 0.2, 0, 1);
        if (q <= 0 || q >= 1) continue;
        const rr = R * 1.3 * (1 - q), pts = [];
        for (let k = 0; k < 36; k++) { const a = (k * TAU) / 36, w = rr * (1 + 0.06 * Math.sin(a * 5 + p * 10)); pts.push(head.x + Math.cos(a) * w, head.y + Math.sin(a) * w * 0.6); }
        D.poly(g, pts, null, 1, { width: 2.5, color: mix(c, 0.3), alpha: 0.8 * (1 - q) });
      }
    });
    return sleep(300);
  },
  burst(s) {   // wybuch magii
    const c = s.color, R = radius(s) * (s.big ? 1.6 : 1.3);
    animate(700, (g, p) => {
      const e = 1 - (1 - p) ** 3;
      D.dot(g, s.at, R * e, c, 0.5 * (1 - p));
      D.dot(g, s.at, R * 0.45 * e, mix(c, 0.7), 0.8 * (1 - p) ** 2);
      D.ring(g, s.at, R * 1.2 * e, 3, mix(c, 0.4), 0.8 * (1 - p));
    });
    return sleep(250);
  },
  sparkle(s) {   // iskry wokół celu
    const c = s.color, R = radius(s), r = rng(`${s.at.x}:${s.at.y}:sp`);
    const parts = Array.from({ length: 10 }, () => [r() * TAU, 0.5 + r() * 0.7, r()]);
    animate(1100, (g, p) => {
      for (const [a, d, ph] of parts) {
        const q = clamp((p - ph * 0.4) / 0.6, 0, 1);
        if (q > 0) D.poly(g, sparkle4(toward(s.at, a, R * d), R * 0.14 * Math.sin(Math.PI * q), q * 2), mix(c, 0.5), 0.95);
      }
      D.ring(g, s.at, R * (0.8 + 0.4 * p), 2, c, 0.4 * (1 - p));
    });
    return sleep(300);
  },
  teleport(s) {   // zapadnięcie i błysk
    const c = s.color, R = radius(s) * 1.3;
    animate(900, (g, p) => {
      if (p < 0.55) { const q = p / 0.55; D.ring(g, s.at, R * (1 - q), 3, mix(c, 0.4), 0.9); D.dot(g, s.at, R * 0.6 * (1 - q), c, 0.3); return; }
      const q = (p - 0.55) / 0.45;
      D.dot(g, s.at, R * 0.5 * (1 - q), 0xffffff, 0.9 * (1 - q));
      for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; D.line(g, toward(s.at, a, R * 0.2 * q), toward(s.at, a, R * (0.3 + 0.7 * q)), 2.5, mix(c, 0.5), 0.9 * (1 - q)); }
    });
    return sleep(500);
  },
  flash(s) {   // światło z rogu
    const c = s.color, g0 = grid(), k = s.big ? 1.25 : 1;
    animate(900, (g, p) => {
      const e = easeOut(Math.min(1, p / 0.3)), a = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7;
      D.dot(g, s.at, g0 * 0.85 * k * e, mix(c, 0.6), 0.3 * a);
      D.dot(g, s.at, g0 * 0.4 * k * e, 0xffffff, 0.7 * a);
      for (let i = 0; i < 12; i++) { const ang = (i * TAU) / 12; D.line(g, toward(s.at, ang, g0 * 0.2 * e), toward(s.at, ang, g0 * (0.4 + 0.45 * e) * k), 2, mix(c, 0.7), 0.6 * a); }
    });
    return sleep(300);
  },
  shimmer(s) {   // falujący zarys — ukrycie, iluzja
    const c = s.color, R = radius(s);
    animate(1200, (g, p) => {
      const a = Math.sin(Math.PI * p);
      for (let i = 0; i < 2; i++) {
        const pts = [];
        for (let k = 0; k < 40; k++) { const ang = (k * TAU) / 40, w = R * (1.02 + 0.06 * Math.sin(ang * 7 + p * 18 + i * 2)); pts.push(s.at.x + Math.cos(ang) * w, s.at.y + Math.sin(ang) * w); }
        D.poly(g, pts, null, 1, { width: 2, color: mix(c, 0.5 + 0.2 * i), alpha: 0.6 * a });
      }
    });
    return sleep(300);
  },
  fizzle(s) {   // iskry opadają i gasną
    const c = s.color ?? 0xc9b2ff, g0 = grid(), r = rng(`${s.at.x}:${s.at.y}:fz`);
    const parts = Array.from({ length: 7 }, () => [r() * TAU, r()]);
    animate(800, (g, p) => {
      for (const [a, d] of parts) { const q = toward(s.at, a, g0 * 0.25 * p * (0.5 + d)); q.y += g0 * 0.35 * p * p; D.dot(g, q, g0 * 0.03 * (1 - p), mix(c, 0.4), 0.9 * (1 - p)); }
    });
    animate(900, (g, p) => D.dot(g, { x: s.at.x, y: s.at.y - g0 * 0.2 * p }, g0 * (0.08 + 0.12 * p), 0x8a8a8a, 0.45 * (1 - p)), { add: false });
    return sleep(400);
  },
  burnout(s) {   // fioletowy dym — magia się wypaliła
    const g0 = grid();
    animate(250, (g, p) => D.dot(g, s.at, g0 * 0.15 * (1 - p), 0xb98cff, 0.9 * (1 - p)));
    animate(1300, (g, p) => {
      const e = easeOut(p);
      for (let i = 0; i < 5; i++) { const q = toward(s.at, (i * TAU) / 5 + 0.3, g0 * 0.25 * e); q.y -= g0 * 0.4 * p; D.dot(g, q, g0 * (0.1 + 0.18 * e), 0x5a3a7a, 0.55 * (1 - p)); }
    }, { add: false });
    return sleep(500);
  }
};

// JB2A: białe grafiki do barwienia (wersje „TMFX”); wiązka, ukrycie, porażka i wypalenie — zawsze wygląd wbudowany
const size = (s, k) => ({ v: ((radius(s) * 2) / grid()) * k, o: { gridUnits: true } });
const tinted = (file, s, k, delay = 0) => seq => {
  const z = size(s, k);
  const e = seq.effect().file(file).atLocation(s.at).size(z.v, z.o).tint(s.color).locally();
  if (delay) e.delay(delay);
  return e;
};
const SPELL_SEQ = {
  cast: { files: ["jb2a.extras.tmfx.inpulse.circle.01.normal"], play: (s, f) => { sqFire(seq => { const e = seq.effect().file(f).atLocation(s.at).size(0.9 + 0.3 * (s.layers ?? 0), { gridUnits: true }).tint(s.color).locally(); return e; }); return sleep(450); } },
  heal: { files: ["jb2a.twinkling_stars.points07.white"], play: (s, f) => { sqFire(tinted(f, s, 1.4)); return sleep(300); } },
  shield: { files: ["jb2a.extras.tmfx.border.circle.simple.01"], play: (s, f) => { sqFire(tinted(f, s, 1.35)); return sleep(350); } },
  tk: { files: ["jb2a.extras.tmfx.border.circle.inpulse.01.normal"], play: (s, f) => { sqFire(tinted(f, s, 1.3)); return sleep(300); } },
  mind: { files: ["jb2a.extras.tmfx.radar.circle.pulse.01.normal"], play: (s, f) => { sqFire(tinted(f, s, 1.4)); return sleep(300); } },
  burst: { files: ["jb2a.extras.tmfx.outpulse.circle.02.normal", "jb2a.extras.tmfx.outpulse.circle.01.normal"], play: (s, f) => { sqFire(tinted(f, s, s.big ? 2.4 : 1.9)); return sleep(250); } },
  sparkle: { files: ["jb2a.twinkling_stars.points07.white"], play: (s, f) => { sqFire(tinted(f, s, 1.4)); return sleep(300); } },
  teleport: { files: ["jb2a.extras.tmfx.inpulse.circle.01.normal"], play: (s, f) => { sqFire(seq => { tinted(f, s, 1.6)(seq); const out = pick(["jb2a.extras.tmfx.outpulse.circle.01.normal"]); if (out) tinted(out, s, 1.8, 500)(seq); }); return sleep(500); } },
  flash: { files: ["jb2a.extras.tmfx.outpulse.circle.04.normal", "jb2a.extras.tmfx.outpulse.circle.01.normal"], play: (s, f) => { sqFire(seq => seq.effect().file(f).atLocation(s.at).size(s.big ? 3 : 2.2, { gridUnits: true }).tint(mix(s.color, 0.5)).locally()); return sleep(300); } }
};

/** Czary: każdy krok osobno — JB2A, gdy jest i gracz go nie wyłączył, inaczej wygląd wbudowany. */
const SPELL = Object.fromEntries(Object.entries(SPELL_BUILTIN).map(([k, fn]) => [k, s => {
  const sq = SPELL_SEQ[k];
  const file = sq && sequencerOk() ? pick(sq.files) : null;
  return file ? sq.play(s, file) : fn(s);
}]));

// ---------- nanoszenie obrażeń ----------
const WOUND_BUILTIN = {
  blood(s) {   // krople krwi rozpryskują się i opadają
    const g0 = grid(), k = s.big ? 1.5 : 1, r = rng(`${s.at.x}:${s.at.y}:blood`);
    const drops = Array.from({ length: Math.round(10 * k) }, () => [r() * TAU, 0.4 + r() * 0.8, 0.6 + r() * 0.6]);
    animate(800, (g, p) => {
      for (const [a, sp, sz] of drops) {
        const q = toward(s.at, a, g0 * 0.35 * k * sp * easeOut(p));
        q.y += g0 * 0.25 * p * p;
        D.dot(g, q, g0 * 0.045 * sz * (1 - 0.4 * p), 0x2a0006, 0.8 * (1 - p * 0.6));
        D.dot(g, q, g0 * 0.033 * sz * (1 - 0.4 * p), 0xc8102e, 0.95 * (1 - p * 0.6));
      }
      D.ellipse(g, s.at, g0 * 0.12 * k * easeOut(p), g0 * 0.07 * k * easeOut(p), 0x7a0012, 0.7 * (1 - p));
    }, { add: false });
    animate(200, (g, p) => D.dot(g, s.at, g0 * 0.14 * k * (1 - p), 0xff6a4d, 0.8 * (1 - p)));
    return sleep(200);
  },
  sparks(s) {   // maszyna, pojazd, pancerz wspomagany: iskry i dym
    const g0 = grid(), k = s.big ? 1.5 : 1, r = rng(`${s.at.x}:${s.at.y}:sp`);
    const rays = Array.from({ length: Math.round(9 * k) }, () => [r() * TAU, 0.5 + r()]);
    animate(450, (g, p) => {
      for (const [a, l] of rays) D.line(g, toward(s.at, a, g0 * 0.1 * p), toward(s.at, a, g0 * (0.12 + 0.35 * l * k * easeOut(p))), 2, 0xffe2a0, 0.95 * (1 - p));
      D.dot(g, s.at, g0 * 0.12 * k * (1 - p), 0xfff4d0, 0.9 * (1 - p));
    });
    animate(1100, (g, p) => D.dot(g, { x: s.at.x, y: s.at.y - g0 * 0.3 * p }, g0 * (0.1 + 0.2 * p) * k, 0x6a6a6a, 0.4 * (1 - p)), { add: false });
    return sleep(200);
  },
  graze(s) {   // otarcie — obrażenia poniżej progu rany
    const g0 = grid();
    animate(350, (g, p) => {
      D.dot(g, s.at, g0 * 0.1 * (1 - p), 0xffb547, 0.8 * (1 - p));
      D.ring(g, s.at, g0 * (0.08 + 0.2 * p), 2, 0xffb547, 0.7 * (1 - p));
    });
    return sleep(150);
  },
  deflect(s) {   // pancerz zatrzymał: iskry i rykoszet w bok
    const g0 = grid(), r = rng(s.seed ?? `${s.at.x}:${s.at.y}`), a0 = r() * TAU;
    const rays = Array.from({ length: 7 }, () => [a0 + (r() - 0.5) * 1.6, 0.5 + r() * 0.6]);
    animate(400, (g, p) => {
      for (const [a, l] of rays) D.line(g, toward(s.at, a, g0 * 0.05), toward(s.at, a, g0 * (0.1 + 0.3 * l * easeOut(p))), 2, 0xdff0ff, 0.95 * (1 - p));
      D.dot(g, s.at, g0 * 0.1 * (1 - p), 0xffffff, 0.9 * (1 - p));
    });
    const end = toward(s.at, a0, g0 * 1.6);
    const T = 260;
    animate(T + 120, (g, p) => {
      const now = p * (T + 120), head = Math.min(1, now / T), back = clamp(now / T - 0.3, 0, 1), a = now > T ? 1 - (now - T) / 120 : 1;
      D.line(g, lerp(s.at, end, back), lerp(s.at, end, head), g0 * 0.06, 0xb0d8ff, 0.5 * a);
      D.line(g, lerp(s.at, end, back), lerp(s.at, end, head), g0 * 0.02, 0xffffff, 0.95 * a);
    });
    return sleep(200);
  },
  disintegrate(s) {   // cel rozpada się w popiół (różowy) albo maź (zielona)
    const c = s.color ?? 0xff7de0, R = radius(s), r = rng(`${s.at.x}:${s.at.y}:dis`);
    const parts = Array.from({ length: 46 }, () => [(r() - 0.5) * 1.8, (r() - 0.5) * 1.8, r()]);
    animate(2200, (g, p) => {
      for (const [x, y, d] of parts) {
        const q = clamp((p - d * 0.35) / 0.65, 0, 1);
        if (q <= 0) continue;
        const pt = { x: s.at.x + x * R * (1 + q * 0.4), y: s.at.y + y * R - q * R * 1.4 };
        D.dot(g, pt, R * 0.06 * (1 - q * 0.6), d < 0.5 ? c : mix(c, 0.5), 0.9 * (1 - q));
      }
      D.dot(g, s.at, R * 1.05, c, 0.35 * Math.max(0, 1 - p * 2));
    });
    animate(2600, (g, p) => D.ellipse(g, { x: s.at.x, y: s.at.y + R * 0.75 }, R * 0.7 * easeOut(Math.min(1, p * 2)), R * 0.18 * easeOut(Math.min(1, p * 2)), c === 0x7dff4d ? 0x3a6a2a : 0x8a7a80, 0.7 * (p < 0.7 ? 1 : (1 - p) / 0.3)), { add: false });
    return sleep(700);
  },
  death(s) {   // czerwony błysk i fala, token gaśnie
    const R = radius(s);
    animate(1000, (g, p) => {
      const e = easeOut(p);
      D.dot(g, s.at, R * 1.1, 0xff2a2a, 0.35 * (1 - p));
      D.ring(g, s.at, R * (0.6 + 1.2 * e), 4, 0xff2a2a, 0.8 * (1 - p));
      D.ring(g, s.at, R * (0.4 + 0.8 * e), 2, 0xffffff, 0.5 * (1 - p));
    });
    animate(1400, (g, p) => D.dot(g, s.at, R * 1.05, 0x000000, 0.45 * Math.sin(Math.PI * p)), { add: false });
    return sleep(400);
  },
  dust(s) {   // przewrócony: kurz przy ziemi
    const R = radius(s);
    animate(1000, (g, p) => {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.1 + 0.8 * (i / 5)), q = { x: s.at.x + Math.cos(a) * R * (0.4 + 0.6 * easeOut(p)) * (i % 2 ? 1 : -1), y: s.at.y - R * 0.1 * p };
        D.dot(g, q, R * (0.15 + 0.2 * p), 0xb8a888, 0.45 * (1 - p));
      }
    }, { add: false });
    return sleep(200);
  },
  explode: s => BUILTIN.explode(s)
};

const WOUND_SEQ = {
  blood: { files: ["jb2a.liquid.splash02.red"], play: (s, f) => { sqFire(seq => seq.effect().file(f).atLocation(s.at).size(s.big ? 1.3 : 0.9, { gridUnits: true }).locally()); return sleep(200); } },
  death: { files: ["jb2a.markers.skull.dark_orange.02", "jb2a.markers.skull.dark_orange.01"], play: (s, f) => { WOUND_BUILTIN.death(s); sqFire(seq => seq.effect().file(f).atLocation(s.at).size(((radius(s) * 2) / grid()) * 1.3, { gridUnits: true }).duration(2400).fadeIn(200).fadeOut(600).locally()); return sleep(400); } },
  explode: { files: BLASTS.frag.files, play: s => SEQ.explode(s) }
};

/** Obrażenia: każdy krok osobno — JB2A (krew, czaszka, wybuch), gdy jest, inaczej wygląd wbudowany. */
const WOUND = Object.fromEntries(Object.entries(WOUND_BUILTIN).map(([k, fn]) => [k, s => {
  const sq = WOUND_SEQ[k];
  const file = sq && sequencerOk() ? pick(sq.files) : null;
  return file ? sq.play(s, file) : fn(s);
}]));

