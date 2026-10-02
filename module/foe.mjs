import { CharacterData, NpcData, WeaponData, ArmorData, GearData, FeatureData } from "./data.mjs";
import { FoeActorSheet, FoeItemSheet } from "./sheets.mjs";
import { registerChatListeners } from "./rolls.mjs";
import { openCreator } from "./creator.mjs";

/** W FoE RPG niższa inicjatywa działa pierwsza. */
class FoeCombat extends Combat {
  _sortCombatants(a, b) {
    const ia = Number.isNumeric(a.initiative) ? a.initiative : Infinity;
    const ib = Number.isNumeric(b.initiative) ? b.initiative : Infinity;
    return (ia - ib) || (b.actor?.system.attributes?.agi.total ?? 0) - (a.actor?.system.attributes?.agi.total ?? 0)
      || (a.id > b.id ? 1 : -1);
  }
}

Hooks.once("init", () => {
  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData };
  CONFIG.Item.dataModels = { weapon: WeaponData, armor: ArmorData, gear: GearData, feature: FeatureData };
  CONFIG.Combat.documentClass = FoeCombat;
  // d100 minus ¼ progu Agility (gracz może zamiast tego dodać — wtedy popraw ręcznie)
  CONFIG.Combat.initiative = { formula: "1d100 - @initMod", decimals: 0 };

  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("foe-rpg", FoeActorSheet, { makeDefault: true, label: "FoE: karta postaci" });
  Items.registerSheet("foe-rpg", FoeItemSheet, { makeDefault: true, label: "FoE: przedmiot" });

  registerChatListeners();
  registerDisplaySettings();
  registerCreatorSettings();
});

/** Nowa postać lub NPC → kreator (tylko u osoby, która ją utworzyła). */
Hooks.on("createActor", (actor, options, userId) => {
  if (userId !== game.user.id || !game.settings.get("foe-rpg", "autoCreator")) return;
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
