/**
 * Weather Forging (moduł pogody na mapie) ↔ pogoda FoE z tabeli podręcznika (s. 628) — część bez Foundry.
 *
 * Weather Forging trzyma pogodę jako liczby (opady 0–1: deszcz, śnieg, grad, popiół; wiatr w km/h, mgła, zachmurzenie,
 * pioruny), FoE — jako jeden z 16 rodzajów z modyfikatorami do celności, percepcji, skradania i lotu.
 *   - foeFromWF: liczby → rodzaj FoE (progi niżej),
 *   - wfFromFoe: rodzaj FoE → stan dla Weather Forging; dokładny rodzaj jedzie w extensions["foe-rpg"].weather,
 *     więc wybór w FoE wraca do FoE bez zmian (np. „Magiczna mgła” nie staje się zwykłą mgłą),
 *   - wfWeatherKey: rodzaj z pogody sceny — z extensions celu przejścia (wfExtKey), a bez nich z liczb w tej chwili.
 */
export const WF_ID = "weather-forging";
export const WF_FLAG = "weather";
const EXT = "foe-rpg";

/** Wbudowana pogoda sceny Foundry, którą Weather Forging przejmuje bez własnego wpisu (jego CORE_WEATHER_MAP). */
export const WF_CORE_WEATHER = ["leaves", "rain", "rainStorm", "fog", "snow", "blizzard"];

export const FOE_WEATHER_KEYS = ["sunny", "partly", "overcast", "drizzle", "rain", "typhoon", "hail", "snow", "blizzard",
  "wind", "mist", "fog", "magicFog", "eclipse", "dust", "sand"];

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const valid = k => FOE_WEATHER_KEYS.includes(k);

/** Rodzaj pogody FoE ze stanu Weather Forging. */
export function foeFromWF(s) {
  const ext = wfExtKey(s);
  if (ext) return ext;
  const p = s?.precipitation ?? {};
  const rain = num(p.rain), snow = num(p.snow), hail = num(p.hail), ash = num(p.ash), dust = num(p.dust), sand = num(p.sand);
  const wind = num(s?.wind?.speed), fog = num(s?.fog), cloud = num(s?.cloudCover, 0.8), lightning = num(s?.lightning);
  if (sand >= 0.3) return "sand";
  if (dust >= 0.3 || (ash >= 0.3 && wind >= 30)) return "dust";      // popiół niesiony wiatrem — jak burza pyłowa
  if (ash >= 0.3) return "fog";                                       // opadający popiół — jak dym
  if (snow >= 0.15 && snow >= rain * 0.8) return wind >= 50 || snow >= 0.85 ? "blizzard" : "snow";   // deszcz ze śniegiem — śnieżyca
  if (hail >= 0.25) return "hail";
  if (rain >= 0.1 || snow >= 0.15) {
    if (wind >= 90) return "typhoon";
    return rain + snow >= 0.45 || lightning >= 0.3 ? "rain" : "drizzle";
  }
  if (fog >= 0.6) return "fog";
  if (fog >= 0.3) return "mist";
  if (wind >= 40) return "wind";
  if (cloud < 0.2) return "sunny";
  if (cloud < 0.6) return "partly";
  return "overcast";
}

// Stan Weather Forging dla każdego rodzaju FoE (jak presety Weather Forging, uzupełnione o brakujące)
const TO_WF = {
  sunny: { temperature: 22, cloudCover: 0.05, wind: { speed: 6 } },
  partly: { temperature: 18, cloudCover: 0.4, wind: { speed: 10 } },
  overcast: { temperature: 12, cloudCover: 0.85, wind: { speed: 12 } },
  drizzle: { temperature: 11, cloudCover: 0.85, fog: 0.1, wind: { speed: 8 }, precipitation: { rain: 0.25 }, ground: { wetness: 0.4 } },
  rain: { temperature: 9, cloudCover: 1, fog: 0.15, lightning: 0.6, wind: { speed: 55, gusts: 0.7 }, precipitation: { rain: 1 }, ground: { wetness: 1 } },
  typhoon: { temperature: 16, cloudCover: 1, fog: 0.3, lightning: 0.5, wind: { speed: 130, gusts: 0.9 }, precipitation: { rain: 1 }, ground: { wetness: 1 } },
  hail: { temperature: 2, cloudCover: 1, wind: { speed: 30, gusts: 0.5 }, precipitation: { hail: 0.7, rain: 0.2 }, ground: { wetness: 0.6 } },
  snow: { temperature: -3, cloudCover: 0.9, wind: { speed: 15 }, precipitation: { snow: 0.6 }, ground: { snow: 0.6 } },
  blizzard: { temperature: -15, cloudCover: 1, fog: 0.45, wind: { speed: 70, gusts: 0.8 }, precipitation: { snow: 1 }, ground: { snow: 1 } },
  wind: { temperature: 12, cloudCover: 0.5, wind: { speed: 60, gusts: 0.7 } },
  mist: { temperature: 8, cloudCover: 0.7, fog: 0.4, wind: { speed: 3 }, ground: { wetness: 0.2 } },
  fog: { temperature: 6, cloudCover: 0.7, fog: 0.8, wind: { speed: 2 }, ground: { wetness: 0.3 } },
  magicFog: { temperature: 8, cloudCover: 0.8, fog: 0.9, wind: { speed: 1 } },
  eclipse: { temperature: 10, cloudCover: 0.1, wind: { speed: 4 } },
  // Weather Forging nie ma jeszcze pyłu ani piasku — na razie popiół (dokładny rodzaj i tak jest w extensions)
  dust: { temperature: 28, cloudCover: 0.6, fog: 0.4, wind: { speed: 45, gusts: 0.6 }, precipitation: { ash: 0.5 } },
  sand: { temperature: 32, cloudCover: 0.5, fog: 0.6, wind: { speed: 70, gusts: 0.8 }, precipitation: { ash: 0.85 } }
};

/** Stan dla Weather Forging (setWeather) z rodzaju FoE. */
export function wfFromFoe(key) {
  const k = valid(key) ? key : "overcast";
  return { ...structuredClone(TO_WF[k]), extensions: { [EXT]: { weather: k } } };
}

// Liczby, po których poznać, że cel przejścia to wciąż pogoda ustawiona z FoE (kierunek wiatru się nie liczy)
const FIELDS = [["temperature"], ["cloudCover"], ["fog"], ["lightning"], ["wind", "speed"], ["wind", "gusts"],
  ["precipitation", "rain"], ["precipitation", "snow"], ["precipitation", "hail"], ["precipitation", "ash"],
  ["ground", "snow"], ["ground", "wetness"]];
const at = (o, path) => path.reduce((v, k) => v?.[k], o);
const fallback = path => (path[0] === "temperature" ? 15 : 0);   // jak normalizeState w Weather Forging

/**
 * Rodzaj FoE zapisany w celu przejścia — tylko gdy cel to wciąż ta pogoda. Weather Forging scala flagę sceny,
 * więc po wyborze presetu w jego panelu stary wpis w extensions zostaje; wtedy liczby się nie zgadzają i wpis się nie liczy.
 */
export function wfExtKey(target) {
  const k = target?.extensions?.[EXT]?.weather;
  if (!valid(k)) return null;
  const want = TO_WF[k];
  const same = FIELDS.every(path => Math.abs(num(at(target, path), fallback(path)) - num(at(want, path), fallback(path))) < 1e-3);
  return same ? k : null;
}

/**
 * Rodzaj FoE z pogody sceny. target — dokąd prowadzi przejście (getTarget), current — stan w tej chwili (getWeather).
 * Wybór z FoE (extensions celu) działa od razu; zmiana z panelu Weather Forging — według liczb w trakcie przejścia
 * (stare extensions z poprzedniej pogody się nie liczą).
 */
export function wfWeatherKey(current, target) {
  return wfExtKey(target) ?? foeFromWF({ ...(current ?? {}), extensions: {} });
}
