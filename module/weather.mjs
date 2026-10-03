/**
 * Pogoda (podręcznik s. 628, tabela „Weather and Lighting”): MG wybiera ją dla całego świata,
 * a modyfikatory same trafiają do okna rzutu jako zaznaczona pozycja sytuacyjna (w budynku można ją odznaczyć).
 *   - celność i percepcja: kroki MFD albo −5 do rzutu,
 *   - skradanie: osobna kolumna (słońce utrudnia, burza ułatwia),
 *   - lot: manewry wykonuje się z modyfikatorem celności (wiatr też przeszkadza).
 */
const F = "foe-rpg";

// acc: { steps, mod } — celność/percepcja; accOnly — nie dotyczy percepcji; sneak — kroki MFD skradania; vis — zasięg widzenia ×PER (ft)
export const WEATHER = {
  sunny: { label: "Słonecznie", acc: { steps: 1 }, sneak: -2, vis: 15 },
  partly: { label: "Częściowe zachmurzenie", acc: {}, sneak: -1, vis: 10 },
  overcast: { label: "Pochmurno (standard)", acc: {}, sneak: 0, vis: 10 },
  drizzle: { label: "Mżawka", acc: { mod: -5 }, sneak: 1, vis: 10 },
  rain: { label: "Burza (deszcz)", acc: { steps: -1 }, sneak: 1, vis: 5 },
  typhoon: { label: "Tajfun / huragan", acc: { steps: -3 }, sneak: 2, vis: 5 },
  hail: { label: "Grad", acc: { steps: -2 }, sneak: 1, vis: 5 },
  snow: { label: "Burza śnieżna", acc: { steps: -1 }, sneak: 1, vis: 5 },
  blizzard: { label: "Zamieć", acc: { steps: -3 }, sneak: 2, vis: 2 },
  wind: { label: "Silny wiatr", acc: { steps: -1 }, accOnly: true, sneak: 0, vis: 10 },
  mist: { label: "Mgiełka", acc: { mod: -5 }, sneak: 1, vis: 5 },
  fog: { label: "Mgła / chmury / dym", acc: { steps: -1 }, sneak: 0, vis: 5 },
  magicFog: { label: "Magiczna mgła / chmury", acc: { steps: -2 }, sneak: 1, vis: 3 },
  eclipse: { label: "Zaćmienie", acc: { steps: -1 }, sneak: 2, vis: 3 },
  dust: { label: "Burza pyłowa", acc: { steps: -2 }, sneak: 1, vis: 3 },
  sand: { label: "Burza piaskowa", acc: { steps: -3 }, sneak: 3, vis: 1 }
};

export function currentWeather() {
  let k = "overcast";
  try { k = game.settings.get(F, "weather") || "overcast"; } catch { /* brak ustawień (testy) */ }
  return WEATHER[k] ? { key: k, ...WEATHER[k] } : { key: "overcast", ...WEATHER.overcast };
}

const stepsText = n => `${n > 0 ? "+" : "−"}${Math.abs(n)} kr.`;

/** Krótki opis modyfikatorów pogody, np. „celność/percepcja −1 kr. · skradanie +1 kr. · widoczność 5×PER”. */
export function weatherSummary(w = currentWeather()) {
  const acc = w.acc.steps ? stepsText(w.acc.steps) : w.acc.mod ? `${w.acc.mod}` : "";
  return [
    acc ? `${w.accOnly ? "celność i lot" : "celność, percepcja i lot"} ${acc}` : "",
    w.sneak ? `skradanie ${stepsText(w.sneak)}` : "",
    `widoczność ${w.vis}×PER ft`
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
  return { id: "weather", label: `Pogoda: ${w.label}`, source: "na zewnątrz — odznacz w budynku", mod, steps, on: true };
}

/** Ustawienie świata + wybór pogody w trackerze walki (MG) i podgląd dla graczy. */
export function registerWeatherSettings() {
  game.settings.register(F, "weather", {
    name: "Pogoda",
    hint: "Modyfikatory pogody (s. 628) dodają się same do rzutów na celność, percepcję, skradanie i lot. Zmienisz ją też w zakładce walki.",
    scope: "world", config: true, type: String, default: "overcast",
    choices: Object.fromEntries(Object.entries(WEATHER).map(([k, v]) => [k, v.label])),
    onChange: () => {
      ui.combat?.render?.();
      for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render();
    }
  });
}

export function setWeather(key) {
  if (!WEATHER[key]) return ui.notifications.warn(`Nieznana pogoda: ${key}`);
  return game.settings.set(F, "weather", key);
}

export function registerWeatherHooks() {
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".foe-weather")) return;
    const w = currentWeather();
    const box = document.createElement("div");
    box.className = "foe-weather";
    box.title = weatherSummary(w);
    box.innerHTML = game.user.isGM
      ? `<i class="fa-solid fa-cloud-sun-rain"></i> <select>${Object.entries(WEATHER).map(([k, v]) => `<option value="${k}" ${k === w.key ? "selected" : ""}>${v.label}</option>`).join("")}</select>`
      : `<i class="fa-solid fa-cloud-sun-rain"></i> ${w.label}`;
    box.querySelector("select")?.addEventListener("change", ev => setWeather(ev.target.value));
    const head = root.querySelector(".combat-tracker-header, header") ?? root;
    head.append(box);
  });
}
