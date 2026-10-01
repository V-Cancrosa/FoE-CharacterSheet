import { CharacterData, NpcData, WeaponData, ArmorData, GearData, FeatureData } from "./data.mjs";
import { FoeActorSheet, FoeItemSheet } from "./sheets.mjs";
import { registerChatListeners } from "./rolls.mjs";

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
});
