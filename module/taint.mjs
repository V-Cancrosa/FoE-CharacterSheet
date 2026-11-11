/**
 * Skażenie na karcie (logika: taint-data.mjs). Flaga aktora foe-rpg.taint — stan suwaka.
 *   - MG daje dawkę (okno: drobna ekspozycja / kleks / kałuża / własna liczba kresek) — rzuty Szczęścia od razu,
 *     skutki ciężkie przez karty decyzji MG (confirm.mjs): mutacja, abominacja (END ¼, INT ¼), 5. romb (Luck ¼),
 *     kolejne etapy przemiany w alikorna / piekielnego psa (cechy z opisem i proponowanym perkiem misji; etap 5 — rasa,
 *     Large, Channeler, Magic ≥ 50, Flight ≥ 25),
 *   - oczyszczenie (Tenpony Tower): suwak na zero, sukcesy i zmiany w ciele zostają,
 *   - udany przerzut kartą szczęścia ostatniego rzutu dawki rozstrzyga ten etap jeszcze raz.
 * Mutacja — wada „Mutation” (−5 CHA z obcymi, gdy widać) z podpowiedzią z tabeli pomysłów; MG opisuje ją sam.
 */
import { t, N_ } from "./i18n.mjs";
import { attrTest, passed } from "./attr-test.mjs";
import { deadly, registerConfirmAction } from "./confirm.mjs";
import { toggleStatus } from "./conditions.mjs";
import { HINDRANCES, TRAITS } from "./creation-data.mjs";
import { resolveFeature, featureItem } from "./creator-logic.mjs";
import {
  TAINT_MARKS, TAINT_DOSES, ALICORN_STAGES, MUTATION_IDEAS, TAINT_MAX, taintOf, need, step, dosePlan, alicornAfter, cleanse,
  taintImmuneRace, isDogRace, isDiamond
} from "./taint-data.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const ownersAndGM = actor => game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
const hasFeat = (actor, re) => (actor.items ?? []).some(i => i.type === "feature" && i.system?.active !== false && re.test(i.name));

export const taintState = actor => taintOf(actor?.flags?.[F]?.taint);
const save = (actor, st) => actor.setFlag(F, "taint", st);

function card(actor, lines, { warn = "", tag = t("TAINT") } = {}) {
  if (!lines.length && !warn) return null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: ownersAndGM(actor),
    content: `<div class="foe-card wounds"><div class="fc-tag"><span>PIPBUCK // ${esc(tag)}</span><span>${esc(actor.name)}</span></div>
      ${lines.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("")}
      ${warn ? `<div class="fc-meta"><b class="warn">${esc(warn)}</b></div>` : ""}</div>`
  });
}

const OUT_TEXT = {
  itch: N_("Itching around the exposed areas."),
  calm: N_("Nothing substantive happens — yet."),
  neg: N_("The first negative effects begin (internal, easily missed)."),
  negGrow: N_("The negative effects grow (growths under the skin, less appetite)."),
  pos: N_("Visible positive changes (e.g. a bigger horn or stature)."),
  immune: N_("Immunity to disease: all malignant tumours become benign."),
  vestigial: N_("Vestigial alicorn traits: an enlarged horn, wings or a telepathic link with the Goddess.")
};

/** Rzut Szczęścia etapu skażenia (z danymi do cofnięcia przy przerzucie). */
async function luckRoll(actor, pos, req, before) {
  const mark = TAINT_MARKS[pos];
  const label = t("Taint, {mark}: Luck {step}", { mark: t(mark.label), step: req.crit ? t("(critical success only)") : req.step });
  const notes = [t(mark.desc)];
  return attrTest(actor, "luck", label, req.step, { notes, check: { kind: "taint", pos, before } });
}

/** Dawka skażenia: n kresek. source — opis (na kartę). */
export async function exposeTaint(actor, n, source = "") {
  if (!actor || actor.type === "vehicle") return null;
  if (taintImmuneRace(actor.system?.race)) return card(actor, [t("{name} is immune to taint (race).", { name: actor.name })]);
  const before = taintState(actor);
  const plan = dosePlan(before, n);
  if (!plan.list.length) return card(actor, [t("The taint slider is already at the end.")]);
  let cur = before;
  const outs = [];
  let lastCheck = null;
  for (const { pos, skip } of plan.list) {
    const req = need(cur, pos);
    let res = null;
    if (skip) res = "skip";
    else if (req.roll) {
      const id = foundry.utils.randomID();
      lastCheck = id;
      await actor.setFlag(F, "taint", { ...cur, lastCheck: id });
      res = await luckRoll(actor, pos, req.roll, { ...cur, lastCheck: id, checkId: id });
    }
    const r = step(cur, pos, res);
    cur = r.st;
    outs.push(...r.out.map(o => ({ o, pos })));
  }
  const a = alicornAfter(before, cur);
  cur = { ...a.st, lastCheck, last: { n, source, at: game.time?.worldTime ?? 0 } };
  await save(actor, cur);
  await announce(actor, before, cur, outs, { n, source, alicornChanged: a.changed, skipped: plan.list.filter(x => x.skip).length });
  return cur;
}

/** Karta dawki i karty decyzji MG dla ciężkich skutków. */
async function announce(actor, before, st, outs, { n, source, alicornChanged, skipped }) {
  const mark = TAINT_MARKS[st.pos];
  const lines = [
    t("Taint dose: +{n} (slider: {from} → {to}){src}", { n, from: t(TAINT_MARKS[before.pos].label), to: t(mark.label), src: source ? ` · ${source}` : "" }),
    skipped && st.alicorn === 0 ? t("Skipped stages count as failed rolls.") : "",
    ...[...new Set(outs.map(x => x.o))].filter(o => OUT_TEXT[o]).map(o => t(OUT_TEXT[o])),
    t("Successful Luck rolls: {n}", { n: st.wins })
  ].filter(Boolean);
  await card(actor, lines);
  const dog = isDogRace(actor.system?.race);
  if (outs.some(x => x.o === "mutation")) await deadly(actor, "taint-mutation", { source: "taint" }, {
    title: t("{name}: taint mutations (stage 3).", { name: actor.name }),
    text: t("Handbook p. 486: the Mutation hindrance with a suggestion — you describe it (taint mutations are totally random).")
  });
  const abom = outs.find(x => x.o === "abom" || x.o === "abomAuto");
  if (abom) await deadly(actor, "taint-abom", { auto: abom.o === "abomAuto" }, {
    title: t("{name}: deadly taint exposure (4th tick).", { name: actor.name }),
    text: abom.o === "abomAuto" ? t("Handbook p. 486: the stage was skipped — the END roll fails automatically: death.")
      : t("Handbook p. 486: END ¼ — failure: death; success: a slow transformation into an abomination and INT ¼ to keep the mind.")
  });
  if (outs.some(x => x.o === "final")) await deadly(actor, "taint-final", {}, {
    title: t("{name}: 5th diamond of taint.", { name: actor.name }),
    text: t("Handbook p. 486: Luck ¼ — critical success: an alicorn (hellhound); success: a centaur or another tainted creature; failure: a slow, painful death.")
  });
  if (alicornChanged) await deadly(actor, "taint-alicorn", { from: before.alicorn, to: st.alicorn }, {
    title: t("{name}: {what}, stage {n}.", { name: actor.name, what: dog ? t("hellhound transformation") : t("alicorn transformation"), n: st.alicorn }),
    text: st.alicorn >= 5 ? t("Handbook pp. 487, 612: full transformation — new race, Large{ch}; it takes 1–2 days.", { ch: dog ? "" : t(", Channeler") })
      : t("Handbook p. 612: a stage feature with the suggested quest perk; instead of negative effects each further dose is the next stage.")
  });
}

/** Oczyszczenie z Tenpony Tower. */
export async function cleanseTaint(actor) {
  const st = cleanse(taintState(actor));
  await save(actor, st);
  return card(actor, [t("{name} is cleansed of taint (Tenpony Tower): the slider is back at zero. Changes to the body remain.", { name: actor.name })]);
}

/** Przerzut kartą szczęścia (survival.onReroll): rozstrzygnij etap jeszcze raz, jeśli to ostatni rzut dawki. */
export async function taintReroll(actor, check, res) {
  const st = taintState(actor);
  if (!check?.before || st.lastCheck !== check.before.checkId) return null;
  const { checkId, lastCheck, ...raw } = check.before;
  const before = taintOf(raw);
  const r = step(before, check.pos, res);
  const a = alicornAfter(before, r.st);
  const next = { ...a.st, lastCheck: null, last: st.last };
  await save(actor, next);
  const lines = [t("Luck card: the taint roll is resolved again."), ...r.out.filter(o => OUT_TEXT[o]).map(o => t(OUT_TEXT[o])),
    t("Successful Luck rolls: {n}", { n: next.wins }), t("If a GM decision card from the first roll is still open, skip it.")];
  await card(actor, lines);
  if (a.changed) await deadly(actor, "taint-alicorn", { from: before.alicorn, to: next.alicorn }, { title: t("{name}: alicorn transformation, stage {n}.", { name: actor.name, n: next.alicorn }) });
  return next;
}

// ---------- skutki (akcje kart decyzji MG) ----------
const pick = list => list[Math.floor(Math.random() * list.length)];

/** Wada „Mutation” z podpowiedzią (radiation | taint). */
export async function addMutation(actor, source = "taint") {
  const idea = t(pick(MUTATION_IDEAS[source] ?? MUTATION_IDEAS.taint));
  const base = featureItem(resolveFeature("hindrance", "mutation", HINDRANCES.mutation, {}, { auto: true }));
  base.name = source === "radiation" ? t("Mutation (radiation)") : t("Mutation (taint)");
  base.system.description = `<p>${esc(t(HINDRANCES.mutation.desc))}</p><p><b>${esc(t("Suggestion"))}:</b> ${esc(idea)}</p><p><i>${esc(t("GM: describe the mutation here (handbook pp. 485, 610–611)."))}</i></p>`;
  base.flags = { [F]: { mutation: source } };
  await actor.createEmbeddedDocuments("Item", [base]);
  return idea;
}

function feature(name, desc, flag) {
  return { name, type: "feature", system: { kind: "other", active: true, effects: [], description: desc.map(d => `<p>${esc(d)}</p>`).join("") }, flags: { [F]: { taint: flag } } };
}

async function playMutation(actor, { source = "taint" } = {}) {
  const idea = await addMutation(actor, source);
  return card(actor, [t("A new mutation: the Mutation hindrance (−5 CHA with strangers when visible)."), t("Suggestion: {idea}", { idea })], { tag: source === "radiation" ? t("RADIATION") : t("TAINT") });
}

async function playAbom(actor, { auto = false } = {}) {
  const unstable = hasFeat(actor, /unstable genetics|niestabiln/i);
  const res = auto ? "fail" : await attrTest(actor, "end", t("Deadly taint exposure: END ¼"), "1/4",
    { mod: unstable ? -30 : 0, notes: [unstable ? t("Unstable Genetics −30") : "", t("failure — death (p. 486)")].filter(Boolean) });
  if (!passed(res)) {
    await toggleStatus(actor, "dead", true);
    return card(actor, [], { warn: t("{name} is killed outright by the taint.", { name: actor.name }) });
  }
  const mind = await attrTest(actor, "int", t("Abomination: INT ¼ to keep the mind"), "1/4", { notes: [t("failure — the intelligence is lost (p. 486)")] });
  const desc = [t("Slowly turning into an abomination (taint, p. 486). Life expectancy drops dramatically: without medical help the mutations kill within a month."),
    passed(mind) ? t("Kept their intelligence (maybe not their speech).") : t("Lost their intelligence — the GM decides how to play it.")];
  await actor.createEmbeddedDocuments("Item", [feature(t("Abomination (taint)"), desc, "abom")]);
  return card(actor, desc, { warn: t("{name} survives — as an abomination.", { name: actor.name }) });
}

async function playFinal(actor) {
  const res = await attrTest(actor, "luck", t("5th diamond of taint: Luck ¼"), "1/4", { notes: [t("critical success — alicorn; success — centaur; failure — death (p. 486)")] });
  if (res === "crit-success") return playAlicorn(actor, { from: taintState(actor).alicorn, to: 5 });
  if (passed(res)) {
    const desc = [t("Transforms into a centaur or another heavily tainted but survivable creature (p. 486). The GM picks the creature and changes the race.")];
    await actor.createEmbeddedDocuments("Item", [feature(t("Tainted creature"), desc, "creature")]);
    return card(actor, desc);
  }
  const desc = [t("Twisted so horribly that they slowly and painfully die (p. 486). The GM decides when.")];
  await actor.createEmbeddedDocuments("Item", [feature(t("Dying of taint"), desc, "dying")]);
  return card(actor, [], { warn: desc[0] });
}

/** Etapy przemiany (from+1 … to); etap 5 — rasa, Large (+ Channeler), Magic ≥ 50, Flight ≥ 25. */
async function playAlicorn(actor, { from = 0, to = 1 } = {}) {
  const dog = isDogRace(actor.system?.race);
  const items = [];
  const lines = [];
  for (let n = Math.max(1, from + 1); n <= Math.min(5, to); n++) {
    if (actor.items.some(i => i.flags?.[F]?.taint === `stage-${n}`)) continue;
    const s = ALICORN_STAGES[n];
    const fx = t((dog && s.hellhound) || s.alicorn);
    const desc = [fx, s.perk ? t("Suggested quest perk — {perk}: {desc}", { perk: t(s.perk), desc: t(s.perkDesc) }) : ""].filter(Boolean);
    items.push(feature(dog ? t("Hellhound transformation, stage {n}", { n }) : t("Alicorn transformation, stage {n}", { n }), desc, `stage-${n}`));
    lines.push(`${t("Stage {n}", { n })}: ${fx}`);
  }
  const update = {};
  if (to >= 5) {
    const race = String(actor.system?.race ?? "");
    update["system.race"] = dog ? t("Hellhound (from taint, was: {race})", { race }) : t("Alicorn (from taint, was: {race})", { race });
    items.push(featureItem(resolveFeature("trait", "large", TRAITS.large, {}, { auto: true })));
    if (!dog) {
      items.push(featureItem(resolveFeature("trait", "channeler", TRAITS.channeler, { variant: "cap4" }, { auto: true })));
      for (const [k, min] of [["magic", 50], ["flight", 25]]) {
        const sk = actor.system.skills?.[k];
        if (!sk) continue;
        update[`system.skills.${k}.known`] = true;
        if ((sk.rank ?? 0) < min) update[`system.skills.${k}.points`] = (Number(sk.points) || 0) + (min - (sk.rank ?? 0));
      }
    }
    lines.push(dog ? t("New race: hellhound; the Large trait.") : t("New race: alicorn; the Large and Channeler traits; Magic at least 50, Flight at least 25."));
    if (!dog) lines.push(t("The Goddess is in their head — she will try to make them her pawn (p. 487)."));
  }
  if (items.length) await actor.createEmbeddedDocuments("Item", items);
  if (Object.keys(update).length) await actor.update(update);
  await actor.setFlag(F, "taint.alicorn", Math.max(taintState(actor).alicorn, to));
  return card(actor, lines, { tag: dog ? t("HELLHOUND") : t("ALICORN") });
}

// ---------- okna MG ----------
const { DialogV2 } = foundry.applications.api;

export async function doseDialog(actor) {
  if (!game.user.isGM) return null;
  const st = taintState(actor);
  const content = `<div class="foe-taint-dlg">
    <p>${esc(t("Now: {mark} — {desc}", { mark: t(TAINT_MARKS[st.pos].label), desc: t(TAINT_MARKS[st.pos].desc) }))}</p>
    <label class="atk-row">${esc(t("Dose"))} <select name="n">${TAINT_DOSES.map(d => `<option value="${d.n}">+${d.n} — ${esc(t(d.label))}</option>`).join("")}
      <option value="custom">${esc(t("other (number of ticks below)"))}</option></select></label>
    <label class="atk-row">${esc(t("Ticks"))} <input type="number" name="custom" min="1" max="${TAINT_MAX}" value="1"></label>
    <label class="atk-row">${esc(t("Source (optional)"))} <input type="text" name="source" placeholder="${esc(t("e.g. tainted river water"))}"></label></div>`;
  const r = await DialogV2.prompt({
    window: { title: t("Taint dose: {name}", { name: actor.name }) }, content, classes: ["foe-rpg"],
    ok: { label: t("Apply"), callback: (ev, btn) => ({ n: btn.form.elements.n.value, custom: btn.form.elements.custom.value, source: btn.form.elements.source.value }) },
    rejectClose: false
  });
  if (!r) return null;
  const n = r.n === "custom" ? Number(r.custom) || 0 : Number(r.n);
  return n > 0 ? exposeTaint(actor, n, r.source.trim()) : null;
}

/** Ręczne ustawienie (postacie sprzed tej wersji, poprawki MG). */
export async function setTaintDialog(actor) {
  if (!game.user.isGM) return null;
  const st = taintState(actor);
  const content = `<div class="foe-taint-dlg">
    <label class="atk-row">${esc(t("Slider"))} <select name="pos">${TAINT_MARKS.map(m => `<option value="${m.pos}" ${m.pos === st.pos ? "selected" : ""}>${esc(t(m.label))}</option>`).join("")}</select></label>
    <label class="atk-row">${esc(t("Successful Luck rolls"))} <input type="number" name="wins" min="0" max="9" value="${st.wins}"></label>
    <label class="atk-row">${esc(t("Successes in a row"))} <input type="number" name="streak" min="0" max="9" value="${st.streak}"></label>
    <label class="atk-row atk-check"><input type="checkbox" name="bad" ${st.bad ? "checked" : ""}> <span>${esc(t("Failed a Luck roll (negative effects)"))}</span></label>
    <label class="atk-row">${esc(t("Alicorn stage"))} <select name="alicorn">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === st.alicorn ? "selected" : ""}>${n || "—"}</option>`).join("")}</select></label>
    <label class="atk-row atk-check"><input type="checkbox" name="immune" ${st.immune ? "checked" : ""}> <span>${esc(t("Immune to disease"))}</span></label>
    <p class="hint">${esc(t("Only the record changes — no rolls, no new features."))}</p></div>`;
  const r = await DialogV2.prompt({
    window: { title: t("Taint: {name}", { name: actor.name }) }, content, classes: ["foe-rpg"],
    ok: { label: t("Save"), callback: (ev, btn) => { const e = btn.form.elements; return { pos: +e.pos.value, wins: +e.wins.value || 0, streak: +e.streak.value || 0, bad: e.bad.checked, alicorn: +e.alicorn.value, immune: e.immune.checked }; } },
    rejectClose: false
  });
  if (r) await save(actor, { ...st, ...r, lastCheck: null });
  return r;
}

/** Dane do karty postaci. */
export function taintView(actor) {
  if (actor?.type !== "character") return null;
  const st = taintState(actor);
  const show = game.user.isGM || st.pos > 0 || st.alicorn > 0 || st.cleansed > 0;
  if (!show) return null;
  const dog = isDogRace(actor.system?.race);
  return {
    marks: TAINT_MARKS.map(m => ({ pos: m.pos, diamond: isDiamond(m.pos), on: m.pos <= st.pos && st.pos > 0, here: m.pos === st.pos && st.pos > 0, title: `${t(m.label)}: ${t(m.desc)}` })),
    here: `${t(TAINT_MARKS[st.pos].label)} — ${t(TAINT_MARKS[st.pos].desc)}`,
    stats: [t("Successful Luck rolls: {n}", { n: st.wins }), st.streak ? t("in a row: {n}", { n: st.streak }) : "", st.cleansed ? t("cleansed: {n}×", { n: st.cleansed }) : "",
      st.immune ? t("immune to disease") : ""].filter(Boolean).join(" · "),
    alicorn: !st.alicorn ? "" : dog ? t("Hellhound transformation: stage {n} of 5", { n: st.alicorn }) : t("Alicorn transformation: stage {n} of 5", { n: st.alicorn }),
    immuneRace: taintImmuneRace(actor.system?.race),
    gm: game.user.isGM
  };
}

export function registerTaintActions() {
  registerConfirmAction("taint-mutation", playMutation);
  registerConfirmAction("taint-abom", playAbom);
  registerConfirmAction("taint-final", playFinal);
  registerConfirmAction("taint-alicorn", playAlicorn);
}
