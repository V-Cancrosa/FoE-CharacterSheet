/**
 * Dane do tworzenia postaci — Fallout: Equestria RPG v1.22, rozdział 2 („Making a Character”).
 * Strony w komentarzach odnoszą się do podręcznika.
 */

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
    traits: [{ key: "large", free: true }, { key: "channeler", free: true, cost: 1 }],
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
    traits: [{ key: "large", free: true }, { key: "channeler", free: true, cost: 1 }],
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
    traits: [{ key: "channeler", free: true, cost: 1 }],
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
    traits: [{ key: "sternerStuff", free: true, cost: 1 }],
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

// Darmowy perk kucyka ziemskiego (s. 24)
export const EARTH_PERKS = {
  strongBack: { label: "Strong Back", desc: "+50 udźwigu.", carry: 50 },
  highHo: { label: "High Ho Silver, Away!", desc: "+5 ft ruchu na akcję.", speed: 5 }
};

// ---------- Wady (Hindrances, s. 69–72) — każda daje 1 punkt tworzenia ----------
// eff: efekty liczone automatycznie przez kreator
export const HINDRANCES = {
  abandoned: { label: "Abandoned / All Alone", type: "P", desc: "Zaczyna sam, 200 kapsli zamiast 300, bez PipBucka; tańsze Animal Companion / Wasteland Weirdo.", eff: { caps: 200 } },
  abused: { label: "Abused", type: "M", desc: "Kary do Speechcraft i celności wobec oprawcy; problemy z zaufaniem." },
  addiction: { label: "Addiction", type: "P", desc: "Uzależnienie od substancji, jakby nie zdał rzutu na uzależnienie." },
  addictive: { label: "Addictive Personality", type: "M", desc: "Automatycznie oblewa rzuty INT przeciw uzależnieniu." },
  allergy: { label: "Allergy", type: "P", desc: "Alergia: −5 w pobliżu substancji, −25 przy kontakcie." },
  amnesiac: { label: "Amnesiac", type: "M", desc: "Zapomniał długi okres swojego życia." },
  badLuck: { label: "Bad Luck", type: "M", desc: "Zakres krytycznej porażki +5; jedna karta szczęścia mniej na sesję." },
  badLuckCharm: { label: "Bad Luck Charm", type: "M", desc: "Raz na sesję zmusza sojusznika do przerzutu udanego rzutu." },
  bigEars: { label: "Big Ears", type: "P", desc: "+10 i łatwiejszy MFD na percepcję słuchową; END ½ albo ogłuszenie przy hałasie." },
  blind: { label: "Blind", type: "P", desc: "−3 kroki MFD celności dystansowej, −1 w zwarciu; pomoc przy zadaniach wzrokowych." },
  cannibal: { label: "Cannibal", type: "M/P", desc: "Musi jeść mięso codziennie albo zdać INT ¾ (−10)." },
  cautious: { label: "Cautious", type: "M", desc: "−15 do inicjatywy, +3 do Explosives.", eff: { skills: { explosives: 3 } } },
  clumsy: { label: "Clumsy", type: "P", desc: "−5 i +5 zakresu krytycznej porażki przy precyzyjnych czynnościach." },
  codeOfHonor: { label: "Code of Honor", type: "M", desc: "Musi postępować honorowo." },
  colorBlind: { label: "Color Blind", type: "P", desc: "Nie rozróżnia dwóch kolorów." },
  cowardly: { label: "Cowardly", type: "M", desc: "Rzuty strachu i grozy o krok MFD trudniejsze." },
  crippled: { label: "Crippled", type: "P", desc: "Trwale okaleczona kończyna, wolniejszy ruch." },
  curious: { label: "Curious", type: "M", desc: "Nie oprze się wciśnięciu wielkiego czerwonego guzika." },
  deaf: { label: "Deaf", type: "P", desc: "−15 do Mercantile, Speechcraft i Sneak; brak percepcji słuchowej." },
  demented: { label: "Demented", type: "M", desc: "−2 INT, +1 Luck na stałe; +5 do Explosives albo Melee (wybierz w kroku umiejętności).", eff: { attrs: { int: -2, luck: 1 } } },
  elderly: { label: "Elderly", type: "P", desc: "−1 AGI i STR, +1 INT lub CHA, −1 inny (nie Luck); +3 do wszystkich umiejętności i czwarty tag.", eff: { attrs: { agi: -1, str: -1 }, allSkills: 3, tags: 1 } },
  enemy: { label: "Enemy", type: "P", desc: "Coś groźnego ściga postać przez pustkowia." },
  faithless: { label: "Faithless", type: "M", desc: "−5 Speechcraft wobec tych, którzy wciąż mają nadzieję." },
  family: { label: "Family", type: "P", desc: "Korzyści lub kłopoty fabularne przy spotkaniu rodziny." },
  fixation: { label: "Fixation", type: "M", desc: "Obsesja na punkcie przedmiotu, osoby lub celu." },
  flightless: { label: "Flightless", type: "P", desc: "Ma umiejętność Flight, ale nie może latać." },
  flightSchoolDropout: { label: "Flight School Dropout", type: "M", desc: "Uczy się o połowę mniej manewrów powietrznych na każdym poziomie." },
  fourEyes: { label: "Four-Eyes", type: "P", desc: "−1 PER; +2 PER w okularach korekcyjnych.", eff: { attrs: { per: -1 } } },
  goodNatured: { label: "Good Natured", type: "M", desc: "−10 do umiejętności ofensywnych, +5 do Speechcraft, Repair, Science, Medicine, Mercantile.",
    eff: { skills: { melee: -10, unarmed: -10, smallGuns: -10, bigGuns: -10, energy: -10, explosives: -10, speech: 5, repair: 5, science: 5, medicine: 5, mercantile: 5 } } },
  guiltyConscience: { label: "Guilty Conscience", type: "M", desc: "−10 do wszystkich rzutów, gdy pojawia się temat winy." },
  gunShy: { label: "Gun-Shy", type: "M", desc: "Nie używa broni palnej albo −4 kroki MFD celności." },
  halfDecked: { label: "„Half-Decked”", type: "M", desc: "INT ½ co sesję lub w stresie, by się nie „wyłączyć”." },
  halfHeart: { label: "Half-Heart", type: "M", desc: "+3 do celności, +25 do rzutów strachu, −10 Speechcraft; łatwiej o skłonności samobójcze." },
  hallucinations: { label: "Hallucinations", type: "M", desc: "Co sesję INT i PER ¾ — charakter halucynacji." },
  hardOfHearing: { label: "Hard of Hearing", type: "P", desc: "−10 Speechcraft/Mercantile przy cichej rozmowie, −50 Sneak gdy mówi, −25 percepcji słuchowej." },
  hotBlooded: { label: "Hot Blooded", type: "P/M", desc: "+5 obrażeń; −2 AGI i PER przy okaleczonej głowie lub tułowiu." },
  illiterate: { label: "Illiterate", type: "M", desc: "Nie umie czytać; wyklucza wiele cech związanych z wykształceniem." },
  impatient: { label: "Impatient", type: "M", desc: "Nienawidzi czekać, zwykle na własną szkodę." },
  impreciseMagic: { label: "Imprecise Magic", type: "M", desc: "Celowanie zaklęciami o krok trudniejsze, −10 do Repair/Science/Lockpicking/Medicine telekinezą; Telekinetic Force za darmo." },
  jinxed: { label: "Jinxed", type: "P/M", desc: "Raz na sesję może zostać zmuszony do przerzutu sukcesu; jedna karta szczęścia mniej." },
  literalMinded: { label: "Literal Minded", type: "M", desc: "−10 Speechcraft; wszystko rozumie dosłownie." },
  maimed: { label: "Maimed", type: "P", desc: "Brakuje mu części ciała; −5 Speechcraft (poza zastraszaniem)." },
  masochist: { label: "Masochist", type: "P/M", desc: "Mniejsze kary za okaleczenia; leczenie o 1 ranę słabsze, odpoczynek trwa 2× dłużej." },
  mpd: { label: "Multiple Personality Disorder", type: "M", desc: "Osobowość mnoga — patrz pełny opis w podręczniku." },
  mutation: { label: "Mutation", type: "P", desc: "Półkorzystna mutacja; −5 do rzutów CHA, gdy widoczna." },
  mute: { label: "Mute", type: "P", desc: "Nie mówi (u kucyków nietoperzowych: mowa poza zakresem słuchu innych ras)." },
  naive: { label: "Naïve", type: "M", desc: "Nie spodziewa się, że świat jest tak zły." },
  narcoleptic: { label: "Narcoleptic", type: "M", desc: "Określone bodźce natychmiast usypiają postać." },
  nastyHabit: { label: "Nasty Habit", type: "M/P", desc: "Możliwe −10 do Sneak; −5 do rzutów CHA." },
  obese: { label: "Obese", type: "P", desc: "+1 END, −1 AGI, −5 do uników; je 1,5× więcej.", eff: { attrs: { end: 1, agi: -1 } } },
  obligation: { label: "Obligation", type: "P", desc: "Regularne zobowiązanie wobec kogoś lub organizacji." },
  oblivious: { label: "Oblivious", type: "M", desc: "−15 do wszystkich rzutów PER." },
  ocd: { label: "OCD", type: "M", desc: "Objawy zaburzenia obsesyjno-kompulsywnego." },
  oneTrickPony: { label: "One Trick Pony", type: "M", desc: "Jednorożec: mocno ograniczone zaklęcia, ale 4 warstwy overglow. Zebra: wariant z premiami." },
  oops: { label: "Oops!", type: "P", desc: "−5 ft zasięgu rzutu, ale rzut kosztuje 5 SATS mniej." },
  optimistic: { label: "Optimistic", type: "M", desc: "−5 Speechcraft wobec osób spoza bezpiecznych osad." },
  overactive: { label: "Overactive Imagination", type: "M", desc: "Niepotrzebnie snuje czarne scenariusze." },
  pacifist: { label: "Pacifist", type: "M", desc: "Nigdy nie strzela pierwszy; woli rozwiązania pokojowe." },
  phobia: { label: "Phobia", type: "M", desc: "−10 do testów umiejętności przy obiekcie lęku, −20 do rzutów strachu." },
  picky: { label: "Picky", type: "M", desc: "Nie zbiera ciężkich, mało wartych rzeczy; wyklucza dietę wszystkożerną." },
  pipsqueak: { label: "Pipsqueak", type: "P", desc: "+5 do uników; obrażenia na ranę −2 (sumuje się z Young).", eff: { wound: -2 } },
  ponikaze: { label: "Ponikaze", type: "M/P", desc: "+10 SATS, +5 ft ruchu; −10% do uników, efektywne DT −5." },
  prejudiced: { label: "Prejudiced", type: "M", desc: "−30 Speechcraft i Mercantile wobec określonej grupy." },
  prideful: { label: "Prideful", type: "M", desc: "Nie znosi bycia traktowanym gorzej i przyznawania się do błędów." },
  psychosis: { label: "Psychosis", type: "M", desc: "Postać jest szalona." },
  sadist: { label: "Sadist", type: "M", desc: "Lubi zadawać ból." },
  scarred: { label: "Scarred", type: "P", desc: "−10 do rzutów CHA (poza zastraszaniem), +5 do zastraszania Speechcraft." },
  scavenger: { label: "Scavenger", type: "M", desc: "Musi zbierać wszystko, co ma choć trochę wartości." },
  shadowOfTheMoon: { label: "Shadow of the Moon", type: "M", desc: "+5% szansy na krytyk; zaklęcia ofensywne +2 strain, broń zużywa się 2× szybciej." },
  sickly: { label: "Sickly", type: "P", desc: "Okresowo −2 END i inny atrybut (END ½ co sesję zapobiega); −10 przeciw truciznom i chorobom." },
  skinny: { label: "Skinny as a Rail", type: "P", desc: "−1 STR i END, +3 do uników.", eff: { attrs: { str: -1, end: -1 } } },
  slave: { label: "Slave", type: "M", desc: "Uwarunkowany do wykonywania pewnych poleceń bez namysłu." },
  securityMare: { label: "Spirit of the Security Mare", type: "M", desc: "Premie, gdy ma dokładnie 21 kart szczęścia; inaczej kary." },
  sprayAndPray: { label: "Spray and Pray", type: "P", desc: "−10 celności bronią jednostrzałową; serie 2× więcej pocisków i +1 kość; −5 SATS." },
  stubby: { label: "Stubby Little Horn / Wings", type: "P", desc: "Jednorożec: tylko telekineza, Magic +0 zamiast +10. Pegaz: lata tylko nisko.", eff: { racial: { magic: -10 } } },
  studious: { label: "Studious", type: "M", desc: "−5 do Small Guns, Big Guns i trzech innych (lub −3 do pięciu); uczy się każdego zaklęcia, +1 pkt z książek." },
  stuttering: { label: "Stuttering", type: "P/M", desc: "−5 rang i −5 do rzutów Mercantile i Speechcraft.", eff: { skills: { mercantile: -5, speech: -5 } } },
  suicidal: { label: "Suicidal", type: "M", desc: "Postać ma skłonności samobójcze." },
  thorough: { label: "Thorough", type: "M", desc: "+3 do rzutów bez pośpiechu, −5 w pośpiechu (np. w walce)." },
  triggerDiscipline: { label: "Trigger Discipline", type: "P/M", desc: "+5 celności bronią palną/energetyczną; serie −20% pocisków i −1 kość; +5 SATS na strzał." },
  trusting: { label: "Trusting", type: "M", desc: "−10 do rzutów Mercantile." },
  uncontrolledMagic: { label: "Uncontrolled Magic", type: "M", desc: "Więcej skutków ubocznych magii; −10 do rzucania, warzenia i celowania zaklęciami." },
  unforgivable: { label: "Unforgivable", type: "P", desc: "−50 karmy (−5 Speechcraft wobec dobrej i neutralnej karmy). Można wziąć dwa razy.", eff: { karma: -50 } },
  unstableGenetics: { label: "Unstable Genetics", type: "P", desc: "−30% do END przeciw Taint, dodatkowe −5 przy chorobie popromiennej; łatwiej o mutacje." },
  virtue: { label: "Virtue", type: "M", desc: "Zna swoją cnotę (Kindness, Loyalty, Honesty, Generosity, Laughter…) i żyje według niej." },
  wallEyed: { label: "Wall-eyed", type: "P", desc: "+5 PER wzrokowe, −10 celności bez przyrządów celowniczych; −5 Speechcraft, gdy chce wyglądać mądrze." },
  wsd: { label: "Wartime Stress Disorder", type: "M", desc: "−5 do umiejętności INT/AGI/CHA poza walką; +5 do jednej umiejętności bojowej lub Survival (wybierz w kroku umiejętności)." },
  whiner: { label: "Whiner", type: "M", desc: "−15 do Speechcraft, +5 do Mercantile." },
  young: { label: "Young", type: "P", desc: "−3 do umiejętności (poza Sneak), +1 CHA i Luck, −1 STR, +5 do uników, obrażenia na ranę −2, udźwig −50.",
    eff: { attrs: { cha: 1, luck: 1, str: -1 }, allSkills: -3, skills: { sneak: 3 }, wound: -2, carry: -50 } }
};

// ---------- Cechy (Traits, s. 100–101) — kosztują punkty tworzenia ----------
// cost: [min, max] — przy zakresie gracz wybiera koszt (wariant cechy)
export const TRAITS = {
  aceFlyer: { label: "Ace Flyer", cost: [1, 1], desc: "Więcej manewrów powietrznych. Wymaga Flight; nie z Flight School Dropout." },
  additionalSpell: { label: "Additional Spell/Recipe", cost: [1, 1], desc: "Dodatkowe zaklęcie lub receptura poziomu 0–1. Wymaga Magic; nie dla alikornów." },
  agileTongue: { label: "Agile Tongue / Prehensile Tail", cost: [1, 1], desc: "Znosi karę do Lockpicking ras z kopytami; +5 do Lockpicking i Science.", eff: { skills: { lockpick: 5, science: 5 }, removeLockpickPenalty: true } },
  animalCompanion: { label: "Animal Companion", cost: [1, 3], desc: "Zwierzęcy towarzysz. Nie z Robot Companion." },
  arcaneDevotion: { label: "Arcane Devotion", cost: [2, 2], desc: "+5 do Magic, kilka dodatkowych zaklęć na start.", eff: { skills: { magic: 5 } } },
  astronomer: { label: "Astronomer", cost: [1, 1], desc: "+10 do magii zebr w pewnych warunkach (zebry)." },
  brave: { label: "Brave", cost: [1, 1], desc: "Rzuty strachu i grozy o krok MFD łatwiejsze; towarzysze +10." },
  cache: { label: "Cache Location", cost: [1, 3], desc: "Zna położenie skrytki z zapasami." },
  channeler: { label: "Channeler", cost: [1, 2], desc: "+4 do pojemności strain lub 25% szybsza regeneracja (albo oba). Można wziąć dwa razy." },
  clearConscience: { label: "Clear Conscience", cost: [1, 1], desc: "+25 do rzutów INT/woli przeciw nabyciu wad psychicznych." },
  contortionist: { label: "Contortionist", cost: [1, 1], desc: "+15 do uników; wciska się w bardzo małe przestrzenie." },
  cyberpony: { label: "Cyberpony", cost: [1, 3], desc: "+3 DT, +10 DT od ognia, +10 END przeciw truciznom, +10% odporności na promieniowanie; wolniej się starzeje." },
  dareingDo: { label: "D.A.R.E.-ing Do", cost: [1, 1], desc: "+20 do END lub INT przeciw uzależnieniu." },
  diseaseResistant: { label: "Disease Resistant", cost: [1, 1], desc: "+20 do END przeciw chorobom." },
  faith: { label: "Faith", cost: [1, 1], desc: "Ułatwia sojusznikom przezwyciężanie wad psychicznych; raz na sesję zmienia zakres krytyków." },
  foalAtHeart: { label: "Foal at Heart", cost: [1, 1], desc: "Wyjątkowe opcje dialogowe z młodymi NPC; +2 CHA wobec młodych." },
  formalEducation: { label: "Formal Education", cost: [1, 1], desc: "+10 do rzutów wiedzy; zna lepiej historię świata." },
  goodLuckCharm: { label: "Good Luck Charm", cost: [1, 1], desc: "Raz na sesję sojusznik może przerzucić rzut." },
  heavenlyVision: { label: "Heavenly Vision", cost: [1, 1], desc: "+5 do rzutów CHA i +1d10 obrażeń wobec zauroczonych; rywale zadają +1d10." },
  implanted: { label: "Implanted", cost: [2, 4], desc: "Poważne implanty wewnętrzne z premiami lub efektami specjalnymi." },
  concealedStorage: { label: "Internal/Concealed Storage", cost: [1, 1], desc: "Ukrywa mały przedmiot nawet nago. Za darmo ze Slave." },
  ironStomach: { label: "Iron Stomach", cost: [1, 1], desc: "Je zepsute jedzenie bez skutków; MFD przeciw połkniętym truciznom o krok łatwiejszy." },
  large: { label: "Large", cost: [1, 1], desc: "Rana co 12 obrażeń (+2), −5% do uników, +20 udźwigu.", eff: { wound: 2, carry: 20 } },
  lucky: { label: "Lucky", cost: [1, 1], desc: "Raz na sesję przerzut i wybór lepszego wyniku (za każde wzięcie)." },
  magicalSavant: { label: "Magical Savant", cost: [2, 2], desc: "Łatwiej uczy się zaklęć; koszt rzucania i podtrzymania −1 (min. 1)." },
  ministryDescendant: { label: "Ministry Descendant", cost: [0, 1], desc: "Dostęp do zaszyfrowanych plików i miejsc ministerstw." },
  ministryEmployee: { label: "Ministry Employee", cost: [0, 1], desc: "Dostęp do zaszyfrowanych plików i miejsc ministerstw." },
  named: { label: "Named Weapon/Armor", cost: [1, 1], desc: "Zaczyna z nazwaną bronią lub pancerzem." },
  omnivore: { label: "Omnivore", cost: [1, 1], desc: "Może żywić się szerszą gamą pokarmów." },
  openMinded: { label: "Open Minded", cost: [1, 1], desc: "Ignoruje rasowe kary do Speechcraft; może przekonać, że jest przyjacielem." },
  organization: { label: "Organization", cost: [1, 3], desc: "Członek organizacji lub osady (np. Stalowi Strażnicy, Talon, EVC) z korzyściami." },
  poisonResistant: { label: "Poison Resistant", cost: [1, 1], desc: "+10 do END przeciw truciznom; 50% szans, że zabójcza trucizna nie zabije." },
  ponyRomance: { label: "Pony Romance", cost: [1, 1], desc: "+1d10 obrażeń wobec płci, która postać interesuje." },
  powerArmor: { label: "Power Armor Training", cost: [1, 1], desc: "Umie w pełni korzystać z pancerza wspomaganego." },
  quickWitted: { label: "Quick Witted", cost: [1, 1], desc: "+10 do inicjatywy, +5 do INT/PER pod presją czasu; działa w rundzie zaskoczenia." },
  reversal: { label: "Reversal of Fortune", cost: [1, 1], desc: "Raz na sesję zamienia cyfry dziesiątek i jedności w rzucie." },
  robotCompanion: { label: "Robot Companion", cost: [1, 3], desc: "Robot-towarzysz. Nie z Animal Companion." },
  senseMagic: { label: "Sense Magic", cost: [1, 1], desc: "Wyczuwa użycie magii w pobliżu." },
  specialization: { label: "Specialization", cost: [1, 1], desc: "+15 do rzutów związanych ze specjalizacją." },
  stableDweller: { label: "Stable Dweller", cost: [1, 1], desc: "Wychował się w Stajni i ma z tego korzyści." },
  sternerStuff: { label: "Sterner Stuff", cost: [1, 2], desc: "+1 DT i +5 przeciw chorobom i truciznom ALBO +10 do odporności psychicznej." },
  tastesFine: { label: "„Tastes Fine to Me!”", cost: [1, 1], desc: "+5 do rzutów Survival." },
  touchedBySun: { label: "Touched by the Sun", cost: [1, 1], desc: "+1 do wszystkich atrybutów, −5 do wszystkich umiejętności, −1 punkt umiejętności na poziom.",
    eff: { attrs: { str: 1, per: 1, end: 1, cha: 1, int: 1, agi: 1, luck: 1 }, allSkills: -5 } },
  medicineMare: { label: "Trained under a Medicine Mare", cost: [1, 1], desc: "Jedna receptura zebr poziomu 0; ignoruje rasowe kary do Speechcraft wobec zebr." },
  weirdo: { label: "Wasteland Weirdo", cost: [1, 4], desc: "Rzadka lub unikalna cecha, zdolność albo efekt z przeszłości." },
  zebraAugmented: { label: "Zebra Augmented", cost: [1, 1], desc: "+3 DT, +10 DT od ognia, +10 odporności na trucizny, 10% na promieniowanie; wolniej się starzeje." },
  ghoul: { label: "Ghoul", cost: [2, 3], desc: "Ghul: leczy go promieniowanie, nie potrzebuje jedzenia." },
  canterlotGhoul: { label: "Canterlot Ghoul", cost: [4, 4], desc: "Ghul z Canterlotu: jak Ghoul + odporność na Pink Cloud." }
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
