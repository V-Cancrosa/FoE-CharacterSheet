/**
 * Znaczek (cutie mark) postaci: obrazek obok portretu na karcie i krótki opis talentu (podpowiedź po najechaniu).
 * Obrazek wybiera się przeglądarką plików Foundry; bez uprawnienia do niej — wklejając adres obrazka.
 */
import { t } from "./i18n.mjs";
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : x?.[0] instanceof HTMLElement ? x[0] : null);

export async function editCutieMark(actor) {
  if (!actor?.isOwner) return ui.notifications.warn(t("The cutie mark is changed by the character's owner."));
  const sys = actor.system;
  const canBrowse = !!game.user.can?.("FILES_BROWSE");
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const content = `
    <div class="foe-dialog cutie-mark-dialog">
      <div class="cm-preview">${sys.cutieMark ? `<img src="${esc(sys.cutieMark)}" alt="">` : `<span>${t("none")}</span>`}</div>
      <label class="atk-row">${t("Image")} <input type="text" name="img" value="${esc(sys.cutieMark)}" placeholder="${canBrowse ? t("path to the file") : t("paste the image address (https://…)")}"></label>
      ${canBrowse && FP ? `<button type="button" class="cm-pick"><i class="fa-solid fa-folder-open"></i> ${t("Choose a file")}</button>` : `<p class="hint">${t("You don't have access to the file browser — paste the image address or ask the GM to upload the file.")}</p>`}
      <label class="atk-row">${t("Description")} <input type="text" name="text" value="${esc(sys.cutieMarkText)}" placeholder="${t("e.g. a wrench — a talent for repair")}"></label>
    </div>`;
  const render = (event, dialog) => {
    const root = elementOf(dialog) ?? elementOf(event?.target);
    const input = root?.querySelector("input[name=img]");
    const preview = root?.querySelector(".cm-preview");
    const show = path => { if (preview) preview.innerHTML = path ? `<img src="${esc(path)}" alt="">` : `<span>${t("none")}</span>`; };
    input?.addEventListener("change", () => show(input.value.trim()));
    root?.querySelector(".cm-pick")?.addEventListener("click", ev => {
      ev.preventDefault();
      new FP({ type: "image", current: input?.value || "", callback: path => { if (input) input.value = path; show(path); } }).browse();
    });
  };
  const pick = await DialogV2.wait({
    window: { title: t("Cutie mark: {text}", { text: actor.name }) }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false, content, render,
    buttons: [
      { action: "save", label: t("Save"), icon: "fa-solid fa-check", default: true,
        callback: (ev, btn) => ({ img: btn.form.elements.img.value.trim(), text: btn.form.elements.text.value.trim() }) },
      { action: "clear", label: t("Remove cutie mark"), icon: "fa-solid fa-eraser", callback: () => ({ img: "", text: "" }) }
    ]
  });
  if (!pick || typeof pick !== "object") return null;
  return actor.update({ "system.cutieMark": pick.img, "system.cutieMarkText": pick.text });
}
