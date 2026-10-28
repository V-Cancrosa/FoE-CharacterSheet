# Fallout: Equestria RPG — system do Foundry VTT
Nieoficjalny, fanowski. Zasady: Fallout: Equestria RPG System Core Rulebook v1.22.

**English:** an unofficial fan system for Foundry VTT (v13/v14) based on the Fallout: Equestria RPG System Core Rulebook v1.22.
The whole system is in English, with the rulebook's terms; a Polish translation can be switched on per player.
Language: *Configure Settings → System Settings → “Language (Fallout: Equestria)”* — Same as Foundry / English / Polski
(the page reloads after the change). Chat messages and created documents (items, actors, roll tables) stay in the language
of whoever created them. The rest of this README is in Polish.

## Aktualizacja systemu
Po aktualizacji systemu (Foundry, The Forge) **uruchom świat ponownie**: zakładka Ustawienia → „Wróć do konfiguracji”
(„Return to Setup”), potem znów uruchom świat. Samo odświeżenie strony nie wystarczy — serwer trzyma opis systemu z chwili
startu świata, więc nowe typy aktorów (np. „Stół do gry”) i nowe style nie działają, a przy tworzeniu takiego aktora pojawia
się błąd „… is not a valid type”. Od wersji 0.35.2 MG dostaje wtedy przy wejściu do gry komunikat z tą instrukcją.

## Język / Language
System jest po angielsku, jak podręcznik; polskie tłumaczenie włącza każdy gracz u siebie:
*Konfiguracja → Ustawienia systemu → „Language (Fallout: Equestria)”* — „Same as Foundry” (język z ustawień Foundry),
„English” albo „Polski”. Po zmianie strona się odświeża. Nazwy z podręcznika (umiejętności, perki, cechy, broń, zaklęcia)
zostają po angielsku w obu językach. Wiadomości na czacie i utworzone dokumenty (przedmioty, postacie, tabele) zostają
w języku tego, kto je utworzył — np. tabele FoE zaimportowane po polsku zostaną po polsku, dopóki MG nie zaimportuje ich
ponownie po angielsku. Tłumaczenie jest w pliku `lang/pl.mjs` (angielski tekst → polski).

## Kompendium zasad
Najważniejsze zasady systemu, własnymi słowami i z numerami stron podręcznika v1.22 — dla MG i dla graczy (na razie po polsku):
zakładka **Kompendia** (ikona książek) → **„Zasady Fallout: Equestria (PL)”**. Trzy dzienniki:
- **1. Testy i umiejętności** — test d100 i próg, MFD i kroki, krytyki, rzuty przeciwstawne, skradanie i światło, pomoc,
  karty szczęścia, S.P.E.C.I.A.L. i wartości pochodne, umiejętności, awans i tabela PD;
- **2. Walka** — runda i inicjatywa, zaskoczenie, akcje i ruch, SATS, atak i zasięg, przeładowanie, strzał celowany i lokacje,
  obrażenia, krytyki i DT, rany, okaleczenia i śmierć, unik, blok i osłona, efekty broni i stany;
- **3. Rasy i zdolności** — tworzenie postaci w skrócie, przegląd ras, kucyki, gryfy i zebry, rasy alternatywne,
  magia jednorożców i alikornów, magia zebr, lot i manewry.

Na każdej stronie ramka „Na karcie” mówi, gdzie dana zasada działa w systemie, a podkreślone nazwy prowadzą do innych stron.
**Szybki skok do zasad:** mała ikonka **?** przy nagłówkach karty postaci (S.P.E.C.I.A.L., umiejętności, krytyki, inicjatywa,
SATS, szczęście, strain, awans, broń, stany, rany, lot, zaklęcia, receptury zebr), w kreatorze postaci, w oknie rzutu (MFD)
i w oknie ataku (SATS, odległość, lokacje) otwiera właściwą stronę. Kompendium jest tylko do odczytu; MG może je
zaimportować do świata (prawy przycisk na dzienniku → „Importuj”), jeśli chce dopisać własne zasady domowe.
Kompendium pojawia się po aktualizacji systemu i ponownym uruchomieniu świata.

Dla twórców: treść jest w plikach Markdown `packs-src/rules/pl/*.md` (`# Dziennik {#klucz}`, `## Strona {#klucz}`,
linki `[[walka/sats]]`). Paczkę `packs/rules` buduje `npm ci && node tools/build-packs.mjs` — przy wydaniu robi to GitHub sam.

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
- Ogłuszenie (shock): zamiast śmierci utrata przytomności, krytyk +1d10 ran. Zasada domowa: trafienie z co najmniej
  1 obrażeniem po DT zapala na tokenie „Porażony prądem” do końca następnej rundy — sam znak, bez dodatkowych obrażeń
  (w walce gaśnie sam, poza walką MG zdejmuje go z HUD). Pistolet i karabin Shock (FSW-32, FSW-42B) też mają tę cechę.
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

Sylwetka PipBucka / V.A.T.S. (zakładka Walka, „Rany, okaleczenia i DT”): kucyk z góry „na rozgwiazdę” — łeb u góry, nogi
rozłożone na boki (lewa strona kucyka po lewej), oba skrzydła, ogon; u dwunożnych postać z przodu. Wzór: schemat lokacji z karty
postaci (s. 630) i ekran V.A.T.S. Kolory stanu: żółty — ranna, czerwony — o krok od okaleczenia, pulsujący — okaleczona,
migający z białym konturem — utracona/śmiertelna. Róg i skrzydła tylko u ras, które je mają; przy każdej części opis: rany, DT
z nazwą pancerza, kara strzału celowanego i pasek ran. Przerywany obrys — część osłania pancerz; ⚙ — proteza.
Klik: +1 rana, prawy przycisk albo Shift+klik: −1. Tabela do edycji DT i okaleczeń jest pod sylwetką (rozwijana).
Potwory z bestiariusza i pojazdy mają dalej tabelę stref.

Warsztat i naprawa (s. 198–199, 458–460):
- „Warsztat” w zakładce Ekwipunek (nagłówek „Przedmioty”): naboje (prasa do naboi; łuska + ładunek + metal o wartości ⅓ naboi;
  Repair MFD 1: krytyk ×2, porażka ½; Junk Rounds — bez łusek i prasy, 2× mniej metalu), ogniwa energii (pył klejnotów: 1 = 5 gem
  cells / 3 ogniwa / 1 MFC; Repair ¾), ładowanie zużytych ogniw (Repair MFD 1, do 50 na rzut; porażka niszczy połowę),
  ładunki miotające (proch + topnik albo zamiennik, Science ¾ → 1d10×10), proch (węgiel + nawóz ¾ albo jedzenie ½, 10 jedn.
  na węgiel) i paliwo do miotacza (alkohol + Sugar Apple Bombs + Abronco Cleaner, Science ½ → 20, krytyk 30; wódka +5).
  Paczki („(10)”, „10 units”) zużywają się w jednostkach — reszta otwartej paczki jest widoczna przy ilości.
- Degradacja broni (zasada opcjonalna, ustawienie świata): kości obrażeń = kroki; krok co 2 magazynki (ponad 8 kości — 1,
  jednostrzałowa — co 4 strzały), wręcz po tylu trafieniach, ile kości; amunicja Explosive/Bulk/Overcharged ×2, Home Made ×4.
  Przy broni widać „stan x/y”, każdy krok to −1 kość, przy 0 broń jest złomem.
- Naprawa broni (klucz przy stanie): do kroku z tabeli XXIX (ranga Repair z premiami jako procent), z drugą taką samą bronią
  na części (do jej stanu +1); Jury Rigging pozwala użyć podobnej broni.
- Naprawa pancerza (młotek przy pancerzu): części z innego pancerza (10% jego DT za każde 10 rang Repair na lokację, min. 1)
  albo surowce przy randze 25+ (skóra/materiał — igła i nici; metal — młotek): 1 DT za jednostkę. Pancerz wspomagany —
  talizman albo części z tego samego modelu.

Książki i magazyny (s. 208–210): przycisk „Czytaj” przy książce w Ekwipunku (katalog → Ekwipunek → Książki i magazyny, 84 tytuły).
- Książka (b): punkt umiejętności za każde przeczytanie; nowa daje je 1+1d4 razy (rzut przy pierwszej lekturze), używana —
  o 1 raz mniej za każdego poprzedniego czytelnika, a jej wartość spada o połowę. Wymaga rangi 25 w tej umiejętności.
  Przeczytanie jednego wydania wyklucza kolejne egzemplarze tego samego tytułu.
- Magazyn (m): raz, bez wymagań; tytuły „zależne od wydania” (Equestria Daily, Griffin's Paw…) czyta się numerami.
- Punkty: 1 + Bookworm + Studious; Illiterate nie czyta; książki „tylko dla jednorożców/zebr” sprawdzają rasę.
- Po skończeniu: Egghead's Guide to Running +5 ft ruchu, Daring Do and the Quest for the Sapphire Stone +5 do rzutów AGI,
  Twilight Sparkle's Notebook — krótsze wypalenie (jako cecha z efektem). Lektura trwa dni–miesiące: kliknij po skończeniu.

Amunicja specjalna (zasada opcjonalna, s. 202–203; włącz w ustawieniach świata „Amunicja specjalna”):
- Zwykłe naboje i amunicja broni energetycznej (bez paliwa miotacza) ignorują 5 DT.
- Katalog → „Amunicja specjalna”: naboje (AP, Explosive, Incendiary, Spark, Glue, Gel, Paint, Hollow Point/Flechette,
  Slugs i Dragon's Breath do strzelb, Bulk), energia (Focused, Stun, Overcharged, Bulk, Home Made) i wybuchowa
  (Incendiary, High Explosive, Gas, Smoke, Paint, Beanbag, Cryo, Spark, Glue). „Kup” pyta o kaliber; cena = zwykła × mnożnik.
- Rodzaj amunicji wybiera się przy przeładowaniu; zmiana rodzaju wyjmuje resztę naboi do ekwipunku. Załadowany rodzaj
  widać przy broni i w oknie ataku.
- Liczy się samo: ignorowanie DT (AP 40, Focused 50, HE 30, Spark 10), ± kości, +2d10 i Ogień (Incendiary), maksymalne
  obrażenia i −1 krok (Slugs); przy nanoszeniu: ½ obrażeń bez pancerza średniego/ciężkiego (AP, Focused), ×4 przeciw żywym
  i DT ×3 (Hollow Point), +4 kości przeciw maszynom i ¼ przy niskim DT (Spark), bez skutku przy DT > 20 (Gel, Stun, Beanbag),
  obrażenia niezabijające. Zużycie broni (szybsza degradacja) jest tylko w opisie.

Broń i pancerz nazwany (s. 204–206): gwiazdka przy broni (zakładka Walka) albo pancerzu (Ekwipunek).
- Punkty: 1 + 1d4 (cecha Named Weapon/Armor — 5), do 3 więcej za pogorszenia (−1 kość, mniejszy magazynek, SATS +5, waga +1).
- Broń: +1 kość (maks. +2), magazynek o jeden strzał, zasięg +5 ft (raz), SATS −5 (min. 60%), waga −1, krytyk +0,5,
  efekt specjalny (2 pkt, gdy broń żadnego nie ma), większa kość (2 pkt za stopień) — wg rodzaju broni (wręcz, dystans, obszarowa).
- Pancerz: DT +1d6, waga −1, +1 tymczasowo do atrybutu (maks. dwa), +5 do umiejętności, +2 do dwóch umiejętności,
  +5 AP (do +25), wyposażenie zintegrowane (opis).
- Według podręcznika tworzy się je przy tworzeniu postaci: gracz — na poziomie 1, MG — zawsze.

Magia cieni (s. 35, 574) — zakładka „Magia i lot”:
- Cecha Shadowflash (kreator, 1 pkt; według podręcznika tylko kucyki nietoperzowe, nie z Young): pula strainu cieni AGI + PER + 2,
  koszt 2, odnawia się 1 na godzinę czasu gry. Unik — Flight MFD ½, sukces = unik udany (reakcja, bez akcji);
  teleport — Flight MFD ¾, do 10×INT ft, tylko postać i trzymane przedmioty. Tłumienie magii na nią nie działa.
- Shadow Form (Czarna Księga): cecha o tej nazwie daje przeskok między cieniami do 40 ft (Flight MFD ¾).
- Sonic Screech kucyków nietoperzowych jako broń (przycisk „Dodaj Sonic Screech”): 3d12, SATS 40, zasięg 10 ft (maks. 30),
  ignoruje pancerz noszony (liczy się tylko naturalne DT; pole „Ignoruje pancerz” w broni).

Podmieńcy — ZASADA DOMOWA (podręcznik v1.22 opisuje ich tylko fabularnie, zasady zapowiada księga II):
- Rasa „Podmieniec (Changeling)” w kreatorze (za zgodą MG): +1 do CHA, AGI albo INT; Magic i Flight (owadzie skrzydła);
  chityna +2 DT wszędzie i +10% odporności na promieniowanie; tabela trafień jak u alikornów (róg i skrzydła).
- Miłość: pula CHA + END, 1 dziennie (liczy się, gdy MG przesuwa czas), 1 za przemianę; pusta pula — −1 krok rzutów END i CHA.
- Przemiana: wygląd i głos widzianego kucyka; tokeny dostają jego imię (prawdziwe zostaje na karcie). „Wykrycie przebrania”:
  rzut PER obserwatora z MFD wg znajomości oryginału (jak przy Voice Alteration, s. 316). Żerowanie: Speechcraft, sukces +1d4 miłości.

MG i gracze (uprawnienia):
- Gracz widzi i obsługuje tylko postacie, których jest właścicielem (uprawnienia aktora w Foundry); obrażenia na cudzy
  token nanosi MG tym samym przyciskiem na karcie z czatu.
- Karty na czacie (rzuty, obrażenia, awanse) respektują tryb rzutu wybrany nad czatem: publiczny, rzut MG, ślepy, tylko dla siebie.
  Opcja świata „Ukryte rzuty MG za przeciwników”: rzuty MG za postacie bez gracza-właściciela idą zawsze jako rzut MG.
- PD i poziom zmienia MG (przycisk „PD”, pola na karcie, cofanie awansu). Gracz klika „Awans” sam, gdy zbierze PD do progu;
  przy awansie bez PD (kamienie milowe) awans klika MG na karcie gracza. Opcja świata „Gracze sami przyznają PD i awansują” oddaje to graczom.
- Katalog: gracz kupuje broń, pancerze i ekwipunek za kapsle; „Dodaj” za darmo (także implanty i perki) ma tylko MG.
  Zaklęcia, receptury i manewry gracz dodaje zawsze. Opcja świata „Gracze dodają z katalogu za darmo” to zmienia.
- Tylko MG: bestiariusz, pojazdy, pogoda, runda zaskoczenia, ustawienia świata; efekty końca rundy, odnawianie AP,
  koniec działania chemii i samonaprawę liczy komputer MG.

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

Obciążenie: waga broni, pancerzy i ekwipunku (amunicja i kapsle nic nie ważą); skradanie −5 do rzutu za każde rozpoczęte
10 lb ponad 50 (s. 438). Przeciążenie — zasada domowa (ustawienie świata „Przeciążenie”): do 125% udźwigu ¾ prędkości,
do 150% ½, do dwukrotności udźwigu wleczenie się po 5 ft na akcję (bez biegu i szarży), ponad dwukrotność postać stoi —
gracz nie przesunie tokena, dopóki czegoś nie porzuci albo nie odda (MG może, z ostrzeżeniem). Karta pokazuje stopień
i ile trzeba odłożyć. W ustawieniach można wrócić do zasady z podręcznika (s. 150: −5 ft za każde rozpoczęte 10 lb).

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

Motyw PipBucka dla całego Foundry (v13/v14; grafiki rysowane od zera, bez logo z gier):
- Ekran pauzy: godło Stajni — zębate wrota z numerem (opcja świata „Numer Stajni”, domyślnie 97) i napis
  „GRA WSTRZYMANA” z zakłóceniami kineskopu, w kolorze PipBucka gracza.
- Interfejs (opcja gracza „Motyw PipBucka dla interfejsu”, domyślnie włączona): pasek boczny, czat jak terminal
  (szepty z przerywaną ramką), lista graczy, pasek makr, sceny, kontrolki, tracker walki, powiadomienia i nagłówki
  okien w kolorach ekranu PipBucka. Motyw zmienia kolory przez zmienne Foundry — elementy, których nie obejmuje,
  zostają w zwykłym wyglądzie. Wyłączenie przywraca wygląd Foundry od razu.
- Tokeny w kolorach radaru EFS (opcja świata): obwódki i pierścienie — zielone swoi, czerwone wrogowie, żółte neutralni.
- Ekran powitalny PipBucka po zalogowaniu (opcja gracza): imię postaci, kapsle, SATS i promieniowanie; MG widzi
  „terminal nadzorcy”. Tylko na ekranie gracza — nic nie trafia na czat. Kliknięcie zamyka.
- Dźwięki PipBucka (opcja gracza, domyślnie wyłączona): ciche piknięcia przy pauzie, otwieraniu kart systemu i własnych
  rzutach, generowane w przeglądarce; głośność jak „Interfejs” w ustawieniach dźwięku Foundry.

Tokeny:
- Nowa postać gracza dostaje token połączony z aktorem, przyjazny, z imieniem widocznym po najechaniu i paskami SATS
  oraz „Do śmierci” (ile ran zostało do śmierci w głowie albo tułowiu, s. 465), które widzi właściciel i MG; widzenie
  włączone. Nowy NPC: każdy token osobno (osobne rany), wrogi, imię i paski widzi tylko MG. Nie zmienia się to, co podano
  przy tworzeniu (kopia, kompendium, bestiariusz) ani to, co MG ustawił w domyślnym tokenie świata Foundry.
- Istniejących aktorów i tokenów nic nie zmienia samo: MG może raz kliknąć *Ustawienia systemu → „Zastosuj ustawienia
  tokenów FoE”* — imiona, paski i widzenie dla wszystkich postaci i NPC (prototypy i tokeny na każdej scenie);
  połączenie z aktorem i nastawienie (np. przyjazny kupiec) zostają.
- Stany FoE w HUD tokena (prawy przycisk na tokenie → ikony): martwy, nieprzytomny, przewrócony, płonie, porażony prądem,
  zatruty, sparaliżowany, ogłuszony, krwawi, oślepiony, głuchy, przerażony, w ukryciu, niewidzialny (pole maskujące),
  w locie, pod ziemią, w osłonie, unieruchomiony, okaleczony, przeciążony, choroba popromienna, wypalenie magii.
  „Przeciążony”, „W locie” (wysokość lotu na karcie), „Okaleczony”, „Choroba popromienna” i „Wypalenie magii” zapalają się
  i gasną same, gdy zmienia się karta (liczy przeglądarka MG); stan włączony ręcznie zostaje, dopóki karta się nie zmieni.
  Niewidzialny i oślepiony działają jak w Foundry (token niewidoczny dla innych, oślepiony nic nie widzi).
- Światło w HUD tokena (lewa kolumna): żarówka — latarka PipBucka (10 ft jasno, 20 ft przyćmione, w kolorze ekranu
  PipBucka), różdżka (tylko jednorożce i alikorny) — światło rogu jak zaklęcie Light (15 / 30 ft) w kolorze magii z zakładki Magia. Ponowne kliknięcie
  gasi światło i przywraca poprzednie ustawienia światła tokena.
- Znacznik tury w walce: zielony celownik V.A.T.S. pod tokenem, który ma turę (jeśli w ustawieniach walki Foundry nie
  wybrano innego obrazka).
- Widzenie ras: kucyk-nietoperz „widzi” echolokacją na 60 ft w ciemności — nowy aktor od razu, a przy zmianie rasy na
  karcie prototyp i połączone tokeny same (większy zasięg ustawiony przez MG zostaje).

Animacje walki (atak bronią albo celowanym zaklęciem z zaznaczonym celem, klawisz T):
- Ruszają, gdy kości wylądują (Dice So Nice), u wszystkich tak samo. Trafienie: pocisk albo cios dosięga tokenu celu —
  przy strzale celowanym w głowę wyżej, w nogi niżej (także przy losowej lokacji z k20). Pudło: kula przelatuje obok
  celu i ląduje za nim (kurz, iskry, napis „Pudło”), cios trafia w powietrze obok. Seria — kilka pocisków (do 5),
  strzelba — śrut, granat i wyrzutnia — lot łukiem i wybuch (odłamkowy, ogień, plazma, impuls, błysk, gaz, mróz,
  balefire — z nazwy), miotacz ognia — strumień, broń energetyczna — laser, plazma, impuls, prąd, dezintegracja, tęcza
  (AER-17)…, wręcz — cięcie, młot, klucz, topór, pazury, kopyto. Miny kładzione nie mają animacji.
- Przerzut kartą Szczęścia: w miejscu, w które wbiła się poprzednia kula, błyska złota koniczynka („Szczęście!”), a kula
  odbija się rykoszetem — udany przerzut trafia w cel, nieudany znowu chybia (kolejny przerzut to kolejne odbicie).
  Po zacięciu broni (krytyczna porażka) albo w walce wręcz szczęście błyska przy strzelcu albo celu.
- Krytyczny sukces — większe trafienie i „Krytyk!”, krytyczna porażka — dym przy strzelcu i „Zacięcie!” (wręcz
  „Potknięcie!”, czar „Zaklęcie gaśnie!”, granat „Niewypał!”).
- Rzut ukryty przed graczem (tylko MG, na ślepo) nie ma u niego animacji; strzał z ukrytego tokena gracze widzą tylko
  tam, gdzie doleciał; cele ukryte i na innej scenie są pomijane.
- Wygląd: z modułami **Sequencer** i **JB2A** (darmowe „JB2A - Jules&Ben's Animated Assets”, albo wersja z Patreona) —
  animacje JB2A; bez nich wbudowane efekty w stylu PipBucka (bez żadnych modułów). Na The Forge: Bazaar → Modules →
  wyszukaj „Sequencer” i „JB2A”, zainstaluj i włącz w świecie (Manage Modules). Modułu Automated Animations nie
  włączaj do ataków FoE — dublowałby animacje.
- Opcje gracza (Ustawienia gry → Fallout: Equestria RPG): „Animacje walki i czarów” (wł./wył.) i „Animacje walki: wygląd” (JB2A,
  gdy są, albo zawsze wygląd PipBucka). Jeśli w Sequencerze MG zabronił graczom efektów, gracze widzą wygląd PipBucka.

Animacje stanów na tokenach (idą za ikonami stanów w HUD tokena — także za tymi, które system zapala sam):
- Płonie — płomienie, porażony prądem — iskry, zatruty — bąbelki, choroba popromienna — zielona poświata, krwawi — krople
  krwi, ogłuszony — gwiazdki nad głową, przerażony — drżąca obwódka i krople potu, sparaliżowany — kryształowy
  sześciokąt, unieruchomiony — łańcuchy, nieprzytomny — „Zzz”, wypalenie magii — fioletowy dym, w ukryciu — przerywany
  krąg, w locie — cień pod tokenem, a jednorożec, który utrzymuje zaklęcia — krążące gwiazdki (tyle, ile zaklęć, do 3).
  Martwy token nie ma animacji.
- Z Sequencerem i JB2A stany, dla których JB2A ma znacznik w pętli (ogień, prąd, trucizna, promieniowanie, krew,
  ogłuszenie, strach, paraliż, łańcuchy, sen, wypalenie, cień lotu, zaklęcia), dostają grafikę JB2A; ukrycie zawsze
  ma wygląd PipBucka. Animacje rysuje każdy gracz u siebie — nic nie zapisuje się w świecie ani w tokenach i nie
  zostaje po wyłączeniu modułów.
- Opcja gracza „Animacje stanów na tokenach” (wł./wył.); wygląd — jak przy animacjach walki.

Czary i kolor magii:
- W zakładce Magia (jednorożce i alikorny) jest pole „Kolor magii” — kolor aury jednorożca (domyślnie liliowy). Tym kolorem
  świecą: animacje rzucania czarów, pocisk zaklęcia przy celowaniu, światło rogu w HUD tokena i gwiazdki utrzymywanych
  zaklęć.
- Rzucenie zaklęcia (karta wyniku na czacie, po wylądowaniu kości testu Magic): róg rozbłyska (overglow — mocniej), a dalej
  zależnie od zaklęcia: wiązka magii do celów (zaznaczonych klawiszem T; bez celu — rzucający) i przy nich leczenie
  (krzyżyki), tarcza (bańka), telekineza (poświata), umysł (fale do głowy), obrażenia obszarowe (wybuch magii)
  albo iskry przy pozostałych; teleportacja — zapadnięcie i błysk, światło — rozbłysk z rogu, niewidzialność i iluzje —
  falujący zarys. Porażka — iskry gasną („Zaklęcie gaśnie!”), wypalenie — fioletowy dym („Wypalenie!”), krytyk —
  „Overglow!”. Zaklęcia celowane z obrażeniami pokazują pocisk dopiero przy celowaniu.
- Rodzaj animacji wynika z nazwy zaklęcia (katalog; własne zaklęcia też po polsku, np. „Leczenie”, „Tarcza”).
- Z Sequencerem i JB2A blask rogu, leczenie, tarcza, telekineza, umysł, wybuch, iskry, teleport i światło używają
  białych grafik JB2A zabarwionych kolorem magii; wiązka, ukrycie, porażka i wypalenie — zawsze wygląd PipBucka.
  Pocisk zaklęcia we własnym kolorze (innym niż domyślny) rysuje system, bo grafiki JB2A pocisków mają stały kolor.

Instalacja: w Foundry VTT → Game Systems → Install System wklej manifest URL:
`https://github.com/V-Cancrosa/FoE-CharacterSheet/releases/latest/download/system.json`
Ręcznie: wrzuć zawartość repo jako folder `foe-rpg` do `Data/systems/`.

Wymiana: przy broni, pancerzu, ekwipunku i kapslach jest ikona dłoni — okno wymiany. Lista bierze tylko tokeny
z oglądanej sceny, które gracz widzi (bez ukrytych, martwych i NPC spoza mapy — nie zdradza przyszłych przeciwników);
NPC, którego nazwy MG nie pokazuje na mapie, to „nieznany NPC” z kierunkiem (np. „obok, na północ”). Przy stosach
wybierasz ilość, założony przedmiot zdejmuje się przy wymianie.
- „Przekaż” — tylko komuś obok (tokeny stykają się bokiem albo rogiem, podobna wysokość) albo komuś w tym samym
  pojeździe (załoga i ładownia — wtedy tokeny nie są potrzebne). Ładownia pojazdu ma samo „Przekaż”.
- „Rzuć” — komuś, kogo widzisz w zasięgu, np. w walce: test Explosives (s. 58, 187). Rzucisz rzecz lżejszą niż ½ STR;
  przedział zasięgu (STR/4)×5 ft, a dla rzeczy lżejszych niż ¼ STR — (STR/2)×5 ft (min. 5 ft); Heave, Ho! +5 ft,
  Oops! −5 ft; jednorożec z telekinezą może rzucić nią (INT, udźwig 2×INT, s. 253). Zasięg to 4 przedziały, każdy
  po pierwszym — krok MFD trudniej. Udany — cel łapie. Chybiony — przedmiot upada obok celu (5 ft dalej za każdy
  brakujący krok MFD, kierunek k8): na mapie pojawia się znacznik, a na czacie karta „Podnieś” dla kogoś, kto stanie
  obok. Udany przerzut za kartę szczęścia oddaje przedmiot celowi (jeśli nikt go jeszcze nie podniósł).
- „Sprzedaj” — postaci albo NPC obok: oferta na czacie z ceną. Podpowiedź z Tabeli XXXI (s. 471–472): gracz sprzedaje
  NPC za (Mercantile/5, w dół)×5 % wartości, NPC sprzedaje graczowi za 200% minus tyle samo (Mercantile kupującego),
  między graczami — wartość z podręcznika; cenę można zmienić. Kupujący (jego gracz, za NPC — MG) klika „Kupuję”
  albo „Odrzuć”, sprzedający może „Wycofać”. Kupiec-NPC, który ma za mało kapsli, płaci za zgodą MG tyle, ile ma.
Upuść na ziemię: strzałka w dół przy broni, pancerzu i ekwipunku (przy stosie pytanie, ile sztuk). Przedmiot schodzi
z postaci (spada ciężar — tak pozbędziesz się przeciążenia) i leży na polu pod jej tokenem: na mapie znacznik, na czacie
karta „Podnieś” jak po chybionym rzucie — podniesie go każdy, kto stanie obok i kliknie z zaznaczonym tokenem.
Znacznik stawia przeglądarka MG; bez MG gracz upuszcza sam, tylko bez znacznika. Ikona kosza nadal usuwa przedmiot
na dobre (np. zjedzony, zniszczony).
Zapis zmian u innych robi przeglądarka MG (sprawdza, czy oddajesz swoje rzeczy); ślad zostaje na czacie.
Żeby gracze widzieli w oknie nazwę kupca, ustaw w jego tokenie wyświetlanie nazwy „po najechaniu” albo „zawsze”.
Znacznik upuszczonego przedmiotu można wyłączyć w ustawieniach świata.

Kapsle od MG: obok pola kapsli na karcie (i przy kapslach w zakładce Ekwipunek) MG ma przycisk ± — wpisuje kwotę
i opcjonalnie powód (np. „nagroda za zlecenie”), potem „Dodaj” albo „Zabierz” (liczba ujemna też zabiera). Kapsle
nie spadną poniżej 0, a na czacie zostaje krótki wpis, np. „Light Chain: +50 kapsli” z powodem pod spodem. Żeby gracze
go nie widzieli, przełącz tryb nad czatem na „rzut MG”. Pole kapsli można też po prostu poprawić ręcznie (bez wpisu).

Znaczek: obok portretu na karcie jest pole znaczka — kliknij, wybierz obrazek (albo wklej adres, jeśli nie masz dostępu
do przeglądarki plików) i dopisz krótki opis talentu (pokazuje się po najechaniu).

Przeładowanie: postać gracza ładuje tylko amunicję z ekwipunku (albo z rezerwy siodła lub implantu) — bez niej dostaje
komunikat i nie traci akcji. NPC prowadzone przez MG ładują bez liczenia amunicji.

Łup z ciał NPC: MG klika „ŁUP” w nagłówku karty NPC albo „Przeszukaj” w przypomnieniu, które dostaje szeptem, gdy NPC
zginie (ustawienie świata „Łup: przypomnienie po śmierci NPC”). Na czacie pojawia się karta łupu: rzeczy, które NPC ma przy
sobie (broń z katalogu — bez naturalnej, pancerz, ekwipunek), oraz łup z bestiariusza — szanse i ilości rzucone, wpisy
ogólne (Random ammo — amunicja do broni NPC, Food Item, Random Drug, ubrania, zabawki) losowane z tabel łupów, kapsle.
Stwory bez łupu w podręczniku dostają nasze domyślne (zwierzęta — mięso z katalogu, roboty — złom, frakcje — kapsle).
Gracze klikają „Weź” albo „Weź wszystko” — rzecz trafia do postaci z zaznaczonego tokenu i znika z karty u wszystkich
(rzeczy NPC znikają też z jego ekwipunku; zapisuje to przeglądarka MG). Ciało oznacza się jako przeszukane.

Tabele losowe: w zakładce „Tabele” MG klika „Tabele FoE” — powstaje (albo aktualizuje się, bez dublowania) folder
„Tabele FoE”: spotkania losowe d% (100, s. 618), głód 1d6 (tabela XXXII, s. 477), objawy chorób (Covering Sickness,
EHV, Rabies, s. 587–593), pułapki i ich wyzwalacze (s. 597) — po polsku z nazwą oryginalną — oraz tabele łupów z katalogu
(amunicja, chemia, jedzenie, różności, broń, pancerz; tanie częściej, nasze, nie z podręcznika). Zmiany w tych tabelach
nadpisze kolejny import — własne tabele kampanii rób osobno. Wynik każdej tabeli (także własnej) wygląda na czacie jak
karta PipBucka; przy stworach z bestiariusza jest „Dodaj NPC”, przy pojazdach „Dodaj pojazd”, przy przedmiotach z katalogu
„Dodaj do ekwipunku” (postać z zaznaczonego tokenu), przy głodzie „Zastosuj głód” (cecha „Głód” z karą), przy mgle
„Rzuć ponownie”. W tabelach MG przyciski pojawiają się, gdy w wyniku jest dokładna nazwa stwora albo przedmiotu.

Kości 3D (jeśli jest włączony moduł Dice So Nice): w ustawieniach modułu, w kategorii „Fallout: Equestria”, są zestawy
PipBuck (zielony, bursztynowy, niebieski, biały — czcionka ekranu PipBucka), Stable-Tec, Gardens, Kapsel, Radiacja,
Zebra i Enklawa. Każdy gracz wybiera swój zestaw. Opcja gracza „Kości 3D: kolory” (Ustawienia gry → Fallout: Equestria
RPG) ma trzy możliwości: „Testy moimi kośćmi, rzuty specjalne w kolorach FoE” (domyślnie — zwykłe testy idą zestawem
wybranym w Dice So Nice, np. z modułu z kośćmi jak Rollsmith), „Wszystkie rzuty w kolorach Fallout: Equestria” (test —
PipBuck w kolorze ekranu) i „Zawsze moje kości”. Rzuty specjalne mają własne kolory: SATS, lokacja trafienia, obrażenia,
magia, leczenie, karta szczęścia, pułapka (Radiacja); inni widzą te same kolory. Kto wcześniej wyłączył dawną opcję
„kolor według rodzaju rzutu”, ma od razu „Zawsze moje kości”. W ustawieniach efektów specjalnych Dice So Nice są wyzwalacze
„Fallout: Equestria — Krytyczny sukces / Krytyczna porażka” (nasze krytyki z rzutu d100, także poszerzone przerzutami).

Inne moduły (działa samo, gdy moduł jest włączony):
- Carousel Combat Tracker — przy portretach SATS, karty szczęścia, rany i ruch, a pod imieniem rasa i poziom (NPC:
  „NPC”, pojazd: „Pojazd”). To wartości domyślne: jeśli MG zmienił już listę w ustawieniach Carousel („Tooltip
  Attributes” → „Configure Attributes”), zostaje jego lista. Dymek z wartościami w czcionkach PipBucka; kolory pasków — z ustawień Carousel.
- Dice Tray — tacka pod czatem ma d100 na wierzchu (testy) i kości obrażeń z podręcznika (d4, d6, d8, d10, d12, d20),
  przyciski KH / KL zostają; z motywem PipBucka — w jego kolorach.
- Levels (i bez niego) — opcja świata „Wysokość lotu przesuwa token” (domyślnie włączona): gdy pegaz albo pojazd
  latający zmienia wysokość lotu (karta, lot, lądowanie, upadek), jego token idzie w górę albo w dół o tyle samo stóp.
  Piętro, na którym stał, zostaje, więc Levels pokazuje lecącego kucyka na właściwej wysokości; wymiana i terminale
  liczą odległość w pionie.
- PopOut! — karty systemu działają w osobnym oknie w kolorze PipBucka (zmiana koloru odświeży się po ponownym otwarciu).
- Monk's Active Tile Triggers — w konfiguracji kafelka (zakładka akcji) jest grupa „Fallout: Equestria”:
  - „FoE: promieniowanie” — postacie na kafelku dostają rady (liczba albo kości, np. 2d10) pomniejszone o odporność na
    promieniowanie, jak przy broni; wpis na czacie z nowym stanem i stopniem choroby popromiennej po przekroczeniu progu,
  - „FoE: pułapka (obrażenia)” — rzut obrażeń (np. 3d12) i karta z „Nanieś obrażenia” dla postaci na kafelku: jedno
    trafienie (lokację wybiera się w oknie obrażeń) albo wybuch (każda odsłonięta lokacja), z DT pancerza jak przy ataku.
  Uwaga: wbudowanej akcji „Hurt/Heal” nie używaj na postaciach FoE — odejmuje wartość z głównego paska tokena, czyli SATS.
- Break Time — w czasie przerwy ekran pauzy z drzwiami Stajni pokazuje „PRZERWA” zamiast „GRA WSTRZYMANA” (po przerwie
  wraca zwykły napis). Z motywem PipBucka okno przerwy (kto wrócił — zielony pasek, kto nie — czerwony), przycisk
  „Przerwa” i kubek przy graczach, którzy odeszli od stołu, są w kolorach PipBucka.
- Tokenizer — kliknięcie w portret na karcie (postać, NPC, pojazd, terminal, stół do gry) otwiera Tokenizer, Shift + klik —
  zwykły wybór obrazka. Jeśli w ustawieniach Tokenizera wyłączono klikanie w awatar, jest odwrotnie; gracze bez prawa
  wysyłania plików dostają zwykły wybór obrazka (jak w samym Tokenizerze). Przycisk „Tokenizer” w menu okna karty też działa.
- Custom CSS — style z tego modułu mają pierwszeństwo przed stylami systemu, więc można nimi zmienić wszystko w wyglądzie.

Terminale (osobny typ aktora „Terminal”): MG ustawia typ (biurowy RobronCo, Stable-Tec, ministerialny, chmurowy,
Unics, przenośny), przy ministerialnym — które z sześciu Ministerstw (Nauk Magicznych, Czadu, Wizerunku, Morale,
Pokoju, Technologii Wojennej; od niego zależą nagłówek, logo i kolor ekranu), zabezpieczenie (MFD hakowania), wymagane Science, hasło i hasło administratora, wpisy (publiczne / po
zalogowaniu / administrator), komendy (drzwi ze sceny, tokeny wieżyczek i robotów, komunikat na czacie) i pułapkę
(Rigged Terminal, s. 597). Gracze klikają token i widzą tylko ekran komputera: logowanie hasłem, hakowanie (rzut
Science; krytyk — administrator, krytyczna porażka — blokada, Computer Whiz — druga próba, druga blokada na stałe),
wpisy, komendy i zgrywanie wpisu na holotaśmę (zużywa pustą „Holotape”). Terminal chmurowy obsłużą tylko latający,
Illiterate nie hakuje, Certified Pipbuck Technician dostaje administratora na Stable-Tec. Opcja świata „Terminale:
minigra hakowania” (zasada domowa): zgadywanie hasła ze zrzutu pamięci jak w grach Fallout — 4 próby, podobieństwo
liter. Science daje podpowiedzi (usunięcie atrapy): z góry ranga/25 minus trudność terminala (¾ −1, ½ −2, ¼ −3),
a raz na grę „Analiza zrzutu” — rzut Science z trudnością terminala: sukces +1 podpowiedź i +1 próba (do 4), krytyk
+2 podpowiedzi i pełne próby, krytyczna porażka −1 próba. Zmiany stanu terminala zapisuje przeglądarka MG, więc MG musi być zalogowany.
- Z bliska (opcja świata „Terminale: obsługa tylko z bliska”, domyślnie włączona): gracz korzysta z terminala tylko,
  gdy token jego postaci stoi obok tokenu terminala (jak przy wymianie); z daleka widzi tylko „ZA DALEKO”. Dalej
  sięgają przedmioty z podręcznika: Cabling, Universal (10’) — 10 ft, implant Console Matrix Remote Control Talisman
  (zasilony) — 20 ft, Wire, Spark (25’) — 25 ft. Terminal bez tokenu na oglądanej scenie działa jak dotąd; MG zawsze.
- Oględziny pod kątem ładunku nie mają przycisku: gracz musi sam powiedzieć MG, że sprawdza terminal. MG mówi mu
  wtedy, którą śrubkę (◦) kliknąć — przed włączeniem terminala; to otwiera rzut Explosives. Ukrytą śrubkę MG wybiera
  w konfiguracji terminala (sekcja „Pułapka”, pole „Śrubka”): jedną z 4 w rogach ekranu, domyślnie prawą dolną.
  Wykryty ładunek widać już otwarcie, z przyciskiem „Rozbrój” (ta sama śrubka też rozbraja).
- Włączenie terminala pokazuje animację ASCII (około 10 s): tekst startowy (status testów pojawia się po chwili),
  pasek ładowania skaczący o losowe wartości, a na koniec logo producenta z hasłem — inne dla każdego typu: biurowy
  (RobronCo), Stable-Tec, ministerialny (logo wybranego Ministerstwa: M.A.S., MoA, MoI, MoM, MoP, M.W.T.), chmurowy
  (Enklawa), Unics i przenośny. Kliknięcie pomija; opcja gracza „Terminale: animacja uruchamiania”.

Kasyno (osobny typ aktora „Stół do gry”): blackjack z automatycznym krupierem albo Texas Hold'em bez limitu. Talia jak
w podręczniku (s. 220): damą kier jest Celestia, trefl — Luna, karo — Cadance, pik — Nightmare Moon (jokerów, Discorda
i Chrysalis, te gry nie używają). Same zasady gier są jak w kasynach.
- MG klika w zakładce aktorów przycisk „Stół do gry” (albo tworzy aktora typu „Stół do gry”), wybiera grę i stawia token stołu
  na mapie (2×1 pola). W ustawieniach stołu wybiera grę i stawki
  (blackjack: najniższa i najwyższa stawka, talie w bucie; poker: ciemne, wpisowe od–do, prowizja kasyna 0–10%), imię
  krupiera i bank kasyna — bez limitu albo z kwotą, którą da się rozbić (krupier nie przyjmie stawki, której bank nie
  pokryje). MG widzi też bilans kasyna.
- Gracze klikają token stołu. Usiąść można tylko, gdy token postaci stoi obok tokenu stołu (opcja świata „Stoły do gry:
  siadanie tylko z bliska”). Kapsle schodzą z karty postaci: w blackjacku przy stawianiu, w pokerze wpisowe idzie na stół
  i wraca przy wstawaniu. Wygrane trafiają na kartę postaci.
- Blackjack: gracze stawiają, a ktokolwiek z nich klika „Rozdaj” — krupier rozdaje tym, którzy postawili. Dobierz, stój,
  podwój (na dwóch kartach), rozdziel parę (raz; asy dostają po jednej karcie). Krupier dobiera do 16 i staje na każdych
  17, zagląda pod kartę przy asie i dziesiątce; blackjack płaci 3:2. Bez ubezpieczenia i poddania.
- Texas Hold'em: siedzący klika „Nowe rozdanie” (potrzeba dwóch graczy z kapslami na stole). Pas, czekaj, sprawdź,
  podbij (co najmniej o ostatnie podbicie), va banque; boczne pule, pokazanie kart i podział puli liczy system.
  Między rozdaniami można dokupić kapsli.
- NPC: MG zaznacza ich tokeny i klika „Posadź zaznaczonych NPC” — gra nimi w oknie stołu i widzi ich karty (kart graczy
  nie widzi). NPC, który ma za mało kapsli, dostaje je od MG; to, co wygra, zostaje na jego karcie.
- Tajemnica kart: but, zakryta karta krupiera i karty graczy w pokerze są tylko w pamięci przeglądarki MG — nie ma ich
  w świecie. Gracz dostaje swoje karty zaszyfrowane (odczyta je tylko jego przeglądarka), więc nikt nie podejrzy cudzych
  nawet w konsoli. Gdy MG odświeży stronę w trakcie rozdania, rozdanie przepada, a stawki wracają do graczy; gracz po
  odświeżeniu strony dostaje swoje karty jeszcze raz. Ruchy wykonuje przeglądarka MG, więc MG musi być zalogowany.
- MG może wyprosić kogoś od stołu (kapsle wracają), zrobić ruch za gracza, który nie odpowiada (stój / pas), anulować
  rozdanie i zamknąć stół (wszystkie kapsle ze stołu wracają). Wyniki rund idą na czat (opcja świata „Stoły do gry:
  wyniki na czacie”).

Celownik S.A.T.S. (opcja, domyślnie wyłączona; na podstawie modułu foe-sats): MG włącza go w Ustawieniach gry →
Fallout: Equestria RPG → „Celownik S.A.T.S. (opcja)”. Po namierzeniu celu (T) i zaznaczeniu SATS w oknie ataku
kamera najeżdża na cel, a na ekranie pojawia się jego sylwetka V.A.T.S. z szansą trafienia każdej części ciała —
klik ustawia strzał celowany, Esc wychodzi z SATS. Przycisk ⌖ przy „Cel ataku” otwiera celownik bez zaznaczania SATS.
Każdy gracz może u siebie wyłączyć auto-otwieranie, przybliżanie kamery i zwijanie kart na czas celowania oraz ustawić powrót kamery. Gdy w świecie
jest włączony osobny moduł foe-sats, wersja wbudowana się nie uruchamia (nie dubluje się).

Grafiki kampanii (folder `assets/gardens/`, w Foundry pod `systems/foe-rpg/assets/gardens/`):
`gardens-logo.webp` (logo Gardens 97), `gardens-scena.webp` (scena z logo Gardens 97, 1920×1080),
`stodola-mapa.webp` (mapa stodoły do sceny) i `stodola-plan.png` (plan stodoły z numerami dla MG).
Pliki w folderze systemu są nadpisywane przy aktualizacji — własne zmiany trzymaj poza nim.

Nowe wydanie: zmień `"version"` w system.json (np. na `0.2.0`) i scal to do `main` —
workflow `.github/workflows/release.yml` sam utworzy wydanie `v0.2.0` z plikami `foe-rpg.zip` i `system.json`.

Czcionki: VT323 i IBM Plex Mono (SIL Open Font License, pliki licencji w `fonts/`).
Ikony stanów tokenów (`icons/status/`): Font Awesome Free 6.5.2 (CC BY 4.0, https://fontawesome.com/license/free) — informacja o licencji jest w każdym pliku.
