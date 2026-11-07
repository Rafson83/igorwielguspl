# 🔧🎮 Blog Osobisty – Igor Wielgus (`igorwielgus.pl`)

Blog stworzony w technologii **Astro + MDX** w klimacie **Dark Garage & Gaming Neon**.
Zaprojektowany do **nauki przez tworzenie** – łączy wiedzę ze **Szkoły Branżowej w ZST w Lipnie (kierunek: Mechanik Pojazdów Samochodowych, 2. rok)** oraz pasję do gier i symulatorów jazdy.

---

## 🚀 Jak uruchomić bloga lokalnie?

1. Zainstaluj zależności (tylko za pierwszym razem):
   ```bash
   npm install
   ```
2. Uruchom serwer deweloperski z podglądem na żywo:
   ```bash
   npm run dev
   ```
3. Otwórz w przeglądarce: `http://localhost:4321`

---

## ✍️ Jak dodać nowy artykuł?

Wszystkie wpisy znajdują się w katalogu:
`src/content/blog/`

Możesz:
- Wejść na podstronę **Strefa Twórcy (`/jak-pisac`)** na uruchomionym blogu, wpisać tytuł, zaznaczyć dodatki (Quiz, Kalkulator mocy, Karta oceny gry) i skopiować gotowy kod `.mdx`.
- Lub skopiować dowolny istniejący plik `.mdx` w `src/content/blog/` i zmienić jego treść!

### Dostępne interaktywne komponenty w artykułach `.mdx`:
- `<PowerCalculator defaultTorque={340} defaultRpm={4000} defaultWeight={1420} />` – interaktywny kalkulator mocy (KM / kW) i stosunku mocy do masy
- `<MechanicQuiz title="..." questions={[...]} />` – quiz sprawdzający wiedzę czytelnika z wyjaśnieniami
- `<GameScoreCard ... />` – karta recenzji i oceny gry z paskami postępu oraz sekcją Plusy/Minusy
- `<WorkshopTip title="..." type="warsztat">...</WorkshopTip>` – wyróżniona wskazówka z warsztatu
