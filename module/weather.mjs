/**
 * Pogoda (podręcznik s. 628, tabela „Weather and Lighting”): MG wybiera ją dla całego świata,
 * a modyfikatory same trafiają do okna rzutu jako zaznaczona pozycja sytuacyjna (w budynku można ją odznaczyć).
 *   - celność i percepcja: kroki MFD albo −5 do rzutu,
 *   - skradanie: osobna kolumna (słońce utrudnia, burza ułatwia),
 *   - lot: manewry wykonuje się z modyfikatorem celności (wiatr też przeszkadza).
 * Z modułem Weather Forging (pogoda na mapie) obie pogody są jedną: modyfikatory idą za tym, co widać na oglądanej
 * scenie, a wybór pogody w FoE ustawia ją w Weather Forging (weather-wf.mjs). Scena bez jego pogody — jak dotąd.
 */
import { t, tfields } from "./i18n.mjs";
import { WF_ID, WF_FLAG, WF_CORE_WEATHER, wfWeatherKey, wfFromFoe, wfExtKey } from "./weather-wf.mjs";
const F = "foe-rpg";

// acc: { steps, mod } — celność/percepcja; accOnly — nie dotyczy percepcji; sneak — kroki MFD skradania; vis — zasięg widzenia ×PER (ft)
export const WEATHER = tfields({
  sunny: { label: "Sunny", acc: { steps: 1 }, sneak: -2, vis: 15 },
  partly: { label: "Partly cloudy", acc: {}, sneak: -1, vis: 10 },
  overcast: { label: "Overcast (standard)", acc: {}, sneak: 0, vis: 10 },
  drizzle: { label: "Drizzle", acc: { mod: -5 }, sneak: 1, vis: 10 },
  rain: { label: "Storm (rain)", acc: { steps: -1 }, sneak: 1, vis: 5 },
  typhoon: { label: "Typhoon / hurricane", acc: { steps: -3 }, sneak: 2, vis: 5 },
  hail: { label: "Hail", acc: { steps: -2 }, sneak: 1, vis: 5 },
  snow: { label: "Snowstorm", acc: { steps: -1 }, sneak: 1, vis: 5 },
  blizzard: { label: "Blizzard", acc: { steps: -3 }, sneak: 2, vis: 2 },
  wind: { label: "Strong wind", acc: { steps: -1 }, accOnly: true, sneak: 0, vis: 10 },
  mist: { label: "Mist", acc: { mod: -5 }, sneak: 1, vis: 5 },
  fog: { label: "Fog / clouds / smoke", acc: { steps: -1 }, sneak: 0, vis: 5 },
  magicFog: { label: "Magical fog / clouds", acc: { steps: -2 }, sneak: 1, vis: 3 },
  eclipse: { label: "Eclipse", acc: { steps: -1 }, sneak: 2, vis: 3 },
  dust: { label: "Dust storm", acc: { steps: -2 }, sneak: 1, vis: 3 },
  sand: { label: "Sandstorm", acc: { steps: -3 }, sneak: 3, vis: 1 }
}, ["label"]);

export function currentWeather() {
  const wf = wfSceneWeather();
  let k = wf ?? "overcast";
  if (!wf) try { k = game.settings.get(F, "weather") || "overcast"; } catch { /* brak ustawień (testy) */ }
  return WEATHER[k] ? { key: k, ...WEATHER[k], wf: !!wf } : { key: "overcast", ...WEATHER.overcast };
}

// ---------- Weather Forging ----------
const wfLinked = () => { try { return game.settings.get(F, "weatherForging") !== false; } catch { return true; } };
const wfApi = () => {
  const mod = globalThis.game?.modules?.get?.(WF_ID);
  return mod?.active && mod.api?.getWeather ? mod.api : null;
};
const viewedScene = () => globalThis.canvas?.scene ?? globalThis.game?.scenes?.active ?? null;

/**
 * Rodzaj pogody FoE z pogody Weather Forging na oglądanej scenie; null — moduł wyłączony, powiązanie wyłączone
 * albo scena bez jego pogody (wtedy zostaje pogoda wybrana w FoE).
 */
export function wfSceneWeather(scene = viewedScene()) {
  const api = wfApi();
  if (!api || !scene || !wfLinked()) return null;
  try {
    // Weather Forging przejmuje też wbudowaną pogodę sceny Foundry
    if (!scene.getFlag?.(WF_ID, WF_FLAG) && !WF_CORE_WEATHER.includes(scene.weather)) return null;
    return wfWeatherKey(api.getWeather(scene), api.getTarget?.(scene));
  } catch { return null; }
}

/** MG: pogoda z FoE trafia do Weather Forging na oglądanej scenie (płynne przejście); raz — gdy już tam jest, nic. */
async function syncToWF(key) {
  const api = wfApi(), scene = viewedScene();
  if (!api?.setWeather || !scene || !wfLinked() || !game.user?.isGM || !WEATHER[key]) return;
  if (wfExtKey(api.getTarget?.(scene)) === key) return;
  try { await api.setWeather(scene, wfFromFoe(key)); } catch (err) { console.warn(`${F} | Weather Forging`, err); }
}

function rerender() {
  ui.combat?.render?.();
  for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render();
}

const stepsText = n => `${n > 0 ? "+" : "−"}${Math.abs(n)} ${t("st.")}`;

/** Krótki opis modyfikatorów pogody, np. „accuracy, perception and flight −1 st. · sneaking +1 st. · visibility 5×PER ft”. */
export function weatherSummary(w = currentWeather()) {
  const acc = w.acc.steps ? stepsText(w.acc.steps) : w.acc.mod ? `${w.acc.mod}` : "";
  return [
    acc ? `${w.accOnly ? t("accuracy and flight") : t("accuracy, perception and flight")} ${acc}` : "",
    w.sneak ? t("sneaking {s}", { s: stepsText(w.sneak) }) : "",
    t("visibility {n}×PER ft", { n: w.vis })
  ].filter(Boolean).join(" · ");
}

/** Pozycja sytuacyjna do okna rzutu (zaznaczona domyślnie) albo null. ctx jak w rollContext(). */
export function weatherSituational(ctx) {
  const w = currentWeather();
  if (w.key === "overcast") return null;
  let mod = 0, steps = 0;
  const perception = ctx.kind === "attr" && ctx.attr === "per";
  if (ctx.kind === "attack" || (ctx.kind === "skill" && ctx.skill === "flight") || (perception && !w.accOnly)) {
    mod = w.acc.mod ?? 0; steps = w.acc.steps ?? 0;
  } else if (ctx.kind === "skill" && ctx.skill === "sneak") {
    steps = w.sneak;
  }
  if (!mod && !steps) return null;
  return { id: "weather", label: t("Weather: {w}", { w: w.label }), source: t("outdoors — uncheck indoors"), mod, steps, on: true };
}

/** Ustawienie świata + wybór pogody w trackerze walki (MG) i podgląd dla graczy. */
export function registerWeatherSettings() {
  game.settings.register(F, "weather", {
    name: "Weather",
    hint: "Weather modifiers (p. 628) are added automatically to accuracy, perception, sneaking and flight rolls. You can also change it in the combat tab.",
    scope: "world", config: true, type: String, default: "overcast",
    choices: Object.fromEntries(Object.entries(WEATHER).map(([k, v]) => [k, v.label])),
    onChange: value => {
      rerender();
      // zmiana w ustawieniach świata: ta sama pogoda w Weather Forging (zapisuje aktywny MG)
      if (game.users?.activeGM?.isSelf) syncToWF(value);
    }
  });
  game.settings.register(F, "weatherForging", {
    name: "Weather Forging: shared weather",
    hint: "With the Weather Forging module active, weather modifiers follow the weather it shows on the scene you are viewing, and choosing the weather here or in the combat tab sets it in Weather Forging with a smooth transition. Scenes without Weather Forging weather use the weather chosen here.",
    scope: "world", config: !!globalThis.game?.modules?.get?.(WF_ID), type: Boolean, default: true,
    onChange: () => rerender()
  });
}

export async function setWeather(key) {
  if (!WEATHER[key]) return ui.notifications.warn(t("Unknown weather: {k}", { k: key }));
  // najpierw Weather Forging — zmiana ustawienia niżej nie dubluje zapisu (sprawdza, czy już tam jest)
  await syncToWF(key);
  return game.settings.set(F, "weather", key);
}

export function registerWeatherHooks() {
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-weather")) return;
    const w = currentWeather();
    const box = document.createElement("div");
    box.className = "foe-weather";
    box.title = `${weatherSummary(w)}${w.wf ? " · Weather Forging" : ""}`;
    box.innerHTML = game.user.isGM
      ? `<i class="fa-solid fa-cloud-sun-rain"></i> <select>${Object.entries(WEATHER).map(([k, v]) => `<option value="${k}" ${k === w.key ? "selected" : ""}>${v.label}</option>`).join("")}</select>`
      : `<i class="fa-solid fa-cloud-sun-rain"></i> ${w.label}`;
    box.querySelector("select")?.addEventListener("change", ev => setWeather(ev.target.value));
    const head = root.querySelector(".combat-tracker-header, header") ?? root;
    head.append(box);
  });

  // Weather Forging: nowa pogoda na scenie albo zmiana sceny — modyfikatory na kartach i w zakładce walki od nowa
  let shown = null;
  const refresh = () => {
    const k = currentWeather().key;
    if (k !== shown) { shown = k; rerender(); }
  };
  Hooks.on(`${WF_ID}.changed`, (scene, target, transition) => {
    if (scene !== viewedScene()) return;
    refresh();
    // zmiana z panelu Weather Forging idzie płynnie — jeszcze raz po przejściu
    const ms = (Number(transition?.duration) || 0) * 1000;
    if (ms > 0) setTimeout(refresh, ms + 300);
  });
  Hooks.on("canvasReady", () => { if (wfApi()) refresh(); });
  // wbudowana pogoda sceny (bez wpisu Weather Forging) też się liczy
  Hooks.on("updateScene", (scene, changes) => { if ("weather" in changes && scene === viewedScene() && wfApi()) refresh(); });
}
