/**
 * Czytanie książek i magazynów (s. 208–210). Zasady: books-data.mjs.
 */
import { SKILLS } from "./data.mjs";
import { parseBook, readState, readPoints, bookUses, isMagazine } from "./books-data.mjs";
import { t } from "./i18n.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const label = k => SKILLS[k]?.label.split(" / ").pop() ?? k;

/** Nagrody spoza umiejętności po skończeniu książki — jako cecha z efektem. */
const SPECIAL_FEATURES = {
  running: () => ({ name: t("Egghead's Guide to Running (read)"), effects: [{ type: "speed", target: "all", value: 5, when: "" }], desc: t("+5 ft movement (p. 208).") }),
  daring: () => ({ name: t("Daring Do and the Quest for the Sapphire Stone (read)"), effects: [{ type: "attrRoll", target: "agi", value: 5, when: "" }], desc: t("+5 to AGI rolls (p. 208).") }),
  notebook: () => ({ name: t("Twilight Sparkle's Notebook (read)"), effects: [], desc: t("Magical burnout lasts half as long (p. 208). The notebook may also teach spells — the GM adds them from the catalog.") })
};

export async function readBook(actor, item) {
  if (!actor.isOwner) return warn(t("You don't own this character."));
  const magazine = isMagazine(item.name);
  const info = parseBook(item.name, item.system?.description);
  const pre = readState(actor, item);
  if (pre.blocked) return warn(`${item.name}: ${pre.why.join("; ")}.`);
  const pts = readPoints(actor);
  const known = info.skills.filter(k => actor.system.skills?.[k]?.known !== false);
  const opts = known.map(k => {
    const st = readState(actor, item, { skill: k });
    return { k, ok: st.canRead, why: st.why.join("; "), rank: actor.system.skills[k].rank };
  });
  if (info.skills.length && !opts.length) return warn(t("{name}: the character has none of this book's skills ({list}).", { name: item.name, list: info.skills.map(label).join(", ") }));
  const readers = (item.flags?.[F]?.book?.readers ?? item.getFlag?.(F, "book")?.readers ?? []).filter(u => u !== actor.uuid);
  const content = `<div class="foe-dialog">
    <div class="atk-info">
      <div>${magazine ? t("Magazine — points once, no requirements") : t("Book — a point for every reading (new: 1+1d4 times), requires rank 25")}${info.note ? ` · ${esc(info.note)}` : ""}</div>
      <div>${t("Per reading: {n} pts ({parts})", { n: `<b>${pts.total}</b>`, parts: pts.parts.map(p => `${p[0]} ${p[1]}`).join(", ") })}${!magazine && pre.entry ? ` · ${t("readings left: {v}", { v: `<b>${pre.entry.left}/${pre.entry.total}</b>` })}` : ""}${!magazine && !pre.entry && readers.length ? ` · ${t("used (previous readers: {n}) — fewer readings", { n: readers.length })}` : ""}</div>
    </div>
    ${opts.length ? `<label class="atk-row">${t("Skill")} <select name="skill">${opts.map(o => `<option value="${o.k}" ${o.ok ? "" : "disabled"}>${esc(label(o.k))} ${t("(rank {n})", { n: o.rank })}${o.ok ? "" : ` — ${esc(o.why)}`}</option>`).join("")}</select></label>` : ""}
    ${magazine && info.varies ? `<label class="atk-row">${t("Issue number")} <input type="text" name="issue" value="1" placeholder="${t("each issue is read separately")}"></label>` : ""}
    <p class="hint">${t("Reading takes days to months (Bookworm or Studious — half as long); the points come after finishing. Click when the character finishes another reading.")}</p></div>`;
  const pick = await DialogV2.wait({
    window: { title: t("Reading: {name}", { name: item.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false, content,
    buttons: [{ action: "ok", label: t("Done reading"), icon: "fa-solid fa-book-open", default: true,
      callback: (ev, btn) => ({ skill: btn.form.elements.skill?.value ?? "", issue: btn.form.elements.issue?.value?.trim() ?? "" }) }]
  });
  if (!pick) return null;
  const st = readState(actor, item, pick);
  if (!st.canRead) return warn(`${item.name}: ${st.why.join("; ")}.`);
  if (opts.length && !pick.skill) return warn(t("Choose a skill."));

  const log = foundry.utils.deepClone(actor.flags?.[F]?.booksRead ?? actor.getFlag?.(F, "booksRead") ?? {});
  let entry = log[st.key];
  const rolls = [];
  if (!entry) {
    if (magazine) entry = { left: 1, total: 1, reads: 0 };
    else {
      const r = await new Roll("1d4").evaluate();
      rolls.push(r);
      // książka bez umiejętności (np. Egghead's Guide to Running) — jedno przeczytanie do końca
      const uses = info.skills.length ? bookUses(r.total, readers.length) : 1;
      entry = { left: uses, total: uses, reads: 0 };
      if (!uses) {
        log[st.key] = entry;
        await actor.setFlag(F, "booksRead", log);
        return warn(t("{name}: this copy is too worn — nothing new (1+1d4 = {n}, previous readers: {r}).", { name: item.name, n: 1 + r.total, r: readers.length }));
      }
    }
  }
  entry.left -= 1;
  entry.reads += 1;
  log[st.key] = entry;
  const update = {};
  if (pick.skill) update[`system.skills.${pick.skill}.points`] = (actor.system.skills[pick.skill].points || 0) + pts.total;
  if (Object.keys(update).length) await actor.update(update, { foeAdvance: true });
  await actor.setFlag(F, "booksRead", log);

  // egzemplarz: dopisz czytelnika; używana książka jest warta połowę (s. 208)
  const book = item.flags?.[F]?.book ?? item.getFlag?.(F, "book") ?? {};
  if (!magazine && !(book.readers ?? []).includes(actor.uuid)) {
    await item.update({ [`flags.${F}.book`]: { ...book, readers: [...(book.readers ?? []), actor.uuid] },
      ...((book.readers ?? []).length ? {} : { "system.value": Math.floor((Number(item.system.value) || 0) / 2) }) });
  }
  // nagroda po skończeniu
  let bonus = "";
  const reward = SPECIAL_FEATURES[info.special]?.();
  if (entry.left <= 0 && reward && !actor.items.some(i => i.getFlag?.(F, "bookReward") === info.special || i.flags?.[F]?.bookReward === info.special || i.name === reward.name)) {
    const s = reward;
    await actor.createEmbeddedDocuments("Item", [{ name: s.name, type: "feature", img: "systems/foe-rpg/icons/book.svg", system: { kind: "other", active: true, effects: s.effects, description: `<p>${s.desc}</p>` }, flags: { [F]: { bookReward: info.special } } }]);
    bonus = s.desc;
  }
  const lines = [
    pick.skill ? t("{skill} +{n} pts → rank {r}", { skill: label(pick.skill), n: pts.total, r: actor.system.skills[pick.skill].rank }) : t("no skill points"),
    magazine ? t("magazine read") : entry.left > 0 ? t("readings left: {v}", { v: `${entry.left}/${entry.total}` }) : t("book finished"),
    bonus ? t("reward: {r}", { r: bonus }) : info.note && entry.left <= 0 ? info.note : ""
  ].filter(Boolean);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls,
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // ${t("READING")}</span><span>${magazine ? t("magazine") : t("book")}</span></div>
      <h3>${esc(item.name)}${st.key !== item.name ? ` <small>${esc(st.key.slice(item.name.length))}</small>` : ""}</h3>
      <div class="fc-meta">${lines.map(esc).join(" · ")}</div></div>`
  });
}

/** Krótki stan do listy ekwipunku. */
export function bookStatus(actor, item) {
  const st = readState(actor, item);
  if (st.magazine) return st.info.varies ? t("issues separately") : st.entry ? t("mag|read") : t("to read");
  if (!st.entry) return (item.flags?.[F]?.book?.readers ?? []).filter(u => u !== actor.uuid).length ? t("book|used") : t("book|new");
  return st.entry.left > 0 ? `${st.entry.total - st.entry.left}/${st.entry.total}` : t("book|read");
}
