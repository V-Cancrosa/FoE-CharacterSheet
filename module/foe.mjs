import { CharacterData, NpcData, VehicleData, WeaponData, ArmorData, GearData, FeatureData, SpellData } from "./data.mjs";
import { FoeVehicleSheet } from "./vehicle-sheet.mjs";
import { registerVehicleHooks } from "./vehicle.mjs";
import { registerCyberSettings, registerCyberHooks } from "./cyber.mjs";
import { registerPermissionSettings, registerPermissionHooks } from "./permissions.mjs";
import { registerShadowHooks } from "./shadow.mjs";
import { registerMagicHooks } from "./magic.mjs";
import { FoeActorSheet, FoeItemSheet } from "./sheets.mjs";
import { registerCombatHooks } from "./attack.mjs";
import { openCreator } from "./creator.mjs";
import { openCatalog, registerCatalogButton, loadCatalog } from "./catalog.mjs";
import { specialsFrom } from "./catalog-data.mjs";
import { FoeCombat, registerTrackerHooks, registerTrackerSettings } from "./tracker.mjs";
import { registerWeatherSettings, registerWeatherHooks, setWeather } from "./weather.mjs";
import { registerPerkSettings } from "./perks.mjs";
import { registerChemSettings, registerChemHooks } from "./chems.mjs";
import { registerSatsSettings, registerSatsHooks } from "./sats-targeting.mjs";
import { terminalDataClass } from "./terminal-data.mjs";
import { FoeTerminalSheet } from "./terminal-sheet.mjs";
import { registerTerminalSettings, registerTerminalHooks } from "./terminal.mjs";
import { registerDice3d, registerDice3dSettings } from "./dice3d.mjs";
import { registerRollTableClass, registerTableHooks } from "./tables.mjs";
import { registerLootSettings, registerLootHooks } from "./loot.mjs";
import { registerGiveHooks } from "./give.mjs";
import { registerLoadHooks } from "./load.mjs";
import { registerThrowSettings, registerThrowHooks } from "./throw.mjs";
import { registerSaleHooks } from "./sale.mjs";
import { registerUiSettings, registerUiHooks } from "./ui-theme.mjs";
import { casinoDataClass } from "./casino-data.mjs";
import { FoeCasinoSheet } from "./casino-sheet.mjs";
import { registerCasinoSettings, registerCasinoHooks } from "./casino.mjs";
import { registerLanguageSetting, registerI18nHelpers, localizeRegistrations } from "./i18n.mjs";
import { registerVersionCheck } from "./version-check.mjs";
import { registerIntegrations } from "./integrations.mjs";
import { registerRuleLinks } from "./rules.mjs";

Hooks.once("init", () => {
  // język systemu (opcja gracza) — najpierw, bo z niego korzystają wszystkie napisy
  registerLanguageSetting();
  registerI18nHelpers();
  registerRuleLinks();
  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData, vehicle: VehicleData, terminal: terminalDataClass(), casino: casinoDataClass() };
  CONFIG.Item.dataModels = { weapon: WeaponData, armor: ArmorData, gear: GearData, feature: FeatureData, spell: SpellData };
  CONFIG.Combat.documentClass = FoeCombat;
  // d100 − ¼ progu Agility; FoeCombat.rollInitiative pyta gracza: odjąć czy dodać (s. 436)
  CONFIG.Combat.initiative = { formula: "1d100 - @initMod", decimals: 0 };

  // v14: Actors/Items.registerSheet są przestarzałe — DocumentSheetConfig działa w v13 i v14
  const SheetConfig = foundry.applications.apps?.DocumentSheetConfig;
  const register = (cls, sheet, opts) => (SheetConfig?.registerSheet
    ? SheetConfig.registerSheet(cls, "foe-rpg", sheet, opts)
    : (cls === Actor ? foundry.documents.collections.Actors : foundry.documents.collections.Items).registerSheet("foe-rpg", sheet, opts));
  register(Actor, FoeActorSheet, { types: ["character", "npc"], makeDefault: true, label: "FoE: character sheet" });
  register(Actor, FoeVehicleSheet, { types: ["vehicle"], makeDefault: true, label: "FoE: vehicle sheet" });
  register(Actor, FoeTerminalSheet, { types: ["terminal"], makeDefault: true, label: "FoE: terminal" });
  register(Actor, FoeCasinoSheet, { types: ["casino"], makeDefault: true, label: "FoE: gaming table" });
  register(Item, FoeItemSheet, { makeDefault: true, label: "FoE: item sheet" });

  registerCombatHooks();
  registerTrackerHooks();
  registerMagicHooks();
  registerTrackerSettings();
  registerWeatherSettings();
  registerPerkSettings();
  registerChemSettings();
  registerChemHooks();
  registerVehicleHooks();
  registerCyberSettings();
  registerPermissionSettings();
  registerPermissionHooks();
  registerShadowHooks();
  registerCyberHooks();
  // runda walki = 6 sekund czasu gry (s. 389: „30 sekund, czyli pięć rund”) — czas działania chemii płynie w walce
  CONFIG.time.roundTime = 6;
  registerWeatherHooks();
  registerCatalogButton();
  registerDisplaySettings();
  registerCreatorSettings();
  registerCombatSettings();
  registerSatsSettings();
  registerSatsHooks();
  registerTerminalSettings();
  registerTerminalHooks();
  registerDice3d();
  registerDice3dSettings();
  // Carousel Combat Tracker, Dice Tray (przed ich init/i18nInit) i wysokość lotu → token
  registerIntegrations();
  registerRollTableClass();
  registerTableHooks();
  registerLootSettings();
  registerLootHooks();
  registerGiveHooks();
  registerLoadHooks();
  registerThrowSettings();
  registerThrowHooks();
  registerSaleHooks();
  registerUiSettings();
  registerUiHooks();
  registerCasinoSettings();
  registerCasinoHooks();
  registerVersionCheck();
  game.foe = { openCatalog, setWeather };
});

/** Tłumaczenia Foundry wczytane: ustawienia, typy i etykiety kart w języku gracza. */
Hooks.once("i18nInit", () => localizeRegistrations());

/** Nowa postać lub NPC → kreator (tylko u osoby, która ją utworzyła). */
Hooks.on("createActor", (actor, options, userId) => {
  if (userId !== game.user.id || ["vehicle", "terminal", "casino"].includes(actor.type) || !game.settings.get("foe-rpg", "autoCreator")) return;
  if (actor.getFlag("foe-rpg", "created") || actor.items.size || actor.pack) return;
  // po chwili, żeby kreator otworzył się nad kartą postaci
  setTimeout(() => openCreator(actor), 150);
});

function registerCreatorSettings() {
  game.settings.register("foe-rpg", "autoCreator", {
    name: "Creator for new characters",
    hint: "Opens the character (PC) or NPC creator right after a new actor is created. You can also start the creator with a button on the sheet.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register("foe-rpg", "creationPool", {
    name: "Character creation points",
    hint: "S.P.E.C.I.A.L. point pool (rulebook p. 51): 35 as standard, 37 for “great heroes”, 32 for weaker characters.",
    scope: "world",
    config: true,
    type: Number,
    choices: { 32: "32 — weaker characters", 35: "35 — standard", 37: "37 — great heroes" },
    default: 35
  });
}

/**
 * Jednorazowo (MG): broń dodana z katalogu przed v0.6 dostaje efekty specjalne z przypisów podręcznika.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM || game.settings.get("foe-rpg", "specialsMigrated")) return;
  try {
    const cat = await loadCatalog();
    const byName = new Map(cat.weapons.map(e => [e.name, e]));
    const fix = items => items.filter(i => i.type === "weapon" && byName.has(i.getFlag("foe-rpg", "catalog"))
      && !Object.values(i.system.specials ?? {}).some(Boolean))
      .map(i => ({ _id: i.id, "system.specials": specialsFrom(byName.get(i.getFlag("foe-rpg", "catalog"))) }));
    for (const actor of game.actors) {
      const updates = fix(actor.items);
      if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    }
    const world = fix(game.items);
    if (world.length) await Item.implementation.updateDocuments(world);
    await game.settings.set("foe-rpg", "specialsMigrated", true);
  } catch (err) {
    console.error("foe-rpg | weapon specials migration", err);
  }
});

/** Zasady opcjonalne z rozdziału o walce. */
function registerCombatSettings() {
  game.settings.register("foe-rpg", "powerArmorUntrainedAgi", {
    name: "AGI penalty for power armor without training",
    hint: "House rule: an extra AGI penalty for characters without Power Armor Training. The rulebook only says that without the training the armor gives no bonuses while its AGI penalties remain (0 = just that).",
    scope: "world", config: true, type: Number, default: 0, range: { min: 0, max: 5, step: 1 }
  });
  game.settings.register("foe-rpg", "weaponDegradation", {
    name: "Weapon degradation",
    hint: "Optional rule (p. 458): each damage die is one degradation step; a weapon loses a die every 2 magazines (over 8 dice — every magazine, single-shot — every 4 shots), a melee weapon — after as many hits as it has dice. Repair: Repair per Table XXIX and a donor weapon for parts.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register("foe-rpg", "specialAmmo", {
    name: "Special ammunition",
    hint: "Optional rule (pp. 202–203): regular rounds and energy ammo ignore 5 DT, and the catalog has special ammunition (AP, Incendiary, Spark, Focused, High Explosive…) chosen when reloading.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register("foe-rpg", "overloadRule", {
    name: "Overloading",
    hint: "House rule (default): up to 125% of the carry limit — ¾ speed, up to 150% — ½ speed, up to twice the limit — dragging along at 5 ft per action, over twice the limit — the character can't move (players can't move the token until they drop or hand over something; the GM can). Rulebook (pp. 19, 150): −5 ft per action for every started 10 lb over the limit.",
    scope: "world", config: true, type: String, default: "tiers",
    choices: { tiers: "Levels (house rule): ¾ → ½ → 5 ft → stuck", book: "Rulebook: −5 ft for every 10 lb" },
    onChange: () => {
      for (const a of game.actors) a.prepareData();
      for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render();
    }
  });
  game.settings.register("foe-rpg", "specialsMigrated", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register("foe-rpg", "randomHitLocations", {
    name: "Random hit locations",
    hint: "Optional rule (pp. 449–450): the attack dialog defaults to a hit location rolled on a d20 for the target's race instead of the torso. Called shots always work.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register("foe-rpg", "armorDegradation", {
    name: "Armor degradation",
    hint: "Optional rule (p. 460): when damage gets through the armor, it loses 1 DT on that location. This is the default of the checkbox in the “Apply damage” dialog.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}

/** Ustawienia wyglądu ekranu PipBucka (każdy gracz wybiera dla siebie). */
function registerDisplaySettings() {
  const apply = () => {
    document.body.dataset.foePip = game.settings.get("foe-rpg", "pipColor");
    document.body.dataset.foeCrt = game.settings.get("foe-rpg", "crtEffect") ? "on" : "off";
    try { globalThis.ui?.pause?.render?.(); } catch { /* ekran pauzy jeszcze nie istnieje */ }
  };
  game.settings.register("foe-rpg", "pipColor", {
    name: "PipBuck screen color",
    hint: "Phosphor color of the character sheets and of the rolls in chat.",
    scope: "client",
    config: true,
    type: String,
    choices: { green: "Green", amber: "Amber", blue: "Blue", white: "White" },
    default: "green",
    onChange: apply
  });
  game.settings.register("foe-rpg", "crtEffect", {
    name: "CRT effect (scan lines)",
    hint: "Turn it off if the scan lines make reading harder.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: apply
  });
  apply();
}
