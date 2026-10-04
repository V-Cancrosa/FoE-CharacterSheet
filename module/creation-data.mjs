/**
 * Dane do tworzenia postaci — Fallout: Equestria RPG v1.22, rozdział 2 („Making a Character”).
 * Strony w komentarzach odnoszą się do podręcznika.
 */
import { ATTRS, SKILLS, LOCATIONS } from "./data.mjs";

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
const one = (id, label, options, extra = {}) => ({ id, label, type: "one", options, ...extra });
const many = (id, label, options, pick, extra = {}) => ({ id, label, type: "many", options, pick, ...extra });
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

export const RACES = {
  earth: {
    label: "Kucyk ziemski (Earth Pony)",
    desc: "Wszechstronny i silny. Dwa punkty rasowe, darmowa cecha za 1 pkt, +1 punkt umiejętności na każdym poziomie.",
    attrs: { pick: 2, from: ["str", "end", "int"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["science", "repair", "unarmed", "bigGuns", "survival"] }] },
    freeTraitPoints: 1,
    earthPerk: true,
    notes: ["Earth Pony Dedication: +1 punkt umiejętności na każdym poziomie.",
      "Może wziąć Ricochet jako cechę za 1 pkt; Cyberpony bez zgody MG."]
  },
  unicorn: {
    label: "Jednorożec (Unicorn)",
    desc: "Magia i telekineza. Brak kary do Lockpicking, darmowe zaklęcie znaczka i jedno zaklęcie poziomu 1.",
    attrs: { pick: 1, from: ["per", "int", "luck"] },
    skills: { picks: [{ n: 3, value: 3, from: ["smallGuns", "sneak", "lockpick", "energy", "science"] }] },
    racial: { magic: { bonus: 10, attrs: ["int"] } },
    notes: ["Magia: telekineza, zaklęcie znaczka (jeśli pasuje) + jedno darmowe zaklęcie poziomu 1."]
  },
  pegGround: {
    label: "Pegaz (urodzony na ziemi)",
    desc: "Lot i zwinność. Wersja dla pegaza wychowanego na powierzchni.",
    attrs: { pick: 1, from: ["agi", "end", "per"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["survival", "mercantile", "smallGuns", "sneak"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    notes: ["Lot, manewry powietrzne, dostęp do terminali chmur Enklawy."]
  },
  pegDash: {
    label: "Pegaz (Dashite)",
    desc: "Lot i zwinność. Weteran wojskowy; Power Armor Training za darmo.",
    attrs: { pick: 1, from: ["agi", "per"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["survival", "energy", "bigGuns", "repair"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    traits: [{ key: "powerArmor", free: true }],
    notes: ["Lot, manewry powietrzne, dostęp do terminali chmur Enklawy."]
  },
  pegEnclave: {
    label: "Pegaz (Enklawa / EVC)",
    desc: "Lot i zwinność. Wykształcenie naukowe lub medyczne; Formal Education za darmo przy członkostwie w EVC.",
    attrs: { pick: 1, from: ["agi", "int"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["medicine", "science", "survival", "smallGuns", "energy"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    notes: ["Lot, manewry powietrzne, dostęp do terminali chmur Enklawy.", "Formal Education za darmo przy Organization: EVC."]
  },
  griffin: {
    label: "Gryf (Griffin)",
    desc: "Latający najemnik z ostrymi pazurami; precyzyjna manipulacja bez magii.",
    attrs: { pick: 1, from: ["per", "agi", "end"] },
    skills: { picks: [{ n: 2, value: 3, from: ["smallGuns", "bigGuns", "energy", "melee", "unarmed"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    notes: ["Pazury (broń Unarmed), Opposable Claw: wspinaczka z połową szybkości.", "Brak znaczka. Zalecana Organization: Mercenary."]
  },
  zebra: {
    label: "Zebra",
    desc: "Magia zebr (alchemia, talizmany). Premie przetrwania; kara do Speechcraft wobec kucyków.",
    attrs: { pick: 1, from: ["per", "end", "cha", "int"] },
    skills: { fixed: { survival: 5, unarmed: 5, sneak: 5, lockpick: -10 } },
    racial: { magic: { bonus: 10, attrs: ["int", "cha"] } },
    zebraNoMagic: true,
    traits: [{ key: "hindLegStance", free: true, label: "Hind Leg Stance (perk)", desc: "Darmowy perk rasowy zebr." }],
    notes: ["−20 Speechcraft wobec kucyków (−5 w przebraniu lub jako Proditor).",
      "Receptury na start: Magic / 10."]
  },
  alicornUnity: {
    label: "Alikorn (Unity)",
    desc: "Potężna magia i lot, umysł zbiorowy. Tylko 1 punkt za każde 2 wady (maks. 8 wad). Niezalecany dla początkujących.",
    attrs: { pick: 1, from: ["int", "end"] },
    skills: { fixed: { bigGuns: 5, sneak: 3 } },
    racial: { flight: { bonus: 5, attrs: ["agi"] }, magic: { bonus: 15, attrs: ["int"] } },
    traits: [{ key: "large", free: true }, { key: "channeler", free: true, choices: { variant: "cap4" } }],
    hindrances: [{ key: "flightSchoolDropout", points: true }],
    hindrancePoints: "half", maxHindrances: 8,
    notes: ["−40 Speechcraft wobec kucyków (poza przebraniem / pierwszym spotkaniem).", "Odporność na Taint i Pink Cloud; leczenie promieniowaniem."]
  },
  alicornPost: {
    label: "Alikorn (po upadku Unity)",
    desc: "Jak alikorn z Unity, ale niezależny; uczy się zaklęć jak jednorożec.",
    attrs: { pick: 1, from: ["int", "end", "luck"] },
    skills: { fixed: { bigGuns: 5, sneak: 3 } },
    racial: { flight: { bonus: 5, attrs: ["agi"] }, magic: { bonus: 15, attrs: ["int"] } },
    traits: [{ key: "large", free: true }, { key: "channeler", free: true, choices: { variant: "cap4" } }],
    hindrances: [{ key: "flightSchoolDropout", points: true }],
    hindrancePoints: "half", maxHindrances: 8,
    notes: ["−20 Speechcraft wobec kucyków (poza przebraniem).", "Odporność na Taint i Pink Cloud; leczenie promieniowaniem."]
  },
  alicornGen2: {
    label: "Alikorn (2. pokolenie)",
    desc: "Urodzony z alikornów, słabszy magicznie. Musi wziąć Young; punkty = liczba wad − 2.",
    attrs: { pick: 1, from: ["int", "end", "luck"] },
    skills: { picks: [{ n: 2, value: 3, from: ["mercantile", "speech", "bigGuns", "sneak"] }] },
    racial: { flight: { bonus: 5, attrs: ["agi"] }, magic: { bonus: 5, attrs: ["int"] } },
    traits: [{ key: "channeler", free: true, choices: { variant: "cap4" } }],
    hindrances: [{ key: "young", points: true }],
    hindrancePoints: "minus2", maxHindrances: 8,
    notes: ["Na start tarcza (Shield, poziom 1) lub inne zaklęcie 0/1 + ewentualnie zaklęcie znaczka."]
  },
  hellhound: {
    label: "Piekielny pies (Hellhound)",
    desc: "Groźny w zwarciu, kopie przez beton. Tylko 1 punkt za każde 2 wady (maks. 8). Niezalecany dla początkujących.",
    attrs: { pick: 1, from: ["str", "per", "end"] },
    skills: { fixed: { explosives: 5, sneak: 5 }, picks: [{ n: 1, value: 5, from: ["energy", "unarmed"] }] },
    racial: { dig: { bonus: 10, attrs: ["str"] } },
    hindrances: [{ key: "bigEars", points: true }],
    hindrancePoints: "half", maxHindrances: 8,
    notes: ["−50 Speechcraft wobec ras innych niż psy.", "Biped: połowa szybkości bazowej, wspinaczka. Pazury.", "Odporność na Taint i promieniowanie."]
  },
  sanddog: {
    label: "Pies piaskowy (Sand Dog)",
    desc: "Mistrz cybernetyki i napraw, kopie w ziemi. Musi wziąć Big Ears.",
    attrs: { pick: 1, from: ["int", "agi", "end"] },
    skills: { fixed: { energy: 3, repair: 5, explosives: 5, sneak: 3 } },
    racial: { dig: { bonus: 10, attrs: ["str"] } },
    hindrances: [{ key: "bigEars", points: true }],
    notes: ["−15 Speechcraft wobec kucyków.", "Biped, Opposable Thumb za darmo. Cyber Dog tańszy o 1 pkt."]
  },
  bat: {
    label: "Kucyk nietoperzowy (Bat Pony)",
    desc: "Lot, echolokacja i ultradźwiękowy krzyk. Mówi poza zakresem słuchu innych ras.",
    attrs: { pick: 1, from: ["per", "agi"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["energy", "survival", "unarmed", "sneak"] }] },
    racial: { flight: { bonus: 10, attrs: ["agi"] } },
    hindrances: [{ key: "mute", points: false, uncounted: true }],
    notes: ["Sonic Screech: 3d12, SATS 40, zasięg 10 (maks. 30), ignoruje pancerz (Energy Weapons).",
      "Echolokacja: ignoruje kary oświetlenia, „widzi” na 60 ft.", "Shadowflash (cecha za 1 pkt)."]
  },
  changeling: {
    label: "Podmieniec (Changeling) — zasada domowa",
    desc: "Rasa spoza podręcznika v1.22 (zasady zapowiedziane w księdze II) — tylko za zgodą MG. Chitynowy pancerz, owadzie skrzydła, róg, przemiana i żywienie się miłością.",
    attrs: { pick: 1, from: ["cha", "agi", "int"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["speech", "sneak", "energy", "lockpick", "mercantile"] }] },
    racial: { magic: { bonus: 5, attrs: ["int", "cha"] }, flight: { bonus: 5, attrs: ["agi"] } },
    notes: ["Chityna: +2 DT na wszystkich lokacjach; magicznie zahartowani przeciw promieniowaniu (+10%).",
      "Przemiana w dowolnego widzianego kucyka podobnej wielkości (1 miłość); naturalnie zmienia głos (jak Voice Alteration).",
      "Miłość: pula CHA + END, 1 dziennie; żerowanie rzutem Speechcraft. Przy pustej puli: −1 krok rzutów END i CHA.",
      "Lot na owadzich skrzydłach (bez chodzenia po chmurach)."]
  },
  buffalo: {
    label: "Bizon (Buffalo)",
    desc: "Duży i wytrzymały. Large i jedna cecha za 1 pkt za darmo.",
    attrs: { pick: 2, from: ["str", "per", "end", "cha"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["melee", "survival", "unarmed", "medicine"] }] },
    traits: [{ key: "large", free: true }],
    freeTraitPoints: 1,
    notes: ["Szarża rogami: 6d10 + STR (6d20 przy podwójnym Large)."]
  },
  donkey: {
    label: "Osioł (Donkey)",
    desc: "Kupiec i negocjator. Sterner Stuff i jedna cecha za darmo.",
    attrs: { pick: 2, from: ["per", "cha", "end", "luck"] },
    skills: { fixed: LP, picks: [{ n: 2, value: 5, from: ["mercantile", "speech", "sneak"] }] },
    traits: [{ key: "sternerStuff", free: true, choices: { variant: "body" } }],
    freeTraitPoints: 1,
    notes: ["Może wziąć Tough Hide (perk poziomu 6) jako cechę za 1 pkt."]
  },
  minotaur: {
    label: "Minotaur",
    desc: "Dwunożny olbrzym z rękami. Large za darmo.",
    attrs: { pick: 1, from: ["str", "end"] },
    skills: { picks: [{ n: 2, value: 5, from: ["melee", "unarmed", "bigGuns", "survival"] }] },
    traits: [{ key: "large", free: true }],
    notes: ["Biped: połowa szybkości bazowej, Opposable Thumb za darmo.", "Magia zebr jako cecha za 2 pkt (Magic +10, CHA lub INT)."]
  },
  other: {
    label: "Inna rasa (np. półrasa) — ręcznie",
    desc: "Bez automatycznych premii. Premie rasy wpisz ręcznie (s. 40–48 podręcznika).",
    attrs: { pick: 0, from: [] },
    manual: true
  }
};

// Efekty rasowe przenoszone na cechę „Rasa: …” (premie do atrybutów i rang są wpisywane bezpośrednio)
const RACE_FX = {
  zebra: [ROLL("speech", -20, "Wobec kucyków (bez przebrania)")],
  alicornUnity: [ROLL("speech", -40, "Wobec kucyków (bez przebrania)")],
  alicornPost: [ROLL("speech", -20, "Wobec kucyków (bez przebrania)")],
  hellhound: [ROLL("speech", -50, "Wobec ras innych niż psy"), fx("speedPct", "ground", -50)],
  sanddog: [ROLL("speech", -15, "Wobec kucyków"), fx("speedPct", "ground", -50)],
  minotaur: [fx("speedPct", "ground", -50)],
  changeling: [fx("dt", "all", 2), fx("radResist", "all", 10)]
};
for (const [k, v] of Object.entries(RACE_FX)) RACES[k].fx = v;

// Darmowy perk kucyka ziemskiego (s. 24)
export const EARTH_PERKS = {
  strongBack: { label: "Strong Back", desc: "+50 udźwigu.", fx: [fx("carry", "all", 50)] },
  highHo: { label: "High Ho Silver, Away!", desc: "+5 ft ruchu na akcję.", fx: [fx("speed", "all", 5)] }
};

// ---------- Wady (Hindrances, s. 69–96) — każda daje 1 punkt tworzenia ----------
// fx: efekty stałe i sytuacyjne (when); choices: wybory gracza; resolve(ch): efekty zależne od wyborów.
// Efekty specjalne kreatora: caps (zmiana kapsli), karma, tags (dodatkowy tag), creationPoints.
const COMBAT = ["smallGuns", "bigGuns", "energy", "melee", "unarmed", "explosives"];
const ATTR4 = ["per", "end", "cha", "int"];

export const HINDRANCES = {
  abandoned: { label: "Abandoned / All Alone", type: "P", desc: "Zaczyna sam, 200 kapsli zamiast 300, bez PipBucka; tańsze Animal Companion / Wasteland Weirdo.", fx: [fx("caps", "all", -100)] },
  abused: { label: "Abused", type: "M", desc: "−5 celności wręcz wobec kogoś przypominającego oprawcę; −10 Speechcraft przy wspomnieniach.",
    fx: [fx("accuracy", "melee", -5, "Wobec kogoś przypominającego oprawcę"), ROLL("speech", -10, "Wspomnienia przemocy")] },
  addiction: { label: "Addiction", type: "P", desc: "Uzależnienie od substancji, jakby nie zdał rzutu na uzależnienie." },
  addictive: { label: "Addictive Personality", type: "M", desc: "Automatycznie oblewa rzuty INT przeciw uzależnieniu." },
  allergy: { label: "Allergy", type: "P", desc: "−5 do wszystkich rzutów w pobliżu alergenu, −25 przy dłuższym kontakcie.",
    fx: [...ALL(-5, "Alergen w pobliżu"), ...ALL(-25, "Dłuższy kontakt z alergenem")] },
  amnesiac: { label: "Amnesiac", type: "M", desc: "Zapomniał długi okres swojego życia." },
  badLuck: { label: "Bad Luck", type: "M", desc: "Zakres krytycznej porażki +5; jedna karta szczęścia mniej na sesję.",
    fx: [fx("critFail", "all", 5), fx("luckCards", "all", -1)] },
  badLuckCharm: { label: "Bad Luck Charm", type: "M", desc: "Raz na sesję zmusza sojusznika do przerzutu sukcesu; sojusznicy mają kartę szczęścia mniej." },
  bigEars: { label: "Big Ears", type: "P", desc: "Percepcja słuchowa +10 i o krok łatwiejsza; END ½ albo ogłuszenie przy hałasie w promieniu 5 ft.",
    fx: [AROLL("per", 10, "Percepcja słuchowa"), fx("mfdStep", "per", 1, "Percepcja słuchowa")] },
  blind: { label: "Blind", type: "P", desc: "−3 kroki MFD celności dystansowej, −1 krok wręcz; pomoc przy zadaniach wzrokowych.",
    fx: [fx("mfdStep", "ranged", -3), fx("mfdStep", "melee", -1)] },
  cannibal: { label: "Cannibal", type: "M/P", desc: "Musi jeść mięso codziennie albo zdać rzut woli ¾ (−10)." },
  cautious: { label: "Cautious", type: "M", desc: "−15 do inicjatywy, +3 do rangi Explosives.",
    fx: [fx("initiative", "all", -15), RANK("explosives", 3)] },
  clumsy: { label: "Clumsy", type: "P", desc: "−5 do Lockpicking, Explosives i Repair; krytyczna porażka od 91 w tych umiejętnościach.",
    fx: [ROLL("lockpick,explosives,repair", -5), fx("critFail", "lockpick,explosives,repair", 5)] },
  codeOfHonor: { label: "Code of Honor", type: "M", desc: "Musi postępować honorowo." },
  colorBlind: { label: "Color Blind", type: "P", desc: "Nie rozróżnia dwóch kolorów." },
  cowardly: { label: "Cowardly", type: "M", desc: "Rzuty strachu o krok MFD trudniejsze." },
  crippled: { label: "Crippled", type: "P", desc: "Trwale okaleczona kończyna: ruch −25% (skrzydło: lot −25% i −15 do Flight).",
    choices: [one("where", "Okaleczone", [{ v: "leg", label: "Noga" }, { v: "wing", label: "Skrzydło" }])],
    resolve: ch => ch.where === "wing" ? [fx("speedPct", "fly", -25), ROLL("flight", -15)] : ch.where === "leg" ? [fx("speedPct", "ground", -25)] : [] },
  curious: { label: "Curious", type: "M", desc: "Nie oprze się wciśnięciu wielkiego czerwonego guzika." },
  deaf: { label: "Deaf", type: "P", desc: "−15 do Speechcraft, Mercantile i Sneak; brak percepcji słuchowej.",
    fx: [ROLL("speech,mercantile,sneak", -15)] },
  demented: { label: "Demented", type: "M", desc: "−2 INT, +1 Luck na stałe; +5 do rangi Explosives albo Melee.",
    fx: [A("int", -2), A("luck", 1)],
    choices: [one("skill", "Premia +5 do", skillOpts(["explosives", "melee"]))],
    resolve: ch => ch.skill ? [RANK(ch.skill, 5)] : [] },
  elderly: { label: "Elderly", type: "P", desc: "−1 AGI i STR, −1 do innego atrybutu, +1 INT lub CHA; +3 do wszystkich umiejętności i czwarty tag.",
    fx: [A("agi", -1), A("str", -1), RANK("all", 3), fx("tags", "all", 1)],
    choices: [one("minus", "Dodatkowe −1 do", attrOpts(ATTR4)), one("plus", "+1 do", attrOpts(["int", "cha"]))],
    resolve: ch => [...(ch.minus ? [A(ch.minus, -1)] : []), ...(ch.plus ? [A(ch.plus, 1)] : [])] },
  enemy: { label: "Enemy", type: "P", desc: "Coś groźnego ściga postać przez pustkowia." },
  faithless: { label: "Faithless", type: "M", desc: "−5 Speechcraft wobec tych, którzy wciąż mają nadzieję.",
    fx: [ROLL("speech", -5, "Wobec kogoś, kto ma nadzieję")] },
  family: { label: "Family", type: "P", desc: "Korzyści lub kłopoty fabularne przy spotkaniu rodziny." },
  fixation: { label: "Fixation", type: "M", desc: "Obsesja na punkcie przedmiotu, osoby lub celu." },
  flightless: { label: "Flightless", type: "P", desc: "Ma umiejętność Flight, ale nie może latać." },
  flightSchoolDropout: { label: "Flight School Dropout", type: "M", desc: "Połowa manewrów powietrznych na każdym poziomie, bez manewrów poziomu 4." },
  fourEyes: { label: "Four-Eyes", type: "P", desc: "−1 PER na stałe; w okularach tymczasowo +2 PER.",
    fx: [A("per", -1), fx("tempAttr", "per", 2, "W okularach")] },
  goodNatured: { label: "Good Natured", type: "M", desc: "−10 do rang umiejętności bojowych, +5 do Speechcraft, Repair, Science, Medicine, Mercantile.",
    fx: [RANK(COMBAT.join(","), -10), RANK("speech,repair,science,medicine,mercantile", 5)] },
  guiltyConscience: { label: "Guilty Conscience", type: "M", desc: "−10 do wszystkich rzutów umiejętności, gdy pojawia się temat winy.",
    fx: [ROLL("all", -10, "Temat winy poruszony")] },
  gunShy: { label: "Gun-Shy", type: "M", desc: "Broń palna i energetyczna: −4 kroki MFD celności (poza bronią obszarową).",
    fx: [fx("mfdStep", "smallGuns,energy,bigGuns", -4)] },
  halfDecked: { label: "„Half-Decked”", type: "M", desc: "INT ½ co sesję lub w stresie, by się nie „wyłączyć”." },
  halfHeart: { label: "Half-Heart", type: "M", desc: "+3 do celności, +25 do rzutów strachu, −10 Speechcraft; łatwiej o skłonności samobójcze.",
    fx: [fx("accuracy", "all", 3), ROLL("speech", -10)] },
  hallucinations: { label: "Hallucinations", type: "M", desc: "Co sesję INT i PER ¾ — charakter halucynacji." },
  hardOfHearing: { label: "Hard of Hearing", type: "P", desc: "−10 Speechcraft/Mercantile przy cichej rozmowie, −25 percepcji słuchowej, −50 Sneak gdy mówi.",
    fx: [ROLL("speech,mercantile", -10, "Rozmowa normalnym głosem lub ciszej"), AROLL("per", -25, "Percepcja słuchowa"), ROLL("sneak", -50, "Rozmowa podczas skradania")] },
  hotBlooded: { label: "Hot Blooded", type: "P/M", desc: "Przy okaleczonej głowie lub tułowiu: +5 obrażeń, −2 AGI i PER (tymczasowo).",
    fx: [fx("damage", "all", 5, "Okaleczona głowa lub tułów"), fx("tempAttr", "agi,per", -2, "Okaleczona głowa lub tułów")] },
  illiterate: { label: "Illiterate", type: "M", desc: "Nie umie czytać; nie może mieć Science jako tagu ani używać terminali." },
  impatient: { label: "Impatient", type: "M", desc: "Nienawidzi czekać, zwykle na własną szkodę." },
  impreciseMagic: { label: "Imprecise Magic", type: "M", desc: "Celowanie zaklęciami o krok trudniejsze; −10 do Repair, Medicine, Science, Lockpicking. Telekinetic Force za darmo.",
    fx: [ROLL("repair,medicine,science,lockpick", -10), fx("mfdStep", "magic", -1, "Celowanie zaklęciem")] },
  jinxed: { label: "Jinxed", type: "P/M", desc: "Raz na sesję MG może wymusić przerzut sukcesu; jedna karta szczęścia mniej.",
    fx: [fx("luckCards", "all", -1)] },
  literalMinded: { label: "Literal Minded", type: "M", desc: "−10 do Speechcraft; wszystko rozumie dosłownie.", fx: [ROLL("speech", -10)] },
  maimed: { label: "Maimed", type: "P", desc: "Brak części ciała (efekt wg tabeli); −5 Speechcraft przy widocznych bliznach (poza zastraszaniem).",
    fx: [ROLL("speech", -5, "Widoczne blizny (nie przy zastraszaniu)")],
    choices: [one("part", "Czego brakuje", [
      { v: "eye", label: "Oko (−10 percepcji wzrokowej i celności wymagającej głębi)" },
      { v: "nose", label: "Nos (−10 węchu i smaku)" },
      { v: "ear", label: "Ucho (−10 percepcji słuchowej)" },
      { v: "leg", label: "Noga (ruch −25%)" },
      { v: "horn", label: "Róg (brak magii)" },
      { v: "hoof", label: "Kopyto / pazur (ruch −10%)" },
      { v: "teeth", label: "Zęby (−1 CHA, −5 Survival)" },
      { v: "tail", label: "Ogon (gryf: −25 Flight)" }])],
    resolve: ch => ({
      eye: [AROLL("per", -10, "Percepcja wzrokowa"), fx("accuracy", "ranged", -10, "Cel wymaga głębi widzenia")],
      nose: [AROLL("per", -10, "Węch lub smak")],
      ear: [AROLL("per", -10, "Percepcja słuchowa")],
      leg: [fx("speedPct", "ground", -25)],
      hoof: [fx("speedPct", "ground", -10)],
      teeth: [A("cha", -1), ROLL("survival", -5)],
      tail: [ROLL("flight", -25)]
    })[ch.part] ?? [] },
  masochist: { label: "Masochist", type: "P/M", desc: "Okaleczenie: −10 zamiast −25; leczenie słabsze o 1d4 rany, odpoczynek 2× dłuższy." },
  mpd: { label: "Multiple Personality Disorder", type: "M", desc: "Osobowość mnoga — patrz pełny opis w podręczniku." },
  mutation: { label: "Mutation", type: "P", desc: "−5 do rzutów CHA wobec obcych, gdy mutacja jest widoczna.",
    fx: [BASED("cha", -5, "Widoczna mutacja, obcy rozmówca")] },
  mute: { label: "Mute", type: "P", desc: "Nie mówi (u kucyków nietoperzowych: mowa poza zakresem słuchu innych ras)." },
  naive: { label: "Naïve", type: "M", desc: "Nie wie, jak zły jest świat; na 10 poziomie zamienia się w inną wadę." },
  narcoleptic: { label: "Narcoleptic", type: "M", desc: "Określone bodźce usypiają postać (INT ¼, by się oprzeć)." },
  nastyHabit: { label: "Nasty Habit", type: "M/P", desc: "−5 do Speechcraft, Mercantile i rzutów CHA; −10 do Sneak, gdy nawyk hałasuje.",
    fx: [ROLL("speech,mercantile", -5), AROLL("cha", -5), ROLL("sneak", -10, "Nawyk hałasuje (nie stłumiony)")] },
  obese: { label: "Obese", type: "P", desc: "+1 END, −1 AGI (maks. 8), −5 do uników; je 1,5–2× więcej.",
    fx: [A("end", 1), A("agi", -1), fx("dodge", "all", -5)] },
  obligation: { label: "Obligation", type: "P", desc: "Regularne zobowiązanie wobec kogoś lub organizacji." },
  oblivious: { label: "Oblivious", type: "M", desc: "−15 do wszystkich rzutów percepcji.", fx: [AROLL("per", -15)] },
  ocd: { label: "OCD", type: "M", desc: "Objawy zaburzenia obsesyjno-kompulsywnego (rzut woli ¾, by się oprzeć)." },
  oneTrickPony: { label: "One Trick Pony", type: "M", desc: "Jednorożec: jedno zaklęcie, ale 4 warstwy overglow. Zebra: tylko gulasz przetrwania (+1 punkt i +5 do rzutów 3 umiejętności) albo jedna szkoła magii.",
    choices: [
      one("variant", "Wariant", [{ v: "unicorn", label: "Jednorożec: jedno zaklęcie" }, { v: "stew", label: "Zebra: gulasz przetrwania (+1 punkt)" }, { v: "school", label: "Zebra: jedna szkoła magii" }]),
      many("skills", "+5 do rzutów (3)", skillOpts(["smallGuns", "melee", "unarmed", "sneak", "science", "mercantile", "medicine", "repair"]), 3, { show: ch => ch.variant === "stew" })],
    resolve: ch => ch.variant === "stew" ? [fx("creationPoints", "all", 1), ...(ch.skills ?? []).map(k => ROLL(k, 5))] : [] },
  oops: { label: "Oops!", type: "P", desc: "Zasięg rzutu 5 ft zamiast 10, ale rzut kosztuje 5 SATS mniej." },
  optimistic: { label: "Optimistic", type: "M", desc: "−5 Speechcraft wobec osób spoza bezpiecznych osad.",
    fx: [ROLL("speech", -5, "Rozmówca spoza bezpiecznej osady")] },
  overactive: { label: "Overactive Imagination", type: "M", desc: "Niepotrzebnie snuje czarne scenariusze." },
  pacifist: { label: "Pacifist", type: "M", desc: "Nigdy nie strzela pierwszy; woli rozwiązania pokojowe." },
  phobia: { label: "Phobia", type: "M", desc: "−10 do wszystkich rzutów, gdy fobia jest aktywna (−20 więcej do strachu).",
    fx: ALL(-10, "Fobia aktywna") },
  picky: { label: "Picky", type: "M", desc: "Nie zbiera ciężkich, mało wartych rzeczy; wyklucza dietę wszystkożerną." },
  pipsqueak: { label: "Pipsqueak", type: "P", desc: "+5 do uników; obrażenia na ranę −2; udźwig −10 (sumuje się z Young).",
    fx: [fx("dodge", "all", 5), fx("wound", "all", -2), fx("carry", "all", -10)] },
  ponikaze: { label: "Ponikaze", type: "M/P", desc: "+5 ft ruchu, +10 SATS; efektywne DT −5, −10 do uników.",
    fx: [fx("speed", "all", 5), fx("sats", "all", 10), fx("dt", "all", -5), fx("dodge", "all", -10)] },
  prejudiced: { label: "Prejudiced", type: "M", desc: "−30 Speechcraft i Mercantile wobec wybranej grupy.",
    fx: [ROLL("speech,mercantile", -30, "Wobec grupy, do której ma uprzedzenia")] },
  prideful: { label: "Prideful", type: "M", desc: "Nie znosi bycia traktowanym gorzej i przyznawania się do błędów." },
  psychosis: { label: "Psychosis", type: "M", desc: "Postać jest szalona." },
  sadist: { label: "Sadist", type: "M", desc: "Lubi zadawać ból." },
  scarred: { label: "Scarred", type: "P", desc: "−10 do wszystkich rzutów CHA; zastraszanie Speechcraft +5.",
    fx: [BASED("cha", -10), ROLL("speech", 15, "Zastraszanie (razem +5)")] },
  scavenger: { label: "Scavenger", type: "M", desc: "Musi zbierać wszystko, co ma choć trochę wartości." },
  shadowOfTheMoon: { label: "Shadow of the Moon", type: "M", desc: "Krytyczny sukces ataków od 1–10; broń zużywa się 2× szybciej, zaklęcia ofensywne +2 strain.",
    fx: [fx("critSuccess", "attack", 5)] },
  sickly: { label: "Sickly", type: "P", desc: "Gdy choroba aktywna (nieudany END ½ na początku sesji): −1 END i −1 do innego atrybutu.",
    choices: [one("attr", "Drugi atrybut", attrOpts(["str", "agi"]))],
    resolve: ch => [fx("tempAttr", ["end", ch.attr].filter(Boolean).join(","), -1, "Choroba aktywna")] },
  skinny: { label: "Skinny as a Rail", type: "P", desc: "−1 STR i END, +3 do uników.",
    fx: [A("str", -1), A("end", -1), fx("dodge", "all", 3)] },
  slave: { label: "Slave", type: "M", desc: "Uwarunkowany do pewnych zachowań; Internal/Concealed Storage za darmo." },
  securityMare: { label: "Spirit of the Security Mare", type: "M", desc: "Karty szczęścia: 21 → +5 do rzutów, tylko 14 → −5, żadne → −10.",
    fx: [...ALL(5, "Karty dają 21"), ...ALL(-5, "Karty dają tylko 14"), ...ALL(-10, "Karty nie dają ani 21, ani 14")] },
  sprayAndPray: { label: "Spray and Pray", type: "P", desc: "−10 celności bronią jednostrzałową; serie: 2× amunicji, +1 kość obrażeń; −5 SATS.",
    fx: [fx("accuracy", "ranged", -10, "Broń jednostrzałowa")] },
  stubby: { label: "Stubby Little Horn / Wings", type: "P", desc: "Jednorożec: Magic +0 zamiast +10, tylko telekineza. Pegaz: lata tylko nisko.",
    fx: [RANK("magic", -10)] },
  studious: { label: "Studious", type: "M", desc: "−5 do Small Guns i Big Guns oraz −5 do trzech (albo −3 do pięciu) innych; +1 punkt z każdej książki.",
    fx: [RANK("smallGuns,bigGuns", -5)],
    choices: [
      one("mode", "Wariant", [{ v: "m5", label: "−5 do trzech umiejętności" }, { v: "m3", label: "−3 do pięciu umiejętności" }]),
      many("skills", "Umiejętności", skillOpts(["unarmed", "melee", "explosives", "speech", "survival", "mercantile", "sneak"]), ch => ch.mode === "m3" ? 5 : 3, { show: ch => !!ch.mode })],
    resolve: ch => (ch.skills ?? []).map(k => RANK(k, ch.mode === "m3" ? -3 : -5)) },
  stuttering: { label: "Stuttering", type: "P/M", desc: "−5 do rang i −5 do rzutów Mercantile i Speechcraft.",
    fx: [RANK("speech,mercantile", -5), ROLL("speech,mercantile", -5)] },
  suicidal: { label: "Suicidal", type: "M", desc: "Postać ma skłonności samobójcze." },
  thorough: { label: "Thorough", type: "M", desc: "+3 do rzutów umiejętności bez pośpiechu; −5 do wszystkich rzutów w pośpiechu.",
    fx: [ROLL("all", 3, "Bez pośpiechu, poza walką"), ...ALL(-5, "W pośpiechu (więcej niż jedna akcja w turze)")] },
  triggerDiscipline: { label: "Trigger Discipline", type: "P/M", desc: "+5 celności Small Guns, Big Guns i Energy Weapons; serie −20% pocisków i −1 kość; +5 SATS.",
    fx: [fx("accuracy", "smallGuns,bigGuns,energy", 5)] },
  trusting: { label: "Trusting", type: "M", desc: "−10 do rzutów Mercantile.", fx: [ROLL("mercantile", -10)] },
  uncontrolledMagic: { label: "Uncontrolled Magic", type: "M", desc: "−10 do rzucania i celowania zaklęciami; skutki uboczne magii.", fx: [ROLL("magic", -10)] },
  unforgivable: { label: "Unforgivable", type: "P", desc: "−50 karmy za każde wzięcie (można dwa razy).",
    choices: [one("times", "Ile razy", [{ v: "1", label: "Raz (−50 karmy)" }, { v: "2", label: "Dwa razy (−100 karmy, +1 punkt)" }])],
    resolve: ch => ch.times === "2" ? [fx("karma", "all", -100), fx("creationPoints", "all", 1)] : [fx("karma", "all", -50)] },
  unstableGenetics: { label: "Unstable Genetics", type: "P", desc: "−30 do END przeciw Taint, dodatkowe −5 przy chorobie popromiennej; łatwiej o mutacje." },
  virtue: { label: "Virtue", type: "M", desc: "Zna swoją cnotę (Kindness, Loyalty, Honesty, Generosity, Laughter…) i żyje według niej." },
  wallEyed: { label: "Wall-eyed", type: "P", desc: "+5 do percepcji wzrokowej; −10 celności bez przyrządów celowniczych; −5 Speechcraft, gdy chce wyglądać mądrze.",
    fx: [AROLL("per", 5, "Percepcja wzrokowa"), fx("accuracy", "ranged", -10, "Strzał bez celowania przyrządami (poza SATS)"), ROLL("speech", -5, "Próbuje wyglądać mądrze")] },
  wsd: { label: "Wartime Stress Disorder", type: "M", desc: "−5 do umiejętności INT, AGI i CHA poza walką; +5 do rangi jednej umiejętności bojowej lub Survival.",
    fx: [fx("skillsOf", "int,agi,cha", -5, "Poza walką")],
    choices: [one("skill", "Premia +5 do", skillOpts([...COMBAT, "survival"]))],
    resolve: ch => ch.skill ? [RANK(ch.skill, 5)] : [] },
  whiner: { label: "Whiner", type: "M", desc: "−15 do Speechcraft i rzutów CHA, +5 do Mercantile.",
    fx: [ROLL("speech", -15), AROLL("cha", -15), ROLL("mercantile", 5)] },
  young: { label: "Young", type: "P", desc: "−3 do umiejętności (poza Sneak), +1 CHA i Luck, −1 STR, +5 do uników, obrażenia na ranę −2, udźwig −50.",
    fx: [A("cha", 1), A("luck", 1), A("str", -1), RANK("all", -3), RANK("sneak", 3), fx("dodge", "all", 5), fx("wound", "all", -2), fx("carry", "all", -50)] }
};

// ---------- Cechy (Traits, s. 100–124) — kosztują punkty tworzenia ----------
// cost: [min, max]; opcje z polem cost ustalają koszt same (np. wybór zwierzęcia lub wariantu).
export const TRAITS = {
  aceFlyer: { label: "Ace Flyer", cost: [1, 1], desc: "+2 manewry poziomu 2 i +1 poziomu 3. Wymaga Flight; nie z Flight School Dropout." },
  additionalSpell: { label: "Additional Spell/Recipe", cost: [1, 1], desc: "Dodatkowe zaklęcie lub receptura poziomu 0–1. Wymaga Magic; nie dla alikornów." },
  agileTongue: { label: "Agile Tongue / Prehensile Tail", cost: [1, 1], desc: "Znosi rasową karę do Lockpicking; +5 do rangi Lockpicking i Science.",
    fx: [RANK("lockpick,science", 5)], removeLockpickPenalty: true },
  animalCompanion: { label: "Animal Companion", cost: [1, 3], desc: "Zwierzęcy towarzysz (statystyki u MG). Nie z Robot Companion.",
    choices: [one("pet", "Zwierzę", [
      { v: "dog", label: "Pies (1)", cost: 1 }, { v: "cyberdog", label: "Cyberpies (2)", cost: 2 }, { v: "molerat", label: "Kretoszczur (1)", cost: 1 },
      { v: "radroach", label: "1d4 radkaraluchy (1)", cost: 1 }, { v: "brahmin", label: "Brahmin (2)", cost: 2 }, { v: "timberwolf", label: "Drzewny wilk (2)", cost: 2 },
      { v: "phoenix", label: "Feniks balefire (3)", cost: 3 }, { v: "nightstalker", label: "Nightstalker (3)", cost: 3 }, { v: "yaoguai", label: "Yao Guai (3)", cost: 3 }])] },
  arcaneDevotion: { label: "Arcane Devotion", cost: [2, 2], desc: "+5 do rangi Magic, dodatkowe zaklęcia na start (atrybut/3). Wymaga tagu Magic i INT 8 lub Studious.",
    fx: [RANK("magic", 5)] },
  astronomer: { label: "Astronomer", cost: [1, 1], desc: "+10 do Magic przy wiedzy o gwiazdach i recepturach gwiezdnych (zebry).",
    fx: [ROLL("magic", 10, "Wiedza o gwiazdach / receptura gwiezdna")] },
  brave: { label: "Brave", cost: [1, 1], desc: "Rzuty strachu o krok MFD łatwiejsze; towarzysze +10." },
  cache: { label: "Cache Location", cost: [1, 3], desc: "Skrytka z ekwipunkiem: 1000 kapsli wartości za każdy punkt." },
  channeler: { label: "Channeler", cost: [1, 2], desc: "Więcej strain albo szybsza regeneracja (wymaga Magic).",
    choices: [one("variant", "Wariant", [
      { v: "cap4", label: "+4 strain (1)", cost: 1 }, { v: "regen45", label: "Regeneracja co 45 min (1)", cost: 1 },
      { v: "both", label: "+4 strain i co 45 min (2)", cost: 2 }, { v: "cap8", label: "+8 strain (2)", cost: 2 }, { v: "regen30", label: "Regeneracja co 30 min (2)", cost: 2 }])],
    resolve: ch => ({ cap4: [fx("strain", "all", 4)], both: [fx("strain", "all", 4)], cap8: [fx("strain", "all", 8)] })[ch.variant] ?? [] },
  clearConscience: { label: "Clear Conscience", cost: [1, 1], desc: "+25 do rzutów przeciw nabyciu wad psychicznych." },
  contortionist: { label: "Contortionist", cost: [1, 1], desc: "+15 do uników i chowania się za osłoną; wciska się w małe przestrzenie. Wymaga AGI 6.",
    fx: [fx("dodge", "all", 15)] },
  cyberpony: { label: "Cyberpony", cost: [1, 3], desc: "+10 DT od ognia, 10% odporności na promieniowanie, +10 przeciw truciznom; DT +6 w miejscu protezy (1 pkt) albo +3 wszędzie (3 pkt).",
    choices: [
      one("level", "Poziom", [{ v: "1", label: "1 pkt — proteza", cost: 1 }, { v: "3", label: "3 pkt — więcej maszyny niż ciała", cost: 3 }]),
      one("loc", "Miejsce protezy", locOpts(), { show: ch => ch.level === "1" })],
    resolve: ch => [fx("radResist", "all", 10), fx("fireDt", "all", 10), fx("limbWounds", "flLeg,frLeg,rlLeg,rrLeg,wings", 1),
      ...(ch.level === "3" ? [fx("dt", "all", 3)] : ch.loc ? [fx("dt", ch.loc, 6)] : [])] },
  shadowflash: { label: "Shadowflash", cost: [1, 1], onlyRaces: ["bat"], notWith: ["young"],
    desc: "Magia cieni kucyka nietoperzowego (s. 35): teleport jak Teleportation I (10×INT ft) tylko siebie i trzymanych przedmiotów; pula cieni AGI+PER+2, koszt 2, odnawia się 1/h; rzut Flight MFD ½ przy uniku (sukces = unik), ¾ poza tym. Nie działa na nią tłumienie magii." },
  dareingDo: { label: "D.A.R.E.-ing Do", cost: [1, 1], desc: "+20 do END lub INT przeciw uzależnieniu." },
  diseaseResistant: { label: "Disease Resistant", cost: [1, 1], desc: "+20 do END przeciw chorobom." },
  faith: { label: "Faith", cost: [1, 1], desc: "Raz na sesję własny zakres krytycznego sukcesu; pomaga drużynie unikać wad psychicznych." },
  foalAtHeart: { label: "Foal at Heart", cost: [1, 1], desc: "Opcje dialogowe z młodymi; tymczasowo +2 CHA wobec młodych NPC.",
    fx: [fx("tempAttr", "cha", 2, "Rozmowa z młodym NPC")] },
  formalEducation: { label: "Formal Education", cost: [1, 1], desc: "+10 do rzutów INT na wiedzę o świecie.",
    fx: [AROLL("int", 10, "Rzut na wiedzę o świecie")] },
  goodLuckCharm: { label: "Good Luck Charm", cost: [1, 1], desc: "Raz na sesję sojusznik przerzuca porażkę; sojusznicy mają kartę szczęścia więcej." },
  heavenlyVision: { label: "Heavenly Vision", cost: [1, 1], desc: "+10 do wszystkich rzutów CHA (z umiejętnościami); +1d10 obrażeń przy Pony Romance; zazdrośni rywale zadają +1d10.",
    fx: [BASED("cha", 10)] },
  implanted: { label: "Implanted", cost: [2, 4], desc: "Implanty wewnętrzne: 2 pkt za pierwszy, +1 za każdy kolejny (pozostałe opisz ręcznie).",
    choices: [
      one("implant", "Główny implant", [
        { v: "attr", label: "+1 do atrybutu" }, { v: "nemean", label: "Nemean Sub-Dermal Armor (+4 DT)" },
        { v: "basilisk", label: "Basilisk Impact Armor (+10 DT, −1 CHA, −10 umiejętności CHA)" }, { v: "other", label: "Inny (opis ręczny)" }]),
      one("attr", "Atrybut", attrOpts(["str", "per", "end", "cha", "int", "agi", "luck"]), { show: ch => ch.implant === "attr" })],
    resolve: ch => ({
      attr: ch.attr ? [A(ch.attr, 1)] : [],
      nemean: [fx("dt", "all", 4)],
      basilisk: [fx("dt", "all", 10), A("cha", -1), fx("skillsOf", "cha", -10)]
    })[ch.implant] ?? [] },
  concealedStorage: { label: "Internal/Concealed Storage", cost: [1, 1], desc: "Ukrywa mały przedmiot nawet nago. Za darmo ze Slave." },
  ironStomach: { label: "Iron Stomach", cost: [1, 1], desc: "Je zepsute jedzenie bez skutków; połowa skażenia z jedzenia; trucizny połknięte o krok łatwiejsze." },
  large: { label: "Large", cost: [1, 1], desc: "Rana co 12 obrażeń (+2), +20 udźwigu, −5 do uników i −5 do Sneak.",
    fx: [fx("wound", "all", 2), fx("carry", "all", 20), fx("dodge", "all", -5), ROLL("sneak", -5)] },
  lucky: { label: "Lucky", cost: [1, 3], desc: "Raz na sesję przerzut i wybór wyniku oraz +1 karta szczęścia — za każde wzięcie (maks. 3).",
    choices: [one("times", "Ile razy", [{ v: "1", label: "Raz (1)", cost: 1 }, { v: "2", label: "Dwa razy (2)", cost: 2 }, { v: "3", label: "Trzy razy (3)", cost: 3 }])],
    resolve: ch => [fx("luckCards", "all", Number(ch.times) || 1)] },
  magicalSavant: { label: "Magical Savant", cost: [2, 2], desc: "Łatwiej uczy się zaklęć (+10); koszt strain zaklęć −1 (min. 1). Wymaga INT 8 i Magic." },
  ministryDescendant: { label: "Ministry Descendant", cost: [0, 0], desc: "Potomek ministerialnej klaczy: dostęp do zamkniętych miejsc i plików. Tylko za zgodą MG." },
  ministryEmployee: { label: "Ministry Employee", cost: [0, 0], desc: "Były pracownik ministerstwa (alikorny, cyberkucyki, ghule). Tylko za zgodą MG." },
  named: { label: "Named Weapon/Armor", cost: [1, 1], desc: "Zaczyna z nazwaną bronią lub pancerzem." },
  omnivore: { label: "Omnivore", cost: [1, 1], desc: "Szersza dieta; +3 do rangi Survival.", fx: [RANK("survival", 3)] },
  openMinded: { label: "Open Minded", cost: [1, 1], desc: "Ignoruje rasowe kary do Speechcraft wobec innych ras." },
  organization: { label: "Organization", cost: [0, 3], desc: "Członek organizacji z korzyściami (koszt ustala MG, zwykle 0–3).",
    choices: [
      one("org", "Organizacja", [
        { v: "legion", label: "Caesar's Legion (zebry, minotaury)" }, { v: "proditor", label: "Proditor (zebry)" },
        { v: "crusaders", label: "Crusaders (Young lub Foal at Heart)" }, { v: "evc", label: "Enclave Volunteer Corps (pegazy)" },
        { v: "ganger", label: "Gang" }, { v: "mercenary", label: "Najemnik / łowca nagród" }, { v: "raider", label: "Raider (wymaga Sadist)" },
        { v: "reaper2", label: "Reaper — powiązany gang (2)", cost: 2 }, { v: "reaper3", label: "Reaper — samotny (3)", cost: 3 },
        { v: "settleMinor", label: "Mała osada" }, { v: "settleMajor", label: "Duża osada" }, { v: "slaver", label: "Łowca niewolników" },
        { v: "knight", label: "Steel Rangers — Rycerz" }, { v: "scribe", label: "Steel Rangers — Skryba" },
        { v: "ajKnight", label: "Applejack's Rangers — Rycerz" }, { v: "ajScribe", label: "Applejack's Rangers — Skryba" },
        { v: "tribal", label: "Plemię" }]),
      one("skill", "Umiejętność", skillOpts(["survival", "energy", "science", "medicine"]), { show: ch => ch.org === "evc", label: "+3 do (EVC)" }),
      one("skill", "+5 do umiejętności bojowej", skillOpts(COMBAT), { show: ch => ch.org === "reaper2" || ch.org === "reaper3" }),
      one("skill", "+7 do umiejętności", skillOpts(ALL_SKILLS), { show: ch => ch.org === "settleMinor" }),
      one("skill", "+5 do rzutów umiejętności INT lub CHA", skillOpts(["mercantile", "speech", "medicine", "repair", "science", "magic"]), { show: ch => ch.org === "settleMajor" }),
      one("skill", "+5 do", skillOpts(["melee", "unarmed", "smallGuns"]), { show: ch => ch.org === "tribal" }),
      many("skills", "Skryba: +3 do dwóch umiejętności badań", skillOpts(ALL_SKILLS), 2, { show: ch => ch.org === "scribe" || ch.org === "ajScribe" })],
    resolve: ch => {
      const sk = ch.skill;
      switch (ch.org) {
        case "legion": return [RANK("sneak,survival,magic", 5), fx("karma", "all", -10), ROLL("speech", -25, "Wobec ras innych niż zebry")];
        case "proditor": return [RANK("survival,magic", 5)];
        case "crusaders": return [RANK("survival,sneak,speech", 3), ROLL("mercantile", 5, "W dużej osadzie")];
        case "evc": return sk ? [RANK(sk, 3)] : [];
        case "reaper2": case "reaper3": return sk ? [RANK(sk, 5)] : [];
        case "settleMinor": return sk ? [RANK(sk, 7)] : [];
        case "settleMajor": return [fx("caps", "all", 100), ROLL("mercantile", 5, "Z kupcami z rodzinnej osady"), ...(sk ? [ROLL(sk, 5)] : [])];
        case "knight": return [RANK("bigGuns", 5)];
        case "ajKnight": return [RANK("bigGuns", 5), fx("karma", "all", 10)];
        case "scribe": return (ch.skills ?? []).map(k => RANK(k, 3));
        case "ajScribe": return [...(ch.skills ?? []).map(k => RANK(k, 3)), fx("karma", "all", 10)];
        case "tribal": return sk ? [RANK(sk, 5)] : [];
        default: return [];
      }
    } },
  poisonResistant: { label: "Poison Resistant", cost: [1, 1], desc: "+10 do END przeciw truciznom; 50% szans, że zabójcza trucizna nie zabije." },
  ponyRomance: { label: "Pony Romance", cost: [1, 1], desc: "+1d10 obrażeń wobec wybranej płci (dolicz ręcznie do formuły)." },
  powerArmor: { label: "Power Armor Training", cost: [1, 1], desc: "Umie w pełni korzystać z pancerza wspomaganego." },
  quickWitted: { label: "Quick Witted", cost: [1, 1], desc: "+10 do inicjatywy, +5 do INT/PER pod presją czasu; działa w rundzie zaskoczenia.",
    fx: [fx("initiative", "all", 10), AROLL("int,per", 5, "Pod presją czasu")] },
  reversal: { label: "Reversal of Fortune", cost: [1, 1], desc: "Raz na sesję zamienia cyfry dziesiątek i jedności w rzucie." },
  robotCompanion: { label: "Robot Companion", cost: [1, 3], desc: "Robot-towarzysz (statystyki u MG). Nie z Animal Companion.",
    choices: [one("robot", "Robot", [
      { v: "protectapony", label: "Protectapony (1)", cost: 1 }, { v: "spritebot", label: "Spritebot (1)", cost: 1 },
      { v: "handy", label: "Mister Handy (2)", cost: 2 }, { v: "gutsy", label: "Mister Gutsy (2)", cost: 2 },
      { v: "ponitron", label: "Ponitron (2)", cost: 2 }, { v: "sentry", label: "Sentry Bot (3)", cost: 3 }])] },
  senseMagic: { label: "Sense Magic", cost: [1, 1], desc: "Wyczuwa użycie magii w pobliżu; iluzje na niego o 2 kroki trudniejsze." },
  specialization: { label: "Specialization", cost: [1, 1], desc: "+15 do rzutów w obrębie specjalizacji (umiejętność musi być tagiem).",
    fx: ALL(15, "W obrębie specjalizacji") },
  stableDweller: { label: "Stable Dweller", cost: [1, 1], desc: "Wychował się w Stajni: PipBuck i strój Stajni." },
  sternerStuff: { label: "Sterner Stuff", cost: [1, 2], desc: "Fizycznie: +1 DT i +5 przeciw chorobom i truciznom. Psychicznie: +10 do odporności psychicznej.",
    choices: [one("variant", "Wariant", [{ v: "body", label: "Fizyczny (1)", cost: 1 }, { v: "mind", label: "Psychiczny (1)", cost: 1 }, { v: "both", label: "Oba (2)", cost: 2 }])],
    resolve: ch => ch.variant === "body" || ch.variant === "both" ? [fx("dt", "all", 1)] : [] },
  tastesFine: { label: "„Tastes Fine to Me!”", cost: [1, 1], desc: "+5 do rzutów Survival.", fx: [ROLL("survival", 5)] },
  touchedBySun: { label: "Touched by the Sun", cost: [1, 1], desc: "+1 do wszystkich atrybutów, −5 do wszystkich umiejętności, −1 punkt umiejętności na poziom.",
    fx: [A("all", 1), RANK("all", -5)] },
  medicineMare: { label: "Trained under a Medicine Mare", cost: [1, 1], desc: "Jedna receptura zebr poziomu 0; ignoruje rasowe kary do Speechcraft wobec zebr." },
  weirdo: { label: "Wasteland Weirdo", cost: [1, 4], desc: "Rzadka lub unikalna cecha, zdolność albo efekt z przeszłości (efekty dodaj ręcznie)." },
  zebraAugmented: { label: "Zebra Augmented", cost: [1, 1], desc: "+3 DT, +10 DT od ognia, +10 przeciw truciznom, 10% odporności na promieniowanie (zebry).",
    fx: [fx("dt", "all", 3), fx("fireDt", "all", 10), fx("radResist", "all", 10)] },
  ghoul: { label: "Ghoul", cost: [2, 3], desc: "Ghul: −5 do rzutów PER, −20 Speechcraft wobec nie-ghuli; leczy go promieniowanie.",
    fx: [AROLL("per", -5), ROLL("speech", -20, "Wobec nie-ghuli")] },
  canterlotGhoul: { label: "Canterlot Ghoul", cost: [4, 4], desc: "Jak Ghoul + odporność na Pink Cloud; 15 wolnych rang umiejętności (wpisz w kolumnie Inne).",
    fx: [AROLL("per", -5), ROLL("speech", -20, "Wobec nie-ghuli")] }
};

// ---------- Archetypy NPC (s. 604: „Rapid NPC Generation”) ----------
// attrs: rozkład 28 punktów; tags: 3 tagi; focus: umiejętności, w które idą punkty z poziomów (waga)
export const NPC_ARCHETYPES = {
  raider: { label: "Bandyta (Raider)", attrs: { str: 6, per: 5, end: 6, cha: 2, int: 3, agi: 6, luck: 7 },
    tags: ["melee", "smallGuns", "unarmed"], focus: { smallGuns: 3, melee: 3, unarmed: 2, sneak: 1, explosives: 1 } },
  mercenary: { label: "Najemnik", attrs: { str: 6, per: 6, end: 6, cha: 3, int: 4, agi: 6, luck: 4 },
    tags: ["smallGuns", "bigGuns", "survival"], focus: { smallGuns: 3, bigGuns: 2, survival: 1, melee: 1, explosives: 1 } },
  guard: { label: "Strażnik osady", attrs: { str: 6, per: 7, end: 6, cha: 4, int: 4, agi: 5, luck: 3 },
    tags: ["smallGuns", "melee", "speech"], focus: { smallGuns: 3, melee: 2, speech: 1, survival: 1 } },
  ranger: { label: "Stalowy Strażnik (Steel Ranger)", attrs: { str: 7, per: 6, end: 7, cha: 3, int: 5, agi: 4, luck: 3 },
    tags: ["bigGuns", "energy", "repair"], focus: { bigGuns: 3, energy: 3, repair: 1, science: 1 } },
  sniper: { label: "Zwiadowca / snajper", attrs: { str: 4, per: 8, end: 5, cha: 3, int: 4, agi: 8, luck: 3 },
    tags: ["smallGuns", "sneak", "survival"], focus: { smallGuns: 3, sneak: 2, survival: 2, lockpick: 1 } },
  trader: { label: "Kupiec / karawaniarz", attrs: { str: 4, per: 5, end: 5, cha: 8, int: 6, agi: 4, luck: 3 },
    tags: ["mercantile", "speech", "smallGuns"], focus: { mercantile: 3, speech: 3, smallGuns: 1, survival: 1 } },
  doctor: { label: "Medyk", attrs: { str: 3, per: 6, end: 5, cha: 6, int: 8, agi: 5, luck: 2 },
    tags: ["medicine", "science", "speech"], focus: { medicine: 4, science: 2, speech: 1 } },
  scientist: { label: "Naukowiec / technik", attrs: { str: 3, per: 6, end: 4, cha: 4, int: 9, agi: 5, luck: 4 },
    tags: ["science", "repair", "energy"], focus: { science: 3, repair: 3, energy: 1, lockpick: 1 } },
  mage: { label: "Mag (jednorożec)", attrs: { str: 3, per: 6, end: 4, cha: 5, int: 9, agi: 5, luck: 3 },
    tags: ["magic", "science", "medicine"], focus: { magic: 4, science: 1, medicine: 1, energy: 1 } },
  scavver: { label: "Zbieracz (scavenger)", attrs: { str: 5, per: 6, end: 6, cha: 3, int: 5, agi: 6, luck: 4 },
    tags: ["lockpick", "survival", "repair"], focus: { lockpick: 2, survival: 2, repair: 2, smallGuns: 1, sneak: 1 } },
  slaver: { label: "Handlarz niewolnikami", attrs: { str: 6, per: 5, end: 6, cha: 5, int: 4, agi: 5, luck: 4 },
    tags: ["smallGuns", "melee", "speech"], focus: { smallGuns: 2, melee: 2, speech: 2, unarmed: 1 } },
  civilian: { label: "Mieszkaniec / cywil", attrs: { str: 5, per: 5, end: 5, cha: 5, int: 5, agi: 5, luck: 5 },
    tags: ["survival", "repair", "mercantile"], focus: { survival: 1, repair: 1, mercantile: 1, speech: 1 } }
};
