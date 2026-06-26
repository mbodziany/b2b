# Zgodność z RODO i przepisami sektorowymi

> **Zastrzeżenie**: ten dokument to analiza organizacyjno-techniczna sporządzona
> z perspektywy projektanta systemu IT, nie opinia prawna. Przed wdrożeniem
> produkcyjnym rekomendowana jest weryfikacja przez prawnika/IOD specjalizującego
> się w ochronie danych w sektorze medycznym — szczególnie w zakresie podstaw
> prawnych przetwarzania i treści umowy powierzenia.

## 1. Charakter danych

System przetwarza:

- **Dane finansowe** (faktury, kwoty, pozycje rozliczeniowe) — dane osobowe
  "zwykłe" w rozumieniu RODO (dotyczące zarówno przychodni jako podmiotu, jak i,
  pośrednio, pacjentów, których dotyczą poszczególne zlecenia).
- **Dane o zdrowiu** (wyniki badań USG — opisy i obrazy) powiązane z konkretnym
  pacjentem — to **dane szczególnej kategorii** w rozumieniu **art. 9 RODO**
  ("dane dotyczące zdrowia"). Wymagają one podwyższonego standardu ochrony i
  szczególnej podstawy prawnej przetwarzania (art. 9 ust. 2 RODO), nie tylko
  ogólnej podstawy z art. 6.

Z perspektywy RODO **przychodnia jest administratorem danych swoich pacjentów**.
Operator niniejszego systemu (Wykonawca) występuje w tej relacji jako
**podmiot przetwarzający (processor)** — przetwarza dane pacjentów w imieniu i
na polecenie przychodni, w zakresie niezbędnym do wykonania zleconej usługi
(np. wykonanie badania USG na zlecenie przychodni, wystawienie faktury za tę
usługę). Konsekwencje:

1. **Wymagana jest umowa powierzenia przetwarzania danych osobowych (art. 28
   RODO)** pomiędzy Wykonawcą a każdą przychodnią, zanim przychodnia zacznie
   korzystać z portalu. Umowa powinna określać w szczególności: zakres i cel
   przetwarzania, kategorie danych (w tym wprost — dane o zdrowiu), czas
   przetwarzania, obowiązek zachowania poufności, środki bezpieczeństwa
   (z odwołaniem do `bezpieczenstwo.md`), zasady podpowierzenia (subprocessing —
   np. dostawca hostingu, jeśli inny niż własna serwerownia), obowiązek
   zgłaszania incydentów Wykonawcy do przychodni (rekomendacja: **bez zbędnej
   zwłoki, nie później niż 24h** od wykrycia — krócej niż ustawowe 72h dla
   zgłoszenia do UODO, by przychodnia jako administrator miała czas zareagować),
   zasady audytu przez przychodnię, zasady usunięcia/zwrotu danych po
   zakończeniu współpracy.
2. Konta w systemie nadaje **administrator po stronie Wykonawcy** — co oznacza,
   że Wykonawca decyduje technicznie, kto ma dostęp. Rekomendacja: **przed
   utworzeniem konta dla pracownika przychodni Wykonawca powinien otrzymać
   pisemne/elektroniczne potwierdzenie od przychodni (np. e-mail od osoby
   upoważnionej), kogo i z jakimi uprawnieniami upoważnić** — inaczej Wykonawca
   sam decyduje, kto z personelu przychodni ma wgląd w dane pacjentów tej
   przychodni, co przeczy roli "wyłącznie processora" i powinno być
   uregulowane w umowie powierzenia (np. jako upoważnienie do nadawania
   dostępu na podstawie zgłoszeń przesłanych określonym kanałem przez
   wyznaczone osoby kontaktowe przychodni).

## 2. Podstawa prawna przetwarzania danych o zdrowiu

Najbardziej naturalne podstawy z art. 9 ust. 2 RODO dla tego przypadku:

- **lit. h)** — przetwarzanie niezbędne do celów profilaktyki zdrowotnej,
  medycyny pracy, oceny zdolności pracownika do pracy, diagnozy medycznej,
  zapewnienia opieki zdrowotnej, na podstawie prawa UE/państwa członkowskiego
  lub umowy z pracownikiem służby zdrowia, z zastrzeżeniem warunków z art. 9
  ust. 3 (tajemnica zawodowa/odpowiednik).
- w powiązaniu z przepisami krajowymi sektorowymi, w szczególności:
  - **ustawą o prawach pacjenta i Rzeczniku Praw Pacjenta** (zasady prowadzenia
    i udostępniania dokumentacji medycznej),
  - **ustawą o systemie informacji w ochronie zdrowia** (jeżeli dotyczy zakresu
    działalności Wykonawcy),
  - **ustawą o działalności leczniczej**, jeśli Wykonawca jest podmiotem
    leczniczym wykonującym badania USG na zlecenie przychodni.

To, którą podstawę i który przepis sektorowy wskazać precyzyjnie, zależy od
formy prawnej Wykonawcy (czy jest podmiotem leczniczym) i treści umów z
przychodniami — **do potwierdzenia z prawnikiem**, ale architektura systemu
(zgoda na minimalizację danych, kontrola dostępu, audyt) jest spełniona
niezależnie od finalnie wskazanej podstawy.

## 3. Minimalizacja danych

- System przechowuje wyłącznie dane niezbędne do realizacji celu: identyfikację
  pacjenta ogranicza się do pola `patientReference` (np. imię, nazwisko, ew.
  numer zlecenia/skierowania) — **bez przechowywania pełnej historii medycznej
  pacjenta** poza zakresem konkretnego zlecenia/badania, które jest przedmiotem
  przekazania.
- Rekomendacja do dalszej decyzji biznesowej: jeśli identyfikacja pacjenta nie
  musi obejmować pełnego PESEL (a wystarczy np. imię + nazwisko + data
  urodzenia, lub wewnętrzny numer zlecenia używany przez obie strony), warto
  ograniczyć zakres pola `patientReference` do minimum koniecznego do
  jednoznacznej identyfikacji przez personel przychodni — mniej danych w
  systemie = mniejsze ryzyko przy incydencie.
- Pole `patientReference` jest szyfrowane na poziomie aplikacji (zob.
  `bezpieczenstwo.md` §3) — dodatkowy środek minimalizujący skutki ewentualnego
  wycieku samej bazy danych.

## 4. Ocena skutków dla ochrony danych (DPIA, art. 35 RODO)

Przetwarzanie obejmuje dane szczególnej kategorii na dużą skalę (dane pacjentów
wielu przychodni) — **rekomendowane jest przeprowadzenie DPIA przed
uruchomieniem produkcyjnym**. Szkic zakresu DPIA:

1. Opis operacji przetwarzania i celów (jak w `architektura.md` §1).
2. Ocena niezbędności i proporcjonalności (czy zakres zbieranych danych
   ogranicza się do minimum — patrz §3).
3. Ocena ryzyka dla praw i wolności osób (pacjentów) — najważniejsze ryzyka:
   - nieautoryzowany dostęp do wyniku badania/faktury innej osoby/przychodni
     (mitygacja: `ClinicScopeGuard`, `PermissionGuard`, MFA, audyt — patrz
     `bezpieczenstwo.md`),
   - przejęcie konta pracownika przychodni (mitygacja: MFA obowiązkowe, blokada
     po nieudanych logowaniach, możliwość natychmiastowego zablokowania konta
     przez administratora),
   - wyciek bazy danych/plików (mitygacja: szyfrowanie dysku, szyfrowanie pól
     szczególnie wrażliwych, brak bezpośredniej ekspozycji bazy/plików do
     internetu),
   - nadmiarowy dostęp pracownika przychodni do danych niewłaściwego pacjenta
     wewnątrz tej samej przychodni (do rozważenia w kolejnym etapie: czy
     potrzebne jest dodatkowe ograniczenie "tylko swoi pacjenci" wewnątrz
     przychodni — obecnie każdy upoważniony użytkownik danej przychodni widzi
     wszystkie dane tej przychodni, analogicznie do tego, że dokumentacja
     medyczna pacjenta w przychodni jest dostępna upoważnionemu personelowi tej
     przychodni).
4. Środki minimalizujące ryzyko — odniesienie do `bezpieczenstwo.md`.
5. Konsultacja z IOD (jeśli Wykonawca lub przychodnie mają wyznaczonego
   Inspektora Ochrony Danych — w sektorze medycznym zazwyczaj jest to
   wymagane).

## 5. Rejestr czynności przetwarzania (art. 30 RODO)

Wykonawca powinien dodać do swojego rejestru czynności przetwarzania nową
pozycję: "Udostępnianie przychodniom danych o zleceniach/fakturach i wynikach
USG drogą elektroniczną", z opisem celu, kategorii danych, kategorii odbiorców
(przychodnie), okresu retencji, zastosowanych środków bezpieczeństwa.

## 6. Retencja i usuwanie danych

- Rekomendacja: określić okres przechowywania danych w systemie (np. zgodnie z
  przepisami o przechowywaniu dokumentacji medycznej — standardowo **20 lat**
  od końca roku kalendarzowego, w którym dokonano ostatniego wpisu, zgodnie z
  ustawą o prawach pacjenta, z zastrzeżeniem wyjątków ustawowych; dla danych
  czysto księgowych — zgodnie z przepisami podatkowymi, standardowo 5 lat).
  **Konkretny okres do potwierdzenia z prawnikiem/działem księgowości
  Zamawiającego** — system techniczny jest gotowy na wdrożenie automatycznej
  polityki retencji (np. joba archiwizującego/usuwającego dane po określonym
  czasie), ale sama wartość okresu nie jest "zaszyta" w kodzie — powinna być
  konfigurowalna.
- Po zakończeniu współpracy z przychodnią — zgodnie z umową powierzenia, dane
  powinny być zwrócone i/lub usunięte (z zachowaniem okresów ustawowych dot.
  dokumentacji medycznej, które mogą wymagać dalszego przechowywania mimo
  zakończenia współpracy operacyjnej).

## 7. Zgłaszanie naruszeń (art. 33–34 RODO)

- Operator (Wykonawca jako processor) ma obowiązek **bez zbędnej zwłoki**
  poinformować każdą przychodnię (administratora) o naruszeniu ochrony danych —
  rekomendacja: maksymalnie 24h od wykrycia, zapisana w umowie powierzenia.
- Przychodnia (jako administrator) ocenia, czy zgłasza naruszenie do UODO (w
  terminie 72h od wykrycia) i czy informuje osoby, których dane dotyczą.
- Log audytowy (`bezpieczenstwo.md` §7) jest kluczowym źródłem informacji
  potrzebnych do oceny zakresu naruszenia (kto, kiedy, do jakich danych miał
  dostęp).
- Rekomendacja: opracować wewnętrzną procedurę reagowania na incydenty
  (kto jest powiadamiany, w jakim czasie, jak się komunikuje z przychodniami)
  — poza zakresem kodu, do przygotowania organizacyjnie.

## 8. Inne przepisy, które warto zweryfikować z prawnikiem

- **Ustawa o krajowym systemie cyberbezpieczeństwa (KSC)** — zastosowanie
  zależy od skali działalności Wykonawcy i ewentualnego statusu operatora
  usługi kluczowej; zwykle nie dotyczy małych/średnich podmiotów medycznych,
  ale warto zweryfikować.
- **Rozporządzenie o europejskiej przestrzeni danych dotyczących zdrowia
  (EHDS)** — wchodzi w życie etapowo w UE, może w przyszłości wpływać na
  obowiązki dot. interoperacyjności i wymiany danych zdrowotnych — do
  monitorowania, nie blokuje wdrożenia MVP.
- **Tajemnica zawodowa pracowników medycznych** — dostęp personelu
  wewnętrznego Wykonawcy do danych pacjentów (np. przy wprowadzaniu wyników
  USG) powinien być objęty odpowiednimi klauzulami poufności w umowach o
  pracę/zlecenie.
