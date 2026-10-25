/**
 * Logo powitalne terminala po załadowaniu systemu — emblemat i napis producenta (ASCII) oraz hasło.
 * Tylko znaki ASCII: czcionka ekranu (VT323) nie ma znaków blokowych ani ramek, a inne czcionki rozjechałyby kolumny.
 * Napisy: FIGlet (licencja BSD), emblematy rysowane ręcznie.
 */
import { t, N_ } from "./i18n.mjs";

const LOGOS = {
  office: {
    art: [
      "     *      /\\      *",
      "       ____/  \\____",
      "       \\          /",
      "    .   >        <   .",
      "       /___    ___\\",
      "           \\  /",
      "     *      \\/      *",
      "",
      " __  __      _      ____",
      "|  \\/  |    / \\    / ___|",
      "| |\\/| |   / _ \\   \\___ \\",
      "| |  | |_ / ___ \\ _ ___) |",
      "|_|  |_(_)_/   \\_(_)____(_)"
    ],
    tagline: [N_("MINISTRY OF ARCANE SCIENCE"), N_("KNOWLEDGE IS MAGIC")]
  },
  stabletec: {
    art: [
      "                  __    __",
      "               __|  |__|  |__",
      "              |   .------.   |",
      "            __|  /  .--.  \\  |__",
      "           |__  |  (    )  |  __|",
      "              |  \\  '--'  /  |",
      "              |__ '------' __|",
      "                 |__|  |__|",
      "",
      " ___ _____ _   ___ _    ___   _____ ___ ___",
      "/ __|_   _/_\\ | _ ) |  | __|_|_   _| __/ __|",
      "\\__ \\ | |/ _ \\| _ \\ |__| _|___|| | | _| (__",
      "|___/ |_/_/ \\_\\___/____|___|   |_| |___\\___|"
    ],
    tagline: [N_("SAFE. SOUND. STABLE.")]
  },
  military: {
    art: [
      "       .-------------.",
      "       |  \\       /  |",
      "       |  \\\\     //  |",
      "       |   \\\\   //   |",
      "       |  \\ \\\\ // /  |",
      "        \\  \\ \\V/ /  /",
      "         '. \\ V / .'",
      "           '-.v.-'",
      "",
      " __  ____          _________",
      "|  \\/  \\ \\        / /__   __|",
      "| \\  / |\\ \\  /\\  / /   | |",
      "| |\\/| | \\ \\/  \\/ /    | |",
      "| |  | |_ \\  /\\  / _   | | _",
      "|_|  |_(_) \\/  \\/ (_)  |_|(_)"
    ],
    tagline: [N_("MINISTRY OF WARTIME TECHNOLOGY"), N_("AUTHORIZED PERSONNEL ONLY")]
  },
  cloud: {
    art: [
      "        ___                     ___",
      "        \\  '--.__          __.--'  /",
      "         \\___    '--.__.--'    ___/",
      "          \\  '--.__  ()  __.--'  /",
      "           '--.__  '-..-'  __.--'",
      "                 '--.__.--'",
      "",
      "    _______   __________    ___ _    ________",
      "   / ____/ | / / ____/ /   /   | |  / / ____/",
      "  / __/ /  |/ / /   / /   / /| | | / / __/",
      " / /___/ /|  / /___/ /___/ ___ | |/ / /___",
      "/_____/_/ |_/\\____/_____/_/  |_|___/_____/"
    ],
    tagline: [N_("ENCLAVE — CLOUD SERVICES"), N_("SKY-LINK: CONNECTED")]
  },
  unics: {
    art: [
      "       .-----------.",
      "       | $ login:_ |",
      "       |           |",
      "       '-----------'",
      "         __|___|__",
      "",
      " _   _ _   _ ___ ____ ____",
      "| | | | \\ | |_ _/ ___/ ___|",
      "| | | |  \\| || | |   \\___ \\",
      "| |_| | |\\  || | |___ ___) |",
      " \\___/|_| \\_|___\\____|____/"
    ],
    tagline: ["UNICS LABS", N_("MULTI-USER SYSTEM 3.4")]   // en=pl
  },
  portable: {
    art: [
      "        .--------------------------.",
      "        | [#######.............] |==",
      "        '--------------------------'",
      "",
      " ___ _____ _   ___ _    ___   _____ ___ ___",
      "/ __|_   _/_\\ | _ ) |  | __|_|_   _| __/ __|",
      "\\__ \\ | |/ _ \\| _ \\ |__| _|___|| | | _| (__",
      "|___/ |_/_/ \\_\\___/____|___|   |_| |___\\___|"
    ],
    tagline: [N_("PORTABLE TERMINAL"), N_("LOW POWER MODE")]
  }
};

/** Logo dla typu terminala: { art (wiersze równej długości), width, tagline (przetłumaczone) }. */
export function bootLogo(kind = "office") {
  const logo = LOGOS[kind] ?? LOGOS.office;
  const width = Math.max(...logo.art.map(l => l.length));
  return { art: logo.art.map(l => l.padEnd(width)), width, tagline: logo.tagline.map(s => t(s)) };
}
