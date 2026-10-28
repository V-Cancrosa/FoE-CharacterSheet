/**
 * Motyw PipBucka dla całego Foundry (v13/v14):
 *   - ekran pauzy: godło Stajni z numerem (ustawienie świata) i „GRA WSTRZYMANA” z zakłóceniami kineskopu
 *     (w czasie przerwy z modułu Break Time — „PRZERWA”),
 *   - interfejs w stylu PipBucka (pasek boczny, czat, gracze, makra, sceny, kontrolki, powiadomienia) — opcja gracza,
 *   - kolory nastawienia tokenów jak radar EFS z PipBucka (zielony — swoi, czerwony — wrogowie, żółty — neutralni),
 *   - ekran powitalny PipBucka po zalogowaniu (tylko u siebie, bez wpisu na czacie),
 *   - dźwięki PipBucka: krótkie piknięcia generowane w przeglądarce, bez plików (opcja gracza, domyślnie wyłączona).
 * Wygląd: styles/ui.css; grafiki i teksty: ui-art.mjs.
 */
import { stableDoorUrl, welcomeLines } from "./ui-art.mjs";
import { t } from "./i18n.mjs";

const F = "foe-rpg";
const get = (key, fallback) => { try { return game.settings.get(F, key); } catch { return fallback; } };
export const PIP_HEX = { green: "#4dff8a", amber: "#ffb547", blue: "#5fd8ff", white: "#e4f2e8" };
const pipHex = () => PIP_HEX[get("pipColor", "green")] ?? PIP_HEX.green;
/** Przerwa z modułu Break Time (breaktime) — wtedy ekran pauzy mówi „PRZERWA”. */
const onBreak = () => { try { return !!game.modules.get("breaktime")?.active && !!game.settings.get("breaktime", "paused"); } catch { return false; } };
const PAUSE_TEXT = () => (onBreak() ? t("BREAK") : t("GAME PAUSED"));

/** Kolory radaru EFS (Eyes Forward Sparkle) dla obwódek i pierścieni tokenów. */
export const EFS_COLORS = { HOSTILE: 0xff3b30, NEUTRAL: 0xffd23f, FRIENDLY: 0x4dff8a, PARTY: 0x8affb8 };

export function registerUiSettings() {
  const theme = () => document.body.classList.toggle("foe-ui", !!get("uiTheme", true));
  game.settings.register(F, "uiTheme", {
    name: "PipBuck theme for the interface",
    hint: "Sidebar, chat, player list, macro bar, scenes and controls in the colors of the PipBuck screen (the color from the “PipBuck screen color” setting). Turn it off if you prefer the regular look of Foundry.",
    scope: "client", config: true, type: Boolean, default: true, onChange: theme
  });
  game.settings.register(F, "stableNumber", {
    name: "Stable number (pause screen and welcome)",
    hint: "The number on the Stable emblem shown on the pause screen (at most 3 digits).",
    scope: "world", config: true, type: String, default: "97", onChange: () => ui.pause?.render?.()
  });
  game.settings.register(F, "efsColors", {
    name: "Tokens in EFS radar colors",
    hint: "Token borders and rings like on the PipBuck radar: green — friendly, red — hostile, yellow — neutral. Takes effect after a reload.",
    scope: "world", config: true, type: Boolean, default: true, requiresReload: true
  });
  game.settings.register(F, "uiWelcome", {
    name: "PipBuck welcome screen",
    hint: "After logging in, the PipBuck screen with the character's name and condition appears for a moment (only for you; a click closes it).",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(F, "uiSounds", {
    name: "PipBuck sounds",
    hint: "Quiet beeps on pause, when opening system sheets and on your own rolls (volume as “Interface” in the sound settings).",
    scope: "client", config: true, type: Boolean, default: false
  });
  theme();
}

// ======================================================================
// Dźwięki (Web Audio — bez plików)
// ======================================================================
let AUDIO = null;
function audio() {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AC) return null;
  AUDIO ??= new AC();
  if (AUDIO.state === "suspended") AUDIO.resume().catch(() => null);
  return AUDIO;
}
export const SOUNDS = {
  pause: [{ f: 880, d: 0.07 }, { f: 587, d: 0.13 }],
  unpause: [{ f: 587, d: 0.07 }, { f: 880, d: 0.13 }],
  open: [{ f: 1320, d: 0.035, type: "triangle" }],
  roll: [{ f: 990, d: 0.03 }, { f: 1480, d: 0.03 }],
  welcome: [{ f: 523, d: 0.06 }, { f: 784, d: 0.06 }, { f: 1046, d: 0.1 }]
};
/** Zagraj sekwencję piknięć (gdy gracz ma dźwięki włączone). */
export function beep(name) {
  if (!get("uiSounds", false)) return;
  const seq = SOUNDS[name];
  const a = seq && audio();
  if (!a) return;
  let vol = 0.5;
  try { vol = Number(game.settings.get("core", "globalInterfaceVolume")); } catch { /* domyślna */ }
  const peak = Math.max(0.0002, Math.min(1, Number.isFinite(vol) ? vol : 0.5) * 0.12);
  let t = a.currentTime + 0.01;
  for (const s of seq) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = s.type ?? "square";
    o.frequency.setValueAtTime(s.f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + s.d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + s.d + 0.02);
    t += s.d + 0.025;
  }
}

// ======================================================================
// Ekran pauzy
// ======================================================================
/** Podmienia ikonę i napis pauzy Foundry (figure#pause: <img> + <figcaption>). */
export function decoratePause(element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;
  root.classList.add("foe-pause");
  root.style.setProperty("--foe-pause", pipHex());
  const img = root.querySelector("img");
  if (img) {
    img.src = stableDoorUrl(get("stableNumber", "97"), pipHex());
    img.classList.remove("fa-spin");
    img.alt = "";
  }
  const cap = root.querySelector("figcaption, h3");
  if (cap) { cap.textContent = PAUSE_TEXT(); cap.dataset.text = PAUSE_TEXT(); }
}

// ======================================================================
// Ekran powitalny
// ======================================================================
function welcome() {
  if (!get("uiWelcome", true) || document.querySelector(".foe-welcome")) return;
  const actor = game.user.character;
  const sys = actor?.system ?? {};
  const sats = sys.resources?.sats;
  const lines = welcomeLines({
    user: game.user.name, actor: actor?.name ?? "", gm: game.user.isGM, stable: get("stableNumber", "97"),
    caps: actor ? Number(sys.caps) || 0 : null, sats: sats ? `${sats.value}/${sats.max}` : null,
    rads: actor ? Number(sys.resources?.rads?.value) || 0 : null
  });
  const box = document.createElement("div");
  box.className = "foe-welcome";
  box.innerHTML = `<div class="fw-frame"><img src="${stableDoorUrl(get("stableNumber", "97"), pipHex())}" alt=""><pre></pre></div>`;
  document.body.append(box);
  const pre = box.querySelector("pre");
  const text = lines.join("\n");
  let i = 0;
  const close = () => { box.classList.add("out"); setTimeout(() => box.remove(), 400); };
  box.addEventListener("click", close);
  const timer = setInterval(() => {
    if (!box.isConnected) return clearInterval(timer);
    i = Math.min(text.length, i + 2);
    pre.textContent = `${text.slice(0, i)}${i < text.length ? "█" : ""}`;
    if (i >= text.length) { clearInterval(timer); setTimeout(close, 3200); }
  }, 18);
  beep("welcome");
}

export function registerUiHooks() {
  // pauza: Foundry v13/v14 (GamePause) — hak renderowania i dźwięk przy przełączeniu
  Hooks.on("renderGamePause", (app, element) => { try { decoratePause(element); } catch (err) { console.warn(`${F} | pauza`, err); } });
  Hooks.on("pauseGame", paused => beep(paused ? "pause" : "unpause"));
  // Break Time: początek i koniec przerwy zmieniają napis na ekranie pauzy
  const breakChanged = setting => { if (setting?.key === "breaktime.paused") try { ui.pause?.render?.(); } catch { /* brak ekranu pauzy */ } };
  Hooks.on("createSetting", breakChanged);
  Hooks.on("updateSetting", breakChanged);
  // kolory EFS przed narysowaniem planszy
  Hooks.once("setup", () => {
    if (!get("efsColors", true)) return;
    const dc = globalThis.CONFIG?.Canvas?.dispositionColors;
    if (dc) Object.assign(dc, EFS_COLORS);
  });
  // dźwięk przy otwarciu kart i okien systemu, przy własnym rzucie
  Hooks.on("renderApplicationV2", (app, element, context, options) => {
    if (options?.isFirstRender && app?.element?.classList?.contains("foe-rpg") && !app.element.classList.contains("foe-roll-dialog")) beep("open");
  });
  Hooks.on("createChatMessage", msg => { if (msg.flags?.[F]?.test && msg.author?.isSelf) beep("roll"); });
  // kolor godła wg ustawienia gracza; powitanie po wczytaniu
  Hooks.once("ready", () => {
    try { ui.pause?.render?.(); } catch { /* starsze wersje */ }
    setTimeout(welcome, 600);
  });
}

