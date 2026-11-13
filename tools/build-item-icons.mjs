/**
 * Ikony przedmiotów z katalogu (data/catalog.json) i pozostałych list (zaklęcia, przepisy, manewry, perki,
 * bestiariusz, cybernetyka, pojazdy — reguły w tools/icon-rules-lists.mjs) z zestawu game-icons.net (CC BY 3.0).
 * Użycie: node tools/build-item-icons.mjs <katalog repozytorium game-icons/icons> [--check]
 *   - dopasowanie rysunku do nazwy: reguły (pierwsza pasująca), potem domyślne dla kategorii,
 *   - powtórzony rysunek dostaje inne tło i znacznik (kaliber, model, inicjały) — każdy plik jest inny,
 *   - zapis: icons/items/<slug>.svg (zielony rysunek na ciemnym tle), pole "icon" w data/catalog.json,
 *     icons/items/CREDITS.md (autorzy użytych rysunków; licencja CC BY 3.0).
 * --check: tylko raport (brakujące nazwy rysunków, liczby), bez zapisu.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { LISTS } from "./icon-rules-lists.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = process.argv[2];
const CHECK = process.argv.includes("--check");
if (!SRC || !existsSync(SRC)) { console.error("Podaj katalog repozytorium game-icons/icons."); process.exit(1); }

// ---------- indeks rysunków: nazwa → { path, author } ----------
const INDEX = new Map();
(function walk(dir, author = null) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!f.startsWith(".") && f !== "badges") walk(p, author ?? f); continue; }
    if (f.endsWith(".svg") && author && !INDEX.has(f.slice(0, -4))) INDEX.set(f.slice(0, -4), { path: p, author });
  }
})(SRC);

// ---------- reguły: [wyrażenie na nazwie (małe litery), rysunki od najlepszego] ----------
const R = (re, ...icons) => [re, icons];
const RULES = [
  // broń ciężka i wybuchowa
  R(/flamethrower|incinerator/, "flamethrower", "fire-ray"),
  R(/minigun|gatling/, "minigun", "chaingun"),
  R(/rocket|missile|rock-it/, "rocket", "missile-pod", "missile-launcher", "rocket-thruster"),
  R(/grenade (rifle|launcher)|machine grenade/, "grenade", "panzerfaust"),
  R(/balefire egg launcher|howitzer|cannon|autocannon|artillery/, "cannon", "siege-tower", "cannon-ball"),
  R(/mounted machine gun|light mg|automatic rifle|\bpaw\b/, "machine-gun", "heavy-bullets"),
  R(/anti-machine rifle/, "rifle", "supersonic-bullet"),
  R(/plasma (caster|cannon)/, "plasma-bolt", "energy-arrow"),
  R(/plasma grenade|pulse grenade|sparkle grenade|windigo grenade/, "flash-grenade", "bundle-grenade", "grenade"),
  R(/stun grenade|flashbang/, "stun-grenade", "flash-grenade"),
  R(/incendiary grenade|firebomb|molotov/, "molotov", "flaming-claw", "fire-bomb"),
  R(/frag grenade|grenade/, "grenade", "bundle-grenade", "stick-grenade"),
  R(/mine \(placed\)|\bmine\b/, "land-mine", "minefield"),
  R(/dynamite/, "dynamite", "sparky-bomb"),
  R(/satchel charge|liquid rainbow|bio-gas charge/, "time-bomb", "unlit-bomb", "cluster-bomb"),
  R(/gas bomb|bio-gas canister/, "gas-mask", "poison-gas", "bottled-shadow"),
  R(/balefire egg/, "nuclear-bomb", "radioactive", "egg-clutch"),
  // broń energetyczna
  R(/flare gun/, "cross-flare", "pistol-gun"),
  R(/gauss/, "laser-precision", "rifle"),
  R(/sonic emitter/, "sonic-boom", "sound-waves"),
  R(/shock (pistol|rifle|baton)|cattle prod|zap/, "electric", "lightning-arc", "power-lightning"),
  R(/disintegrat|atomizer/, "laser-burst", "atomic-slashes", "laser-blast"),
  R(/scorcher|star blaster|tri-beam/, "laser-sparks", "laser-blast"),
  R(/beam|pulse|recharger|rcw|maer|compliance/, "laser-gun", "ray-gun", "laser-blast", "laser-precision"),
  // broń palna
  R(/sawed off/, "sawed-off-shotgun", "shotgun"),
  R(/shotgun/, "shotgun", "sawed-off-shotgun"),
  R(/revolver|magnum|colt rangemaster/, "revolver", "pistol-gun"),
  R(/smg|typewriter|infiltrator/, "uzi", "machine-gun"),
  R(/sniper|marksman|high powered/, "supersonic-bullet", "rifle", "winchester-rifle"),
  R(/lever action|repeater|brush gun|cowpony|carbine|varmint|hunting rifle/, "winchester-rifle", "rifle"),
  R(/assault rifle|battle rifle|service rifle|rifle|railpony/, "rifle", "ak47", "winchester-rifle"),
  R(/nail gun/, "nails", "pistol-gun"),
  R(/dart pistol|blowgun/, "dart", "zat-gun", "pistol-gun"),
  R(/pistol|bb gun|gun/, "pistol-gun", "colt-m1911", "revolver"),
  R(/crossbow/, "crossbow"),
  R(/bow\b/, "pocket-bow", "high-shot", "bow-arrow"),
  // biała broń
  R(/chainsaw/, "chainsaw"),
  R(/shishkebab|ripper/, "flaming-sheet", "inferno-bomb", "circular-saw"),
  R(/katana|sword|blade of|machete|bumper/, "katana", "broadsword", "machete", "sword-brandish", "piercing-sword"),
  R(/knife|razor|switchblade/, "bowie-knife", "switchblade", "plain-dagger", "butterfly-knife", "trench-knife", "razor-blade"),
  R(/spear|lance/, "thrown-spear", "barbed-spear", "spears"),
  R(/staff|cane|pool cue/, "wizard-staff", "wood-stick", "bo"),
  R(/sledge|hammer/, "flat-hammer", "warhammer", "claw-hammer"),
  R(/axe|hatchet/, "fire-axe", "battle-axe", "wood-axe", "hatchet"),
  R(/pickaxe/, "war-pick", "mining"),
  R(/shovel/, "spade", "trench-spade"),
  R(/baseball bat|bat\b/, "baseball-bat"),
  R(/baton|rolling pin|pipe|tire iron|9-iron|rebar|club|nail board/, "wood-club", "spiked-bat", "lead-pipe", "pipes", "club", "flanged-mace"),
  R(/stinger/, "scorpion-tail", "wasp-sting"),
  // walka wręcz
  R(/claw/, "claws", "beast-eye", "fangs"),
  R(/horn/, "unicorn", "horn-internal"),
  R(/wing/, "feathered-wing", "angel-wings"),
  R(/hoof|hooves|shoes|knuckles|boxing/, "horseshoe", "boxing-glove", "fist"),
  R(/spikes/, "spiked-armor", "spikes"),
  R(/rock/, "stone-pile", "rock"),
  R(/cakes/, "cupcake", "cake-slice"),
  // pancerz
  R(/power(ed)? armor|powered barding|powered helmet|power armor helmet/, "battle-mech", "mechanical-arm", "robot-helmet", "spartan-helmet"),
  R(/gas mask|breathing mask|rebreather/, "gas-mask", "scuba-mask"),
  R(/mask|bandana/, "robber-mask", "domino-mask", "carnival-mask", "ninja-mask"),
  R(/sunglasses|glasses|goggles|eye patch|monocle/, "sunglasses", "steampunk-goggles", "spectacles", "eyepatch"),
  R(/hat|cap|beret|stetson|bonnet|wig/, "western-hat", "billed-cap", "top-hat", "fedora", "phrygian-cap", "pointy-hat", "captain-hat-profile"),
  R(/helmet|head wrap/, "visored-helm", "brutal-helm", "full-motorcycle-helmet", "barbute", "closed-barbute", "crested-helmet", "spartan-helmet", "light-helm"),
  R(/saddlebag|backpack|bag/, "knapsack", "backpack", "swap-bag"),
  R(/collar|necklace|amulet|ring\b/, "gem-necklace", "pendant-key", "ring", "diamond-ring"),
  R(/boots|leg/, "boots", "leg-armor"),
  R(/holster|bandolier/, "ammo-box", "belt"),
  R(/cape|cloak/, "cape", "cloak-dagger"),
  R(/robe|dress|gown|tuxedo|suit|outfit|wear|uniform|fatigues|jumpsuit|scrubs|coat|duster/, "shirt", "lab-coat", "pirate-coat", "dress", "pirate-coat", "t-shirt", "robe"),
  R(/vest/, "kevlar-vest", "leather-vest", "armor-vest"),
  R(/barding|armor|armour/, "chest-armor", "breastplate", "abdominal-armor", "leather-armor", "lamellar", "scale-mail", "mail-shirt"),
  // urządzenia
  R(/pipbuck|stealthbuck|stealthfilly/, "smartphone", "watch", "pocket-watch"),
  R(/broadcaster|radio/, "pocket-radio", "radio-tower", "radar-dish"),
  R(/equemapper|map\b/, "treasure-map", "folded-paper"),
  R(/terminal|computer|pra\b/, "laptop", "tablet"),
  R(/saddle|battle saddle|loader/, "horse-head", "gears", "machine-gun-magazine"),
  R(/reserve|fuel|tank/, "jerrycan", "gas-pump", "fuel-tank"),
  // amunicja
  R(/arrow/, "arrow-cluster", "quiver"),
  R(/bolts?\b/, "crossbow", "arrow-flights"),
  R(/rocket|missile/, "rocket"),
  R(/shell|gauge/, "shotgun-rounds", "bullets"),
  R(/cell|mfc|spc|battery|solar/, "battery-pack", "battery-pack-alt", "car-battery", "energy-tank"),
  R(/flamer|fuel/, "jerrycan", "flame"),
  R(/nail|spike/, "nails", "spikes"),
  R(/cal|mm\b|ammo|round|dart/, "bullets", "heavy-bullets", "ammo-box", "machine-gun-magazine"),
  // leczenie i chemia
  R(/healing potion|potion/, "potion-ball", "round-bottom-flask", "drink-me"),
  R(/talisman/, "gem-pendant", "rune-stone"),
  R(/bandage/, "bandage-roll", "sticking-plaster"),
  R(/rad-?x|radaway|rad\b/, "radioactive", "pill"),
  R(/dash|mint|buck|med-x|stimpak|syringe|chem/, "pill", "medicine-pills", "syringe", "pill-drop", "vial"),
  R(/whiskey|wine|beer|cider|vodka|gin\b|absinthe|martini|cocktail|alcohol|applejack|buckweiser|cantermerlot|liquor|sake|rum/, "beer-bottle", "wine-bottle", "brandy-bottle", "martini", "beer-stein", "wine-glass"),
  R(/tobacco|cigar|cigarette/, "cigarette", "cigar", "smoking-pipe"),
  R(/coffee|tea\b/, "coffee-cup", "teapot", "hot-meal"),
  R(/cola|soda|juice|water|milk|drink|nectar/, "soda-can", "water-bottle", "soda-bottle", "milk-carton", "water-flask"),
  // jedzenie
  R(/meat|steak|jerky|brahmin|squirrel|rat\b|mole|gecko|manticore|dog|mirelurk|radroach|ant\b|bloat/, "meat", "steak", "ham-shank", "chicken-leg", "fried-fish", "roast-chicken"),
  R(/apple|pear|fruit|berry|cactus|melon|tomato/, "shiny-apple", "pear", "strawberry", "cactus", "tomato", "grapes", "cherry"),
  R(/carrot|corn|spinach|grass|flower|hay|beans|potato|vegetable/, "carrot", "corn", "flower-pot", "wheat", "potato", "beanstalk", "daisy"),
  R(/pie|cake|bread|snack|sugar|cookie|candy|muffin|cupcake/, "pie-slice", "cake-slice", "bread", "cupcake", "wrapped-sweet", "candy-canes", "cookie"),
  R(/noodle|stew|soup|meal|box|instamash|mash/, "noodles", "hot-meal", "bowl-of-rice", "cooking-pot"),
  R(/can\b|canned/, "opened-food-can", "canned-fish"),
  R(/egg/, "egg-clutch", "fried-eggs"),
  // książki i drobiazgi
  R(/spell|magic|arcane/, "spell-book", "book-cover"),
  R(/guide|manual|technical|catalogue|handbook/, "rule-book", "open-book", "book-cover"),
  R(/book|tales|adventure|the |of /, "book-cover", "open-book", "secret-book", "book-pile", "notebook", "black-book"),
  R(/toy|ball|doll|plush/, "balloon-dog", "toy-mallet", "beach-ball", "basketball-ball", "robot-golem"),
  R(/gem|crystal|diamond|ruby|sapphire|emerald/, "gem-chain", "crystal-growth", "diamond-hard", "cut-diamond", "emerald", "gem-pendant"),
  R(/plate|fork|spoon|cup|mug|pot|pan|kettle/, "metal-plate", "fork-knife-spoon", "coffee-mug", "cooking-pot", "saucepan"),
  R(/hide|leather|pelt|fur/, "animal-hide", "wolf-head"),
  R(/gland|tooth|fang|claw|bone|tail/, "fangs", "bone-gnawer", "broken-bone", "tooth"),
  R(/spark|reactor|generator/, "spark-plug", "electric", "power-generator"),
  R(/vial|jar|bottle|glass/, "vial", "mason-jar", "bottle-cap", "empty-hourglass"),
  R(/poison/, "poison-bottle", "skull-crossed-bones"),
  R(/casing|brass/, "bullets", "metal-bar"),
  R(/card/, "card-random", "key-card", "card-ace-spades"),
  R(/stick|wood|log|plank/, "wood-pile", "wood-stick"),
  R(/clipboard|paper|note|letter|document|holotape|tape/, "paper-clip", "folded-paper", "scroll-unfurled", "audio-cassette"),
  R(/lamp|light|lantern|flashlight|candle/, "lantern-flame", "flashlight", "desk-lamp", "candle-light"),
  R(/surgical|scalpel|medical|doctor/, "scalpel", "medical-pack", "first-aid-kit"),
  R(/tin|metal|scrap|steel|iron|wire/, "metal-bar", "metal-plate", "barbed-wire", "gear-hammer"),
  R(/case|box|crate|chest/, "wooden-crate", "locked-chest", "cardboard-box", "toolbox"),
  R(/tool|wrench|screwdriver|pliers/, "toolbox", "wrench", "screwdriver", "triple-plier"),
  R(/key|lockpick|bobby pin/, "lockpicks", "key", "skeleton-key"),
  R(/cap\b|caps\b|bottlecap/, "bottle-cap", "coins"),
  R(/camera/, "photo-camera"),
  R(/rope|chain/, "rope-coil", "crossed-chains"),
  R(/watch|clock/, "pocket-watch", "alarm-clock")
];
const FALLBACK = {
  smallGuns: ["pistol-gun", "rifle"], bigGuns: ["heavy-bullets", "machine-gun"], energy: ["laser-gun", "ray-gun"], explosives: ["cluster-bomb", "unlit-bomb"],
  melee: ["broadsword", "wood-club"], unarmed: ["fist", "punch"],
  clothing: ["shirt", "t-shirt"], light: ["leather-armor", "leather-vest"], medium: ["chest-armor", "breastplate"], heavy: ["armor-vest", "lamellar"],
  helmet: ["visored-helm", "light-helm"], accessory: ["swap-bag", "belt"],
  food: ["hot-meal", "meal", "bowl-of-rice", "noodles", "sandwich", "hamburger", "pizza-slice", "sliced-bread", "cheese-wedge", "honey-jar", "jelly", "pretzel", "popcorn", "donut", "croissant", "fish-cooked", "sausage", "taco", "french-fries", "covered-jar", "mason-jar", "opened-food-can", "canned-fish", "fruit-bowl", "acorn", "mushroom", "peanut", "oat"], drug: ["pill", "vial", "pill-drop", "medicine-pills", "syringe", "round-potion", "standing-potion", "magic-potion", "bottle-vapors", "spiral-bottle", "square-bottle", "heart-bottle", "health-capsule", "powder", "smoking-pipe"], ammo: ["bullets", "ammo-box"], book: ["book-cover", "open-book", "black-book", "white-book", "book-pile", "bookmark", "notebook", "rule-book", "secret-book", "spell-book", "burning-book", "scroll-unfurled", "bookshelf", "evil-book", "book-aura", "quill-ink", "newspaper", "papers"], medical: ["medical-pack"],
  pipbuck: ["smartphone"], saddle: ["gears"], misc: ["swap-bag", "cardboard-box", "toolbox", "gears", "light-bulb", "cog", "puzzle", "spanner", "hammer-nails", "magnifying-glass", "compass", "hourglass", "bell", "whistle", "padlock", "sewing-needle", "scissors", "duct-tape", "spray", "funnel", "bucket", "broom", "sponge", "soap", "candle-light", "matches", "lighter", "binoculars", "telescope", "dice-six-faces-six", "trophy", "medal", "crown", "vase", "globe", "umbrella", "fishing-pole", "hook", "anchor", "abacus", "microscope", "test-tubes", "circuitry", "processor", "electrical-socket", "wire-coil", "spring", "nuts-and-bolts", "screw", "film-strip", "vinyl-record", "guitar", "violin", "trumpet", "drum", "paint-brush", "palette", "pencil", "ink-swirl", "envelope", "stamper", "ticket", "money-stack", "bank", "shield", "scarf", "urn", "orb-wand", "crystal-ball", "ashtray"]
};

const PALETTE = ["#06180b", "#0b1a20", "#1a1606", "#180b14", "#0c0c1e", "#1c0d08", "#0d1a14", "#16120c", "#101010", "#08141a"];
const slug = s => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
const has = n => INDEX.has(n);

/** Znacznik: kaliber, kod modelu, inaczej inicjały (max 5 znaków). */
function badgeOf(name, roman = false) {
  const rn = roman && name.match(/\b(I{1,3}|IV|VI{0,3})\b(?!.*\b(I{1,3}|IV|VI{0,3})\b)/);
  if (rn) return rn[1];
  const cal = name.match(/(\.\d{2,3}|\d{1,3}(?:\.\d)?\s?mm|\d+\s?gauge|\d+\s?cal)/i);
  if (cal) return cal[1].replace(/\s/g, "").toUpperCase().replace("GAUGE", "G").replace("CAL", "");
  const model = name.match(/\b([A-Z]{1,4}-?\d{1,4}[A-Z]?)\b/);
  if (model) return model[1].slice(0, 5);
  const words = name.replace(/\(.*?\)/g, "").split(/[\s/,-]+/).filter(w => w.length > 2 && !/^(the|and|of|for|with)$/i.test(w));
  return words.slice(0, 3).map(w => w[0].toUpperCase()).join("") || name.slice(0, 2).toUpperCase();
}

/** Środek rysunku (ścieżki bez tła) z pliku game-icons. */
function glyphOf(file) {
  const svg = readFileSync(file, "utf8");
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return inner.replace(/<path d="M0 0h512v512H0z"\s*\/>/, "").replace(/fill="#fff"/g, 'fill="#4dff8a"').replace(/fill="#000"/g, 'fill="#4dff8a"');
}

function iconSvg(glyph, { bg, badge }) {
  const w = badge ? Math.max(84, badge.length * 50 + 28) : 0;
  const b = badge ? `<g font-family="'Consolas','DejaVu Sans Mono','Courier New',monospace" font-size="80" font-weight="700"><rect x="${488 - w}" y="400" width="${w}" height="88" rx="10" fill="#000" fill-opacity=".75" stroke="#4dff8a" stroke-width="4"/>
<text x="${488 - w / 2}" y="470" text-anchor="middle" textLength="${w - 28}" lengthAdjust="spacingAndGlyphs" fill="#b8ffd0">${badge.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="8" y="8" width="496" height="496" rx="56" fill="${bg}" stroke="#2c7a46" stroke-width="10"/>
<g transform="translate(64 56) scale(.75)" style="filter:drop-shadow(0 0 6px rgba(77,255,138,.55))">${glyph}</g>${b}</svg>\n`;
}

// ---------- przypisanie ----------
const catalog = JSON.parse(readFileSync(join(ROOT, "data/catalog.json"), "utf8"));
const items = [];
for (const [tab, list] of Object.entries(catalog)) for (const e of list) items.push({ tab, e, cat: tab === "weapons" ? e.skill : e.category, prefix: tab[0], rules: RULES });
const lists = LISTS.map(l => ({ ...l, data: JSON.parse(readFileSync(join(ROOT, `data/${l.file}.json`), "utf8")) }));
for (const l of lists) for (const e of l.data) items.push({ tab: l.file, e, prefix: l.prefix, rules: l.rules, fallback: l.fallback, roman: true });
const missing = new Set();
const STOP = new Set(["with", "from", "that", "this", "your", "pony", "ponies", "equestria", "equestrian", "edition", "model", "mark", "type", "special", "unique", "light", "heavy", "medium", "small", "large", "big", "little", "mini", "power", "stealth", "dash", "pinkie", "rarity", "twilight", "sparkle", "fluttershy", "applejack", "celestia", "luna"]);
const PARTS = new Map();
for (const n of INDEX.keys()) for (const p of n.split("-")) { if (!PARTS.has(p)) PARTS.set(p, []); PARTS.get(p).push(n); }
const wordMatches = name => {
  const out = [];
  for (let w of name.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    const hits = PARTS.get(w) ?? PARTS.get(w.replace(/e?s$/, "")) ?? [];
    out.push(...hits.filter(h => h.split("-").length <= 2).slice(0, 3));
  }
  return out;
};
for (const it of items) {
  const n = it.e.name.toLowerCase();
  let pick = [];
  for (const [re, icons] of it.rules) {
    if (!re.test(n)) continue;
    for (const i of icons) if (!has(i)) missing.add(i);
    pick = icons.filter(has);
    if (pick.length) break;
  }
  const cat = (it.fallback ?? FALLBACK[it.cat] ?? FALLBACK.misc).filter(has);
  const words = wordMatches(it.e.name);
  it.candidates = [...new Set([...pick, ...words, ...cat])];
  if (!it.candidates.length) it.candidates = ["swap-bag"];
  it.best = pick.length ? pick : it.candidates.slice(0, 3);
}
// rozkład: pierwszy kandydat (od najlepszego), który ma mniej niż CAP użyć; inaczej najmniej użyty z najlepszych
const CAP = 5;
const use = new Map();
for (const it of items) {
  it.glyph = it.candidates.find(g => (use.get(g) ?? 0) < CAP)
    ?? it.best.reduce((best, g) => ((use.get(g) ?? 0) < (use.get(best) ?? 0) ? g : best), it.best[0]);
  use.set(it.glyph, (use.get(it.glyph) ?? 0) + 1);
}
const seen = new Map();
for (const it of items) {
  const k = seen.get(it.glyph) ?? 0;
  seen.set(it.glyph, k + 1);
  const shared = (use.get(it.glyph) ?? 0) > 1;
  it.bg = PALETTE[k % PALETTE.length];
  it.badge = shared ? badgeOf(it.e.name, it.roman) : (/(\.\d{2,3}|\d+mm)/i.test(it.e.name) ? badgeOf(it.e.name) : "");
}
// unikalność: ten sam rysunek + tło + znacznik → dopisz numer
const key = it => `${it.glyph}|${it.bg}|${it.badge}`;
const dup = new Map();
for (const it of items) { const c = dup.get(key(it)) ?? 0; dup.set(key(it), c + 1); if (c) it.badge = `${it.badge.slice(0, 4)}${c + 1}`; }
if (new Set(items.map(key)).size !== items.length) { console.error("Ikony nie są unikalne."); process.exit(1); }

const glyphs = new Set(items.map(i => i.glyph));
console.log(`ikon: ${items.length} | różnych rysunków: ${glyphs.size} | z wariantem: ${items.filter(i => (use.get(i.glyph) ?? 0) > 1).length}`);
if (missing.size) console.log(`nieznane nazwy rysunków (pominięte): ${[...missing].sort().join(", ")}`);
if (process.env.DEBUG) { const top = [...use.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40); console.log(top.map(([g, c]) => `${g}:${c}`).join(" ")); for (const it of items) if (process.env.DEBUG === it.glyph) console.log(" -", it.e.name); }
if (CHECK) process.exit(0);

// ---------- zapis ----------
const OUT = join(ROOT, "icons/items");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const used = new Map();
const names = new Set();
const cache = new Map();
for (const it of items) {
  let s = slug(`${it.prefix}-${it.e.name}`);
  for (let i = 2; names.has(s); i++) s = `${slug(`${it.prefix}-${it.e.name}`)}-${i}`;
  names.add(s);
  if (!cache.has(it.glyph)) cache.set(it.glyph, glyphOf(INDEX.get(it.glyph).path));
  writeFileSync(join(OUT, `${s}.svg`), iconSvg(cache.get(it.glyph), it));
  it.e.icon = `systems/foe-rpg/icons/items/${s}.svg`;
  const a = INDEX.get(it.glyph).author;
  if (!used.has(a)) used.set(a, new Set());
  used.get(a).add(it.glyph);
}
writeFileSync(join(ROOT, "data/catalog.json"), JSON.stringify(catalog));
for (const l of lists) {
  const pretty = readFileSync(join(ROOT, `data/${l.file}.json`), "utf8").includes("\n");
  writeFileSync(join(ROOT, `data/${l.file}.json`), pretty ? `${JSON.stringify(l.data, null, 2)}\n` : JSON.stringify(l.data));
}
const credits = [...used.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  .map(([a, set]) => `- **${a}** — ${[...set].sort().join(", ")}`).join("\n");
writeFileSync(join(OUT, "CREDITS.md"), `# Ikony / Icons

Rysunki z [game-icons.net](https://game-icons.net) na licencji [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
(część autorów — CC0). Zmiany: kolor PipBucka, ciemne tło, ramka, znaczniki (kaliber, model, inicjały).
Drawings from game-icons.net under CC BY 3.0 (some CC0). Changes: PipBuck colour, dark background, frame, badges.

Autorzy użytych rysunków (katalog autora w repozytorium game-icons/icons):

${credits}
`);
console.log(`zapisano ${items.length} ikon, ${glyphs.size} rysunków, autorów: ${used.size}`);
