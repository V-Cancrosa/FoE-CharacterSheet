/**
 * Kreator broni i pancerza nazwanego (podręcznik s. 204–206). Zasady: named-data.mjs.
 */
import { ATTRS, SKILLS } from "./data.mjs";
import { POISONS } from "./combat.mjs";
import { weaponOptions, armorOptions, pointsBalance, applyWeaponNaming, applyArmorNaming, NAMED_SPECIALS, weaponClass } from "./named-data.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };

/** Kto może tworzyć: MG zawsze; gracz — przy tworzeniu postaci (poziom 1), jak mówi podręcznik. */
export const canName = actor => !!game.user?.isGM || (actor?.isOwner && (actor.system?.level ?? 1) <= 1);
const hasNamedTrait = actor => actor.items.some(i => i.type === "feature" && i.system?.active !== false && /named (weapon|armou?r)/i.test(i.name));
const CLASS_PL = { close: "broń do walki wręcz", ranged: "broń dystansowa", aoe: "broń obszarowa" };

export async function nameItem(actor, item) {
  if (!["weapon", "armor"].includes(item.type)) return null;
  if (item.flags?.[F]?.named ?? item.getFlag?.(F, "named")) return warn(`${item.name} jest już bronią/pancerzem nazwanym.`);
  if (!canName(actor)) return warn("Według podręcznika broń i pancerz nazwany tworzy się przy tworzeniu postaci (poziom 1). Później — tylko MG.");
  if (item.type === "weapon" && item.system.consumable) return warn("Broni jednorazowej (granaty, miny) nie da się uczynić nazwaną.");
  const weapon = item.type === "weapon";
  const w = item.system;
  const original = item.name;
  const opts = weapon ? weaponOptions(w) : armorOptions(w);
  let points = 5, roll = null;
  if (!hasNamedTrait(actor)) { roll = await new Roll("1 + 1d4").evaluate(); points = roll.total; }

  const skillOpts = Object.entries(SKILLS).map(([k, s]) => `<option value="${k}">${esc(s.label.split(" / ").pop())}</option>`).join("");
  const attrOpts = Object.entries(ATTRS).filter(([k]) => k !== "luck").map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
  const sel = (name, inner, first = "—") => `<select name="${name}"><option value="">${first}</option>${inner}</select>`;
  const rows = opts.map(o => `<tr class="${o.drawback ? "drawback" : ""}"><td class="l">${esc(o.label)}</td><td>${o.cost > 0 ? `${o.cost} pkt` : `+${-o.cost} pkt`}</td>
    <td><input type="number" name="n-${o.key}" value="0" min="0" max="${o.max}"></td></tr>`).join("");
  const extra = weapon
    ? `<label class="atk-row">Efekt specjalny (2 pkt) ${sel("special", Object.entries(NAMED_SPECIALS).map(([k, l]) => `<option value="${k}">${l}</option>`).join(""))}</label>
       <label class="atk-row">Trucizna ${sel("poison", Object.entries(POISONS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join(""))}</label>`
    : `<div class="named-picks">
        <label>Atrybuty (+1) ${sel("attr1", attrOpts)} ${sel("attr2", attrOpts)}</label>
        <label>+5 do umiejętności ${sel("s5a", skillOpts)} ${sel("s5b", skillOpts)} ${sel("s5c", skillOpts)}</label>
        <label>+2 do dwóch ${sel("s2a", skillOpts)} ${sel("s2b", skillOpts)} · ${sel("s2c", skillOpts)} ${sel("s2d", skillOpts)}</label>
        <label>Wyposażenie <input type="text" name="sp1" placeholder="np. noktowizor"> <input type="text" name="sp2" placeholder="np. radio"></label>
      </div>`;
  const content = `<div class="foe-dialog named-dlg">
    <div class="atk-info"><div>${esc(item.name)} — ${weapon ? CLASS_PL[weaponClass(w)] : "pancerz"}. Punkty: <b>${points}</b>${roll ? ` (1+1d4 = ${roll.total})` : " (cecha Named Weapon/Armor)"}; pogorszenia dają do 3 pkt więcej.</div></div>
    <label class="atk-row">Nazwa <input type="text" name="name" value="${esc(item.name)}" placeholder="np. Filly Mays"></label>
    <table class="foe-table named-opts"><tbody>${rows}</tbody></table>
    ${extra}
    <div class="named-left atk-info"></div>
    <p class="hint">Podręcznik zachęca do nazw-kalamburów. Na koniec MG może (choć zwykle nie powinien) dać broni zdolność specjalną z jej historii.</p></div>`;

  const read = form => {
    const counts = Object.fromEntries(opts.map(o => [o.key, Number(form.elements[`n-${o.key}`]?.value) || 0]));
    return { counts, bal: pointsBalance(opts, counts, points) };
  };
  const render = (event, dialog) => {
    const root = dialog?.element ?? event?.target?.element ?? document;
    const form = root.querySelector?.("form") ?? root;
    const out = form.querySelector(".named-left");
    const upd = () => {
      const { bal } = read(form);
      out.innerHTML = `Zostało punktów: <b>${bal.left}</b>${bal.bonus ? ` (w tym ${Math.min(3, bal.bonus)} z pogorszeń)` : ""}${bal.errors.length ? `<div class="warn">${bal.errors.map(esc).join(" · ")}</div>` : ""}`;
    };
    form.addEventListener("input", upd);
    upd();
  };
  const res = await DialogV2.wait({
    window: { title: `${weapon ? "Broń" : "Pancerz"} nazwany: ${item.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 520 }, rejectClose: false,
    content, render,
    buttons: [{ action: "ok", label: "Zapisz", icon: "fa-solid fa-star", default: true, callback: (ev, btn) => {
      const f = btn.form.elements;
      const { counts, bal } = read(btn.form);
      return { counts, bal, name: f.name.value.trim() || item.name, special: f.special?.value ?? "", poison: f.poison?.value ?? "",
        picks: weapon ? null : {
          attr: [f.attr1.value, f.attr2.value].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i),
          skill5: [f.s5a.value, f.s5b.value, f.s5c.value].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i),
          skill2: [[f.s2a.value, f.s2b.value], [f.s2c.value, f.s2d.value]].filter(p => p[0] && p[1] && p[0] !== p[1])
        }, specials: weapon ? [] : [f.sp1.value.trim(), f.sp2.value.trim()] };
    } }]
  });
  if (!res) return null;
  if (res.bal.errors.length) return warn(`Nie zapisano: ${res.bal.errors.join("; ")}.`);
  if (weapon && res.counts.special && !res.special) return warn("Wybierz efekt specjalny (2 pkt) albo wyzeruj tę opcję.");

  const lines = [];
  let update;
  const rolls = roll ? [roll] : [];
  if (weapon) {
    const sys = applyWeaponNaming(w, res.counts, { special: res.special ? { key: res.special, poison: res.poison } : null });
    update = Object.fromEntries(Object.entries(sys).map(([k, v]) => [`system.${k}`, v]));
    lines.push(`Obrażenia ${w.damage} → ${sys.damage}`, `SATS ${w.satsCost} → ${sys.satsCost}`, `Kryt. ${w.crit} → ${sys.crit}`, `Waga ${w.weight} → ${sys.weight}`);
    if (sys["ammo.max"] !== undefined) lines.push(`Magazynek ${w.ammo.max} → ${sys["ammo.max"]}`);
    if (sys.rangeInc) lines.push(`Zasięg ${w.rangeInc} → ${sys.rangeInc} ft`);
    if (res.special && res.counts.special) lines.push(`Efekt: ${NAMED_SPECIALS[res.special]}`);
  } else {
    const dtRolls = [];
    for (let i = 0; i < (res.counts.dt || 0); i++) { const r = await new Roll("1d6").evaluate(); rolls.push(r); dtRolls.push(r.total); }
    for (let i = 0; i < (res.counts["-dt"] || 0); i++) { const r = await new Roll("1d6").evaluate(); rolls.push(r); dtRolls.push(-r.total); }
    const sys = applyArmorNaming(w, res.counts, { dtRolls, picks: res.picks, specials: res.specials });
    update = { "system.dt": sys.dt, "system.weight": sys.weight, "system.effects": sys.effects };
    if (sys.specialNote.length) update["system.description"] = `${w.description ?? ""}<p><b>Wyposażenie zintegrowane:</b> ${sys.specialNote.map(esc).join(", ")}</p>`;
    lines.push(`DT ${w.dt} → ${sys.dt}${dtRolls.length ? ` (k6: ${dtRolls.join(", ")})` : ""}`, `Waga ${w.weight} → ${sys.weight}`);
    if (sys.effects.length > (w.effects?.length ?? 0)) lines.push(`Nowe efekty: ${sys.effects.length - (w.effects?.length ?? 0)}`);
    if (sys.specialNote.length) lines.push(`Wyposażenie: ${sys.specialNote.join(", ")}`);
  }
  await item.update({ name: res.name, ...update, [`flags.${F}.named`]: { points, counts: res.counts, original } });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls,
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${weapon ? "BROŃ NAZWANA" : "PANCERZ NAZWANY"}</span><span>${points} pkt</span></div>
      <h3>${esc(res.name)}</h3>${original !== res.name ? `<div class="fc-meta">z: ${esc(original)}</div>` : ""}
      <div class="fc-meta">${lines.map(esc).join(" · ")}</div></div>`
  });
}
