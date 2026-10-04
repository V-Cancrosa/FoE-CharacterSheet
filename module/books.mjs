/**
 * Czytanie książek i magazynów (s. 208–210). Zasady: books-data.mjs.
 */
import { SKILLS } from "./data.mjs";
import { parseBook, readState, readPoints, bookUses, isMagazine } from "./books-data.mjs";

const { DialogV2 } = foundry.applications.api;
const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => { ui.notifications.warn(msg); return null; };
const label = k => SKILLS[k]?.label.split(" / ").pop() ?? k;

/** Nagrody spoza umiejętności po skończeniu książki — jako cecha z efektem. */
const SPECIAL_FEATURES = {
  running: { name: "Egghead's Guide to Running (przeczytana)", effects: [{ type: "speed", target: "all", value: 5, when: "" }], desc: "+5 ft ruchu (s. 208)." },
  daring: { name: "Daring Do and the Quest for the Sapphire Stone (przeczytana)", effects: [{ type: "attrRoll", target: "agi", value: 5, when: "" }], desc: "+5 do rzutów AGI (s. 208)." },
  notebook: { name: "Twilight Sparkle's Notebook (przeczytany)", effects: [], desc: "Wypalenie magiczne trwa o połowę krócej (s. 208). Notatnik może też nauczyć zaklęć — MG dodaje je z katalogu." }
};

export async function readBook(actor, item) {
  if (!actor.isOwner) return warn("Nie jesteś właścicielem tej postaci.");
  const magazine = isMagazine(item.name);
  const info = parseBook(item.name, item.system?.description);
  const pre = readState(actor, item);
  if (pre.why.some(w => /illiterate|tylko dla|już przeczytany|do końca/i.test(w))) return warn(`${item.name}: ${pre.why.join("; ")}.`);
  const pts = readPoints(actor);
  const known = info.skills.filter(k => actor.system.skills?.[k]?.known !== false);
  const opts = known.map(k => {
    const st = readState(actor, item, { skill: k });
    return { k, ok: st.canRead, why: st.why.join("; "), rank: actor.system.skills[k].rank };
  });
  if (info.skills.length && !opts.length) return warn(`${item.name}: postać nie ma żadnej z umiejętności tej książki (${info.skills.map(label).join(", ")}).`);
  const readers = (item.flags?.[F]?.book?.readers ?? item.getFlag?.(F, "book")?.readers ?? []).filter(u => u !== actor.uuid);
  const content = `<div class="foe-dialog">
    <div class="atk-info">
      <div>${magazine ? "Magazyn — punkty raz, bez wymagań" : "Książka — punkt za każde przeczytanie (nowa: 1+1d4 razy), wymaga rangi 25"}${info.note ? ` · ${esc(info.note)}` : ""}</div>
      <div>Za przeczytanie: <b>${pts.total}</b> pkt (${pts.parts.map(p => `${p[0]} ${p[1]}`).join(", ")})${!magazine && pre.entry ? ` · zostało przeczytań: <b>${pre.entry.left}/${pre.entry.total}</b>` : ""}${!magazine && !pre.entry && readers.length ? ` · używana (poprzedni czytelnicy: ${readers.length}) — mniej przeczytań` : ""}</div>
    </div>
    ${opts.length ? `<label class="atk-row">Umiejętność <select name="skill">${opts.map(o => `<option value="${o.k}" ${o.ok ? "" : "disabled"}>${esc(label(o.k))} (ranga ${o.rank})${o.ok ? "" : ` — ${esc(o.why)}`}</option>`).join("")}</select></label>` : ""}
    ${magazine && info.varies ? `<label class="atk-row">Numer wydania <input type="text" name="issue" value="1" placeholder="każdy numer czyta się osobno"></label>` : ""}
    <p class="hint">Lektura trwa od dni do miesięcy (Bookworm albo Studious — o połowę krócej); punkty przychodzą po skończeniu. Kliknij, gdy postać skończy kolejne przeczytanie.</p></div>`;
  const pick = await DialogV2.wait({
    window: { title: `Lektura: ${item.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 460 }, rejectClose: false, content,
    buttons: [{ action: "ok", label: "Przeczytane", icon: "fa-solid fa-book-open", default: true,
      callback: (ev, btn) => ({ skill: btn.form.elements.skill?.value ?? "", issue: btn.form.elements.issue?.value?.trim() ?? "" }) }]
  });
  if (!pick) return null;
  const st = readState(actor, item, pick);
  if (!st.canRead) return warn(`${item.name}: ${st.why.join("; ")}.`);
  if (opts.length && !pick.skill) return warn("Wybierz umiejętność.");

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
        return warn(`${item.name}: ten egzemplarz jest zbyt zużyty — nic nowego (1+1d4 = ${1 + r.total}, poprzednich czytelników: ${readers.length}).`);
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
  if (entry.left <= 0 && SPECIAL_FEATURES[info.special] && !actor.items.some(i => i.name === SPECIAL_FEATURES[info.special].name)) {
    const s = SPECIAL_FEATURES[info.special];
    await actor.createEmbeddedDocuments("Item", [{ name: s.name, type: "feature", img: "systems/foe-rpg/icons/book.svg", system: { kind: "other", active: true, effects: s.effects, description: `<p>${s.desc}</p>` } }]);
    bonus = s.desc;
  }
  const lines = [
    pick.skill ? `${label(pick.skill)} +${pts.total} pkt → ranga ${actor.system.skills[pick.skill].rank}` : "bez punktów umiejętności",
    magazine ? "magazyn przeczytany" : entry.left > 0 ? `zostało przeczytań: ${entry.left}/${entry.total}` : "książka skończona",
    bonus ? `nagroda: ${bonus}` : info.note && entry.left <= 0 ? info.note : ""
  ].filter(Boolean);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls,
    content: `<div class="foe-card spell success"><div class="fc-tag"><span>PIPBUCK // LEKTURA</span><span>${magazine ? "magazyn" : "książka"}</span></div>
      <h3>${esc(item.name)}${st.key !== item.name ? ` <small>${esc(st.key.slice(item.name.length))}</small>` : ""}</h3>
      <div class="fc-meta">${lines.map(esc).join(" · ")}</div></div>`
  });
}

/** Krótki stan do listy ekwipunku. */
export function bookStatus(actor, item) {
  const st = readState(actor, item);
  if (st.magazine) return st.info.varies ? "numery osobno" : st.entry ? "przeczytany" : "do przeczytania";
  if (!st.entry) return (item.flags?.[F]?.book?.readers ?? []).filter(u => u !== actor.uuid).length ? "używana" : "nowa";
  return st.entry.left > 0 ? `${st.entry.total - st.entry.left}/${st.entry.total}` : "przeczytana";
}
