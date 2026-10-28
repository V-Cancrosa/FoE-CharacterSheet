/**
 * Portret na kartach aktorów (akcja „portrait”). Z modułem Tokenizer (vtta-tokenizer): kliknięcie otwiera Tokenizer,
 * Shift + klik — zwykły wybór pliku (albo odwrotnie, gdy w Tokenizerze wyłączono klikanie w awatar). Bez Tokenizera —
 * wybór pliku. Portret celowo nie ma data-edit: Tokenizer podpina się pod takie obrazki sam, a przy kartach
 * ApplicationV2 Shift + klik otwierało wtedy dwa okna wyboru pliku naraz.
 */
const TK = "vtta-tokenizer";
const tkSetting = key => { try { return game.settings.get(TK, key); } catch { return undefined; } };

/** API Tokenizera, jeśli moduł działa i ten użytkownik może go używać (jak w samym Tokenizerze). */
export function tokenizerApi() {
  const mod = game.modules.get(TK);
  const api = mod?.active ? mod.api : null;
  if (!api?.tokenizeDoc) return null;
  if (!game.user.can("FILES_UPLOAD") && tkSetting("disable-player")) return null;
  return api;
}

/**
 * Czy kliknięcie otwiera Tokenizer. globalDisabled — „disable-avatar-click” (świat),
 * userChoice — „disable-avatar-click-user”: "global" (jak świat), "tokenizer" albo "default" (wybór pliku).
 */
export function wantsTokenizer(shift, globalDisabled, userChoice) {
  const disabled = !userChoice || userChoice === "global" ? !!globalDisabled : userChoice === "default";
  return disabled ? !!shift : !shift;
}

/** Akcja karty: `this` to karta (ApplicationV2). */
export async function onPortrait(event, target) {
  const actor = this.document;
  if (!this.isEditable) return;
  const api = tokenizerApi();
  if (api && wantsTokenizer(event?.shiftKey, tkSetting("disable-avatar-click"), tkSetting("disable-avatar-click-user"))) {
    // token niepołączony z aktorem: Tokenizer edytuje obrazek tego tokena
    return api.tokenizeDoc(actor.isToken && actor.token ? { actor, token: actor.token } : actor);
  }
  const FP = foundry.applications.apps.FilePicker.implementation;
  return new FP({
    type: "image",
    current: actor.img,
    top: (this.position?.top ?? 0) + 40,
    left: (this.position?.left ?? 0) + 10,
    callback: path => {
      if (target) target.src = path;
      return actor.update({ img: path });
    }
  }).browse();
}
