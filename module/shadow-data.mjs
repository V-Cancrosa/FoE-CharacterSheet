/**
 * Magia cieni i podmieńcy — czyste zasady (bez Foundry, do testów).
 *
 * Z podręcznika v1.22 (s. 35, 574):
 *   - Shadowflash (cecha kucyka nietoperzowego, 1 pkt, nie z Young): działa jak Teleportation I (10×INT ft), ale tylko
 *     na siebie i trzymane przedmioty; pula „strain cieni” = AGI + PER + 2, koszt 2, odnawia się 1 na godzinę;
 *     nie działa na nią tłumienie magii; rzut Flight MFD ½ przy uniku (sukces = unik udany), ¾ w innych sytuacjach;
 *     nie zachowuje pędu,
 *   - Sonic Screech kucyków nietoperzowych: 3d12, kryt. x1, SATS 40, przedział 10 ft (maks. 30), +2d12 przeciw maszynom
 *     i pancerzom wspomaganym, ignoruje pancerz (chyba że cel jest w szczelnym pancerzu); celowanie Energy Weapons,
 *   - Shadow Form (Czarna Księga): forma cienia — 4 kroki MFD do skradania w cieniu, przeskok między cieniami do 40 ft.
 *
 * Podmieńcy: podręcznik v1.22 opisuje ich tylko fabularnie (zasady zapowiedziane w księdze II) i wspomina, że naturalnie
 * zmieniają głos i potrafią Perfect Illusion. Wszystko poniżej o podmieńcach to ZASADY DOMOWE:
 *   - pula miłości = CHA + END; 1 dziennie na utrzymanie, 1 za przemianę; przy 0 — głód: −1 krok rzutów END i CHA,
 *   - żerowanie: rzut Speechcraft, sukces +1d4 miłości (krytyk 2d4),
 *   - wykrycie przebrania: rzut PER obserwatora z MFD wg znajomości (jak przy Voice Alteration, s. 316).
 */
const F = "foe-rpg";
const flags = actor => actor?.flags?.[F] ?? {};
const featureNamed = (actor, re) => (actor?.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));

export const isBatPony = actor => /nietoperz|bat ?pon/i.test(String(actor?.system?.race ?? ""));
export const isChangeling = actor => /podmie|changeling/i.test(String(actor?.system?.race ?? ""));
export const hasShadowflash = actor => featureNamed(actor, /shadowflash/i);
export const hasShadowForm = actor => featureNamed(actor, /shadow form|forma cienia/i);

/** Pula strainu cieni: maks. AGI + PER + 2; zużyte punkty wracają 1 na godzinę czasu gry. */
export function shadowState(actor, now = globalThis.game?.time?.worldTime ?? 0) {
  const a = actor?.system?.attributes ?? {};
  const max = (a.agi?.total ?? 0) + (a.per?.total ?? 0) + 2;
  const f = flags(actor).shadow ?? {};
  const back = Math.max(0, Math.floor((now - (Number(f.at) || 0)) / 3600));
  const spent = Math.max(0, (Number(f.spent) || 0) - back);
  return { max, spent, value: Math.max(0, max - spent), nextIn: spent ? 3600 - ((now - (Number(f.at) || 0)) % 3600) : 0 };
}

/** Flaga po wydaniu punktów (zapisuje stan „teraz”, żeby odnawianie liczyło się od tej chwili). */
export function spendShadow(state, cost, now) {
  return { spent: Math.min(state.max, state.spent + cost), at: now };
}

export const SHADOW_MODES = {
  dodge: { label: "Unik (Shadowflash)", mfd: "1/2", cost: 2, note: "sukces = unik udany automatycznie; reakcja, bez akcji" },
  teleport: { label: "Teleport (Shadowflash)", mfd: "3/4", cost: 2, note: "do 10×INT ft, tylko ty i trzymane przedmioty; pęd przepada" },
  warp: { label: "Przeskok między cieniami (Shadow Form)", mfd: "3/4", cost: 0, note: "do 40 ft, tylko między cieniami (zależy od światła)" }
};

/** Sonic Screech jako broń (dane przedmiotu). */
export function sonicScreechItem() {
  return {
    name: "Sonic Screech", type: "weapon", img: "systems/foe-rpg/icons/energy.svg",
    system: {
      skill: "energy", kind: "special", damage: "3d12", shots: 1, satsCost: 40, ammo: { value: 0, max: 0 }, ammoType: "", reload: "",
      range: "10 ft (maks. 30)", rangeInc: 10, crit: "x1", ignoreDT: 0, flat: false, armorless: true,
      description: "<p>Ultradźwiękowy krzyk kucyka nietoperzowego (s. 35). +2d12 przeciw maszynom i pancerzom wspomaganym. Całkowicie ignoruje pancerz, chyba że cel jest w szczelnie zamkniętym pancerzu (wtedy odznacz to przy nanoszeniu). Zasięg maks. 30 ft.</p>"
    },
    flags: { [F]: { racial: "sonicScreech" } }
  };
}

// ---------- podmieńcy (zasady domowe) ----------
export function loveState(actor) {
  const a = actor?.system?.attributes ?? {};
  const max = Math.max(1, (a.cha?.total ?? 0) + (a.end?.total ?? 0));
  const f = flags(actor).love ?? {};
  const value = Math.max(0, Math.min(max, f.value ?? max));
  return { max, value, starving: value <= 0, day: Number(f.day) || 0 };
}
export const disguiseOf = actor => flags(actor).disguise ?? null;

/** Ile dni utrzymania minęło od ostatniego rozliczenia (1 miłość / dzień). */
export function upkeepDays(state, now) {
  const today = Math.floor(now / 86400);
  return { today, days: state.day ? Math.max(0, today - state.day) : 0 };
}

/** Efekty stanu podmieńca do actorEffects: głód miłości. */
export function changelingEffects(actor) {
  if (!isChangeling(actor)) return [];
  // liczone przed atrybutami (actorEffects na początku przygotowania danych) — tylko z zapisanej wartości
  if ((flags(actor).love?.value ?? 1) > 0) return [];
  return [{ type: "basedStep", target: "end,cha", value: -1, when: "", source: "Głód miłości (podmieniec)", id: "love.hunger" }];
}

/** MFD wykrycia przebrania wg znajomości z oryginałem (s. 316: zna blisko — 1; widział raz krótko — kryt.). */
export const FAMILIARITY = {
  intimate: { label: "Zna oryginał bardzo dobrze", mfd: "1" },
  friend: { label: "Zna oryginał dobrze", mfd: "3/4" },
  acquaint: { label: "Zna oryginał z widzenia", mfd: "1/2" },
  met: { label: "Spotkał oryginał kilka razy", mfd: "1/4" },
  once: { label: "Widział oryginał raz, krótko", mfd: "1/10" }
};
