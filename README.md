# Fallout: Equestria RPG — minimalny system do Foundry VTT (v0.1, pod one-shot)
Nieoficjalny, fanowski. Zasady: Fallout: Equestria RPG System Core Rulebook v1.22.

Co działa: S.P.E.C.I.A.L. z progami MFD, 17 umiejętności (baza = 2×ATR + Luck/2 + 2, min 5; tag +15; próg MFD 1 = ranga + ATR×5),
rzut d100 pod próg z wyborem MFD (2 … 1/10) i modyfikatorem, krytyki 1–5 / 96–100, poziom osiągnięty do rzutów przeciwstawnych,
przerzut za kartę szczęścia z czatu (+5% zakresu krytyków za każdy przerzut), SATS, karty szczęścia, strain, rady,
rany i DT na lokacjach, bronie (atak + amunicja + obrażenia; Energy Weapons +ranga/10), pancerze, przedmioty, cechy/perki,
inicjatywa d100 − ¼ progu AGI, niższa działa pierwsza.

Czego NIE ma (świadomie): automatyczne liczenie ran z obrażeń, efekty okaleczeń, kompendia (rasy, perki, bronie), magia/alchemia,
wybór „dodaj/odejmij” do inicjatywy (domyślnie odejmuje).

Kreator postaci: po utworzeniu nowej postaci otwiera się kreator (można go też uruchomić przyciskiem KREATOR na karcie).
- Postać gracza, 5 kroków według rozdziału 2 podręcznika: rasa (premie do atrybutów i umiejętności, umiejętności rasowe),
  wady i cechy (punkty tworzenia), S.P.E.C.I.A.L. (28 punktów, limity 9/10/12), umiejętności z tagiem, podsumowanie.
- NPC: archetyp + rasa + poziom („Rapid NPC Generation”); punkty z awansów rozdzielane automatycznie (10 + INT/2 na poziom).
- W ustawieniach świata: włączanie kreatora przy nowej postaci i pula punktów (32 / 35 / 37).

Efekty cech, wad i perków: każda cecha na karcie ma listę efektów, które karta dolicza sama
(atrybuty, rangi, modyfikatory rzutów, celność, kroki MFD, krytyki, inicjatywa, karty szczęścia, obrażenia na ranę,
udźwig, ruch, SATS, DT, odporność na promieniowanie, strain, uniki). Efekty sytuacyjne (np. „Fobia aktywna −10”)
pojawiają się w oknie rzutu jako pola do zaznaczenia. Kreator nadaje efekty wszystkim wadom i cechom z podręcznika
(s. 67–124) razem z wyborami gracza; własne cechy i perki można opisać edytorem efektów w karcie cechy.
Kwadracik przy cesze na karcie wyłącza jej efekty.

Wygląd: ekran PipBucka. W Ustawieniach gry → Fallout: Equestria RPG każdy gracz wybiera kolor ekranu
(zielony / bursztynowy / niebieski / biały) i może wyłączyć linie skanowania. Rzuty na czacie pokazują
drabinkę MFD: wymagany poziom (CEL), osiągnięty poziom (WYNIK) i progi wszystkich poziomów.

Instalacja: w Foundry VTT → Game Systems → Install System wklej manifest URL:
`https://github.com/V-Cancrosa/FoE-CharacterSheet/releases/latest/download/system.json`
Ręcznie: wrzuć zawartość repo jako folder `foe-rpg` do `Data/systems/`.

Nowe wydanie: zmień `"version"` w system.json (np. na `0.2.0`) i scal to do `main` —
workflow `.github/workflows/release.yml` sam utworzy wydanie `v0.2.0` z plikami `foe-rpg.zip` i `system.json`.

Czcionki: VT323 i IBM Plex Mono (SIL Open Font License, pliki licencji w `fonts/`).
