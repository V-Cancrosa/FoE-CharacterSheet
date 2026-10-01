# Fallout: Equestria RPG — minimalny system do Foundry VTT (v0.1, pod one-shot)
Nieoficjalny, fanowski. Zasady: Fallout: Equestria RPG System Core Rulebook v1.22.

Co działa: S.P.E.C.I.A.L. z progami MFD, 17 umiejętności (baza = 2×ATR + Luck/2 + 2, min 5; tag +15; próg MFD 1 = ranga + ATR×5),
rzut d100 pod próg z wyborem MFD (2 … 1/10) i modyfikatorem, krytyki 1–5 / 96–100, poziom osiągnięty do rzutów przeciwstawnych,
przerzut za kartę szczęścia z czatu (+5% zakresu krytyków za każdy przerzut), SATS, karty szczęścia, strain, rady,
rany i DT na lokacjach, bronie (atak + amunicja + obrażenia; Energy Weapons +ranga/10), pancerze, przedmioty, cechy/perki,
inicjatywa d100 − ¼ progu AGI, niższa działa pierwsza.

Czego NIE ma (świadomie): automatyczne liczenie ran z obrażeń, efekty okaleczeń, kompendia (rasy, perki, bronie), magia/alchemia,
wybór „dodaj/odejmij” do inicjatywy (domyślnie odejmuje).

Wygląd: ekran PipBucka. W Ustawieniach gry → Fallout: Equestria RPG każdy gracz wybiera kolor ekranu
(zielony / bursztynowy / niebieski / biały) i może wyłączyć linie skanowania. Rzuty na czacie pokazują
drabinkę MFD: wymagany poziom (CEL), osiągnięty poziom (WYNIK) i progi wszystkich poziomów.

Instalacja: w Foundry VTT → Game Systems → Install System wklej manifest URL:
`https://github.com/V-Cancrosa/FoE-CharacterSheet/releases/latest/download/system.json`
Ręcznie: wrzuć zawartość repo jako folder `foe-rpg` do `Data/systems/`.

Nowe wydanie: zmień `"version"` w system.json (np. na `0.2.0`) i scal to do `main` —
workflow `.github/workflows/release.yml` sam utworzy wydanie `v0.2.0` z plikami `foe-rpg.zip` i `system.json`.

Czcionki: VT323 i IBM Plex Mono (SIL Open Font License, pliki licencji w `fonts/`).
