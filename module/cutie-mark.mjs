/**
 * Znaczek (cutie mark) postaci: obrazek obok portretu na karcie i krótki opis talentu (podpowiedź po najechaniu).
 * Obrazek wybiera się przeglądarką plików Foundry; bez uprawnienia do niej — wklejając adres obrazka.
 */
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const elementOf = x => (x instanceof HTMLElement ? x : x?.element instanceof HTMLElement ? x.element : x?.[0] instanceof HTMLElement ? x[0] : null);

export async function editCutieMark(actor) {
  if (!actor?.isOwner) return ui.notifications.warn("Znaczek zmienia właściciel postaci.");
  const sys = actor.system;
  const canBrowse = !!game.user.can?.("FILES_BROWSE");
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const content = `
    <div class="foe-dialog cutie-mark-dialog">
      <div class="cm-preview">${sys.cutieMark ? `<img src="${esc(sys.cutieMark)}" alt="">` : "<span>brak</span>"}</div>
      <label class="atk-row">Obrazek <input type="text" name="img" value="${esc(sys.cutieMark)}" placeholder="${canBrowse ? "ścieżka do pliku" : "wklej adres obrazka (https://…)"}"></label>
      ${canBrowse && FP ? `<button type="button" class="cm-pick"><i class="fa-solid fa-folder-open"></i> Wybierz plik</button>` : `<p class="hint">Nie masz dostępu do przeglądarki plików — wklej adres obrazka albo poproś MG o wgranie pliku.</p>`}
      <label class="atk-row">Opis <input type="text" name="text" value="${esc(sys.cutieMarkText)}" placeholder="np. klucz francuski — talent do naprawy"></label>
    </div>`;
  const render = (event, dialog) => {
    const root = elementOf(dialog) ?? elementOf(event?.target);
    const input = root?.querySelector("input[name=img]");
    const preview = root?.querySelector(".cm-preview");
    const show = path => { if (preview) preview.innerHTML = path ? `<img src="${esc(path)}" alt="">` : "<span>brak</span>"; };
    input?.addEventListener("change", () => show(input.value.trim()));
    root?.querySelector(".cm-pick")?.addEventListener("click", ev => {
      ev.preventDefault();
      new FP({ type: "image", current: input?.value || "", callback: path => { if (input) input.value = path; show(path); } }).browse();
    });
  };
  const pick = await DialogV2.wait({
    window: { title: `Znaczek: ${actor.name}` }, classes: ["foe-rpg", "foe-roll-dialog"], position: { width: 420 }, rejectClose: false, content, render,
    buttons: [
      { action: "save", label: "Zapisz", icon: "fa-solid fa-check", default: true,
        callback: (ev, btn) => ({ img: btn.form.elements.img.value.trim(), text: btn.form.elements.text.value.trim() }) },
      { action: "clear", label: "Usuń znaczek", icon: "fa-solid fa-eraser", callback: () => ({ img: "", text: "" }) }
    ]
  });
  if (!pick || typeof pick !== "object") return null;
  return actor.update({ "system.cutieMark": pick.img, "system.cutieMarkText": pick.text });
}
