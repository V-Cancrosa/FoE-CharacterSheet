/**
 * Sylwetka postaci w stylu PipBucka / V.A.T.S. (jak schemat lokacji na karcie z podręcznika, s. 630):
 * części ciała kolorowane wg stanu, opisy z ranami, DT, pancerzem i karą strzału celowanego.
 * Czysta funkcja: dane SVG do szablonu (bez Foundry). Rysunek własny.
 *   - kucyk z góry, „na rozgwiazdę”: łeb u góry, nogi rozłożone na boki, oba skrzydła — lewa strona kucyka po lewej,
 *     prawa połowa to lustrzane odbicie lewej (symetria),
 *   - dwunożni (minotaury, psy): postać z przodu (jej lewa strona po prawej stronie ekranu).
 */
import { CALLED_SHOTS, HIT_TABLES } from "./combat.mjs";

const VIEW_W = 760, VIEW_H = 336;
const CX = VIEW_W / 2;
const BOX_W = 142, BOX_H = 72;

/** Lustro ścieżki względem osi x = CX (ścieżki tylko z bezwzględnych par „x,y”). */
export const mirror = d => String(d).replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${2 * CX - Number(x)},${y}`);

// ---------- kucyk z góry (lewa połowa; prawa to lustro) ----------
const L_FRONT = "M336,116 C316,106 300,100 290,94 C284,84 280,74 276,64 C272,56 258,58 256,68 C256,80 262,96 268,106 C284,122 304,134 330,146 Z";
const L_HIND = "M328,206 C308,214 292,224 280,234 C272,244 266,256 260,268 C256,280 270,286 276,276 C282,266 288,258 296,252 C310,244 322,238 334,232 Z";
const L_WING = "M326,140 C300,128 262,118 214,116 C200,116 192,122 198,128 C206,130 214,131 220,132 C206,136 198,142 200,148 C210,150 220,150 230,149 C220,154 214,160 218,166 C230,166 242,164 254,162 C248,168 248,174 254,178 C280,174 304,170 328,170 Z";
const TORSO = "M380,96 C420,96 438,124 438,160 C438,200 432,232 412,246 C398,256 362,256 348,246 C328,232 322,200 322,160 C322,124 340,96 380,96 Z";
const HEAD = "M352,100 C334,92 330,74 336,58 C340,46 350,36 358,24 C362,12 370,4 380,4 C390,4 398,12 402,24 C410,36 420,46 424,58 C430,74 426,92 408,100 C398,106 362,106 352,100 Z";
const HORN = "M375,46 L380,-8 L385,46 Z";
const PONY_TOP = {
  flLeg: { ds: [L_FRONT], anchor: [264, 72] },
  frLeg: { ds: [mirror(L_FRONT)], anchor: [496, 72] },
  rlLeg: { ds: [L_HIND], anchor: [264, 272] },
  rrLeg: { ds: [mirror(L_HIND)], anchor: [496, 272] },
  wings: { ds: [L_WING, mirror(L_WING)], anchor: [222, 140], under: true },
  torso: { ds: [TORSO], anchor: [412, 200] },
  head: { ds: [HEAD], anchor: [414, 66] },
  horn: { ds: [HORN], anchor: [380, 4] }
};
const L_EAR = "M344,80 L320,76 L340,64";
const L_FEATHERS = "M300,136 C276,130 248,128 224,128 M298,150 C274,146 248,146 232,149 M300,162 C282,162 266,163 254,165";
const L_HOOVES = "M257,74 C262,69 270,67 278,70 M259,264 C265,264 272,268 275,274";
const PONY_TOP_DECOR = [
  L_EAR, mirror(L_EAR), L_FEATHERS, mirror(L_FEATHERS), L_HOOVES, mirror(L_HOOVES),
  "M372,12 C374,16 376,16 378,12 M382,12 C384,16 386,16 388,12",               // chrapy
  "M380,54 C372,70 372,86 378,104 M384,58 C390,72 390,88 384,104",            // grzywa
  "M380,108 L380,240",                                                          // kręgosłup
  "M372,250 C360,272 362,298 378,324 C394,302 398,274 388,250"                // ogon
];
const PONY_TOP_EYES = [[355, 54], [405, 54]];
const DY = 12;

// ---------- dwunożni (z przodu) ----------
const BIPED = {
  // postać stoi przodem: jej lewa strona jest po prawej stronie ekranu
  frLeg: { ds: ["M322,100 L298,110 L276,196 L294,202 L318,130 Z"], anchor: [300, 150] },
  flLeg: { ds: ["M438,100 L462,110 L484,196 L466,202 L442,130 Z"], anchor: [460, 150] },
  rrLeg: { ds: ["M326,204 L376,204 L370,306 L338,306 Z"], anchor: [352, 260] },
  rlLeg: { ds: ["M384,204 L434,204 L422,306 L390,306 Z"], anchor: [408, 260] },
  torso: { ds: ["M330,96 L430,96 L440,200 L320,200 Z"], anchor: [380, 150] },
  head: { ds: ["M380,22 C404,22 412,40 412,58 C412,78 398,92 380,92 C362,92 348,78 348,58 C348,40 356,22 380,22 Z"], anchor: [380, 56] }
};

/** Miejsca opisów: kolumna (L/P) i wiersz — nogi przy swoich opisach. */
const SLOTS_PONY = { horn: ["L", 0], flLeg: ["L", 1], wings: ["L", 2], rlLeg: ["L", 3], head: ["R", 0], frLeg: ["R", 1], torso: ["R", 2], rrLeg: ["R", 3] };
const SLOTS_BIPED = { head: ["L", 0], frLeg: ["L", 1], rrLeg: ["L", 3], torso: ["R", 0], flLeg: ["R", 1], rlLeg: ["R", 3] };

const STATUS_PL = { ok: "sprawna", wounded: "ranna", crippled: "OKALECZONA", maimed: "UTRACONA", dead: "ŚMIERĆ" };

/** Poziom uszkodzenia do kolorów (styl V.A.T.S.): ok, light (żółty), heavy (czerwony), crippled (czerwony, pulsuje), lost (biały kontur, miga). */
export function damageLevel(L) {
  const status = L.offline ? "crippled" : L.status ?? "ok";
  if (status === "maimed" || status === "dead") return "lost";
  if (status === "crippled") return "crippled";
  if (!L.wounds) return "ok";
  return L.wounds >= Math.max(1, (L.crippleAt ?? 2) - 1) ? "heavy" : "light";
}

/**
 * Dane sylwetki.
 * sys — dane postaci (locations z ranami, DT, stanem); locs — lokacje, które ma ta postać;
 * opts: { table, labels, cyber: Set lokacji z protezą }.
 */
export function bodyMap(sys, locs, { table = "earth", labels = {}, cyber = new Set() } = {}) {
  const biped = !!HIT_TABLES[table]?.biped;
  const shapes = biped ? BIPED : PONY_TOP;
  const slots = biped ? SLOTS_BIPED : SLOTS_PONY;
  const dy = biped ? 0 : DY;
  const have = new Set(locs);
  const parts = [], callouts = [];
  for (const k of Object.keys(shapes).filter(x => have.has(x))) {
    const L = sys.locations?.[k];
    if (!L) continue;
    const s = shapes[k];
    const limit = L.limit || 1;
    const status = L.offline ? "crippled" : L.status ?? "ok";
    const level = damageLevel(L);
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
    parts.push({ key: k, ds: s.ds, under: !!s.under, cls: `dmg-${level}${L.armorDt > 0 ? " armored" : ""}${cyber.has(k) ? " cyber" : ""}`, title });
    const [side, row] = slots[k] ?? ["R", 0];
    const bx = side === "L" ? 6 : VIEW_W - BOX_W - 6;
    const by = 8 + row * (BOX_H + 10);
    const [ax, ay] = s.anchor;
    callouts.push({
      key: k, x: bx, y: by, w: BOX_W, h: BOX_H, cls: `dmg-${level}`,
      lx1: side === "L" ? bx + BOX_W : bx, ly1: by + BOX_H / 2, lx2: ax, ly2: ay + dy,
      tx: bx + 7,
      name: `${name}${cyber.has(k) ? " ⚙" : ""}`,
      line1: `Rany ${L.wounds}/${limit}${status !== "ok" ? ` · ${STATUS_PL[status]}` : ""}`,
      line2: `DT ${L.dtTotal}${L.armorName ? ` · ${short(L.armorName)}` : ""}`,
      line3: called ? `Cel ${called} kr. MFD` : "Cel bez kary",
      bar: Math.round(Math.min(1, L.wounds / limit) * (BOX_W - 14))
    });
  }
  // skrzydła pod tułowiem, róg na wierzchu
  parts.sort((a, b) => (b.under - a.under) || ((a.key === "horn") - (b.key === "horn")));
  return {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, biped, dy, cx: CX, cy: biped ? 168 : 170,
    decor: biped ? [] : PONY_TOP_DECOR, eyes: biped ? [] : PONY_TOP_EYES.map(([x, y]) => ({ cx: x, cy: y })),
    tail: !biped,
    parts, callouts
  };
}

const short = s => (String(s).length > 18 ? `${String(s).slice(0, 17)}…` : String(s));
