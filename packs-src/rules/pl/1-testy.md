# 1. Testy i umiejętności {#tests}

## Test d100 {#test}

Prawie każdy rzut w Fallout: Equestria to **k100** — dwie k10, jedna to dziesiątki, druga jedności (00 i 0 to 100). Trzeba wyrzucić **tyle samo albo mniej** niż **próg** (TN, *target number*). Im niższy wynik, tym lepiej. (s. 6–7)

### Skąd się bierze próg

- **Atrybut:** wartość × 10 (AGI 6 → próg 60).
- **Umiejętność:** ranga + połowa progu atrybutu, do którego należy (Small Guns 50 i AGI 6 → 50 + 30 = 80).
- Ten próg to **MFD 1**. Mnożysz go przez [[tests/mfd|MFD]] zadania (w dół do pełnych), a potem dodajesz premie i odejmujesz kary (osłona celu, cechy, perki, pogoda).

> **Przykład (s. 7):** Small Guns 80, cel w 25% za osłoną (kara −25), zwykły strzał MFD 1 → próg 55. Wynik 55 lub mniej trafia; 97 to [[tests/crit|krytyczna porażka]].

### Rzut bez umiejętności (s. 63)

Gdy żadna umiejętność nie pasuje, MG wybiera atrybut i rzucasz nim (× 10) na odpowiednim MFD.

> **Na karcie:** kliknij nazwę atrybutu albo umiejętności w zakładce *Statystyki* — w oknie rzutu wybierasz MFD i wpisujesz modyfikator. Tabela atrybutów ma gotowe progi dla MFD 1, ¾, ½ i ¼, tabela umiejętności — dla MFD 1 i ½. Karta na czacie pokazuje wynik, próg i najtrudniejsze MFD, jakie udało się osiągnąć (przydaje się w [[tests/opposed|rzutach przeciwstawnych]]).

## MFD — trudność zadania {#mfd}

MFD (*Modifier for Difficulty*) mówi, jak trudne jest samo zadanie — niezależnie od tego, jak dobra jest postać. Mnożysz przez nie próg MFD 1. (s. 6–7)

| MFD | Trudność | Przykłady z podręcznika |
|---|---|---|
| 2 | bardzo łatwe | rozmowa z przyjaznym NPC, strzał ze śrutówki z przyłożenia |
| 1½ | łatwe | tropienie nieostrożnego kucyka, przejście obok śpiących strażników |
| 1 | normalne | zauważenie źle ukrytej miny, trafienie odkrytego celu w zasięgu, łatwy zamek |
| ¾ | trudne | przeciętny zamek lub terminal, uczciwa cena u obojętnego kupca |
| ½ | bardzo trudne | trudny zamek lub terminal, strzał do pilota lecącego vertibucka (z SATS) |
| ¼ | frustrująco trudne | bardzo trudny zamek lub terminal, strzał na ślepo zza barykady |
| 1/10 | ekstremalne | złożenie PipBucka z pamięci, ten sam strzał do pilota bez SATS |

Zadania „niemal niemożliwe” (trudniejsze niż 1/10) udają się tylko na krytycznym sukcesie.

### Kroki MFD

Wiele zasad mówi o **krokach**: „1 krok trudniej” to przesunięcie w dół tabeli (1 → ¾ → ½ → ¼ → 1/10), „1 krok łatwiej” — w górę (1 → 1½ → 2). Kroki dodają: zasięg, strzał celowany, okaleczenia, pogoda i światło, podtrzymywane zaklęcia.

### Premie i kary

Liczbowe premie i kary (+10, −25) dodajesz do progu **po** pomnożeniu przez MFD. Premie i kary do tej samej rzeczy sumują się i nie mają limitu — w odróżnieniu od rangi umiejętności, która nie przekracza 100. (s. 63, 126)

## Krytyki {#crit}

- **Krytyczny sukces: 1–5** na kości. Wyszło lepiej, niż ktokolwiek się spodziewał — co dokładnie, decyduje MG. (s. 8)
- **Krytyczna porażka: 96–100.** Nie tylko porażka — coś się psuje (w walce np. broń się zacina i trzeba ją naprawić).
- Perki mogą poszerzać te zakresy. Każdy przerzut [[tests/luck|kartą szczęścia]] poszerza oba zakresy o 5.
- Krytyczny sukces liczy się tylko wtedy, gdy na kości naprawdę wypadło 1–5. Premie, które „zbijają” wynik, nie robią z niego krytyka, a 96–100 zostaje krytyczną porażką mimo premii. (s. 55)

W walce krytyczne trafienie mnoży obrażenia przez mnożnik krytyczny broni — zob. [[combat/damage]].

> **Na karcie:** pole *Krytyki* w zakładce *Statystyki* pokazuje twoje aktualne zakresy (z perkami).

## Rzuty przeciwstawne, pomoc i wiedza {#opposed}

### Rzut przeciwstawny (s. 8)

Obie strony rzucają i podają **najtrudniejsze MFD**, jakie osiągnęły. Wygrywa ta, która osiągnęła trudniejsze (1/10 bije ¼). Przy remisie obie rzucają jeszcze raz. Krytyczny sukces remisuje tylko z krytycznym sukcesem, a krytyczna porażka prawie zawsze przegrywa.

Typowe pary: Sneak przeciw Perception, Magic rzucającego przeciw INT celu, Sneak złodzieja przeciw Perception okradanego.

### Skradanie się i światło (s. 49, 60, 438)

Zamiast rzutu przeciwstawnego można użyć MFD zależnego od czujności strażnika:

| Strażnik | MFD dla Sneak |
|---|---|
| śpi, jest ślepy albo obezwładniony | 2 |
| zmęczony albo czymś zajęty | 1½ |
| znudzony | 1 |
| skupiony | ¾ |
| uważny | ½ |
| w pogotowiu | ¼ |
| w pełnej gotowości, wie, że idziesz | tylko krytyk |

Jeśli strażnik rzuca Perception, osiągnięte przez niego MFD staje się MFD dla skradającego się; remis wygrywa strażnik.

| Światło | Sneak | Perception |
|---|---|---|
| ostre słońce, reflektory | 2 kroki trudniej | 1 krok łatwiej |
| stałe sztuczne światło (latarka PipBucka) | 1 krok trudniej | 0 |
| zwykły dzień, pochmurno | 0 | 0 |
| migające światło, zmierzch, ruiny za dnia | 0 | −5 |
| lampa, ognisko, wczesny wieczór | 1 krok łatwiej | −5 |
| ulewa, noc w mieście | 1 krok łatwiej | 1 krok trudniej |
| prawie ciemność, burza, nieoświetlone wnętrza | 2 kroki łatwiej | 2 kroki trudniej |

Ekwipunek cięższy niż 50 lb daje karę −5 do Sneak za każde rozpoczęte 10 lb ponad 50 (s. 438).

### Pomoc (s. 64)

Pomagający rzucają **przed** głównym rzutem, tą samą umiejętnością i na tym samym MFD. Każdy ich sukces (albo krytyczny sukces) ułatwia główny rzut o 1 krok, każda krytyczna porażka utrudnia o 1 krok. Gdy kilka postaci robi to samo naraz, prościej wziąć najlepszy wynik.

### Czy postać to wie? (s. 65)

Gdy nie wiadomo, czy postać coś wie, MG ustala MFD według tego, jak rzadka to wiedza. Rzucasz pasującą umiejętnością albo INT (+10, jeśli pasuje to do przeszłości postaci). Krytyk nie daje tu nic ponad sukces.

## Karty szczęścia {#luck}

Zasada opcjonalna „Live by Luck”, zalecana przez podręcznik. (s. 53–57)

- Na początku sesji dostajesz **połowę Luck zaokrągloną w górę + 2, minimum 3** karty. To jedyne miejsce w zasadach, gdzie zaokrąglasz w górę. Niewykorzystane karty przepadają po sesji.
- Kartę można oddać innemu graczowi za dwie swoje (s. 57).
- MG też ma karty: po jednej na gracza i dodatkowe za alikorny, piekielne psy, ghule, towarzyszy-zwierzęta.

### Na co wydać kartę

| Użycie | Jak działa |
|---|---|
| **Przerzut porażki** | Rzucasz jeszcze raz. Każdy przerzut poszerza zakres krytyków o 5 w obie strony (1–10 i 91–100, potem 1–15 i 86–100…), najwyżej do 50%. |
| **Ratowanie krytycznej porażki** | Karta + rzut Luck × 10. Sukces — zwykła porażka bez skutków ubocznych; krytyczny sukces — sukces; porażka — karta przepada (można dać następną); krytyczna porażka — koniec prób przy tym rzucie. |
| **Poprawa przed rzutem** | Przed rzutem: +10 do progu za kartę, najwyżej 5 kart. Krytyczny sukces zwraca wydane karty. |
| **Coś niesamowitego** | Wyczyn ponad możliwości postaci, jeśli MG się zgodzi (1–3 karty, może nadal wymagać rzutu). |
| **Poprawa fabuły** | Za zgodą MG zmieniasz to, co się właśnie stało. MG może zrobić to samo, ale daje wtedy kartę każdej postaci, której to dotyczy. |
| **Uniknięcie trafienia** | Po ogłoszeniu trafienia, przed obrażeniami: karta + Luck MFD 1. Sukces — pocisk chybia; krytyczny sukces — chybia z korzyścią dla ciebie. |
| **Zmniejszenie ran** | Karta od razu zdejmuje 1 ranę, potem rzucasz najniższym atrybutem na MFD 1 — każdy osiągnięty krok trudniej niż 1 zdejmuje kolejną ranę, krytyk zdejmuje wszystkie. Tylko w chwili otrzymania ran. |

> **Na karcie:** pasek *Szczęście* w nagłówku, przycisk *Nowa sesja* uzupełnia karty i SATS. Po nieudanym rzucie karta na czacie ma przycisk *Przerzuć za kartę szczęścia* — zakres krytyków poszerza się sam.

## S.P.E.C.I.A.L. {#attributes}

Siedem atrybutów; 5 to przeciętna. Próg atrybutu to wartość × 10. (s. 49–52)

| Atrybut | Za co odpowiada | Umiejętności |
|---|---|---|
| **STR** — Strength | obrażenia wręcz, udźwig, ciężar broni (do 2 × STR lb) | Melee (Dig) |
| **PER** — Perception | zauważanie, zasięg wzroku (5 ft × PER na przedział) | Energy Weapons, Explosives, Lockpicking |
| **END** — Endurance | ile ran zniesie każda lokacja; odporność na promieniowanie, skażenie i trucizny | Big Guns, Survival, Unarmed |
| **CHA** — Charisma | siła osobowości, przekonywanie | Mercantile, Speechcraft (Magic zebr) |
| **INT** — Intelligence | wiedza i myślenie; punkty umiejętności przy awansie | Medicine, Repair, Science, Magic |
| **AGI** — Agility | ruch, SATS, inicjatywa | Small Guns, Sneak, Flight |
| **LCK** — Luck | podstawa wszystkich umiejętności, karty szczęścia | — |

Spadek atrybutu do 0 ma poważne skutki (END 0 — śmierć, AGI 0 — bezruch, PER 0 — ślepota i głuchota). Atrybut nigdy nie przekracza 12. (s. 50–52)

### Wartości pochodne

- **Ruch:** 2,5 × AGI ft na akcję, w dół do pełnych 5 ft. Lot i kopanie: 5 × AGI ft. (s. 13)
- **SATS:** 40 + 5 × AGI punktów akcji. (s. 15)
- **Obrażenia na ranę:** 10 na 1. poziomie, +1 co 3 poziomy (najwyżej 20); Large +2, Pipsqueak i Young mniej. (s. 15)
- **Udźwig:** 100 + 10 × STR lb. Każde rozpoczęte 10 lb ponad udźwig to −5 ft ruchu na akcję. (s. 150)
- **Zasięg wzroku:** bez pomocy PipBucka 5 ft × PER; każdy kolejny taki przedział to 1 krok trudniej, najdalej 25 ft × PER. (s. 49)
- **Zmiana tymczasowa** (pancerz, chemia, choroba) daje powiązanym umiejętnościom ±5 za każdy punkt atrybutu. (s. 17)

## Umiejętności {#skills}

### Ranga i próg (s. 52, 62–63)

- **Ranga startowa** = 2 × atrybut + Luck / 2 + 2 (w dół), **minimum 5**.
- **Tag:** na start wybierasz 3 umiejętności, każda dostaje +15 rang (nie można tagować tej samej dwa razy). Tagi często podsuwają znaczek (*cutie mark*) postaci.
- Kolejność premii przy tworzeniu postaci: rasa → cechy i wady → tagi.
- **Próg MFD 1** = ranga + 5 × atrybut.
- Ranga nigdy nie przekracza 100; premie do rzutu nie mają limitu.

### Lista umiejętności (s. 58–61)

| Umiejętność | Atrybut | Do czego służy |
|---|---|---|
| Dig* | STR | kopanie tuneli, wspinaczka (piekielne psy, psy pustynne) |
| Melee | STR | broń do walki wręcz; ranga zwiększa premię STR do obrażeń |
| Energy Weapons | PER | broń energetyczna; +ranga/10 do obrażeń |
| Explosives | PER | rzucanie, podkładanie i rozbrajanie ładunków, rzucanie przedmiotów; ranga decyduje o sile wybuchu |
| Lockpicking | PER | zamki (potrzebne narzędzia) |
| Big Guns | END | ciężka broń i siodła bojowe; +ranga/10 do obrażeń |
| Survival | END | gotowanie, nawigacja, tropienie, zbieranie składników zebr |
| Unarmed | END | kopyta, róg, pazury, Power Shoes; ranga zwiększa premię STR |
| Mercantile | CHA | handel, ceny, szukanie rzadkich towarów |
| Speechcraft | CHA | przekonywanie NPC (nigdy innych graczy!) |
| Magic* | INT (zebry INT albo CHA) | zaklęcia, alchemia zebr, badanie magii |
| Medicine | INT | leczenie ran, trucizn i uzależnień |
| Repair | INT | naprawa i budowa broni, pancerzy i urządzeń |
| Science | INT | terminale, roboty, technika |
| Flight* | AGI | manewry lotu |
| Small Guns | AGI | broń palna; +ranga/10 do obrażeń |
| Sneak | AGI | skradanie się, kradzież kieszonkowa |

\* umiejętność rasowa — mają ją tylko rasy, które to potrafią.

### Premia STR do obrażeń wręcz (s. 58)

| Ranga Melee lub Unarmed | Premia do obrażeń |
|---|---|
| 0 i mniej | brak |
| 1–24 | STR |
| 25–49 | 2 × STR |
| 50–74 | 3 × STR |
| 75–99 | 4 × STR |
| 100 | 5 × STR |

### Siła wybuchów (s. 58–59)

Materiały wybuchowe i broń obszarowa z Big Guns zadają część wyrzuconych obrażeń zależnie od rangi: do 25 — 25%, 26–50 — 50%, 51–75 — 75%, 76–99 — 100%, 100 — 100% i +10 na każdą trafioną lokację.

> **Na karcie:** w tabeli umiejętności *Tag* to kwadracik (+15), *Pkt* — punkty z awansów, *Bonus* — rasa, cechy i perki, *Mod* — stała premia do rzutu. Kolumna MFD 1 już wszystko uwzględnia. Kursywą — umiejętności rasowe.

## Awans i PD {#levelup}

Co poziom postać dostaje (s. 125–127):

- **Punkty umiejętności:** 10 + INT / 2 (w dół) + perki (Egghead +2, kucyk ziemski +1). Wydajesz je **przed** wyborem perka, żeby spełnić jego wymagania; niewydane przepadają.
- **1 perk.** Rasy magiczne mogą zamiast perka wziąć zaklęcie lub recepturę, jeśli spełniają jej wymagania.
- **+1 obrażeń na ranę** co 3 poziomy, od 3. poziomu.

Najwyższy poziom to 30. MG może prowadzić grę bez PD i podnosić poziom całej drużynie naraz — podręcznik poleca to początkującym MG.

### Tabela XII — PD potrzebne na poziom (s. 125)

| Poziom | Wolna | Szybka | Poziom | Wolna | Szybka |
|---|---|---|---|---|---|
| 1 | 0 | 0 | 16 | 120 000 | 18 750 |
| 2 | 1 000 | 200 | 17 | 136 000 | 21 200 |
| 3 | 3 000 | 550 | 18 | 153 000 | 23 800 |
| 4 | 6 000 | 1 050 | 19 | 171 000 | 26 550 |
| 5 | 10 000 | 1 700 | 20 | 190 000 | 29 450 |
| 6 | 15 000 | 2 500 | 21 | 210 000 | 32 500 |
| 7 | 21 000 | 3 450 | 22 | 231 000 | 35 700 |
| 8 | 28 000 | 4 550 | 23 | 253 000 | 39 050 |
| 9 | 36 000 | 5 800 | 24 | 276 000 | 42 550 |
| 10 | 45 000 | 7 200 | 25 | 300 000 | 46 200 |
| 11 | 55 000 | 8 750 | 26 | 325 000 | 50 000 |
| 12 | 66 000 | 10 450 | 27 | 351 000 | 53 950 |
| 13 | 78 000 | 12 300 | 28 | 379 000 | 58 050 |
| 14 | 91 000 | 14 300 | 29 | 407 000 | 62 300 |
| 15 | 105 000 | 16 450 | 30 | 436 000 | 66 700 |

> **Na karcie:** przycisk *Awans* w nagłówku (podświetla się, gdy PD wystarczą), przycisk *PD* dla MG, strzałka cofa ostatni awans. Tabelę (wolna, szybka albo gra bez PD) wybiera MG w ustawieniach świata.
