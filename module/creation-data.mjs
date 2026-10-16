/**
 * Dane do tworzenia postaci — Fallout: Equestria RPG v1.22, rozdział 2 („Making a Character”).
 * Strony w komentarzach odnoszą się do podręcznika.
 */
import { ATTRS, SKILLS, LOCATIONS } from "./data.mjs";
import { N_, tfields } from "./i18n.mjs";

// ---------- Zasady ogólne (s. 51–52, 62) ----------
export const CREATION = {
  pool: 35,            // punkty tworzenia (w tym 7 wstępnie przypisanych — każdy atrybut startuje od 1)
  attrStart: 1,
  maxRaise: 8,         // z punktów tworzenia można podnieść atrybut maks. o 8 (czyli do 9)…
  maxRaiseLuck: 9,     // …a Luck do 10
  hardCap: 12,         // twardy limit atrybutu
  tags: 3,             // umiejętności z tagiem (+15)
  tagBonus: 15,
  maxHindrances: 6,
  caps: 300            // kapsle / wartość ekwipunku na start (200 z Abandoned)
};

// ---------- Pomocnicze do efektów (format: effects.mjs) ----------
const fx = (type, target, value, when = "") => ({ type, target, value, when });
const A = (t, v) => fx("attr", t, v);
const RANK = (t, v) => fx("skillRank", t, v);
const ROLL = (t, v, when) => fx("skillRoll", t, v, when);
const AROLL = (t, v, when) => fx("attrRoll", t, v, when);
const BASED = (t, v, when) => fx("basedRoll", t, v, when);
const ALL = (v, when) => [ROLL("all", v, when), AROLL("all", v, when)];
// wybory: etykiety (i etykiety opcji) tłumaczone przy odczycie
const one = (id, label, options, extra = {}) => tfields({ id, label, type: "one", options, ...extra }, ["label"]);
const many = (id, label, options, pick, extra = {}) => tfields({ id, label, type: "many", options, pick, ...extra }, ["label"]);
const skillOpts = keys => keys.map(k => ({ v: k, label: SKILLS[k].label }));
const attrOpts = keys => keys.map(k => ({ v: k, label: ATTRS[k] }));
const locOpts = () => Object.entries(LOCATIONS).map(([v, label]) => ({ v, label }));
const ALL_SKILLS = Object.keys(SKILLS).filter(k => !SKILLS[k].racial).concat(["magic"]);

// ---------- Rasy (s. 21–40) ----------
// attrs: ile punktów rasowych (pick) i z jakich atrybutów (from)
// skills.fixed: stałe premie rang; skills.picks: „wybierz n z listy po +value”
// racial: umiejętności rasowe { skill: { bonus, attrs } }
// traits / hindrances: cechy i wady nadawane automatycznie (free = bez kosztu, points = czy daje punkt)
const LP = { lockpick: -10 };

export const RACES = tfields({
  earth: {
    label: "Earth Pony",
    desc: "Versatile and strong. Two racial points, a free 1-point trait, +1 skill point every level.",
    attrs: { pick: 2, from: ["str", "end", "int"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["science", "repair", "unarmed", "bigGuns", "survival"] }] },
    freeTraitPoints: 1,
    earthPerk: true,
    notes: ["Earth Pony Dedication: +1 skill point every level.",
      "May take Ricochet as a 1-point trait, and Cyberpony without GM approval."]
  },
  unicorn: {
    label: "Unicorn",
    desc: "Magic and telekinesis. No Lockpicking penalty, a free cutie mark spell and one level 1 spell.",
    attrs: { pick: 1, from: ["per", "int", "luck"] },
    skills: { picks: [{ n: 3, value: 3, from: ["smallGuns", "sneak", "lockpick", "energy", "science"] }] },
    racial: { magic: { bonus: 10, attrs: ["int"] } },
    notes: ["Magic: telekinesis, a cutie mark spell (if it fits) + one free level 1 spell."]
  },
  pegGround: {
    label: "Pegasus (ground-born)",
    desc: "Flight and agility. The version for a pegasus raised on the surface.",
    attrs: { pick: 1, from: ["agi", "end", "per"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["survival", "mercantile", "smallGuns", "sneak"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    notes: ["Flight, aerial maneuvers, access to Enclave cloud terminals."]
  },
  pegDash: {
    label: "Pegasus (Dashite)",
    desc: "Flight and agility. A military veteran; Power Armor Training for free.",
    attrs: { pick: 1, from: ["agi", "per"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["survival", "energy", "bigGuns", "repair"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    traits: [{ key: "powerArmor", free: true }],
    notes: ["Flight, aerial maneuvers, access to Enclave cloud terminals."]
  },
  pegEnclave: {
    label: "Pegasus (Enclave / EVC)",
    desc: "Flight and agility. A scientific or medical education; Formal Education for free with EVC membership.",
    attrs: { pick: 1, from: ["agi", "int"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["medicine", "science", "survival", "smallGuns", "energy"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    notes: ["Flight, aerial maneuvers, access to Enclave cloud terminals.", "Formal Education for free with Organization: EVC."]
  },
  griffin: {
    label: "Griffin",
    desc: "A flying mercenary with sharp talons; precise manipulation without magic.",
    attrs: { pick: 1, from: ["per", "agi", "end"] },
    skills: { picks: [{ n: 2, value: 3, from: ["smallGuns", "bigGuns", "energy", "melee", "unarmed"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    notes: ["Talons (an Unarmed weapon), Opposable Claw: climbing at half speed.", "No cutie mark. Recommended Organization: Mercenary."]
  },
  zebra: {
    label: "Zebra", // en=pl
    desc: "Zebra magic (alchemy, talismans). Survival bonuses; a Speechcraft penalty with ponies.",
    attrs: { pick: 1, from: ["per", "end", "cha", "int"] },
    skills: { fixed: { survival: 5, unarmed: 5, sneak: 5, lockpick: -10 } },
    racial: { magic: { bonus: 10, attrs: ["int", "cha"] } },
    zebraNoMagic: true,
    traits: [{ key: "hindLegStance", free: true, label: "Hind Leg Stance (perk)", desc: "A free zebra racial perk." }], // en=pl
    notes: ["−20 Speechcraft with ponies (−5 in disguise or as a Proditor).",
      "Starting recipes: Magic / 10."]
  },
  alicornUnity: {
    label: "Alicorn (Unity)",
    desc: "Powerful magic and flight, a hive mind. Only 1 point for every 2 hindrances (max. 8 hindrances). Not recommended for beginners.",
    attrs: { pick: 1, from: ["int", "end"] },
    skills: { fixed: { bigGuns: 5, sneak: 3 } },
    racial: { flight: { bonus: 5, attrs: ["agi"] }, magic: { bonus: 15, attrs: ["int"] } },
    traits: [{ key: "large", free: true }, { key: "channeler", free: true, choices: { variant: "cap4" } }],
    hindrances: [{ key: "flightSchoolDropout", points: true }],
    hindrancePoints: "half", maxHindrances: 8,
    notes: ["−40 Speechcraft with ponies (except in disguise / at the first meeting).", "Immune to Taint and the Pink Cloud; healed by radiation."]
  },
  alicornPost: {
    label: "Alicorn (after the fall of Unity)",
    desc: "Like a Unity alicorn, but independent; learns spells like a unicorn.",
    attrs: { pick: 1, from: ["int", "end", "luck"] },
    skills: { fixed: { bigGuns: 5, sneak: 3 } },
    racial: { flight: { bonus: 5, attrs: ["agi"] }, magic: { bonus: 15, attrs: ["int"] } },
    traits: [{ key: "large", free: true }, { key: "channeler", free: true, choices: { variant: "cap4" } }],
    hindrances: [{ key: "flightSchoolDropout", points: true }],
    hindrancePoints: "half", maxHindrances: 8,
    notes: ["−20 Speechcraft with ponies (except in disguise).", "Immune to Taint and the Pink Cloud; healed by radiation."]
  },
  alicornGen2: {
    label: "Alicorn (2nd generation)",
    desc: "Born of alicorns, magically weaker. Must take Young; points = number of hindrances − 2.",
    attrs: { pick: 1, from: ["int", "end", "luck"] },
    skills: { picks: [{ n: 2, value: 3, from: ["mercantile", "speech", "bigGuns", "sneak"] }] },
    racial: { flight: { bonus: 5, attrs: ["agi"] }, magic: { bonus: 5, attrs: ["int"] } },
    traits: [{ key: "channeler", free: true, choices: { variant: "cap4" } }],
    hindrances: [{ key: "young", points: true }],
    hindrancePoints: "minus2", maxHindrances: 8,
    notes: ["Starts with Shield (level 1) or another level 0/1 spell + possibly a cutie mark spell."]
  },
  hellhound: {
    label: "Hellhound",
    desc: "Dangerous in close combat, digs through concrete. Only 1 point for every 2 hindrances (max. 8). Not recommended for beginners.",
    attrs: { pick: 1, from: ["str", "per", "end"] },
    skills: { fixed: { explosives: 5, sneak: 5 }, picks: [{ n: 1, value: 5, from: ["energy", "unarmed"] }] },
    racial: { dig: { bonus: 10, attrs: ["str"] } },
    hindrances: [{ key: "bigEars", points: true }],
    hindrancePoints: "half", maxHindrances: 8,
    notes: ["−50 Speechcraft with races other than dogs.", "Biped: half base speed, climbing. Claws.", "Immune to Taint and radiation."]
  },
  sanddog: {
    label: "Sand Dog",
    desc: "A master of cybernetics and repairs, digs in the ground. Must take Big Ears.",
    attrs: { pick: 1, from: ["int", "agi", "end"] },
    skills: { fixed: { energy: 3, repair: 5, explosives: 5, sneak: 3 } },
    racial: { dig: { bonus: 10, attrs: ["str"] } },
    hindrances: [{ key: "bigEars", points: true }],
    notes: ["−15 Speechcraft with ponies.", "Biped, Opposable Thumb for free. Cyber Dog costs 1 point less."]
  },
  bat: {
    label: "Bat Pony",
    desc: "Flight, echolocation and an ultrasonic screech. Speaks outside the hearing range of other races.",
    attrs: { pick: 1, from: ["per", "agi"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["energy", "survival", "unarmed", "sneak"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    hindrances: [{ key: "mute", points: false, uncounted: true }],
    notes: ["Sonic Screech: 3d12, SATS 40, range 10 (max. 30), ignores armor (Energy Weapons).",
      "Echolocation: ignores lighting penalties, “sees” 60 ft.", "Shadowflash (a 1-point trait)."]
  },
  changeling: {
    label: "Changeling — house rule",
    desc: "A race outside the v1.22 rulebook (its rules were announced for book II) — only with GM approval. Chitin armor, insect wings, a horn, transformation and feeding on love.",
    attrs: { pick: 1, from: ["cha", "agi", "int"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["speech", "sneak", "energy", "lockpick", "mercantile"] }] },
    racial: { magic: { bonus: 5, attrs: ["int", "cha"] }, flight: { bonus: 5, attrs: ["agi"] } },
    notes: ["Chitin: +2 DT on all locations; magically hardened against radiation (+10%).",
      "Transformation into any seen pony of similar size (1 love); naturally changes the voice (like Voice Alteration).",
      "Love: a pool of CHA + END, 1 per day; feeding with a Speechcraft roll. With an empty pool: −1 step on END and CHA rolls.",
      "Flight on insect wings (no cloud walking)."]
  },
  buffalo: {
    label: "race|Buffalo",
    desc: "Big and tough. Large and one 1-point trait for free.",
    attrs: { pick: 2, from: ["str", "per", "end", "cha"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["melee", "survival", "unarmed", "medicine"] }] },
    traits: [{ key: "large", free: true }],
    freeTraitPoints: 1,
    notes: ["Horn charge: 6d10 + STR (6d20 with double Large)."]
  },
  donkey: {
    label: "Donkey",
    desc: "A trader and negotiator. Sterner Stuff and one trait for free.",
    attrs: { pick: 2, from: ["per", "cha", "end", "luck"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["mercantile", "speech", "sneak"] }] },
    traits: [{ key: "sternerStuff", free: true, choices: { variant: "body" } }],
    freeTraitPoints: 1,
    notes: ["May take Tough Hide (a level 6 perk) as a 1-point trait."]
  },
  minotaur: {
    label: "Minotaur", // en=pl
    desc: "A bipedal giant with hands. Large for free.",
    attrs: { pick: 1, from: ["str", "end"] },
    skills: { picks: [{ n: 2, value: 5, from: ["melee", "unarmed", "bigGuns", "survival"] }] },
    traits: [{ key: "large", free: true }],
    notes: ["Biped: half base speed, Opposable Thumb for free.", "Zebra magic as a 2-point trait (Magic +10, CHA or INT)."]
  },
  other: {
    label: "Other race (e.g. a half-breed) — manual",
    desc: "No automatic bonuses. Enter the race bonuses by hand (pp. 40–48 of the rulebook).",
    attrs: { pick: 0, from: [] },
    manual: true
  }
}, ["label", "desc", "notes"]);

// Efekty rasowe przenoszone na cechę „Rasa: …” (premie do atrybutów i rang są wpisywane bezpośrednio)
const RACE_FX = {
  zebra: [ROLL("speech", -20, N_("With ponies (without a disguise)"))],
  alicornUnity: [ROLL("speech", -40, N_("With ponies (without a disguise)"))],
  alicornPost: [ROLL("speech", -20, N_("With ponies (without a disguise)"))],
  hellhound: [ROLL("speech", -50, N_("With races other than dogs")), fx("speedPct", "ground", -50)],
  sanddog: [ROLL("speech", -15, N_("With ponies")), fx("speedPct", "ground", -50)],
  minotaur: [fx("speedPct", "ground", -50)],
  changeling: [fx("dt", "all", 2), fx("radResist", "all", 10)]
};
for (const [k, v] of Object.entries(RACE_FX)) RACES[k].fx = v;

// Darmowy perk kucyka ziemskiego (s. 24)
export const EARTH_PERKS = tfields({
  strongBack: { label: "Strong Back", desc: "+50 carry weight.", fx: [fx("carry", "all", 50)] },
  highHo: { label: "High Ho Silver, Away!", desc: "+5 ft of movement per action.", fx: [fx("speed", "all", 5)] }
}, ["desc"]);

// ---------- Wady (Hindrances, s. 69–96) — każda daje 1 punkt tworzenia ----------
// fx: efekty stałe i sytuacyjne (when); choices: wybory gracza; resolve(ch): efekty zależne od wyborów.
// Efekty specjalne kreatora: caps (zmiana kapsli), karma, tags (dodatkowy tag), creationPoints.
const COMBAT = ["smallGuns", "bigGuns", "energy", "melee", "unarmed", "explosives"];
const ATTR4 = ["per", "end", "cha", "int"];

export const HINDRANCES = tfields({
  abandoned: { label: "Abandoned / All Alone", type: "P", desc: "Starts alone, 200 caps instead of 300, no PipBuck; cheaper Animal Companion / Wasteland Weirdo.", fx: [fx("caps", "all", -100)] },
  abused: { label: "Abused", type: "M", desc: "−5 melee accuracy against someone resembling the abuser; −10 Speechcraft when the memories come back.",
    fx: [fx("accuracy", "melee", -5, N_("Against someone resembling the abuser")), ROLL("speech", -10, N_("Memories of the abuse"))] },
  addiction: { label: "Addiction", type: "P", desc: "Addicted to a substance, as if the addiction roll had failed." },
  addictive: { label: "Addictive Personality", type: "M", desc: "Automatically fails INT rolls against addiction." },
  allergy: { label: "Allergy", type: "P", desc: "−5 to all rolls near the allergen, −25 on prolonged contact.",
    fx: [...ALL(-5, N_("Allergen nearby")), ...ALL(-25, N_("Prolonged contact with the allergen"))] },
  amnesiac: { label: "Amnesiac", type: "M", desc: "Has forgotten a long period of their life." },
  badLuck: { label: "Bad Luck", type: "M", desc: "Critical failure range +5; one luck card fewer per session.",
    fx: [fx("critFail", "all", 5), fx("luckCards", "all", -1)] },
  badLuckCharm: { label: "Bad Luck Charm", type: "M", desc: "Once per session forces an ally to reroll a success; allies have one luck card fewer." },
  bigEars: { label: "Big Ears", type: "P", desc: "Hearing Perception +10 and one step easier; END ½ or deafened by loud noise within 5 ft.",
    fx: [AROLL("per", 10, N_("Hearing Perception")), fx("mfdStep", "per", 1, N_("Hearing Perception"))] },
  blind: { label: "Blind", type: "P", desc: "−3 MFD steps to ranged accuracy, −1 step in melee; needs help with sight-based tasks.",
    fx: [fx("mfdStep", "ranged", -3), fx("mfdStep", "melee", -1)] },
  cannibal: { label: "Cannibal", type: "M/P", desc: "Must eat meat every day or pass a willpower roll ¾ (−10)." },
  cautious: { label: "Cautious", type: "M", desc: "−15 to initiative, +3 to the Explosives rank.",
    fx: [fx("initiative", "all", -15), RANK("explosives", 3)] },
  clumsy: { label: "Clumsy", type: "P", desc: "−5 to Lockpicking, Explosives and Repair; critical failure from 91 in these skills.",
    fx: [ROLL("lockpick,explosives,repair", -5), fx("critFail", "lockpick,explosives,repair", 5)] },
  codeOfHonor: { label: "Code of Honor", type: "M", desc: "Must act honorably." },
  colorBlind: { label: "Color Blind", type: "P", desc: "Can't tell two colors apart." },
  cowardly: { label: "Cowardly", type: "M", desc: "Fear rolls one MFD step harder." },
  crippled: { label: "Crippled", type: "P", desc: "A permanently crippled limb: movement −25% (wing: flight −25% and −15 to Flight).",
    choices: [one("where", N_("Crippled"), [{ v: "leg", label: N_("Leg") }, { v: "wing", label: N_("Wing") }])],
    resolve: ch => ch.where === "wing" ? [fx("speedPct", "fly", -25), ROLL("flight", -15)] : ch.where === "leg" ? [fx("speedPct", "ground", -25)] : [] },
  curious: { label: "Curious", type: "M", desc: "Can't resist pushing the big red button." },
  deaf: { label: "Deaf", type: "P", desc: "−15 to Speechcraft, Mercantile and Sneak; no hearing Perception.",
    fx: [ROLL("speech,mercantile,sneak", -15)] },
  demented: { label: "Demented", type: "M", desc: "−2 INT, +1 Luck permanently; +5 to the Explosives or Melee rank.",
    fx: [A("int", -2), A("luck", 1)],
    choices: [one("skill", N_("+5 bonus to"), skillOpts(["explosives", "melee"]))],
    resolve: ch => ch.skill ? [RANK(ch.skill, 5)] : [] },
  elderly: { label: "Elderly", type: "P", desc: "−1 AGI and STR, −1 to another attribute, +1 INT or CHA; +3 to all skills and a fourth tag.",
    fx: [A("agi", -1), A("str", -1), RANK("all", 3), fx("tags", "all", 1)],
    choices: [one("minus", N_("Extra −1 to"), attrOpts(ATTR4)), one("plus", N_("+1 to"), attrOpts(["int", "cha"]))],
    resolve: ch => [...(ch.minus ? [A(ch.minus, -1)] : []), ...(ch.plus ? [A(ch.plus, 1)] : [])] },
  enemy: { label: "Enemy", type: "P", desc: "Something dangerous hunts the character across the wasteland." },
  faithless: { label: "Faithless", type: "M", desc: "−5 Speechcraft with those who still have hope.",
    fx: [ROLL("speech", -5, N_("With someone who has hope"))] },
  family: { label: "Family", type: "P", desc: "Story benefits or trouble when meeting the family." },
  fixation: { label: "Fixation", type: "M", desc: "An obsession with an object, a person or a goal." },
  flightless: { label: "Flightless", type: "P", desc: "Has the Flight skill but can't fly." },
  flightSchoolDropout: { label: "Flight School Dropout", type: "M", desc: "Half the aerial maneuvers at every level, no level 4 maneuvers." },
  fourEyes: { label: "Four-Eyes", type: "P", desc: "−1 PER permanently; +2 PER temporarily while wearing glasses.",
    fx: [A("per", -1), fx("tempAttr", "per", 2, N_("Wearing glasses"))] },
  goodNatured: { label: "Good Natured", type: "M", desc: "−10 to combat skill ranks, +5 to Speechcraft, Repair, Science, Medicine, Mercantile.",
    fx: [RANK(COMBAT.join(","), -10), RANK("speech,repair,science,medicine,mercantile", 5)] },
  guiltyConscience: { label: "Guilty Conscience", type: "M", desc: "−10 to all skill rolls when the subject of the guilt comes up.",
    fx: [ROLL("all", -10, N_("The subject of the guilt comes up"))] },
  gunShy: { label: "Gun-Shy", type: "M", desc: "Firearms and energy weapons: −4 MFD steps to accuracy (except area weapons).",
    fx: [fx("mfdStep", "smallGuns,energy,bigGuns", -4)] },
  halfDecked: { label: "“Half-Decked”", type: "M", desc: "INT ½ every session or under stress to avoid “shutting down”." },
  halfHeart: { label: "Half-Heart", type: "M", desc: "+3 to accuracy, +25 to fear rolls, −10 Speechcraft; suicidal tendencies come more easily.",
    fx: [fx("accuracy", "all", 3), ROLL("speech", -10)] },
  hallucinations: { label: "Hallucinations", type: "M", desc: "Every session INT and PER ¾ — the nature of the hallucinations." },
  hardOfHearing: { label: "Hard of Hearing", type: "P", desc: "−10 Speechcraft/Mercantile in quiet conversation, −25 hearing Perception, −50 Sneak while talking.",
    fx: [ROLL("speech,mercantile", -10, N_("Conversation at normal volume or quieter")), AROLL("per", -25, N_("Hearing Perception")), ROLL("sneak", -50, N_("Talking while sneaking"))] },
  hotBlooded: { label: "Hot Blooded", type: "P/M", desc: "With a crippled head or torso: +5 damage, −2 AGI and PER (temporarily).",
    fx: [fx("damage", "all", 5, N_("Crippled head or torso")), fx("tempAttr", "agi,per", -2, N_("Crippled head or torso"))] },
  illiterate: { label: "Illiterate", type: "M", desc: "Can't read; can't have Science as a tag or use terminals." },
  impatient: { label: "Impatient", type: "M", desc: "Hates waiting, usually to their own detriment." },
  impreciseMagic: { label: "Imprecise Magic", type: "M", desc: "Aiming spells is one step harder; −10 to Repair, Medicine, Science, Lockpicking. Telekinetic Force for free.",
    fx: [ROLL("repair,medicine,science,lockpick", -10), fx("mfdStep", "magic", -1, N_("Aiming a spell"))] },
  jinxed: { label: "Jinxed", type: "P/M", desc: "Once per session the GM can force a success to be rerolled; one luck card fewer.",
    fx: [fx("luckCards", "all", -1)] },
  literalMinded: { label: "Literal Minded", type: "M", desc: "−10 to Speechcraft; takes everything literally.", fx: [ROLL("speech", -10)] },
  maimed: { label: "Maimed", type: "P", desc: "A missing body part (effect per the table); −5 Speechcraft with visible scars (except when intimidating).",
    fx: [ROLL("speech", -5, N_("Visible scars (not when intimidating)"))],
    choices: [one("part", N_("What is missing"), [
      { v: "eye", label: N_("Eye (−10 to sight Perception and to accuracy that needs depth perception)") },
      { v: "nose", label: N_("Nose (−10 to smell and taste)") },
      { v: "ear", label: N_("Ear (−10 to hearing Perception)") },
      { v: "leg", label: N_("Leg (movement −25%)") },
      { v: "horn", label: N_("Horn (no magic)") },
      { v: "hoof", label: N_("Hoof / claw (movement −10%)") },
      { v: "teeth", label: N_("Teeth (−1 CHA, −5 Survival)") },
      { v: "tail", label: N_("Tail (griffin: −25 Flight)") }])],
    resolve: ch => ({
      eye: [AROLL("per", -10, N_("Sight Perception")), fx("accuracy", "ranged", -10, N_("The target needs depth perception"))],
      nose: [AROLL("per", -10, N_("Smell or taste"))],
      ear: [AROLL("per", -10, N_("Hearing Perception"))],
      leg: [fx("speedPct", "ground", -25)],
      hoof: [fx("speedPct", "ground", -10)],
      teeth: [A("cha", -1), ROLL("survival", -5)],
      tail: [ROLL("flight", -25)]
    })[ch.part] ?? [] },
  masochist: { label: "Masochist", type: "P/M", desc: "Crippling: −10 instead of −25; healing weaker by 1d4 wounds, rest takes 2× longer." },
  mpd: { label: "Multiple Personality Disorder", type: "M", desc: "Multiple personalities — see the full description in the rulebook." },
  mutation: { label: "Mutation", type: "P", desc: "−5 to CHA rolls with strangers when the mutation is visible.",
    fx: [BASED("cha", -5, N_("Visible mutation, talking to a stranger"))] },
  mute: { label: "Mute", type: "P", desc: "Doesn't speak (bat ponies: speech outside the hearing range of other races)." },
  naive: { label: "Naïve", type: "M", desc: "Doesn't know how bad the world is; at level 10 it turns into another hindrance." },
  narcoleptic: { label: "Narcoleptic", type: "M", desc: "Certain stimuli put the character to sleep (INT ¼ to resist)." },
  nastyHabit: { label: "Nasty Habit", type: "M/P", desc: "−5 to Speechcraft, Mercantile and CHA rolls; −10 to Sneak when the habit makes noise.",
    fx: [ROLL("speech,mercantile", -5), AROLL("cha", -5), ROLL("sneak", -10, N_("The habit makes noise (not suppressed)"))] },
  obese: { label: "Obese", type: "P", desc: "+1 END, −1 AGI (max. 8), −5 to dodge; eats 1.5–2× more.",
    fx: [A("end", 1), A("agi", -1), fx("dodge", "all", -5)] },
  obligation: { label: "Obligation", type: "P", desc: "A regular obligation to someone or an organization." },
  oblivious: { label: "Oblivious", type: "M", desc: "−15 to all Perception rolls.", fx: [AROLL("per", -15)] },
  ocd: { label: "OCD", type: "M", desc: "Symptoms of obsessive-compulsive disorder (willpower roll ¾ to resist)." },
  oneTrickPony: { label: "One Trick Pony", type: "M", desc: "Unicorn: one spell, but 4 layers of overglow. Zebra: only survival stew (+1 point and +5 to rolls of 3 skills) or one school of magic.",
    choices: [
      one("variant", N_("Variant"), [{ v: "unicorn", label: N_("Unicorn: one spell") }, { v: "stew", label: N_("Zebra: survival stew (+1 point)") }, { v: "school", label: N_("Zebra: one school of magic") }]),
      many("skills", N_("+5 to rolls (3)"), skillOpts(["smallGuns", "melee", "unarmed", "sneak", "science", "mercantile", "medicine", "repair"]), 3, { show: ch => ch.variant === "stew" })],
    resolve: ch => ch.variant === "stew" ? [fx("creationPoints", "all", 1), ...(ch.skills ?? []).map(k => ROLL(k, 5))] : [] },
  oops: { label: "Oops!", type: "P", desc: "Throwing range 5 ft instead of 10, but a throw costs 5 SATS less." },
  optimistic: { label: "Optimistic", type: "M", desc: "−5 Speechcraft with people from outside safe settlements.",
    fx: [ROLL("speech", -5, N_("Talking to someone from outside a safe settlement"))] },
  overactive: { label: "Overactive Imagination", type: "M", desc: "Needlessly imagines worst-case scenarios." },
  pacifist: { label: "Pacifist", type: "M", desc: "Never shoots first; prefers peaceful solutions." },
  phobia: { label: "Phobia", type: "M", desc: "−10 to all rolls while the phobia is active (−20 more to fear).",
    fx: ALL(-10, N_("Phobia active")) },
  picky: { label: "Picky", type: "M", desc: "Doesn't pick up heavy, low-value things; rules out an omnivorous diet." },
  pipsqueak: { label: "Pipsqueak", type: "P", desc: "+5 to dodge; damage per wound −2; carry weight −10 (stacks with Young).",
    fx: [fx("dodge", "all", 5), fx("wound", "all", -2), fx("carry", "all", -10)] },
  ponikaze: { label: "Ponikaze", type: "M/P", desc: "+5 ft of movement, +10 SATS; effective DT −5, −10 to dodge.",
    fx: [fx("speed", "all", 5), fx("sats", "all", 10), fx("dt", "all", -5), fx("dodge", "all", -10)] },
  prejudiced: { label: "Prejudiced", type: "M", desc: "−30 Speechcraft and Mercantile with the chosen group.",
    fx: [ROLL("speech,mercantile", -30, N_("With the group they're prejudiced against"))] },
  prideful: { label: "Prideful", type: "M", desc: "Can't stand being treated as lesser or admitting mistakes." },
  psychosis: { label: "Psychosis", type: "M", desc: "The character is insane." },
  sadist: { label: "Sadist", type: "M", desc: "Enjoys inflicting pain." },
  scarred: { label: "Scarred", type: "P", desc: "−10 to all CHA rolls; Speechcraft intimidation +5.",
    fx: [BASED("cha", -10), ROLL("speech", 15, N_("Intimidation (+5 in total)"))] },
  scavenger: { label: "Scavenger", type: "M", desc: "Must pick up everything that has any value at all." },
  shadowOfTheMoon: { label: "Shadow of the Moon", type: "M", desc: "Critical success on attacks at 1–10; weapons wear out 2× faster, offensive spells +2 strain.",
    fx: [fx("critSuccess", "attack", 5)] },
  sickly: { label: "Sickly", type: "P", desc: "While the illness is active (a failed END ½ at the start of the session): −1 END and −1 to another attribute.",
    choices: [one("attr", N_("Second attribute"), attrOpts(["str", "agi"]))],
    resolve: ch => [fx("tempAttr", ["end", ch.attr].filter(Boolean).join(","), -1, N_("Illness active"))] },
  skinny: { label: "Skinny as a Rail", type: "P", desc: "−1 STR and END, +3 to dodge.",
    fx: [A("str", -1), A("end", -1), fx("dodge", "all", 3)] },
  slave: { label: "Slave", type: "M", desc: "Conditioned to certain behaviors; Internal/Concealed Storage for free." },
  securityMare: { label: "Spirit of the Security Mare", type: "M", desc: "Luck cards: 21 → +5 to rolls, only 14 → −5, neither → −10.",
    fx: [...ALL(5, N_("The cards give 21")), ...ALL(-5, N_("The cards give only 14")), ...ALL(-10, N_("The cards give neither 21 nor 14"))] },
  sprayAndPray: { label: "Spray and Pray", type: "P", desc: "−10 accuracy with single-shot weapons; bursts: 2× ammo, +1 damage die; −5 SATS.",
    fx: [fx("accuracy", "ranged", -10, N_("Single-shot weapon"))] },
  stubby: { label: "Stubby Little Horn / Wings", type: "P", desc: "Unicorn: Magic +0 instead of +10, telekinesis only. Pegasus: flies only low.",
    fx: [RANK("magic", -10)] },
  studious: { label: "Studious", type: "M", desc: "−5 to Small Guns and Big Guns and −5 to three (or −3 to five) others; +1 point from every book.",
    fx: [RANK("smallGuns,bigGuns", -5)],
    choices: [
      one("mode", N_("Variant"), [{ v: "m5", label: N_("−5 to three skills") }, { v: "m3", label: N_("−3 to five skills") }]),
      many("skills", N_("Skills"), skillOpts(["unarmed", "melee", "explosives", "speech", "survival", "mercantile", "sneak"]), ch => ch.mode === "m3" ? 5 : 3, { show: ch => !!ch.mode })],
    resolve: ch => (ch.skills ?? []).map(k => RANK(k, ch.mode === "m3" ? -3 : -5)) },
  stuttering: { label: "Stuttering", type: "P/M", desc: "−5 to the ranks and −5 to rolls of Mercantile and Speechcraft.",
    fx: [RANK("speech,mercantile", -5), ROLL("speech,mercantile", -5)] },
  suicidal: { label: "Suicidal", type: "M", desc: "The character has suicidal tendencies." },
  thorough: { label: "Thorough", type: "M", desc: "+3 to skill rolls without haste; −5 to all rolls in a hurry.",
    fx: [ROLL("all", 3, N_("Without haste, outside combat")), ...ALL(-5, N_("In a hurry (more than one action per turn)"))] },
  triggerDiscipline: { label: "Trigger Discipline", type: "P/M", desc: "+5 accuracy with Small Guns, Big Guns and Energy Weapons; bursts −20% rounds and −1 die; +5 SATS.",
    fx: [fx("accuracy", "smallGuns,bigGuns,energy", 5)] },
  trusting: { label: "Trusting", type: "M", desc: "−10 to Mercantile rolls.", fx: [ROLL("mercantile", -10)] },
  uncontrolledMagic: { label: "Uncontrolled Magic", type: "M", desc: "−10 to casting and aiming spells; magic side effects.", fx: [ROLL("magic", -10)] },
  unforgivable: { label: "Unforgivable", type: "P", desc: "−50 karma each time it's taken (it can be taken twice).",
    choices: [one("times", N_("How many times"), [{ v: "1", label: N_("Once (−50 karma)") }, { v: "2", label: N_("Twice (−100 karma, +1 point)") }])],
    resolve: ch => ch.times === "2" ? [fx("karma", "all", -100), fx("creationPoints", "all", 1)] : [fx("karma", "all", -50)] },
  unstableGenetics: { label: "Unstable Genetics", type: "P", desc: "−30 to END against Taint, an extra −5 against radiation sickness; mutations come more easily." },
  virtue: { label: "Virtue", type: "M", desc: "Knows their virtue (Kindness, Loyalty, Honesty, Generosity, Laughter…) and lives by it." },
  wallEyed: { label: "Wall-eyed", type: "P", desc: "+5 to sight Perception; −10 accuracy without sights; −5 Speechcraft when trying to look smart.",
    fx: [AROLL("per", 5, N_("Sight Perception")), fx("accuracy", "ranged", -10, N_("A shot without aiming through the sights (outside SATS)")), ROLL("speech", -5, N_("Trying to look smart"))] },
  wsd: { label: "Wartime Stress Disorder", type: "M", desc: "−5 to INT, AGI and CHA skills outside combat; +5 to the rank of one combat skill or Survival.",
    fx: [fx("skillsOf", "int,agi,cha", -5, N_("Outside combat"))],
    choices: [one("skill", N_("+5 bonus to"), skillOpts([...COMBAT, "survival"]))],
    resolve: ch => ch.skill ? [RANK(ch.skill, 5)] : [] },
  whiner: { label: "Whiner", type: "M", desc: "−15 to Speechcraft and CHA rolls, +5 to Mercantile.",
    fx: [ROLL("speech", -15), AROLL("cha", -15), ROLL("mercantile", 5)] },
  young: { label: "Young", type: "P", desc: "−3 to skills (except Sneak), +1 CHA and Luck, −1 STR, +5 to dodge, damage per wound −2, carry weight −50.",
    fx: [A("cha", 1), A("luck", 1), A("str", -1), RANK("all", -3), RANK("sneak", 3), fx("dodge", "all", 5), fx("wound", "all", -2), fx("carry", "all", -50)] }
}, ["desc"]);

// ---------- Cechy (Traits, s. 100–124) — kosztują punkty tworzenia ----------
// cost: [min, max]; opcje z polem cost ustalają koszt same (np. wybór zwierzęcia lub wariantu).
export const TRAITS = tfields({
  aceFlyer: { label: "Ace Flyer", cost: [1, 1], desc: "+2 level 2 maneuvers and +1 level 3. Requires Flight; not with Flight School Dropout." },
  additionalSpell: { label: "Additional Spell/Recipe", cost: [1, 1], desc: "An extra level 0–1 spell or recipe. Requires Magic; not for alicorns." },
  agileTongue: { label: "Agile Tongue / Prehensile Tail", cost: [1, 1], desc: "Removes the racial Lockpicking penalty; +5 to the Lockpicking and Science ranks.",
    fx: [RANK("lockpick,science", 5)], removeLockpickPenalty: true },
  animalCompanion: { label: "Animal Companion", cost: [1, 3], desc: "An animal companion (the GM has the stats). Not with Robot Companion.",
    choices: [one("pet", N_("Animal"), [
      { v: "dog", label: N_("Dog (1)"), cost: 1 }, { v: "cyberdog", label: N_("Cyberdog (2)"), cost: 2 }, { v: "molerat", label: N_("Mole rat (1)"), cost: 1 },
      { v: "radroach", label: N_("1d4 radroaches (1)"), cost: 1 }, { v: "brahmin", label: "Brahmin (2)", cost: 2 }, { v: "timberwolf", label: N_("Timberwolf (2)"), cost: 2 },
      { v: "phoenix", label: N_("Balefire phoenix (3)"), cost: 3 }, { v: "nightstalker", label: "Nightstalker (3)", cost: 3 }, { v: "yaoguai", label: "Yao Guai (3)", cost: 3 }])] },
  arcaneDevotion: { label: "Arcane Devotion", cost: [2, 2], desc: "+5 to the Magic rank, extra starting spells (attribute/3). Requires the Magic tag and INT 8 or Studious.",
    fx: [RANK("magic", 5)] },
  astronomer: { label: "Astronomer", cost: [1, 1], desc: "+10 to Magic for star lore and star recipes (zebras).",
    fx: [ROLL("magic", 10, N_("Star lore / a star recipe"))] },
  brave: { label: "Brave", cost: [1, 1], desc: "Fear rolls one MFD step easier; companions +10." },
  cache: { label: "Cache Location", cost: [1, 3], desc: "A stash of equipment: 1000 caps of value for each point." },
  channeler: { label: "Channeler", cost: [1, 2], desc: "More strain or faster regeneration (requires Magic).",
    choices: [one("variant", N_("Variant"), [
      { v: "cap4", label: "+4 strain (1)", cost: 1 }, { v: "regen45", label: N_("Regeneration every 45 min (1)"), cost: 1 },
      { v: "both", label: N_("+4 strain and every 45 min (2)"), cost: 2 }, { v: "cap8", label: "+8 strain (2)", cost: 2 }, { v: "regen30", label: N_("Regeneration every 30 min (2)"), cost: 2 }])],
    resolve: ch => ({ cap4: [fx("strain", "all", 4)], both: [fx("strain", "all", 4)], cap8: [fx("strain", "all", 8)] })[ch.variant] ?? [] },
  clearConscience: { label: "Clear Conscience", cost: [1, 1], desc: "+25 to rolls against gaining mental hindrances." },
  contortionist: { label: "Contortionist", cost: [1, 1], desc: "+15 to dodging and hiding behind cover; squeezes into small spaces. Requires AGI 6.",
    fx: [fx("dodge", "all", 15)] },
  cyberpony: { label: "Cyberpony", cost: [1, 3], desc: "+10 fire DT, 10% radiation resistance, +10 against poisons; DT +6 at the prosthesis (1 pt) or +3 everywhere (3 pts).",
    choices: [
      one("level", N_("Level"), [{ v: "1", label: N_("1 pt — a prosthesis"), cost: 1 }, { v: "3", label: N_("3 pts — more machine than flesh"), cost: 3 }]),
      one("loc", N_("Prosthesis location"), locOpts(), { show: ch => ch.level === "1" })],
    resolve: ch => [fx("radResist", "all", 10), fx("fireDt", "all", 10), fx("limbWounds", "flLeg,frLeg,rlLeg,rrLeg,wings", 1),
      ...(ch.level === "3" ? [fx("dt", "all", 3)] : ch.loc ? [fx("dt", ch.loc, 6)] : [])] },
  shadowflash: { label: "Shadowflash", cost: [1, 1], onlyRaces: ["bat"], notWith: ["young"],
    desc: "Bat pony shadow magic (p. 35): a teleport like Teleportation I (10×INT ft) of only yourself and held items; shadow pool AGI+PER+2, cost 2, regains 1 per hour; Flight roll MFD ½ when dodging (success = dodge), ¾ otherwise. Magic suppression doesn't work on it." },
  dareingDo: { label: "D.A.R.E.-ing Do", cost: [1, 1], desc: "+20 to END or INT against addiction." },
  diseaseResistant: { label: "Disease Resistant", cost: [1, 1], desc: "+20 to END against diseases." },
  faith: { label: "Faith", cost: [1, 1], desc: "Once per session a personal critical success range; helps the party avoid mental hindrances." },
  foalAtHeart: { label: "Foal at Heart", cost: [1, 1], desc: "Dialogue options with the young; temporarily +2 CHA with young NPCs.",
    fx: [fx("tempAttr", "cha", 2, N_("Talking with a young NPC"))] },
  formalEducation: { label: "Formal Education", cost: [1, 1], desc: "+10 to INT rolls for knowledge about the world.",
    fx: [AROLL("int", 10, N_("A roll for knowledge about the world"))] },
  goodLuckCharm: { label: "Good Luck Charm", cost: [1, 1], desc: "Once per session an ally rerolls a failure; allies have one more luck card." },
  heavenlyVision: { label: "Heavenly Vision", cost: [1, 1], desc: "+10 to all CHA rolls (with skills); +1d10 damage with Pony Romance; jealous rivals deal +1d10.",
    fx: [BASED("cha", 10)] },
  implanted: { label: "Implanted", cost: [2, 4], desc: "Internal implants: 2 pts for the first, +1 for each next one (describe the others by hand).",
    choices: [
      one("implant", N_("Main implant"), [
        { v: "attr", label: N_("+1 to an attribute") }, { v: "nemean", label: "Nemean Sub-Dermal Armor (+4 DT)" },
        { v: "basilisk", label: N_("Basilisk Impact Armor (+10 DT, −1 CHA, −10 CHA skills)") }, { v: "other", label: N_("Other (manual description)") }]),
      one("attr", N_("Attribute"), attrOpts(["str", "per", "end", "cha", "int", "agi", "luck"]), { show: ch => ch.implant === "attr" })],
    resolve: ch => ({
      attr: ch.attr ? [A(ch.attr, 1)] : [],
      nemean: [fx("dt", "all", 4)],
      basilisk: [fx("dt", "all", 10), A("cha", -1), fx("skillsOf", "cha", -10)]
    })[ch.implant] ?? [] },
  concealedStorage: { label: "Internal/Concealed Storage", cost: [1, 1], desc: "Hides a small item even when naked. Free with Slave." },
  ironStomach: { label: "Iron Stomach", cost: [1, 1], desc: "Eats spoiled food without ill effects; half the radiation from food; swallowed poisons one step easier." },
  large: { label: "Large", cost: [1, 1], desc: "A wound every 12 damage (+2), +20 carry weight, −5 to dodge and −5 to Sneak.",
    fx: [fx("wound", "all", 2), fx("carry", "all", 20), fx("dodge", "all", -5), ROLL("sneak", -5)] },
  lucky: { label: "Lucky", cost: [1, 3], desc: "Once per session a reroll and a choice of the result, plus +1 luck card — for each time it's taken (max. 3).",
    choices: [one("times", N_("How many times"), [{ v: "1", label: N_("Once (1)"), cost: 1 }, { v: "2", label: N_("Twice (2)"), cost: 2 }, { v: "3", label: N_("Three times (3)"), cost: 3 }])],
    resolve: ch => [fx("luckCards", "all", Number(ch.times) || 1)] },
  magicalSavant: { label: "Magical Savant", cost: [2, 2], desc: "Learns spells more easily (+10); spell strain cost −1 (min. 1). Requires INT 8 and Magic." },
  ministryDescendant: { label: "Ministry Descendant", cost: [0, 0], desc: "A descendant of a Ministry Mare: access to locked places and files. Only with GM approval." },
  ministryEmployee: { label: "Ministry Employee", cost: [0, 0], desc: "A former Ministry employee (alicorns, cyberponies, ghouls). Only with GM approval." },
  named: { label: "Named Weapon/Armor", cost: [1, 1], desc: "Starts with a named weapon or armor." },
  omnivore: { label: "Omnivore", cost: [1, 1], desc: "A broader diet; +3 to the Survival rank.", fx: [RANK("survival", 3)] },
  openMinded: { label: "Open Minded", cost: [1, 1], desc: "Ignores racial Speechcraft penalties with other races." },
  organization: { label: "Organization", cost: [0, 3], desc: "A member of an organization with benefits (the GM sets the cost, usually 0–3).",
    choices: [
      one("org", N_("Organization"), [
        { v: "legion", label: N_("Caesar's Legion (zebras, minotaurs)") }, { v: "proditor", label: N_("Proditor (zebras)") },
        { v: "crusaders", label: N_("Crusaders (Young or Foal at Heart)") }, { v: "evc", label: N_("Enclave Volunteer Corps (pegasi)") },
        { v: "ganger", label: "Gang" }, { v: "mercenary", label: N_("Mercenary / bounty hunter") }, { v: "raider", label: N_("Raider (requires Sadist)") },
        { v: "reaper2", label: N_("Reaper — affiliated gang (2)"), cost: 2 }, { v: "reaper3", label: N_("Reaper — lone (3)"), cost: 3 },
        { v: "settleMinor", label: N_("Minor settlement") }, { v: "settleMajor", label: N_("Major settlement") }, { v: "slaver", label: N_("org|Slaver") },
        { v: "knight", label: N_("Steel Rangers — Knight") }, { v: "scribe", label: N_("Steel Rangers — Scribe") },
        { v: "ajKnight", label: N_("Applejack's Rangers — Knight") }, { v: "ajScribe", label: N_("Applejack's Rangers — Scribe") },
        { v: "tribal", label: N_("Tribe") }]),
      one("skill", N_("Skill"), skillOpts(["survival", "energy", "science", "medicine"]), { show: ch => ch.org === "evc", label: N_("+3 to (EVC)") }),
      one("skill", N_("+5 to a combat skill"), skillOpts(COMBAT), { show: ch => ch.org === "reaper2" || ch.org === "reaper3" }),
      one("skill", N_("+7 to a skill"), skillOpts(ALL_SKILLS), { show: ch => ch.org === "settleMinor" }),
      one("skill", N_("+5 to INT or CHA skill rolls"), skillOpts(["mercantile", "speech", "medicine", "repair", "science", "magic"]), { show: ch => ch.org === "settleMajor" }),
      one("skill", N_("+5 to"), skillOpts(["melee", "unarmed", "smallGuns"]), { show: ch => ch.org === "tribal" }),
      many("skills", N_("Scribe: +3 to two research skills"), skillOpts(ALL_SKILLS), 2, { show: ch => ch.org === "scribe" || ch.org === "ajScribe" })],
    resolve: ch => {
      const sk = ch.skill;
      switch (ch.org) {
        case "legion": return [RANK("sneak,survival,magic", 5), fx("karma", "all", -10), ROLL("speech", -25, N_("With races other than zebras"))];
        case "proditor": return [RANK("survival,magic", 5)];
        case "crusaders": return [RANK("survival,sneak,speech", 3), ROLL("mercantile", 5, N_("In a major settlement"))];
        case "evc": return sk ? [RANK(sk, 3)] : [];
        case "reaper2": case "reaper3": return sk ? [RANK(sk, 5)] : [];
        case "settleMinor": return sk ? [RANK(sk, 7)] : [];
        case "settleMajor": return [fx("caps", "all", 100), ROLL("mercantile", 5, N_("With traders from the home settlement")), ...(sk ? [ROLL(sk, 5)] : [])];
        case "knight": return [RANK("bigGuns", 5)];
        case "ajKnight": return [RANK("bigGuns", 5), fx("karma", "all", 10)];
        case "scribe": return (ch.skills ?? []).map(k => RANK(k, 3));
        case "ajScribe": return [...(ch.skills ?? []).map(k => RANK(k, 3)), fx("karma", "all", 10)];
        case "tribal": return sk ? [RANK(sk, 5)] : [];
        default: return [];
      }
    } },
  poisonResistant: { label: "Poison Resistant", cost: [1, 1], desc: "+10 to END against poisons; a 50% chance that a deadly poison won't kill." },
  ponyRomance: { label: "Pony Romance", cost: [1, 1], desc: "+1d10 damage against the chosen sex (add it to the formula by hand)." },
  powerArmor: { label: "Power Armor Training", cost: [1, 1], desc: "Can make full use of power armor." },
  quickWitted: { label: "Quick Witted", cost: [1, 1], desc: "+10 to initiative, +5 to INT/PER under time pressure; acts in the surprise round.",
    fx: [fx("initiative", "all", 10), AROLL("int,per", 5, N_("Under time pressure"))] },
  reversal: { label: "Reversal of Fortune", cost: [1, 1], desc: "Once per session swaps the tens and ones digits of a roll." },
  robotCompanion: { label: "Robot Companion", cost: [1, 3], desc: "A robot companion (the GM has the stats). Not with Animal Companion.",
    choices: [one("robot", "Robot", [
      { v: "protectapony", label: "Protectapony (1)", cost: 1 }, { v: "spritebot", label: "Spritebot (1)", cost: 1 },
      { v: "handy", label: "Mister Handy (2)", cost: 2 }, { v: "gutsy", label: "Mister Gutsy (2)", cost: 2 },
      { v: "ponitron", label: "Ponitron (2)", cost: 2 }, { v: "sentry", label: "Sentry Bot (3)", cost: 3 }])] },
  senseMagic: { label: "Sense Magic", cost: [1, 1], desc: "Senses magic being used nearby; illusions on them are 2 steps harder." },
  specialization: { label: "Specialization", cost: [1, 1], desc: "+15 to rolls within the specialization (the skill must be tagged).",
    fx: ALL(15, N_("Within the specialization")) },
  stableDweller: { label: "Stable Dweller", cost: [1, 1], desc: "Grew up in a Stable: a PipBuck and a Stable jumpsuit." },
  sternerStuff: { label: "Sterner Stuff", cost: [1, 2], desc: "Physical: +1 DT and +5 against diseases and poisons. Mental: +10 to mental resistance.",
    choices: [one("variant", N_("Variant"), [{ v: "body", label: N_("Physical (1)"), cost: 1 }, { v: "mind", label: N_("Mental (1)"), cost: 1 }, { v: "both", label: N_("Both (2)"), cost: 2 }])],
    resolve: ch => ch.variant === "body" || ch.variant === "both" ? [fx("dt", "all", 1)] : [] },
  tastesFine: { label: "“Tastes Fine to Me!”", cost: [1, 1], desc: "+5 to Survival rolls.", fx: [ROLL("survival", 5)] },
  touchedBySun: { label: "Touched by the Sun", cost: [1, 1], desc: "+1 to all attributes, −5 to all skills, −1 skill point per level.",
    fx: [A("all", 1), RANK("all", -5)] },
  medicineMare: { label: "Trained under a Medicine Mare", cost: [1, 1], desc: "One level 0 zebra recipe; ignores racial Speechcraft penalties with zebras." },
  weirdo: { label: "Wasteland Weirdo", cost: [1, 4], desc: "A rare or unique feature, ability or effect from the past (add the effects by hand)." },
  zebraAugmented: { label: "Zebra Augmented", cost: [1, 1], desc: "+3 DT, +10 fire DT, +10 against poisons, 10% radiation resistance (zebras).",
    fx: [fx("dt", "all", 3), fx("fireDt", "all", 10), fx("radResist", "all", 10)] },
  ghoul: { label: "Ghoul", cost: [2, 3], desc: "Ghoul: −5 to PER rolls, −20 Speechcraft with non-ghouls; healed by radiation.",
    fx: [AROLL("per", -5), ROLL("speech", -20, N_("With non-ghouls"))] },
  canterlotGhoul: { label: "Canterlot Ghoul", cost: [4, 4], desc: "Like Ghoul + immunity to the Pink Cloud; 15 free skill ranks (enter them in the Other column).",
    fx: [AROLL("per", -5), ROLL("speech", -20, N_("With non-ghouls"))] }
}, ["desc"]);

// ---------- Archetypy NPC (s. 604: „Rapid NPC Generation”) ----------
// attrs: rozkład 28 punktów; tags: 3 tagi; focus: umiejętności, w które idą punkty z poziomów (waga)
export const NPC_ARCHETYPES = tfields({
  raider: { label: "npc|Raider", attrs: { str: 6, per: 5, end: 6, cha: 2, int: 3, agi: 6, luck: 7 },
    tags: ["melee", "smallGuns", "unarmed"], focus: { smallGuns: 3, melee: 3, unarmed: 2, sneak: 1, explosives: 1 } },
  mercenary: { label: "npc|Mercenary", attrs: { str: 6, per: 6, end: 6, cha: 3, int: 4, agi: 6, luck: 4 },
    tags: ["smallGuns", "bigGuns", "survival"], focus: { smallGuns: 3, bigGuns: 2, survival: 1, melee: 1, explosives: 1 } },
  guard: { label: "Settlement guard", attrs: { str: 6, per: 7, end: 6, cha: 4, int: 4, agi: 5, luck: 3 },
    tags: ["smallGuns", "melee", "speech"], focus: { smallGuns: 3, melee: 2, speech: 1, survival: 1 } },
  ranger: { label: "Steel Ranger", attrs: { str: 7, per: 6, end: 7, cha: 3, int: 5, agi: 4, luck: 3 },
    tags: ["bigGuns", "energy", "repair"], focus: { bigGuns: 3, energy: 3, repair: 1, science: 1 } },
  sniper: { label: "Scout / sniper", attrs: { str: 4, per: 8, end: 5, cha: 3, int: 4, agi: 8, luck: 3 },
    tags: ["smallGuns", "sneak", "survival"], focus: { smallGuns: 3, sneak: 2, survival: 2, lockpick: 1 } },
  trader: { label: "Trader / caravaneer", attrs: { str: 4, per: 5, end: 5, cha: 8, int: 6, agi: 4, luck: 3 },
    tags: ["mercantile", "speech", "smallGuns"], focus: { mercantile: 3, speech: 3, smallGuns: 1, survival: 1 } },
  doctor: { label: "Medic", attrs: { str: 3, per: 6, end: 5, cha: 6, int: 8, agi: 5, luck: 2 },
    tags: ["medicine", "science", "speech"], focus: { medicine: 4, science: 2, speech: 1 } },
  scientist: { label: "Scientist / technician", attrs: { str: 3, per: 6, end: 4, cha: 4, int: 9, agi: 5, luck: 4 },
    tags: ["science", "repair", "energy"], focus: { science: 3, repair: 3, energy: 1, lockpick: 1 } },
  mage: { label: "Mage (unicorn)", attrs: { str: 3, per: 6, end: 4, cha: 5, int: 9, agi: 5, luck: 3 },
    tags: ["magic", "science", "medicine"], focus: { magic: 4, science: 1, medicine: 1, energy: 1 } },
  scavver: { label: "npc|Scavenger", attrs: { str: 5, per: 6, end: 6, cha: 3, int: 5, agi: 6, luck: 4 },
    tags: ["lockpick", "survival", "repair"], focus: { lockpick: 2, survival: 2, repair: 2, smallGuns: 1, sneak: 1 } },
  slaver: { label: "npc|Slaver", attrs: { str: 6, per: 5, end: 6, cha: 5, int: 4, agi: 5, luck: 4 },
    tags: ["smallGuns", "melee", "speech"], focus: { smallGuns: 2, melee: 2, speech: 2, unarmed: 1 } },
  civilian: { label: "Resident / civilian", attrs: { str: 5, per: 5, end: 5, cha: 5, int: 5, agi: 5, luck: 5 },
    tags: ["survival", "repair", "mercantile"], focus: { survival: 1, repair: 1, mercantile: 1, speech: 1 } }
}, ["label"]);
