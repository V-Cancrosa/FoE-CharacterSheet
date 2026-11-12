/**
 * Różowa chmura (Pink Cloud) — logika bez Foundry.
 * Z podręcznika i bestiariusza: poziomy gęstości (3 — gęsta, 4 — dusząca: bez aparatu oddechowego 2k4 ran w głowę
 * i tułów oraz 1 rana w każdą odsłoniętą lokację na rundę), rzednie o 1 poziom na godzinę (chyba że wiatr albo woda),
 * maska przeciwgazowa nie pomaga, śmierć od chmury — END 1/10 i INT ¾ (ghul z Canterlotu, s. 611); ghule z Canterlotu
 * i alikorny z IMP są odporne, ghule od promieniowania — też.
 * ZASADA DOMOWA (brak tabeli w posiadanych stronach): poziomy 1, 2, 3 i 5 dopowiedziane na wzór poziomu 4.
 * Opcje z Project Horizons (osobne ustawienia świata): korozja sprzętu, zrastanie, różne tempo umierania,
 * nabyta odporność, wycie nadajników, alikorny tylko odporniejsze.
 */
import { N_ } from "./i18n.mjs";

export const ROUND = 6;   // sekund na rundę
export const PINK_LEVELS = Object.freeze([
  { d: 0, label: N_("none") },
  { d: 1, label: N_("1 — haze (1 wound a minute to an exposed location)") },
  { d: 2, label: N_("2 — mist (1 wound a round to an exposed location)") },
  { d: 3, label: N_("3 — dense (1d4 to head and torso + 1 to an exposed location a round)") },
  { d: 4, label: N_("4 — choking (2d4 to head and torso + 1 to every exposed location a round)") },
  { d: 5, label: N_("5 — saturated / liquid (4d4 to head and torso + 2 to every exposed location a round)") }
]);
/** Trudność rzutu END przy „różnym tempie umierania” (PH) i rzut na zrośnięcie. */
export const PINK_STEP = Object.freeze({ 1: "1", 2: "1", 3: "3/4", 4: "1/2", 5: "1/4" });

/** Gęstość teraz: rzednie o 1 na godzinę od ustawienia (since), chyba że stała (persistent). */
export function effectiveDensity(z, now) {
  const d = Math.max(0, Math.min(5, Math.round(Number(z?.density) || 0)));
  if (!d || z?.persistent) return d;
  const since = Number(z?.since);
  if (!Number.isFinite(since)) return d;
  return Math.max(0, d - Math.floor(Math.max(0, now - since) / 3600));
}

/**
 * Rany za n rund przy gęstości d. exposed — lokacje odsłonięte, breathe — aparat oddechowy (chroni głowę i tułów przed
 * wdychaniem), roundStart — numer pierwszej rundy (poziom 1: rana co 10. rundę), rng(sides) → 1..sides.
 * Zwraca { loc: rany }.
 */
export function pinkWounds(d, n, { exposed = [], breathe = false, roundStart = 0, rng } = {}) {
  const out = {};
  const add = (loc, w) => { if (w > 0) out[loc] = (out[loc] ?? 0) + w; };
  const pick = () => exposed[rng(exposed.length) - 1];
  const dice = (k, s) => { let x = 0; for (let i = 0; i < k; i++) x += rng(s); return x; };
  for (let r = roundStart; r < roundStart + n; r++) {
    if (d === 1) { if (exposed.length && r % 10 === 9) add(pick(), 1); continue; }
    if (d === 2) { if (exposed.length) add(pick(), 1); continue; }
    if (d === 3) { if (!breathe) { add("head", dice(1, 4)); add("torso", dice(1, 4)); } if (exposed.length) add(pick(), 1); continue; }
    if (d >= 4) {
      const k = d === 4 ? 2 : 4, per = d === 4 ? 1 : 2;
      if (!breathe) { add("head", dice(k, 4)); add("torso", dice(k, 4)); }
      for (const loc of exposed) add(loc, per);
    }
  }
  return out;
}

/** Wynik rzutu END przy „różnym tempie umierania”: krytyczny sukces — bez ran, sukces — połowa, porażka — całość. */
export function scaleWounds(w, res) {
  if (res === "crit-success") return {};
  if (res !== "success") return w;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.floor(v / 2)]).filter(([, v]) => v > 0));
}

/** Korozja (PH): zużycie pancerza na każdej zakrytej lokacji za n rund (gęstość 2–3: 1 na rundę, 4+: 2). */
export const corrosionPerRound = d => (d >= 4 ? 2 : d >= 2 ? 1 : 0);

/**
 * Gęstość działająca na postać: odporni → 0; nabyta odporność (PH) → −1; alikorn z IMP przy opcji „tylko odporniejsze”
 * (PH) → −2 zamiast odporności.
 */
export function densityFor(d, { canterlot = false, radGhoul = false, impAlicorn = false, alicornsResistOnly = false, resist = false } = {}) {
  if (!d || canterlot || radGhoul) return 0;
  if (impAlicorn) { if (!alicornsResistOnly) return 0; d -= 2; }
  if (resist) d -= 1;
  return Math.max(0, d);
}

export const sumWounds = w => Object.values(w).reduce((a, b) => a + b, 0);
