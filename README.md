# Fallout: Equestria RPG — system do Foundry VTT
Nieoficjalny, fanowski. Zasady: Fallout: Equestria RPG System Core Rulebook v1.22.

Co działa: S.P.E.C.I.A.L. z progami MFD, 17 umiejętności (baza = 2×ATR + Luck/2 + 2, min 5; tag +15; próg MFD 1 = ranga + ATR×5),
rzut d100 pod próg z wyborem MFD (2 … 1/10) i modyfikatorem, krytyki 1–5 / 96–100, poziom osiągnięty do rzutów przeciwstawnych,
przerzut za kartę szczęścia z czatu (+5% zakresu krytyków za każdy przerzut), SATS, karty szczęścia, strain, rady,
rany, okaleczenia i DT na lokacjach, bronie, pancerze, ekwipunek, cechy/perki, inicjatywa d100 − ¼ progu AGI (niższa działa pierwsza).

Katalog przedmiotów: 182 bronie, 288 ubrań, pancerzy, hełmów i akcesoriów oraz 722 przedmioty z podręcznika
(amunicja, leki i używki, jedzenie, książki, PipBucki, siodła bojowe…). Przycisk KATALOG na karcie postaci (zakładki
Walka i Ekwipunek) albo „Katalog FoE” w zakładce Przedmioty (dla MG): wyszukiwanie, filtr rodzaju, „Dodaj” za darmo
albo „Kup” za kapsle postaci. Ten sam ekwipunek łączy się w stos; broń przychodzi naładowana.

Walka:
- Atak (kliknij nazwę broni): okno z SATS (koszt AP z broni; znosi kary otoczenia i pośpiechu), odległością (każdy przedział
  zasięgu po pierwszym = 1 krok MFD trudniej), strzałem celowanym (głowa −2 kroki i ×1,5 obrażeń, nogi, skrzydła, róg, oko,
  serce ×2) albo losową lokacją k20 według rasy celu i karą za zbyt ciężką broń (1 krok za każde 2 lb ponad 2×STR).
  Broń obszarowa ma domyślnie MFD ¾. Atak sam odejmuje amunicję: seria „/N” zużywa N naboi, a gdy ich brakuje, broń traci kości;
  granaty i miny zużywają sztuki.
- Obrażenia: „STR” w formule broni wręcz rośnie z rangą Melee/Unarmed (×1 … ×5), Small Guns, Energy Weapons i Big Guns
  dodają rangę/10, materiały wybuchowe zadają 25–100% rzutu według rangi. Mnożniki (krytyk z broni, w SATS wręcz ×2,
  głowa ×1,5, serce ×2) się sumują.
- „Nanieś obrażenia” na karcie obrażeń: cel z namierzonego tokena (klawisz T), lokacja z ataku, DT celu podstawia się samo
  (broń magiczna ignoruje 5 DT), rany = obrażenia po DT / obrażenia na ranę celu. Wybuch trafia każdą lokację osobno.
  Opcjonalnie degradacja pancerza (−1 DT na przebitej lokacji). Śmierć oznacza token.
- Przeładowanie (ikonka przy amunicji): bierze naboje z ekwipunku o tym samym typie amunicji; akcją (pół magazynka
  w Internal, 1d4+1 naboi w Breech) albo w SATS za AP (DTM 10, DTM+5 15, Revolver 20, Internal 20, Breech 25).
- SATS odnawia się o 5 AP na rundę walki (liczy MG), „Nowa sesja” uzupełnia SATS i karty szczęścia.
- W ustawieniach świata: losowe lokacje trafień i degradacja pancerza (zasady opcjonalne).

Efekty specjalne broni (s. 200–202) — broń z katalogu ma je ustawione z przypisów podręcznika, własną broń zaznaczasz w jej karcie:
- Ogień: podpala cel na 1d4 rundy, 3d12 na każdą lokację na koniec rundy (pancerz metalowy chroni, jeśli atak go nie przebił);
  gaszenie przyciskiem „Ugaś” (AGI ½).
- Elektryczność: na koniec rundy 3d12 na każdą lokację (pancerz metalowy nie chroni), przeciw robotom +6d12 od razu i 6d12 potem.
- Promieniowanie: 25 radów za każde 10 obrażeń po DT, minus odporność celu.
- Dezintegracja (broń energetyczna): rany, które okaleczyłyby lokację, albo trafienie zabójcze zamieniają cel w popiół;
  pistolet dezintegrujący i Star Disintegrator — zawsze przy krytyku.
- Ogłuszenie (shock): zamiast śmierci utrata przytomności, krytyk +1d10 ran.
- Trucizna: radskorpion (END ¾, potem 1 rana na rundę w głowę lub tułów) albo mantykora (END ½, paraliż; „Rzut END” na karcie).
- Przewracanie (np. karabin Gaussa); znaczniki: ukrywalna, luneta, tłumik, zapalnik, mina.
Stany widać w zakładce Walka (z przyciskami) i jako ikony na tokenie; w walce działają same przy zmianie rundy.

Pancerz: założony (kwadracik w zakładce Ekwipunek) sam daje DT na lokacjach, które osłania — liczy się najwyższe DT,
a naturalne DT z cech się dodaje — oraz swoje premie (tymczasowe atrybuty, umiejętności, odporność na promieniowanie, SATS).
Z każdej kategorii (ubranie, lekki, średni, ciężki) nosi się jedną warstwę; każda kolejna to −1 AGI, a od trzeciej −1 STR.

Rany: wpisane w tabeli lokacji albo naniesione z czatu. Połowa END ran okalecza lokację i nakłada kary na rzuty
(głowa: −2 kroki INT/PER/CHA i −1 krok celności; tułów: −2 kroki END/STR/AGI; noga: −5 ft ruchu, −1 krok Sneak
i siodła bojowego; skrzydła: bez lotu, −2 kroki Flight; zaklęcia trudniejsze), END ran w głowie albo tułowiu to śmierć,
w kończynie — jej utrata, 4×END ran łącznie — utrata przytomności.

Obciążenie: waga broni, pancerzy i ekwipunku (amunicja i kapsle nic nie ważą); przeciążenie −5 ft ruchu za każde
rozpoczęte 10 lb ponad udźwig, skradanie −5 za każde rozpoczęte 10 lb ponad 50.

Czego NIE ma (jeszcze): kompendia ras i perków poza kreatorem, magia i alchemia, unikalne zdolności pojedynczych broni
(są w opisie broni z katalogu), spadek obrażeń z odległością od wybuchu (licz ręcznie), wybór „dodaj/odejmij”
do inicjatywy (domyślnie odejmuje).

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
