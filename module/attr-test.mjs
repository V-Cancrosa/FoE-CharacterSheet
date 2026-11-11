/**
 * Automatyczny rzut na atrybut z cechami postaci (stałe modyfikatory i kroki MFD z rollContext); kary tymczasowe są
 * już w progu — karta pokazuje wyliczenie. check — { kind, … }: znacznik rzutu automatycznego (udany przerzut kartą
 * szczęścia cofa / rozstrzyga jego skutek: survival.onReroll). Zwraca wynik: crit-success | success | fail | crit-fail.
 */
import { t } from "./i18n.mjs";
import { MFD_STEPS } from "./data.mjs";
import { rollTest, stepIndex, shiftStep } from "./rolls.mjs";
import { rollContext } from "./effects.mjs";

const F = "foe-rpg";
export const passed = r => r === "success" || r === "crit-success";
const NAMES = { str: "STR", per: "PER", end: "END", cha: "CHA", int: "INT", agi: "AGI", luck: "LUCK" };

export async function attrTest(actor, attr, label, stepKey, { mod = 0, notes = [], check = null } = {}) {
  const a = actor.system.attributes[attr];
  const rc = rollContext(actor, { kind: "attr", attr });
  const step = MFD_STEPS[shiftStep(stepIndex(stepKey), rc.fixedSteps)].key;
  const all = [
    a.temp ? t("{attr} {v} (base {b}; {list})", { attr: NAMES[attr] ?? attr, v: a.total, b: a.base, list: (a.tempSources ?? []).join(", ") }) : "",
    ...rc.mods.map(m => `${m.label} ${m.value > 0 ? "+" : ""}${m.value}`),
    ...notes
  ].filter(Boolean);
  const data = { label, baseTn: a.tn, step, mod: rc.fixedMod + (Number(mod) || 0), notes: all };
  if (check) data.check = { id: foundry.utils.randomID(), ...check };
  const msg = await rollTest(actor, data);
  return msg?.getFlag?.(F, "test")?.result ?? msg?.flags?.[F]?.test?.result ?? "fail";
}
