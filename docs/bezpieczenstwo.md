# Bezpieczeństwo — przyjęte mechanizmy i polityki

Dokument opisuje konkretne mechanizmy bezpieczeństwa zaimplementowane w MVP oraz
te, które trzeba domknąć operacyjnie przed wdrożeniem produkcyjnym. Adresat:
zespół wdrażający i osoba odpowiedzialna za bezpieczeństwo informacji (IOD/ABI).

## 1. Uwierzytelnianie

- **Hasła**: haszowane algorytmem **Argon2id** (parametry pamięciowe dobrane pod
  serwer produkcyjny — do ustawienia w `auth.service.ts`/konfiguracji `argon2`),
  nigdy nie są przechowywane ani logowane w postaci jawnej.
- **Konta tworzy wyłącznie administrator** — brak samodzielnej rejestracji.
  Nowe konto otrzymuje jednorazowe, losowe hasło tymczasowe i flagę
  `mustChangePassword` — użytkownik musi je zmienić przy pierwszym logowaniu.
- **Blokada po nieudanych logowaniach**: po 5 nieudanych próbach konto jest
  blokowane czasowo (15 minut, narastająco przy kolejnych seriach) —
  ochrona przed atakiem brute-force/credential stuffing. Każda nieudana próba
  i każda blokada są odnotowywane w logu audytowym.
- **Uwierzytelnianie wieloczynnikowe (MFA/TOTP)** jest **obowiązkowe dla
  wszystkich kont** (administrator, personel wewnętrzny, użytkownicy klinik).
  Przy pierwszym logowaniu po zmianie hasła użytkownik zakłada MFA (kod QR do
  aplikacji typu Google Authenticator/Microsoft Authenticator/Authy), kolejne
  logowania wymagają kodu z aplikacji. Sekret TOTP jest szyfrowany w bazie
  (patrz §4).
- **Sesja**: po stronie serwera (sklepowana w PostgreSQL), identyfikator sesji w
  ciasteczku `HttpOnly`, `Secure` (wymuszone w produkcji), `SameSite=Lax`.
  Limit czasu bezczynności oraz maksymalny czas życia sesji — wymuszają
  ponowne zalogowanie nawet przy aktywnym korzystaniu po przekroczeniu limitu
  absolutnego.

## 2. Autoryzacja

- **RBAC** (role: `INTERNAL_ADMIN`, `INTERNAL_STAFF`, `CLINIC_USER`) — wymuszane
  przez `RolesGuard` na poziomie kontrolera/endpointu.
- **Izolacja danych między klinikami ("tenant scoping")** — `ClinicScopeGuard`
  sprawdza przy każdym żądaniu, że żądany zasób (faktura, badanie USG) należy do
  kliniki zalogowanego użytkownika. Złamanie tej reguły (np. próba odgadnięcia
  identyfikatora innej kliniki w adresie URL) skutkuje `403 Forbidden` i wpisem
  w logu audytowym.
- **Uprawnienia funkcjonalne** (`canViewInvoices`, `canViewUsg`) — `PermissionGuard`
  sprawdzany niezależnie od roli i od izolacji tenantowej — użytkownik bez
  danego uprawnienia nie zobaczy nawet nagłówków/listy danego typu danych, nie
  tylko szczegółów.
- Reguły autoryzacji są scentralizowane w `src/common/guards`, nie rozproszone
  po kontrolerach — pojedyncze miejsce przeglądu/audytu logiki.

## 3. Szyfrowanie

- **W transporcie**: wyłącznie HTTPS/TLS 1.2+ (TLS 1.3 preferowane) na reverse
  proxy, HSTS z `max-age` ≥ 6 miesięcy. Połączenie aplikacji z PostgreSQL przez
  TLS (`sslmode=require` w `DATABASE_URL` produkcyjnym).
- **W spoczynku — dysk**: wolumen z bazą danych i wolumen z plikami (obrazy USG,
  załączniki faktur) powinny być montowane na zaszyfrowanym dysku (LUKS na
  Linuksie lub szyfrowanie na poziomie dostawcy infrastruktury, jeśli maszyna
  jest wirtualna w zewnętrznej chmurze/hostingu). To ustawienie wykonywane jest
  na poziomie systemu operacyjnego/hypervisora — poza kodem aplikacji, opisane w
  `wdrozenie.md`.
- **W spoczynku — pola szczególnie wrażliwe**: identyfikator pacjenta powiązany
  z badaniem/zleceniem (`patientReference`) oraz sekret MFA (`mfaSecret`) są
  **dodatkowo szyfrowane na poziomie aplikacji** (AES-256-GCM, `CryptoService`,
  klucz w zmiennej środowiskowej `FIELD_ENCRYPTION_KEY`, nigdy w repozytorium).
  Dzięki temu nawet w przypadku wycieku samej bazy danych (np. nieautoryzowana
  kopia pliku bazy) dane wskazujące na konkretnego pacjenta nie są czytelne bez
  odrębnie przechowywanego klucza.
- Pliki (obrazy USG, PDF-y faktur) nie są nigdy serwowane jako pliki statyczne —
  każde pobranie przechodzi przez kontroler aplikacji, który weryfikuje
  uprawnienia i odnotowuje pobranie w logu audytowym (`StorageService` +
  trasy `.../download`).

## 4. Zarządzanie kluczami i sekretami

- Wszystkie sekrety (hasło do bazy, `FIELD_ENCRYPTION_KEY`, sekret sesji) są
  wstrzykiwane przez zmienne środowiskowe (`.env`, **nigdy commitowane**) —
  patrz `.env.example`.
- `FIELD_ENCRYPTION_KEY` to klucz 256-bitowy generowany jednorazowo przy
  wdrożeniu (`openssl rand -base64 32`) i przechowywany poza repozytorium kodu
  (menadżer sekretów / sejf haseł zespołu). Utrata klucza = utrata możliwości
  odczytu zaszyfrowanych pól — wymaga procedury backupu klucza odrębnie od
  backupu bazy danych.
- Rotacja kluczy/sekretów — rekomendacja: rotacja sekretu sesji i hasła do bazy
  danych co 12 miesięcy lub natychmiast po podejrzeniu wycieku.

## 5. Walidacja danych wejściowych i ochrona przed OWASP Top 10

- Wszystkie dane wejściowe walidowane przez `class-validator` (DTO) — odrzucenie
  nieprawidłowego formatu przed dotarciem do logiki biznesowej.
- Zapytania do bazy wyłącznie przez Prisma (zapytania parametryzowane) — brak
  budowania SQL ze stringów.
- Szablony EJS domyślnie kodują (escape) zmienne wyświetlane w HTML — ochrona
  przed XSS odbiciowym/zapisanym. Brak skryptów inline (CSP — patrz §6).
- **CSRF**: token synchronizujący w sesji, wstawiany jako pole skryte w każdym
  formularzu (`csrfToken` w widoku), weryfikowany dla każdego żądania
  zmieniającego stan (`POST`/`PUT`/`DELETE`) przez middleware.
- **Upload plików**: nazwa pliku generowana po stronie serwera (UUID) — nazwa
  nadana przez klienta nigdy nie trafia na dysk jako ścieżka (ochrona przed
  path traversal); whitelist dozwolonych typów MIME i rozszerzeń; limit
  rozmiaru pliku; liczona i zapisywana suma kontrolna SHA-256 (integralność —
  możliwość wykrycia podmiany pliku).
- **Rate limiting**: globalny limit żądań na adres IP (`@nestjs/throttler`),
  dodatkowy, bardziej restrykcyjny limit na endpoint logowania.

## 6. Nagłówki bezpieczeństwa (Helmet)

Konfiguracja w `src/main.ts`:
- `Content-Security-Policy`: `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'`
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (ochrona przed clickjackingiem — istotne, bo aplikacja
  pokazuje obrazy medyczne)
- `Referrer-Policy: no-referrer`

## 7. Logowanie zdarzeń i audyt

Tabela `AuditLog` (niemodyfikowalna z poziomu aplikacji — brak endpointu
update/delete) zapisuje co najmniej:

- logowania (sukces/porażka), wylogowania, blokady konta,
- działania administracyjne (utworzenie/zablokowanie/odblokowanie użytkownika,
  zmiana uprawnień, utworzenie kliniki),
- **każdy podgląd i każde pobranie danych szczególnie chronionych** (wynik USG,
  obraz USG, faktura, załącznik faktury) — kto, kiedy, czyje dane (klinika),
  z jakiego adresu IP.

Log audytowy jest podstawą do:
- wykrycia nieautoryzowanego dostępu,
- rozliczenia, kto i kiedy miał wgląd w dane konkretnego pacjenta — istotne przy
  ewentualnym wniosku o realizację praw osoby, której dane dotyczą, lub przy
  postępowaniu wyjaśniającym.

Rekomendacja operacyjna: log aplikacyjny eksportować/replikować do odrębnego,
zewnętrznego systemu logowania (np. syslog/SIEM), aby administrator systemu nie
mógł "po sobie" wyczyścić śladów — nie jest to zrealizowane w kodzie MVP
(wymaga infrastruktury logowania scentralizowanego), ale powinno być elementem
wdrożenia produkcyjnego.

## 8. Kopie zapasowe i ciągłość działania

- Codzienny backup bazy danych PostgreSQL (`pg_dump` lub backup na poziomie
  wolumenu) oraz backup katalogu z plikami (obrazy/załączniki), **szyfrowane**,
  przechowywane poza główną maszyną (inny nośnik/lokalizacja).
- Backup klucza `FIELD_ENCRYPTION_KEY` — odrębna procedura (np. sejf haseł
  zespołu) — bez niego backup bazy jest częściowo nieczytelny.
- Test odtworzenia z backupu — rekomendowany co najmniej raz na kwartał.
- Plan ciągłości działania (kto, w jakim czasie, jakim kanałem jest informowany
  o niedostępności systemu) — do opisania w wewnętrznej procedurze operacyjnej
  Zamawiającego.

## 9. Zarządzanie podatnościami

- `npm audit` / aktualizacja zależności — rekomendacja: cykliczne (np.
  tygodniowe) sprawdzanie i automatyczne PR-y (np. Dependabot/Renovate) po
  podłączeniu repozytorium do CI.
- Aktualizacje systemu operacyjnego serwera — automatyczne instalowanie
  poprawek bezpieczeństwa (unattended-upgrades na Ubuntu/Debian lub
  odpowiednik).
- Rekomendacja: przed udostępnieniem produkcyjnym — zewnętrzny test
  penetracyjny / przegląd bezpieczeństwa, szczególnie reguł izolacji
  tenantowej i kontroli dostępu do plików.

## 10. Co NIE jest jeszcze zrealizowane (do domknięcia przed produkcją)

- Integracja z zewnętrznym systemem logowania/SIEM (§7).
- Automatyczna rotacja kluczy.
- Skanowanie antywirusowe przesyłanych plików (rekomendacja: ClamAV jako
  kontener pomocniczy, skanujący plik po uploadzie, przed udostępnieniem do
  pobrania — w kodzie jest przygotowane miejsce integracji w
  `StorageService.save()`, oznaczone komentarzem `TODO`).
- Formalny test penetracyjny.
- Centralny monitoring/alerting (np. powiadomienie zespołu o serii nieudanych
  logowań, niedostępności usługi).
