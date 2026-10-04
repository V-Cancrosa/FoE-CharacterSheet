# Fallout: Equestria RPG — system do Foundry VTT
Nieoficjalny, fanowski. Zasady: Fallout: Equestria RPG System Core Rulebook v1.22.

Co działa: S.P.E.C.I.A.L. z progami MFD, 17 umiejętności (baza = 2×ATR + Luck/2 + 2, min 5; tag +15; próg MFD 1 = ranga + ATR×5),
rzut d100 pod próg z wyborem MFD (2 … 1/10) i modyfikatorem, krytyki 1–5 / 96–100, poziom osiągnięty do rzutów przeciwstawnych,
przerzut za kartę szczęścia z czatu (+5% zakresu krytyków za każdy przerzut), SATS, karty szczęścia, strain, rady,
rany, okaleczenia i DT na lokacjach, bronie, pancerze, ekwipunek, cechy/perki.

Inicjatywa i tracker walki (s. 436–437): d100, a po rzucie gracz wybiera, czy odjąć (szybciej), czy dodać (później)
próg AGI ¼ albo własną wartość; premie i kary z cech liczą się same, niższa inicjatywa działa pierwsza, remis — wyższe AGI.
Rzut: przycisk „Inicjatywa” na karcie (Statystyki albo Walka) — dodaje token z tej sceny do walki i rzuca; gdy walki nie ma, MG
tworzy ją tym samym kliknięciem. Można też rzucać ikoną kostki w trackerze walki (zakładka z mieczami).
MG rzucający za NPC i „rzuć wszystkim” odejmuje automatycznie. W trackerze każdy walczący ma 2 kropki akcji
(atak, przeładowanie i gaszenie odhaczają je same, kliknięcie odhacza ręcznie, nowa runda je odnawia).
Przycisk „Zaskoczenie” w trackerze: zaskoczeni nie działają, atakujący mają 1 akcję, po tej rundzie wszyscy rzucają od nowa.
Zasada opcjonalna w ustawieniach: ten sam rząd dziesiątek inicjatywy = akcje jednoczesne (tracker je oznacza).

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

Magia jednorożców i alikornów (rozdz. 5): katalog 235 zaklęć z podręcznika (poziomy 0–4; koszt strain, koszt SATS, wymagany
poziom, prekursory, obrażenia) w zakładce „Zaklęcia” katalogu, zakładka „Magia” na karcie postaci.
- Pula strain liczy się sama: END + INT + 2 (alikorny +5) + cechy (np. Channeler); „+1 strain” to godzina odpoczynku (Shift — do pełna).
- Rzucanie: rzut Magic, overglow 0–3 (każda warstwa ×2 efekty i koszt; 1 warstwa = SATS ×3, więcej = 2 akcje i bez SATS),
  krytyk daje darmową warstwę, porażka — zaklęcie nie wychodzi (krytyczna porażka zabiera strain).
- Za mało strain: każdy brakujący punkt = krok MFD trudniej; porażka oznacza wypalenie (bez magii 1d4 tygodnie).
- Podtrzymywane zaklęcia (tarcze, niewidzialność…): koszt na początku każdej rundy, każde dolicza warstwę kosztu do nowych zaklęć
  i −1 krok do celności, INT i AGI; brak strain — zaklęcie gaśnie.
- Zaklęcia z obrażeniami: przycisk „Wyceluj (Magic)” (przedział zasięgu 20 ft, lokacje, strzały celowane) i zwykła karta obrażeń
  z „Nanieś obrażenia”; INT i ranga Magic/10 w formułach liczą się same, overglow podwaja obrażenia.
- Procent nauki: +1% za każde rzucenie; rzut ≤ procent podpowiada, że można nauczyć się zaklęcia, dla którego to jest prekursor.
- Limity znanych zaklęć (poziom 2 — INT, 3 — INT/3, 4 — jedno; Magical Savant / Arcane Devotion podwajają) — ostrzeżenie przy dodawaniu.
- Kreator: jednorożce dostają Telekinezę, alikorny z Unity — swoją listę startową; zaklęcie poziomu 1 wybierasz z katalogu.

Magia zebr i alchemia (s. 327–332): katalog 128 receptur w zakładce „Receptury zebr”, sekcja zebr w zakładce „Magia”.
- Zamiast strain — składniki czterech rzadkości (niska, średnia, wysoka, bardzo wysoka) jako przedmioty w Ekwipunku.
- Przygotowanie zużywa 1d4+1 składników (−1 za każde 25 rang Magic, min. 1); brakujące zastępują rzadsze (1:1)
  albo cztery o stopień pospolitsze. Czas: mikstury 5d12 min, talizmany 15 × (poziom)k4 min, zadania rytualne 15d20 min.
- Wyroby (wywary, mikstury, talizmany) trafiają do Ekwipunku z przyciskiem „Użyj”: wypicie 15 AP, posmarowanie 25 AP,
  rzut 35 AP jak granat (Magic albo Explosives, przedział zasięgu 10 ft, obrażenia z receptury).
- Rytuały („Cast”) odprawia się od razu w walce: składniki + rzut Magic, 1 akcja albo 40 AP w SATS; z obrażeniami — przycisk na karcie.
- „Szukaj składników”: Survival albo Magic, MFD zależy od terenu (tabela XXV), każdy stopień rzadkości o krok trudniej, sukces = 1d4 składników.
- Kreator przypomina, ile receptur poziomu 0–1 zebra wybiera na start (ranga Magic / 10, maks. 5).

Pegazy, lot i magia pogody (s. 379–394, 579, 628): katalog 53 manewrów lotu w zakładce „Manewry lotu” (filtr „Pogodowe”),
sekcja „Lot i manewry” w zakładce „Magia i lot”.
- Lot: 5×AGI ft na akcję, pole wysokości; przeciążenie uziemia, okaleczone skrzydła nie niosą, każdy funt ponad 100 lb to −1 do Flight.
- Manewry: kliknięcie = rzut Flight na MFD manewru (akcje liczą się w trackerze). Nowy manewr najpierw się opanowuje:
  rzut z karą 3 kroków, liczba prób = poziom postaci. Pasywne działają zawsze; Second Wind od razu odnawia AP.
- Limity (ostrzeżenia przy dodawaniu): ranga Flight / 10 manewrów, poziomy od rang 25/50/75/100, poziom 2 — AGI, 3 — AGI/3, 4 — jeden,
  jeden pasywny na poziom; Flight School Dropout i Ace Flyer zmieniają limity. Kreator daje lotnikom manewry poziomu 0.
- Pogoda: MG wybiera ją w zakładce walki (albo w ustawieniach). Modyfikatory z tabeli podręcznika same trafiają do okna rzutu
  (celność, percepcja, skradanie, lot) jako zaznaczona pozycja — w budynku wystarczy ją odznaczyć.
- Upadek (przycisk w zakładkach Walka i Magia): 1d20 na 10 ft (kontrolowany 1d10), ignoruje DT pancerza, lokacja k8 (ze skrzydłami)
  albo k6, powyżej 100 ft — każda lokacja; „Nanieś obrażenia” jak przy broni.

Perki i awansowanie (rozdz. 3, s. 125–149): katalog 177 perków w zakładce „Perki” (filtr „Dostępne dla postaci”),
przycisk „Awans” w nagłówku karty i w zakładce „Cechy i dane”.
- Okno awansu: punkty umiejętności 10 + INT/2 (+3 Egghead, +1 kucyk ziemski, −1 Touched by the Sun) rozdajesz
  przed wyborem perka — lista perków na bieżąco pokazuje, które wymagania spełniasz (✓), których nie (✗) i co ocenia MG (?).
  Niewydane punkty przepadają, ranga nie przekracza 100; co 3 poziomy +1 obrażeń na ranę liczy się samo.
- Perki z liczbami działają same (rangi, DT, udźwig, ruch, SATS, odnawianie AP, krytyki, premie sytuacyjne w oknie rzutu);
  perki z wyborem pytają o atrybut lub umiejętności (Intense Training, Daddy’s/Momma’s Filly, Tag!, D.A.R.E.ing Do).
  Perki wielokrotne (Intense Training ×3, Tough Hide ×3 — co raz +4 do poziomu, High Ho Silver ×2…) liczą rangi.
- „Cofnij awans” (strzałka obok przycisku) zabiera punkty, perk i poziom z ostatniego awansu.
- PD: pole w nagłówku z progiem następnego poziomu (tabela XII — wolna albo szybka, albo bez PD w ustawieniach),
  przycisk „PD” dodaje doświadczenie (Horse Sense +10%), a „Awans” podświetla się, gdy próg jest osiągnięty.

Leczenie, chemikalia i uzależnienia (s. 179–186, tabele XVII–XVIII): sekcja „Zdrowie, chemia i promieniowanie” w zakładce Walka,
przycisk „Użyj” przy lekach i chemii w Ekwipunku (nowa kategoria „Leczenie” w katalogu).
- Mikstury: rany według rangi Medicine podającego (0: 1, 1–24: 1d4 … 100: 4+1d12), odmładzająca ×2, przywracająca ×4;
  rany rozdzielasz w oknie (okaleczonych lokacji mikstury nie leczą bez nastawienia — „Nastaw”, Medicine ¾).
  Leczy siebie albo namierzony cel; w walce maks. 5 ran na lokację na rundę.
- Bandaż (Medicine ¾, 1 rana na lokację co 30 min do 3 h), talizmany z ładunkami (rzut Medicine/Magic, rany i rady na ładunek),
  talizman przywracający — pełne zdrowie. „Odpoczynek”: 1 rana na lokację za 8 h (maks. 3 na dobę, z medykiem ×2, okaleczenia 1 na dobę).
- Chemia i alkohol (55 środków): efekty działają przez czas z tabeli (runda = 6 s czasu gry) i znikają same; ponowna dawka odnawia czas.
  Rzut na uzależnienie: END i INT MFD 1 z karą = szansa uzależnienia, +10 za każdy inny działający środek
  (opcjonalnie × dawki z 72 h); Addictive Personality i D.A.R.E.ing Do liczą się same.
- Uzależnienie od grupy (Alcohol, Dash, Mint-als…): odstawienie działa, gdy nic z grupy nie działa; Fixer je znosi,
  Mint-als zaostrzają je po każdym użyciu. Dash + alkohol = rzut END ½ („krew ghula”). Leczenie uzależnienia — przycisk przy wpisie.
- Radaway/Rad Purge (2× Medicine radów, 50–200), Rad-X, Med-X i Slasher (DT = Medicine/5), antidotum i antywenom (usuwają truciznę).
- Choroba popromienna: od 200 radów kary do END, AGI i STR (Rad Tolerance znosi lekką, ghule bez kar; można wyłączyć w ustawieniach).

Bestiariusz (s. 490–576): 93 stworzenia i NPC z podręcznika w zakładce „Bestiariusz” katalogu (przycisk „Bestiariusz FoE”
w zakładce aktorów). 29 z nich ma pełne statystyki — mrówki, radskorpiony, mantykora, centaur, feniks, ankha, hydra,
wieżyczki, protektron, rabusie, najemnicy, żołnierz Enklawy, ghule z Canterlotu…; reszta (w v1.22 bez statystyk) ma opis.
- „Dodaj” tworzy NPC w folderze „Bestiariusz FoE”: atrybuty, rangi, obrażenia na ranę, progi okaleczenia i utraty z bloku,
  broń z obrażeniami z bloku (bez ponownego doliczania premii), pancerze z katalogu, zaklęcia, manewry lotu, zdolności i łup w notatkach.
- Strefy trafień potworów (czułki, szczypce, ogon, kadłub wieżyczki…) z własnym DT: okno ataku pokazuje je z MFD celowania
  z podręcznika, a karta i nanoszenie obrażeń — ich nazwy.

Siodła bojowe i pancerze wspomagane (s. 161–170, 460):
- Siodło (Ekwipunek → „Siodło bojowe i dodatki”) zakłada się kwadracikiem; pancerze wspomagane mają je wbudowane
  (ciężkie, u Enklawy czteroramienne z rezerwą energii). Broń montuje się przyciskiem „S” przy nazwie (zakładka Walka).
- Limity wagi: użytkowe — 3 lb; lekkie — jak bez siodła (2×STR), razem 3×STR; średnie — 2×STR+5, razem 4×STR;
  ciężkie i czteroramienne — 4×STR. Ostrzeżenia przy przekroczeniu, kara za ciężką broń liczy się z limitu siodła.
- „Salwa z siodła”: wszystkie zamontowane bronie jedną akcją, −1 krok MFD (czteroramienne −2); w SATS najdroższa broń +10 AP (+40).
- Akcesoria: podajnik automatyczny (przeładowanie bez akcji), półautomatyczny (1 akcja), wysuwane wędzidło;
  bez nich sięgnięcie po amunicję to +2 akcje. Rezerwa energii (60 pkt: ogniwo 2, MFC 4, gem cell 1) i paliwa (60/120/240)
  działają jak dodatkowa amunicja zamontowanej broni.
- Pancerz wspomagany bez Power Armor Training: bez premii do atrybutów i umiejętności z pancerza (kary zostają);
  ze szkoleniem kary AGI z pancerza znikają. Talizman naprawczy (klucz przy pancerzu): 2 DT na lokację za jednostkę złomu.

Cybernetyka i implanty (s. 104–107, 135–143, 178):
- Katalog → zakładka „Cybernetyka”: protezy (noga, skrzydło, oko, organ, tułów) i 14 implantów z tabeli IX oraz implant atrybutu.
  „Dodaj” montuje je w postaci (wybór nogi albo atrybutu, opcjonalnie nowa kończyna w miejsce utraconej — rany znikają)
  i ostrzega o przeciwwskazaniach: Zebra Augmented, Bone Strengthening Brew, alikorny, drugi implant tego samego atrybutu.
- Efekty liczą się same: proteza +6 DT na swojej lokacji i 1 rana więcej do okaleczenia i utraty; Nemean +4 DT,
  Basilisk +10 DT, −1 CHA, −10 umiejętności CHA (nie sumują się — liczy się mocniejszy); implant atrybutu najwyżej +1 na atrybut;
  Homeostatic +10 przeciw truciznom; Small-target +10 obrażeń przeciw celom z D/W < 8.
- Cecha Cyberpony: +10 DT od ognia (płonięcie i broń z efektem ognia), kończyny +1 rana do okaleczenia i utraty;
  3 pkt: +3 DT wszędzie zamiast +6 z protez. Zebra Augmented też ma +10 DT od ognia.
- Perki: Adamantium Bone Lacing i Bone Strengthening Brew — kończyny ×2 ran (przed premiami stałymi);
  Robotics Expert — +5 obrażeń przeciw robotom i cyborgom.
- Zasilanie (opcja świata „Zasilanie cybernetyki klejnotami”): przycisk „Zasilanie” je klejnot z ekwipunku
  (Small 12 h, Medium 24 h, Large 4 dni, pył 2 h, Cyberpony Cakes 24 h — dla jednej kończyny; tułów liczy się podwójnie).
  Bez zasilania implanty nie działają, a protezy są jak okaleczone.
- Samonaprawa: talizman naprawczy protezy usuwa 1 ranę na 15 minut za 1 złom (Scrap Metal / Electronics),
  Phoenix Monocyte Breeder 1 ranę na godzinę — dzieje się samo, gdy MG przesuwa czas gry, albo przyciskiem „Samonaprawa”.
- Internal Energy Reservoir: 100 punktów energii (ogniwo 2, MFC 4, gem cell 1) — ładowany z ogniw, przy przeładowaniu broni
  energetycznej działa jak rezerwa energii siodła.

Pojazdy i walka pojazdów (nowy typ aktora „Pojazd”). Podręcznik v1.22 nie ma rozdziału o pojazdach — z książki są:
tabela XLI (s. 608: rozmiar → obrażenia na ranę i łatwiejsze trafienie), zderzenia z Speed Lines (1d20 za każde 20 ft prędkości),
prędkość zaprzęgu wg najwolniejszego kucyka i celowanie wybuchami wprost w pojazdy (s. 451). Reszta to zasady domowe:
- Katalog → zakładka „Pojazdy” (albo przycisk „Pojazdy FoE” w zakładce aktorów): wóz, rydwan, sky-wagon, Vertibuck,
  balon, czołg, bomb-wagon, łódź, wagon kolejowy — z bronią pokładową z katalogu. Wszystkie wartości można zmienić na karcie.
- Strefy zamiast lokacji kucyka: kadłub (zniszczony = wrak), kabina i załoga (MFD ½; uszkodzona −1 krok sterowania),
  napęd (MFD ¾; uszkodzony — połowa prędkości i −2 kroki, zniszczony — pojazd stoi, w powietrzu spada), uzbrojenie (MFD ½;
  uszkodzone −2 kroki strzałów, zniszczone — broń nie strzela). Wytrzymałość strefy: 5 + 1 za każde podwojenie rozmiaru.
- Załoga: przeciągnij postać na kartę pojazdu i wybierz rolę (kierowca, strzelec, zaprzęg, pasażer). Pojazd ciągnięty
  jedzie z prędkością najwolniejszego w zaprzęgu (sky-wagon — z prędkością lotu pegazów, którzy mogą latać).
  Bez postaci na stanowisku działa „załoga bez imienia” ze statystyk pojazdu.
- „Steruj”: rzut kierowcy (domyślnie Flight w powietrzu, AGI na ziemi) z prowadzeniem pojazdu; manewr unikowy daje
  atakującym −1 krok (krytyk −2) do końca następnej rundy, duże pojazdy mają −1 krok do uników.
- Broń pokładowa: strzela wybrany członek załogi swoją umiejętnością i AP, bez kar za ciężar broni; z jadącego pojazdu −1 krok.
- „Taranuj” (namierzony cel): rzut sterowania, 1d20 za każde 20 ft prędkości (+ prędkość celu przy zderzeniu czołowym)
  i +1d20 za każde 4 punkty D/W przewagi; taranujący dostaje same kości prędkości w kadłub.
- „Zderzenie”: przeszkoda (prędkość) albo upadek z wysokości (1d20 / 10 ft) — dla pojazdu, a załoga w środku dostaje
  te same kości jako d10 (d20, gdy kadłub albo kabina są rozbite).
- „Napraw”: rzut Repair (w walce 2 akcje i MFD ½) usuwa 1 ranę ze strefy (krytyk 2) i zużywa złom.

Pancerz: założony (kwadracik w zakładce Ekwipunek) sam daje DT na lokacjach, które osłania — liczy się najwyższe DT,
a naturalne DT z cech się dodaje — oraz swoje premie (tymczasowe atrybuty, umiejętności, odporność na promieniowanie, SATS).
Z każdej kategorii (ubranie, lekki, średni, ciężki) nosi się jedną warstwę; każda kolejna to −1 AGI, a od trzeciej −1 STR.

Rany: wpisane w tabeli lokacji albo naniesione z czatu. Połowa END ran okalecza lokację i nakłada kary na rzuty
(głowa: −2 kroki INT/PER/CHA i −1 krok celności; tułów: −2 kroki END/STR/AGI; noga: −5 ft ruchu, −1 krok Sneak
i siodła bojowego; skrzydła: bez lotu, −2 kroki Flight; zaklęcia trudniejsze), END ran w głowie albo tułowiu to śmierć,
w kończynie — jej utrata, 4×END ran łącznie — utrata przytomności.

Obciążenie: waga broni, pancerzy i ekwipunku (amunicja i kapsle nic nie ważą); przeciążenie −5 ft ruchu za każde
rozpoczęte 10 lb ponad udźwig, skradanie −5 za każde rozpoczęte 10 lb ponad 50.

Czego NIE ma (jeszcze): kompendia ras i perków poza kreatorem, magia zebr (alchemia, talizmany), automatyczne efekty
zaklęć bez obrażeń (tarcze, leczenie — opis w zaklęciu, rozliczasz ręcznie), unikalne zdolności pojedynczych broni
(są w opisie broni z katalogu), spadek obrażeń z odległością od wybuchu (licz ręcznie).

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
