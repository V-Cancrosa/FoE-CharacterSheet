/**
 * Podróż po pustkowiach (s. 481–482, tabela XXXIV). Bez Foundry — testowalne w Node.
 *   - Grupa idzie tempem najwolniejszego członka idącego o własnych siłach (niesieni się nie liczą).
 *   - Marsz: tabela „na godzinę” i „na dobę” (doba zakłada postoje na jedzenie i sen).
 *   - Pośpiech ×2 na godzinę: co 2 h bez 30-minutowego postoju END (pierwszy ¾, kolejne ½) — porażka kogokolwiek:
 *     grupa staje na godzinę (system zawsze staje; ran za marsz bez postoju nie liczy).
 *   - Bieg ×4: co godzinę bez 15-minutowej przerwy END ¼ — porażka: wyczerpanie na 1k6 h (grupa czeka).
 *   - Lot ×2 dystansu pieszego przy tej samej szybkości: Flight ¾ co godzinę (porażkę ocenia MG), od 6. godziny lotu
 *     z rzędu END ½ co godzinę — porażka: lądowanie i godzina odpoczynku.
 *   - Pojazd: tempo tych, którzy go ciągną (szybkość podaje MG).
 */
export const TABLE_XXXIV = Object.freeze([
  [5, 1, 16], [10, 2, 32], [15, 4, 64], [20, 6, 96], [25, 8, 120], [30, 10, 144], [35, 12, 168], [40, 14, 192], [45, 16, 216],
  [50, 18, 240], [55, 20, 264], [60, 22, 288], [65, 24, 312], [70, 26, 336], [75, 28, 360], [80, 30, 384], [85, 32, 408], [90, 34, 432]
]);

/** Mile na godzinę i na dobę dla szybkości (ft/akcję): wiersz tabeli w dół do pełnych 5; ponad 90 — +2 / +24 co 5. */
export function rateOf(speed) {
  const s = Math.floor((Number(speed) || 0) / 5) * 5;
  if (s < 5) return { hour: 0, day: 0, speed: s };
  if (s <= 90) { const r = TABLE_XXXIV.find(x => x[0] === s); return { hour: r[1], day: r[2], speed: s }; }
  const k = (s - 90) / 5;
  return { hour: 34 + 2 * k, day: 432 + 24 * k, speed: s };
}

export const MODES = Object.freeze({ walk: 1, vehicle: 1, hurry: 2, run: 4, fly: 2 });

/** Tempo grupy: najmniejsza szybkość z liczących się (lot: wszyscy muszą latać). */
export function partySpeed(members, mode) {
  const pace = members.filter(m => m.pace);
  if (!pace.length) return { speed: 0, slowest: null, grounded: [] };
  const grounded = mode === "fly" ? pace.filter(m => !m.canFly) : [];
  const slowest = pace.reduce((a, b) => ((Number(b.speed) || 0) < (Number(a.speed) || 0) ? b : a));
  return { speed: Number(slowest.speed) || 0, slowest, grounded };
}

const half = h => Math.ceil(h * 2 - 1e-9) / 2;

/**
 * Plan: { speed, mode, miles } albo { speed, mode, hours } → { moving (godziny w ruchu), total (z postojami doby),
 * miles, days, rate }. Marsz i pojazd: pełne doby według kolumny „na dobę”, reszta według „na godzinę”.
 * Pośpiech, bieg, lot: tylko tempo godzinowe (bez nocnych postojów — dzieli MG).
 */
export function plan({ speed, mode = "walk", miles = null, hours = null }) {
  const r = rateOf(speed), mult = MODES[mode] ?? 1;
  const hourly = r.hour * mult;
  if (!hourly) return { moving: 0, total: 0, miles: 0, days: 0, rate: { ...r, hourly } };
  const daily = mode === "walk" || mode === "vehicle";
  if (miles != null) {
    const m = Math.max(0, Number(miles) || 0);
    if (!daily) { const h = half(m / hourly); return { moving: h, total: h, miles: m, days: 0, rate: { ...r, hourly } }; }
    const days = Math.floor(m / r.day + 1e-9);
    const rest = half((m - days * r.day) / hourly);
    return { moving: days * 24 + rest, total: days * 24 + rest, miles: m, days, rate: { ...r, hourly } };
  }
  const h = Math.max(0, Number(hours) || 0);
  if (!daily) return { moving: h, total: h, miles: Math.round(h * hourly * 10) / 10, days: 0, rate: { ...r, hourly } };
  const days = Math.floor(h / 24);
  const restMiles = Math.min(r.day, (h - days * 24) * hourly);
  return { moving: h, total: h, miles: Math.round((days * r.day + restMiles) * 10) / 10, days, rate: { ...r, hourly } };
}

/**
 * Rzuty w drodze (pośpiech, bieg, lot). members — [{ name, end (TN END), flight (TN Flight) }], roll(tn, f, kind) → true/false
 * (kind "flight" — rzut Flight, do pogody),
 * d6() → 1–6. Zwraca { extra (godziny postojów), log: [{ at, kind, who: [nazwy, które oblały], step }] }.
 */
export function simulate(mode, moving, members, roll, d6) {
  const log = [];
  let extra = 0;
  if (!members.length || !moving) return { extra, log };
  if (mode === "hurry") {
    let since = 0, first = true;
    for (let t = 0; t < moving; t += 0.5) {
      since += 0.5;
      if (since >= 2 && t + 0.5 < moving) {
        const f = first ? 0.75 : 0.5;
        const who = members.filter(m => !roll(m.end, f)).map(m => m.name);
        log.push({ at: t + 0.5, kind: "hurry", step: first ? "3/4" : "1/2", who });
        if (who.length) { extra += 1; since = 0; first = true; } else { since = 0; first = false; }
      }
    }
  } else if (mode === "run") {
    let since = 0;
    for (let t = 0; t < moving; t += 0.5) {
      since += 0.5;
      if (since >= 1 && t + 0.5 < moving) {
        const who = members.filter(m => !roll(m.end, 0.25)).map(m => m.name);
        log.push({ at: t + 0.5, kind: "run", step: "1/4", who });
        if (who.length) { const rest = Math.max(...who.map(() => d6())); extra += rest; log[log.length - 1].rest = rest; }
        since = 0;
      }
    }
  } else if (mode === "fly") {
    let since = 0;
    for (let t = 1; t <= Math.ceil(moving); t++) {
      since += 1;
      const fl = members.filter(m => !roll(m.flight, 0.75, "flight")).map(m => m.name);
      log.push({ at: t, kind: "flight", step: "3/4", who: fl });
      if (since >= 6 && t < moving) {
        const who = members.filter(m => !roll(m.end, 0.5)).map(m => m.name);
        log.push({ at: t, kind: "flyEnd", step: "1/2", who });
        if (who.length) { extra += 1; since = 0; }
      }
    }
  }
  return { extra, log };
}

/** Czy podróż obejmuje noclegi (doba i dłużej) — wtedy przeskok liczy sen. */
export const campsOvernight = total => total >= 24;

// ---------- spotkania losowe w drodze i na postoju ----------
/** Częstotliwość: szansa na spotkanie przy każdym sprawdzeniu (co ENCOUNTER_EVERY godzin). Podręcznik jej nie podaje. */
export const ENCOUNTER_EVERY = 4;
export const ENCOUNTER_CHANCE = Object.freeze({ none: 0, rare: 5, normal: 10, often: 17, danger: 33 });

/** Godziny ruchu na dobę przy marszu z noclegami (reszta doby to postój). */
export function movingPerDay(p, mode) {
  if (!(mode === "walk" || mode === "vehicle") || !p.rate.hourly) return 24;
  return Math.min(24, p.rate.day / p.rate.hourly);
}

/** Pierwsze spotkanie: godzina (licząc od wymarszu) albo null. roll() → 1–100. Sprawdzenia co ENCOUNTER_EVERY h przed metą. */
export function encounterAt(total, chance, roll) {
  if (!(chance > 0)) return null;
  for (let h = ENCOUNTER_EVERY; h < total; h += ENCOUNTER_EVERY) if (roll() <= chance) return h;
  return null;
}

/** Faza w chwili h: "road" (w drodze) albo "camp" (postój nocny). */
export const phaseAt = (h, mDay) => ((h % 24) < mDay - 1e-9 ? "road" : "camp");

/** Najdłuższy postój nocny w pierwszych e godzinach (do snu). */
export function longestCamp(e, mDay) {
  if (mDay >= 24) return 0;
  const full = Math.floor(e / 24);
  const part = Math.max(0, e - full * 24 - mDay);
  return Math.max(full ? 24 - mDay : 0, part);
}

/** Przebyte mile po e godzinach (marsz: według planu po czasie; inne: tempo godzinowe minus postoje przed e). */
export function milesAfter({ speed, mode, e, extraBefore = 0, maxMiles = Infinity }) {
  const daily = mode === "walk" || mode === "vehicle";
  const m = daily ? plan({ speed, mode, hours: e }).miles : Math.round(Math.max(0, e - extraBefore) * plan({ speed, mode, hours: 1 }).rate.hourly * 10) / 10;
  return Math.min(maxMiles, m);
}
