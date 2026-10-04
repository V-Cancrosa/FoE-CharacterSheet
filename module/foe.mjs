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

Hooks.once("init", () => {
  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData, vehicle: VehicleData };
  CONFIG.Item.dataModels = { weapon: WeaponData, armor: ArmorData, gear: GearData, feature: FeatureData, spell: SpellData };
  CONFIG.Combat.documentClass = FoeCombat;
  // d100 − ¼ progu Agility; FoeCombat.rollInitiative pyta gracza: odjąć czy dodać (s. 436)
  CONFIG.Combat.initiative = { formula: "1d100 - @initMod", decimals: 0 };

  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("foe-rpg", FoeActorSheet, { types: ["character", "npc"], makeDefault: true, label: "FoE: karta postaci" });
  Actors.registerSheet("foe-rpg", FoeVehicleSheet, { types: ["vehicle"], makeDefault: true, label: "FoE: karta pojazdu" });
  Items.registerSheet("foe-rpg", FoeItemSheet, { makeDefault: true, label: "FoE: przedmiot" });

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
  game.foe = { openCatalog, setWeather };
});

/** Nowa postać lub NPC → kreator (tylko u osoby, która ją utworzyła). */
Hooks.on("createActor", (actor, options, userId) => {
  if (userId !== game.user.id || actor.type === "vehicle" || !game.settings.get("foe-rpg", "autoCreator")) return;
  if (actor.getFlag("foe-rpg", "created") || actor.items.size || actor.pack) return;
  // po chwili, żeby kreator otworzył się nad kartą postaci
  setTimeout(() => openCreator(actor), 150);
});

function registerCreatorSettings() {
  game.settings.register("foe-rpg", "autoCreator", {
    name: "Kreator przy nowej postaci",
    hint: "Otwiera kreator postaci (PC) lub NPC zaraz po utworzeniu nowego aktora. Kreator można też uruchomić przyciskiem na karcie.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register("foe-rpg", "creationPool", {
    name: "Punkty tworzenia postaci",
    hint: "Pula punktów S.P.E.C.I.A.L. (podręcznik s. 51): 35 standardowo, 37 dla „wielkich bohaterów”, 32 dla słabszych postaci.",
    scope: "world",
    config: true,
    type: Number,
    choices: { 32: "32 — słabsze postacie", 35: "35 — standard", 37: "37 — wielcy bohaterowie" },
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
    console.error("foe-rpg | uzupełnianie efektów broni", err);
  }
});

/** Zasady opcjonalne z rozdziału o walce. */
function registerCombatSettings() {
  game.settings.register("foe-rpg", "powerArmorUntrainedAgi", {
    name: "Kara AGI za pancerz wspomagany bez szkolenia",
    hint: "Zasada domowa: dodatkowa kara do AGI dla postaci bez Power Armor Training. Podręcznik mówi tylko, że bez szkolenia nie ma premii z pancerza, a jego kary AGI zostają (0 = tylko to).",
    scope: "world", config: true, type: Number, default: 0, range: { min: 0, max: 5, step: 1 }
  });
  game.settings.register("foe-rpg", "specialAmmo", {
    name: "Amunicja specjalna",
    hint: "Zasada opcjonalna (s. 202–203): zwykłe naboje i amunicja energetyczna ignorują 5 DT, a w katalogu jest amunicja specjalna (AP, Incendiary, Spark, Focused, High Explosive…) wybierana przy przeładowaniu.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register("foe-rpg", "specialsMigrated", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register("foe-rpg", "randomHitLocations", {
    name: "Losowe lokacje trafień",
    hint: "Zasada opcjonalna (s. 449–450): w oknie ataku domyślnie wybrana jest lokacja losowana k20 wg rasy celu zamiast tułowia. Strzały celowane działają zawsze.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register("foe-rpg", "armorDegradation", {
    name: "Degradacja pancerza",
    hint: "Zasada opcjonalna (s. 460): gdy obrażenia przebiją pancerz, traci on 1 DT na tej lokacji. To domyślne zaznaczenie w oknie „Nanieś obrażenia”.",
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
  };
  game.settings.register("foe-rpg", "pipColor", {
    name: "Kolor ekranu PipBucka",
    hint: "Kolor fosforu na kartach postaci i w rzutach na czacie.",
    scope: "client",
    config: true,
    type: String,
    choices: { green: "Zielony", amber: "Bursztynowy", blue: "Niebieski", white: "Biały" },
    default: "green",
    onChange: apply
  });
  game.settings.register("foe-rpg", "crtEffect", {
    name: "Efekt kineskopu (linie skanowania)",
    hint: "Wyłącz, jeśli linie skanowania przeszkadzają w czytaniu.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: apply
  });
  apply();
}
