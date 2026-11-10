/**
 * Bramka przeskoku czasu. Upływ czasu poniżej progu (rundy walki, minuty, marsz) liczy się jak zwykle. Przeskok od progu
 * (domyślnie 1 godzina) nie jest liczony od razu:
 *   - system sprawdza każdą postać gracza: kiedy ostatnio jadła i piła, czego potrzebuje na ten czas, co ma w plecaku,
 *     dawka promieniowania, zaległe rzuty, utrzymanie podmieńców — jeśli nikt niczego nie potrzebuje, liczy po cichu,
 *   - jeśli wszyscy potrzebujący stoją na scenie „wyżywienie zapewnione” (osada) — rozlicza to sam, z kartą dla MG,
 *   - inaczej zamraża liczniki (jakby czas nie minął) i pyta MG: dla każdej postaci „z zapasów / zapewnione / bez
 *     jedzenia (licz) / pomiń”, osobno promieniowanie i utrzymanie podmieńców. Bez decyzji nic się nie dzieje; karta
 *     na czacie (tylko MG) pozwala rozliczyć później.
 */
import { t, tn, N_ } from "./i18n.mjs";
import { timeTick, skipInfo, freezeSkip, resolveSkip, trackedActors, survivalCard, whenText, rateText } from "./survival.mjs";
import { loveUpkeep, changelingsDue, freezeLove, resolveLove } from "./shadow.mjs";

const F = "foe-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const threshold = () => { try { return Math.max(0, Number(game.settings.get(F, "timeSkipHours")) || 0) * 3600; } catch { return 3600; } };
const days = (from, to) => Math.max(0, Math.floor(to / 86400) - Math.floor(from / 86400));

/** „2 dni 6 h”, „3 h 30 min”. */
export function durationText(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return [d ? tn(d, "{n} day", "{n} days") : "", h ? `${h} h` : "", !d && m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

const FOOD = { supplies: N_("From supplies"), provided: N_("Provided (settlement)"), count: N_("No food or water (count)"), skip: N_("Skip this time") };

/** Wiersz podglądu: co postać jadła i piła, czego potrzebuje, co weźmie i czego zabraknie. */
function rowHtml(i) {
  const ate = i.ghoul ? t("ghoul — lives on radiation") : t("meal: {when} (today {n})", { when: whenText(i.lastMeal), n: i.mealsToday });
  const drank = i.until === null ? "" : i.stageNow ? t("dehydration: stage {n}", { n: i.stageNow })
    : t("drink: {when} (hydrated until {at})", { when: whenText(i.lastDrink), at: whenText(i.until) });
  const need = [i.needs.meals ? tn(i.needs.meals, "{n} meal", "{n} meals") : "", i.needs.drinks ? tn(i.needs.drinks, "{n} drink", "{n} drinks") : ""].filter(Boolean).join(", ") || t("nothing");
  const take = i.pick.use.length ? i.pick.use.map(u => `${esc(u.name)} ×${u.n}`).join(", ") : "—";
  const short = [
    i.starveDays ? tn(i.starveDays, "hunger: {n} day", "hunger: {n} days") : "",
    i.stageAfter ? t("dehydration: stage {n}", { n: i.stageAfter }) : ""
  ].filter(Boolean).join(", ");
  const def = i.provided ? "provided" : "supplies";
  return `<tr><td><b>${esc(i.name)}</b>${i.provided ? ` <small class="skip-tag">${t("settlement")}</small>` : ""}</td>
    <td><small>${esc(ate)}${drank ? `<br>${esc(drank)}` : ""}</small></td>
    <td><small>${esc(need)}</small></td>
    <td><small>${take}${short ? `<br><b class="warn">${esc(t("short — {list}", { list: short }))}</b>` : ""}</small></td>
    <td><select name="food.${i.uuid}" class="skip-food">${Object.entries(FOOD).map(([k, l]) => `<option value="${k}"${k === def ? " selected" : ""}>${t(l)}</option>`).join("")}</select></td></tr>`;
}

/** Okno MG: decyzje dla przeskoku. Zwraca { food: { uuid: mode }, rads, love } albo null (później). */
async function askGM(skip) {
  const { from, to, infos, love } = skip;
  const rads = infos.filter(i => i.rate > 0 || i.due);
  const content = `<div class="foe-dialog skip-dlg">
    <p>${esc(t("Time skip: {d}. The counters are frozen until you decide.", { d: durationText(to - from) }))}</p>
    <label class="atk-row">${t("Food and water — everyone")} <select class="skip-all"><option value="">—</option>${Object.entries(FOOD).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join("")}</select></label>
    <table class="skip-table"><thead><tr><th>${t("Character")}</th><th>${t("Last ate / drank")}</th><th>${t("Needs")}</th><th>${t("From supplies")}</th><th>${t("Decision")}</th></tr></thead>
      <tbody>${infos.map(rowHtml).join("")}</tbody></table>
    ${rads.length ? `<label class="atk-row">${t("Radiation during the skip")} <select name="rads"><option value="count"${to - from < 6 * 3600 ? " selected" : ""}>${t("count (they were on this scene)")}</option><option value="skip"${to - from >= 6 * 3600 ? " selected" : ""}>${t("skip (they were elsewhere)")}</option></select></label>
      <p class="hint">${esc(rads.map(i => i.rate ? t("{name}: {rate} → +{n} rads", { name: i.name, rate: rateText(i.rate), n: i.rads }) : t("{name}: a radiation roll falls due", { name: i.name })).join(" · "))}</p>` : ""}
    ${love.length ? `<label class="atk-row">${t("Changeling upkeep (−1 love a day)")} <select name="love"><option value="count" selected>${t("count")}</option><option value="skip">${t("skip")}</option></select></label>` : ""}
    <p class="hint">${t("“Later” changes nothing — the counters stay frozen; the card in the chat (GM only) lets you settle it later.")}</p>
  </div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title: t("Time skip") }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 820 }, rejectClose: false, content,
    render: (ev, dialog) => {
      const root = dialog instanceof HTMLElement ? dialog : dialog?.element ?? ev?.target?.element;
      const all = root?.querySelector?.(".skip-all");
      all?.addEventListener("change", () => { if (all.value) for (const s of root.querySelectorAll(".skip-food")) s.value = all.value; });
    },
    buttons: [
      { action: "ok", label: t("Apply"), icon: "fa-solid fa-check", default: true, callback: (ev, btn) => {
        const el = btn.form.elements;
        const food = {};
        for (const i of infos) food[i.uuid] = el[`food.${i.uuid}`]?.value ?? "skip";
        return { food, rads: el.rads?.value ?? "skip", love: el.love?.value ?? "count" };
      } },
      { action: "later", label: t("Later"), icon: "fa-solid fa-clock" }
    ]
  }).then(r => (r && typeof r === "object" ? r : null));
}

/** Rozliczenie przeskoku według decyzji (aktywny MG). */
async function apply(skip, choice) {
  const { from, to } = skip;
  const summary = [];
  for (const i of skip.infos) {
    const actor = await fromUuid(i.uuid).catch(() => null);
    if (!actor) continue;
    const mode = choice.food[i.uuid] ?? "skip";
    try {
      const lines = await resolveSkip(actor, skip.snaps?.[i.uuid] ?? null, { food: mode, rads: choice.rads }, { from, to });
      if (lines.length) await survivalCard(actor, lines, { tag: t("TIME SKIP") });
      summary.push(`${i.name}: ${t(FOOD[mode])}`);
    } catch (err) { console.error(`${F} | time skip: ${i.name}`, err); }
  }
  for (const uuid of skip.love ?? []) {
    const actor = await fromUuid(uuid).catch(() => null);
    if (actor && choice.love === "count") await resolveLove(actor, days(from, to), game.time.worldTime);
  }
  if (skip.love?.length) summary.push(t("changeling upkeep: {c}", { c: choice.love === "count" ? t("count") : t("skip") }));
  if (skip.infos.some(i => i.rate > 0 || i.due)) summary.push(t("radiation: {c}", { c: choice.rads === "count" ? t("count") : t("skip") }));
  return summary;
}

/** Karta MG o przeskoku (z przyciskiem „Rozlicz”, dopóki otwarty). */
function skipCard(skip, { summary = null } = {}) {
  const open = skip.state === "open";
  return `<div class="foe-card wounds foe-skip"><div class="fc-tag"><span>PIPBUCK // ${t("TIME SKIP")}</span><span>${esc(durationText(skip.to - skip.from))}</span></div>
    <h3>${esc(open ? t("Time skip: {d} — waiting for the GM's decision.", { d: durationText(skip.to - skip.from) }) : t("Time skip: {d} — settled.", { d: durationText(skip.to - skip.from) }))}</h3>
    ${summary ? summary.map(l => `<div class="fc-meta">${esc(l)}</div>`).join("") : `<div class="fc-meta">${esc(t("Food, water, radiation and changeling upkeep are frozen for this time until you decide."))}</div>`}
    ${open ? `<div class="fc-confirm"><button type="button" class="foe-luck" data-action="foeSkipSettle"><i class="fa-solid fa-clock-rotate-left"></i> ${t("Settle the skip")}</button></div>` : ""}</div>`;
}

/** Decyzja MG dla zapisanego przeskoku (z karty albo od razu po przeskoku). */
export async function settleSkip(message) {
  const skip = message?.flags?.[F]?.skip;
  if (!skip || skip.state !== "open" || !game.user?.isGM) return null;
  const choice = await askGM(skip);
  if (!choice) return null;
  if (message.flags?.[F]?.skip?.state !== "open") return null;   // ktoś zdążył przed nami
  await message.update({ [`flags.${F}.skip.state`]: "busy" });
  let summary;
  try { summary = await apply(skip, choice); } catch (err) { console.error(`${F} | time skip`, err); summary = [t("Error while settling — see the console (F12).")]; }
  return message.update({ content: skipCard({ ...skip, state: "done" }, { summary }), [`flags.${F}.skip.state`]: "done" });
}

/** Przeskok czasu od progu: po cichu, osada albo decyzja MG. */
export async function handleSkip(from, to) {
  const actors = trackedActors();
  const infos = actors.map(a => skipInfo(a, from, to));
  const needy = infos.filter(i => i.any);
  // nikt niczego nie potrzebuje (samo utrzymanie podmieńców to za mało, żeby pytać) — po cichu
  if (!needy.length) {
    await timeTick(to, to - from);
    return loveUpkeep(to);
  }
  const love = changelingsDue(from, to);
  const d = days(from, to);
  const snaps = {};
  for (const a of actors) snaps[a.uuid] = await freezeSkip(a, from, to);
  for (const a of love) await freezeLove(a, d);
  const skip = { from, to, infos, snaps, love: love.map(a => a.uuid), state: "open" };
  // osada: wszyscy potrzebujący na scenie z wyżywieniem — bez pytania
  if (needy.every(i => i.provided)) {
    const food = Object.fromEntries(infos.map(i => [i.uuid, i.provided ? "provided" : "supplies"]));
    const summary = await apply(skip, { food, rads: "count", love: "count" });
    return ChatMessage.create({ whisper: gmIds(), content: skipCard({ ...skip, state: "done" }, { summary: [t("Settlement: food and water provided."), ...summary] }), flags: { [F]: { skip: { from, to, state: "done" } } } });
  }
  const msg = await ChatMessage.create({ whisper: gmIds(), content: skipCard(skip), flags: { [F]: { skip } } });
  return settleSkip(msg);
}

export function registerTimeSkipSettings() {
  game.settings.register(F, "timeSkipHours", {
    name: "Time skip: ask the GM from (hours)",
    hint: "When world time jumps by at least this much at once (the calendar, a time skip), food, water, radiation and changeling upkeep wait for the GM's decision: each character eats from their supplies, gets fed in a settlement, goes without, or the time is skipped. If nobody needs anything, it is counted quietly. 0 — always count at once (no questions).",
    scope: "world", config: true, type: Number, default: 1, range: { min: 0, max: 48, step: 1 }
  });
}

export function registerTimeSkipHooks() {
  Hooks.on("updateWorldTime", (worldTime, dt) => {
    if (!game.users.activeGM?.isSelf) return;
    const step = Number(dt) || 0;
    (async () => {
      const limit = threshold();
      if (limit && step >= limit) return handleSkip(worldTime - step, worldTime);
      await timeTick(worldTime, step);
      await loveUpkeep(worldTime);
    })().catch(err => console.error(`${F} | time`, err));
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const skip = message?.flags?.[F]?.skip;
    if (!skip) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const btn = root?.querySelector?.("[data-action=foeSkipSettle]");
    if (!btn) return;
    if (!game.user.isGM || skip.state !== "open") { btn.closest(".fc-confirm")?.remove(); return; }
    btn.addEventListener("click", ev => { ev.preventDefault(); settleSkip(message).catch(err => console.error(`${F} | time skip`, err)); });
  });
}
