/**
 * Sylwetka postaci w stylu PipBucka (jak schemat lokacji na karcie z podręcznika, s. 630):
 * części ciała kolorowane wg stanu, opisy z ranami, DT, pancerzem i karą strzału celowanego.
 * Czysta funkcja: dane SVG do szablonu (bez Foundry). Rysunek własny, kucyk z profilu (widać lewy bok).
 */
import { CALLED_SHOTS, HIT_TABLES } from "./combat.mjs";

const VIEW_W = 760, VIEW_H = 330;
const BOX_W = 142, BOX_H = 72;
const DX = 76;   // przesunięcie kucyka do środka (miejsce na opisy po bokach)

/** Kształty kucyka (lewy profil, łeb po lewej). far — dalsza noga (ciemniejsza, rysowana pod spodem). */
const PONY = {
  frLeg: { far: true, d: "M272,198 C272,228 272,252 272,278 L294,278 C294,252 296,226 298,204 Z", anchor: [284, 246] },
  rrLeg: { far: true, d: "M370,188 C384,212 380,238 372,256 C369,264 369,270 370,278 L392,278 C392,266 396,250 402,234 C410,210 404,192 394,184 Z", anchor: [384, 240] },
  torso: { d: "M215,152 C215,121 250,105 300,105 L370,105 C416,105 441,126 441,160 C441,195 416,212 370,212 L280,212 C240,212 215,190 215,152 Z", anchor: [330, 160] },
  head: { d: "M228,168 C206,142 191,122 181,103 C166,108 141,110 124,101 C107,92 107,72 121,64 C130,40 160,22 195,26 C226,30 241,55 238,82 C237,98 246,110 264,116 L246,138 C238,148 232,158 228,168 Z", anchor: [182, 66] },
  flLeg: { d: "M238,188 C236,220 234,250 232,282 L258,282 C258,252 262,222 266,198 Z", anchor: [248, 248] },
  rlLeg: { d: "M392,178 C412,200 410,232 398,256 C394,266 394,274 396,282 L422,282 C420,270 424,254 430,236 C440,206 434,184 420,170 Z", anchor: [414, 236] },
  wings: { d: "M292,112 C286,80 300,50 342,32 C337,46 353,46 357,56 C349,64 363,70 357,80 C345,84 345,96 333,104 C321,110 306,114 292,112 Z", anchor: [330, 72] },
  horn: { d: "M180,30 L170,-4 L193,27 Z", anchor: [178, 8] }
};
const PONY_DECOR = [
  "M205,30 L214,6 L227,35",                                                    // ucho
  "M197,25 C238,20 264,48 263,88 C262,100 268,110 280,114 M226,33 C250,44 256,70 252,96", // grzywa
  "M441,140 C482,132 502,170 490,220 C486,236 474,246 463,250 C471,232 471,210 459,190 C453,178 445,170 437,166", // ogon
  "M233,272 L258,272 M272,268 L294,268 M396,272 L422,272 M370,268 L392,268",  // kopyta
  "M128,82 C132,86 138,86 142,83"                                              // pysk
];
const PONY_EYE = [165, 60];
const DY = 22;   // kucyk niżej (róg ma miejsce u góry)

/** Dwunożni (minotaury, psy): schemat z przodu; przednie nogi = ramiona. */
const BIPED = {
  torso: { d: "M330,96 L430,96 L440,200 L320,200 Z", anchor: [380, 150] },
  head: { d: "M380,22 C404,22 412,40 412,58 C412,78 398,92 380,92 C362,92 348,78 348,58 C348,40 356,22 380,22 Z", anchor: [380, 56] },
  // postać stoi przodem: jej lewa strona jest po prawej stronie ekranu
  frLeg: { d: "M322,100 L298,110 L276,196 L294,202 L318,130 Z", anchor: [300, 150] },
  flLeg: { d: "M438,100 L462,110 L484,196 L466,202 L442,130 Z", anchor: [460, 150] },
  rrLeg: { d: "M326,204 L376,204 L370,306 L338,306 Z", anchor: [352, 260] },
  rlLeg: { d: "M384,204 L434,204 L422,306 L390,306 Z", anchor: [408, 260] }
};

/** Miejsca opisów: lewa kolumna i prawa kolumna. */
const SLOTS_PONY = { horn: ["L", 0], head: ["L", 1], flLeg: ["L", 2], frLeg: ["L", 3], wings: ["R", 0], torso: ["R", 1], rlLeg: ["R", 2], rrLeg: ["R", 3] };
const SLOTS_BIPED = { head: ["L", 0], frLeg: ["L", 1], rrLeg: ["L", 3], torso: ["R", 0], flLeg: ["R", 1], rlLeg: ["R", 3] };

const STATUS_PL = { ok: "sprawna", wounded: "ranna", crippled: "OKALECZONA", maimed: "UTRACONA", dead: "ŚMIERĆ" };

/**
 * Dane sylwetki.
 * sys — dane postaci (locations z ranami, DT, stanem); locs — lokacje, które ma ta postać;
 * opts: { table, labels, cyber: Set lokacji z protezą }.
 */
export function bodyMap(sys, locs, { table = "earth", labels = {}, cyber = new Set() } = {}) {
  const biped = !!HIT_TABLES[table]?.biped;
  const shapes = biped ? BIPED : PONY;
  const slots = biped ? SLOTS_BIPED : SLOTS_PONY;
  const dx = biped ? 0 : DX;
  const dy = biped ? 0 : DY;
  const have = new Set(locs);
  const parts = [], callouts = [];
  // dalsze nogi najpierw (pod spodem)
  const order = Object.keys(shapes).filter(k => have.has(k));
  for (const k of order) {
    const L = sys.locations?.[k];
    if (!L) continue;
    const s = shapes[k];
    const limit = L.limit || 1;
    const status = L.offline ? "crippled" : L.status ?? "ok";
    const called = CALLED_SHOTS[k]?.steps ?? 0;
    const name = labels[k] ?? k;
    const title = [
      `${name}: ${L.wounds}/${limit} ran (${STATUS_PL[status]})`,
      `okaleczenie od ${L.crippleAt ?? "?"} ran, ${k === "head" || k === "torso" ? "śmierć" : "utrata"} od ${limit}`,
      `DT ${L.dtTotal}${L.armorName ? ` — pancerz ${L.armorName} ${L.armorDt}` : ""}${L.naturalDt ? `, inne ${L.naturalDt}` : ""}`,
      called ? `strzał celowany: ${called} kroki MFD` : "",
      cyber.has(k) ? `proteza${L.offline ? " — bez zasilania" : ""}` : "",
      "lewy klik: +1 rana · prawy klik: −1 rana"
    ].filter(Boolean).join("\n");
    parts.push({
      key: k, d: s.d, far: !!s.far, cls: `st-${status}${L.armorDt > 0 ? " armored" : ""}${cyber.has(k) ? " cyber" : ""}`,
      fill: Math.min(1, L.wounds / limit) * 0.75 + (status === "ok" ? 0.05 : 0.15), title
    });
    const [side, row] = slots[k] ?? ["R", 0];
    const bx = side === "L" ? 6 : VIEW_W - BOX_W - 6;
    const by = 8 + row * (BOX_H + 8);
    const [ax, ay] = s.anchor;
    callouts.push({
      key: k, x: bx, y: by, w: BOX_W, h: BOX_H, cls: `st-${status}`,
      lx1: side === "L" ? bx + BOX_W : bx, ly1: by + BOX_H / 2, lx2: ax + dx, ly2: ay + dy,
      tx: bx + 7,
      name: `${name}${cyber.has(k) ? " ⚙" : ""}`,
      line1: `Rany ${L.wounds}/${limit}${status !== "ok" ? ` · ${STATUS_PL[status]}` : ""}`,
      line2: `DT ${L.dtTotal}${L.armorName ? ` · ${short(L.armorName)}` : ""}`,
      line3: called ? `Cel ${called} kr. MFD` : "Cel bez kary",
      bar: Math.round(Math.min(1, L.wounds / limit) * (BOX_W - 14))
    });
  }
  // kolejność rysowania: dalsze nogi pod spodem, róg i skrzydła na wierzchu
  parts.sort((a, b) => (b.far - a.far) || (["wings", "horn"].includes(a.key) - ["wings", "horn"].includes(b.key)));
  return {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, biped, dx, dy,
    decor: biped ? [] : PONY_DECOR, eye: biped ? null : { cx: PONY_EYE[0], cy: PONY_EYE[1] },
    parts, callouts
  };
}

const short = s => (String(s).length > 18 ? `${String(s).slice(0, 17)}…` : String(s));
