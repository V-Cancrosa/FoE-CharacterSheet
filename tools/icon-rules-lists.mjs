/**
 * Reguły ikon dla list spoza katalogu przedmiotów (zaklęcia, przepisy zebr, manewry, perki, bestiariusz,
 * cybernetyka, pojazdy). Używa ich tools/build-item-icons.mjs. [wyrażenie na nazwie, rysunki od najlepszego].
 */
const R = (re, ...icons) => [re, icons];

const SPELLS = [
  R(/telekinetic bullet/, "bullet-impacts", "supersonic-bullet", "silver-bullet"),
  R(/telekinetic (wave|blast|force|launch)/, "psychic-waves", "psychic-waves", "magic-palm"),
  R(/telekinesis|telekinetic|precision/, "magic-palm", "glowing-hands", "magic-palm"),
  R(/telepath|mind (read|meld|trick|alter)|dominate|read|memory|extract/, "brain", "psychic-waves", "brainstorm", "hive-mind", "overmind"),
  R(/teleport/, "teleport", "magic-portal", "portal"),
  R(/cutie mark|disguise|alter (features|form)|restore shape|style hair|clothes/, "carnival-mask", "domino-mask", "drama-masks", "magic-hat", "comb"),
  R(/arrow/, "energy-arrow", "arrow-cluster", "arrow-flights", "striking-arrows"),
  R(/beam|railgun|gauss|disruptor|lance/, "laser-blast", "laser-precision", "ray-gun", "focused-lightning"),
  R(/ward|shield|bubble|block|containment|suppression/, "magic-shield", "energy-shield", "shield-reflect", "bolt-shield", "fire-shield", "eye-shield", "rosa-shield", "lightning-dome"),
  R(/heal|mend|regenerat|regrow|restore|replenish|good as new|reconstruction|tissue|transplant|repair|healing/, "healing", "health-increase", "heart-plus", "health-potion", "auto-repair", "spanner", "bone-gnawer"),
  R(/cleanse|dispel|purif|anesthetic|painkiller|poison/, "chalice-drops", "holy-water", "medicine-pills", "poison-bottle"),
  R(/fire|flame|pyre|inferno|hooves of fire|sunbeam|solar|daylight|sun\b|flare|spark/, "fire-spell-cast", "flame", "fire-ray", "fire-ring", "sun", "sunbeams", "sun-radiations", "fire-wave", "flamethrower"),
  R(/ice|freeze|chill|blizzard|snow|popsicle|cold/, "ice-spell-cast", "snowflake-1", "snowflake-2", "frozen-orb", "ice-bolt", "snowing", "frostfire"),
  R(/electr|zap|lightning|thunder/, "bolt-spell-cast", "lightning-arc", "lightning-helix", "lightning-storm", "chain-lightning"),
  R(/tornado|hurricane|windstorm|gale|wind|tradewinds/, "tornado", "whirlwind", "wind-slap", "windy-stripes"),
  R(/cloud|fog|drip|deluge|tsunami|faucet|water|rain/, "fluffy-cloud", "heavy-rain", "water-drop", "big-wave", "waves", "water-splash", "raining"),
  R(/sound|silence|muffle|voice|scream|ear|echo|music|audio|ambience|wall of sound/, "sound-waves", "sound-on", "sound-off", "music-spell", "musical-notes", "acoustic-megaphone"),
  R(/sleep|tired|slumber|dream|nightmare/, "night-sleep", "sleepy", "dream-catcher", "evil-moon", "moon"),
  R(/illusion|phantom|ghost|image|picture|light show|invisib|double|duplicate|clone|surrogate|optical/, "ghost", "floating-ghost", "magick-trick", "mirror-mirror", "double-face-mask", "invisible"),
  R(/blood|hemorrhage|agony|bleed|heartstopper|knock out|nerve|tickling|panic|stunner/, "bleeding-heart", "heart-drop", "drop", "brain-leak", "broken-heart", "knocked-out-stars"),
  R(/door|lock|bypass|pass through|meld/, "magic-gate", "door", "padlock", "lockpicks", "wooden-door"),
  R(/detect|scry|x-ray|lie detector|target lock|life|movement/, "all-seeing-eye", "crystal-ball", "eye-target", "radar-sweep", "magnifying-glass"),
  R(/battery|power|mana|transfer|channeling|assist|talisman/, "battery-pack", "power-lightning", "glowing-artifact", "crystal-growth"),
  R(/crow|raven|bloatsprite|swarm/, "raven", "crow-dive", "missile-swarm", "bee"),
  R(/blade|sword|weapon/, "sword-spin", "swords-emblem", "flying-dagger", "rune-sword"),
  R(/time|age|speed|breakneck|speed lines/, "hourglass", "stopwatch", "sprint", "backward-time"),
  R(/gravity|trajectory|return to sender|back at ya|behind you/, "falling", "boomerang", "return-arrow", "shield-reflect"),
  R(/love|kiss|power of love|tears/, "heart-wings", "lovers", "tear-tracks", "chained-heart"),
  R(/matter|transmogrify|create|animate|come to life|conjure|tool|polish|auto sort|set|field strip|growing|banish|exile/, "magic-swirl", "magic-broom", "crystal-wand", "fairy-wand", "sparkles", "orb-wand"),
  R(/light/, "light-bulb", "lantern-flame", "sunbeams"),
  R(/featherweight|wings|walker|trotter|feather/, "feather", "fairy-wings", "angel-wings", "walk"),
  R(/melon|folly|want-it|fusion/, "watermelon", "mushroom-cloud", "magic-swirl")
];

const RECIPES = [
  R(/talisman|amulet|fetish|voidstone/, "gem-pendant", "rune-stone", "tribal-pendant", "primitive-necklace", "feather-necklace", "emerald-necklace", "heart-necklace"),
  R(/poison|venenum|venenifera|vipera|paliurus/, "poison-bottle", "snake-jar", "death-juice", "poison-gas", "vile-fluid"),
  R(/smoke|cloud|breathe|choking/, "smoke-bomb", "poison-cloud", "dust-cloud", "bottle-vapors"),
  R(/fire|flame|firebomb|balefire|mouthfire|draconis/, "fire-bottle", "fire-bomb", "flaming-claw", "dragon-breath", "fire-breath", "campfire"),
  R(/health|cure|bone|panacea|antidote|mending|medeor|diagnose|purge|regrowth/, "health-potion", "round-potion", "standing-potion", "chalice-drops", "medicine-pills", "bone-gnawer"),
  R(/potion|brew|tonic|ichor|stew|potency/, "magic-potion", "potion-ball", "spiral-bottle", "cauldron", "bubbling-flask", "round-bottom-flask"),
  R(/meditation|mind|spirit|astral|projection|sympathy|virtue|movements|stargaze|nemorosus|nature/, "meditation", "lotus", "aura", "spark-spirit", "night-sky", "lotus-flower"),
  R(/fate|future|joke|stripes/, "tarot-10-wheel-of-fortune", "crystal-ball", "drama-masks", "zebra-shield"),
  R(/water|stride|fall|balance|march|hooves|scale|skin/, "water-drop", "footprint", "scales", "feather", "hoof"),
  R(/stones|perimeter|locking|locator|proximity|dowsing|targeting/, "stone-pile", "padlock", "water-diviner-stick", "compass", "crosshair"),
  R(/light|eyed|eyes|oculus/, "lantern-flame", "beast-eye", "burning-eye", "all-seeing-eye"),
  R(/silence|batspeech|bloodwing|levitation|invisibility|immunity|multi|absorption|amplification/, "bat-wing", "invisible", "magic-palm", "sound-off"),
  R(/clone|appearance|metamorphosis|pox|enhancement|attribute/, "double-face-mask", "dna2", "virus", "muscle-up")
];

const MANEUVERS = [
  R(/cloudbuck/, "fluffy-cloud", "cloud-ring"),
  R(/cloud|fog|parade rain|rain|toraindo/, "fluffy-cloud", "heavy-rain", "sun-cloud", "raining"),
  R(/contrail/, "comet-spark", "fire-dash", "lightning-trio"),
  R(/rainboom|radboom|sonic/, "sonic-boom", "rainbow-star", "psychic-waves"),
  R(/dive|bomb|barnstorming|falcon/, "crow-dive", "falling", "falcon-moon", "eagle-emblem"),
  R(/roll|spin|zig-zag|juke|upside|vortex|aileron/, "spinning-ribbons", "whirlwind", "spiral-arrow", "rolling-energy"),
  R(/dash|charge|sprint|speed|blitz|strut|ace/, "sprint", "fire-dash", "wingfoot", "speedometer", "lightning-trio"),
  R(/punch|stomp|toss|push|seismic|recoil/, "punch", "stomp", "fist", "boot-kick", "push"),
  R(/wind|breeze|downdraft|second wind|dust|rainblow/, "wind-slap", "whirlwind", "windy-stripes", "dust-cloud", "hair-strands"),
  R(/hover|climb|feather|shine|fantastic|fortress|target|computing|sculpture|blaze/, "feathered-wing", "angel-wings", "mountain-climbing", "sparkles", "crosshair", "castle", "fire-wave")
];

const PERKS = [
  R(/\b(gun|shot|trigger|reload|draw|sniper|ricochet|spray|loader|commando|concentrated|center of mass|rounds|plasma|laser)/, "pistol-gun", "crosshair", "bullets", "on-target", "ricochet", "machine-gun", "laser-gun", "plasma-bolt"),
  R(/\b(explosion|demolitions|pyromaniac|bloody mess|splash|meltdown|toss)/, "explosion-rays", "fire-bomb", "fire", "blood"),
  R(/\b(hoof|kick|slam|slash|unstoppable|hard rock|steel|gladiator|punisher|vigilante|monster hunter|fight|super slam)/, "hoof", "boot-kick", "punch", "fist", "crossed-swords", "sword-clash", "mailed-fist"),
  R(/\b(rad|ghoul|glow)/, "radioactive", "radiations", "biohazard"),
  R(/\b(chem|metabolism|lead belly|cannibal|gourmet|life giver|tough hide|stubborn|tolerance|purifier)/, "erlenmeyer", "test-tubes", "meat", "heart-plus", "muscle-up", "stomach"),
  R(/\b(spell|cast|magic|mana|karmic|synergy|anomaly|penetration|blood magic)/, "spell-book", "magic-swirl", "fairy-wand", "orb-wand", "crystal-wand"),
  R(/\b(luna|night|moon|celestia|sun|daylight|ray of sunshine)/, "moon", "sun", "sunrise", "evil-moon"),
  R(/\b(book|egghead|nerd|scribe|computer|whiz|math|robotics|technician|jury|scrounger|organizer|recycl|junk|mechanic|armorer|ferrier)/, "open-book", "brain", "laptop", "gears", "spanner", "toolbox", "anvil"),
  R(/\b(sneak|silent|stealth|ninja|infiltrator|scoundrel|sleight|cat like|deep sleep|tunnel)/, "ninja-mask", "hood", "cat", "night-sleep", "domino-mask"),
  R(/\b(trot|gallop|canter|dash|run|flyer|wonderbolt|acrophobia|haul|pathfinder|survivalist|hunter)/, "sprint", "horseshoe", "footprint", "feathered-wing", "compass", "bow-arrow"),
  R(/\b(friend|romance|love|heart|foal|filly|courtier|mediation|dealer|presence|stare|charm|party|success|mare do well|sacrifice|cowpony)/, "heart-wings", "shaking-hands", "lovers", "card-ace-hearts", "party-popper", "western-hat"),
  R(/\b(strong|back|heavy|large|size|grunt|stonewall|burden|stubbornium|almost perfect|awesome|weakness|forged)/, "muscle-up", "weight-lifting-up", "anvil-impact", "stone-wall", "trophy"),
  R(/\b(cyber|implant|clockwork|adamantium|augment)/, "cyborg-face", "mechanical-arm", "processor", "gears"),
  R(/\b(zebra|tribal|imperialist|lawbringer|eye for an eye|eternity|talon|loophole|reaper|death|gambler|fortune)/, "zebra-shield", "tribal-mask", "skull-crossed-bones", "beast-eye", "clover", "dice-six-faces-six")
];

const BESTIARY = [
  R(/\bants?\b/, "ant", "ants"),
  R(/radscorpion|scorposprite/, "scorpion", "scorpion-tail"),
  R(/tree|pine|bark|weeper|applebug|fruit|zapapple|moss|spore|joke/, "evil-tree", "carnivorous-plant", "tree-face", "fruit-tree", "dead-wood"),
  R(/timberwolf|dog|nightstalker|hellhound/, "wolf-head", "wolf-howl", "direwolf", "sitting-dog", "werewolf"),
  R(/centaur/, "centaur"),
  R(/manticore/, "lion", "scorpion-tail"),
  R(/hydra/, "hydra"),
  R(/phoenix/, "fire-silhouette", "phoenix"),
  R(/ankha|qetzal|changeling/, "snake", "snake-totem", "fairy", "insect-jaws"),
  R(/radigator/, "croc-jaws", "lizardman"),
  R(/mirelurk/, "crab", "crab-claw"),
  R(/yao guai/, "bear-face", "bear-head"),
  R(/mole rat/, "rat", "mouse"),
  R(/brahmin/, "cow", "bull"),
  R(/radroach/, "long-antennae-bug", "spotted-bug"),
  R(/bloatsprite|parasprite/, "fairy", "fly", "bee", "alien-bug"),
  R(/turret/, "turret", "laser-turret", "walking-turret"),
  R(/bot|ponitron|protectapony|robronco|mister|w-1n0n4|cyberdog/, "robot-golem", "vintage-robot", "mono-wheel-robot", "tracked-robot", "robot-antennas", "battle-mech"),
  R(/ghoul|lost herd|reaver|glowing/, "shambling-zombie", "raise-zombie", "half-dead", "radioactive"),
  R(/alicorn/, "unicorn", "pegasus", "winged-emblem"),
  R(/ranger|enclave|knight|paladin|scribe|initiate/, "black-knight-helm", "robot-helmet", "visored-helm", "brutal-helm"),
  R(/zebra|tribal/, "zebra-shield", "tribal-mask", "spears"),
  R(/griffin|talon/, "griffin-symbol", "griffin-shield", "eagle-emblem"),
  R(/raider|slaver|slave|plague|crusader/, "skull-crossed-bones", "spiked-armor", "slavery-whip", "crowned-skull", "dread-skull"),
  R(/merchant|caravan|militia|mercenary|soldier|pony/, "caravan", "swap-bag", "rifle", "pirate-captain", "sergeant")
];

const CYBER = [
  R(/leg/, "robot-leg", "leg-armor"),
  R(/wing/, "plane-wing", "mechanical-arm"),
  R(/eye|vision/, "cyber-eye", "eye-target", "crystal-eye"),
  R(/organ|torso|heart|breeder|homeostatic/, "heart-organ", "cyborg-face", "processor"),
  R(/armor|armour/, "abdominal-armor", "chest-armor"),
  R(/reservoir|filtration|water|energy/, "battery-pack", "water-tank", "energy-tank"),
  R(/drug|chemical/, "syringe", "pill-drop"),
  R(/talisman|matrix|remote|optimization|implant|muscular/, "processor", "circuitry", "muscle-up", "gem-pendant")
];

const VEHICLES = [
  R(/balloon/, "air-balloon"),
  R(/tank/, "tank", "battle-tank"),
  R(/boat/, "boat-fishing", "sailboat", "paddle-steamer"),
  R(/train/, "steam-locomotive", "subway-train", "rail-road"),
  R(/sky|vertibuck|bomb/, "helicopter", "bomber", "stealth-bomber", "airplane"),
  R(/chariot/, "chariot", "horse-head"),
  R(/wagon/, "old-wagon", "caravan", "old-wagon")
];

/** file — data/*.json, prefix — początek nazwy pliku ikony, fallback — rysunki domyślne listy. */
export const LISTS = [
  { file: "spells", prefix: "s", rules: SPELLS, fallback: ["magic-swirl", "sparkles", "spell-book", "fairy-wand", "crystal-wand", "orb-wand", "magic-palm", "glowing-hands", "unicorn"] },
  { file: "recipes", prefix: "r", rules: RECIPES, fallback: ["cauldron", "mortar", "round-bottom-flask", "bubbling-flask", "herbs-bundle", "potion-ball", "zebra-shield"] },
  { file: "maneuvers", prefix: "m", rules: MANEUVERS, fallback: ["feathered-wing", "pegasus", "angel-wings", "fluffy-wing", "eagle-emblem"] },
  { file: "perks", prefix: "p", rules: PERKS, fallback: ["star-medal", "medal", "rank-3", "trophy", "laurels", "achievement", "polar-star", "round-star"] },
  { file: "bestiary", prefix: "b", rules: BESTIARY, fallback: ["monster-grasp", "beast-eye", "fangs", "claws"] },
  { file: "cyber", prefix: "c", rules: CYBER, fallback: ["processor", "cyborg-face", "circuitry"] },
  { file: "vehicles", prefix: "v", rules: VEHICLES, fallback: ["old-wagon", "caravan"] }
];
