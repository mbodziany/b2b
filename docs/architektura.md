# Architektura systemu — Portal B2B dla przychodni

## 1. Cel i kontekst

System służy do elektronicznego przekazywania przychodniom (klientom B2B):

1. **Szczegółowych informacji o zleceniach wykonanych w ramach faktur** (rozbicie pozycji
   faktury na konkretne usługi/zlecenia) wraz z załącznikami do faktur (np. PDF faktury,
   specyfikacje).
2. **Wyników badań USG** — opisów oraz obrazów/zdjęć z badania.

Logują się **organizacje (przychodnie)**, a w ich imieniu — konkretni, nazwani
pracownicy przychodni (użytkownicy). Każdy użytkownik ma indywidualne konto i
indywidualnie przypisane uprawnienia. Drugą stroną są **użytkownicy wewnętrzni**
(po stronie operatora systemu): administrator (zarządza kontami i uprawnieniami) oraz
personel wprowadzający dane (faktury, wyniki USG).

Dane, którymi system operuje, to w części **dane osobowe szczególnej kategorii**
(dane o zdrowiu, art. 9 RODO) powiązane z danymi finansowymi — stąd wymagania
bezpieczeństwa są podwyższone względem typowej aplikacji B2B. Szczegóły prawne —
patrz `zgodnosc-rodo.md`.

## 2. Zasada izolacji od istniejącego systemu EDM

Organizacja posiada już system elektronicznej dokumentacji medycznej (EDM)
wystawiony do internetu na Windows Server 2022. **Nowa aplikacja jest budowana
jako odrębny system, na odrębnym serwerze/maszynie wirtualnej**, nie współdzieli
bazy danych, kont serwisowych, certyfikatów ani sieci wewnętrznej z EDM. Powody:

- **Ograniczenie skutków incydentu** — kompromitacja jednego systemu nie daje
  automatycznie dostępu do drugiego (różne dane, różni użytkownicy, różne
  podatności).
- **Niezależne cykle aktualizacji i utrzymania** — łatka/awaria jednego systemu
  nie wpływa na dostępność drugiego.
- **Czytelność odpowiedzialności** — łatwiej wykazać przed audytorem/UODO, jakie
  dane przetwarza który system i na jakiej podstawie.

Rekomendacja: nowa, odrębna maszyna wirtualna (Linux, patrz uzasadnienie technologii
w `wdrozenie.md`), w odrębnym segmencie sieci (VLAN / grupa zabezpieczeń), z
regułami firewall ograniczającymi ruch tylko do niezbędnych portów (443/HTTPS
z internetu, SSH tylko z zaufanych adresów/VPN administracyjnego).

## 3. Komponenty systemu

```
                         ┌─────────────────────────────┐
                         │        Internet (TLS)        │
                         └───────────────┬──────────────┘
                                         │ 443/HTTPS (HSTS, TLS 1.2+)
                          ┌──────────────▼───────────────┐
                          │   Reverse proxy / TLS term.   │
                          │   (nginx lub Caddy)            │
                          │   - terminacja TLS              │
                          │   - rate limiting na poziomie IP │
                          │   - nagłówki bezpieczeństwa      │
                          └──────────────┬───────────────┘
                                         │ 127.0.0.1 / sieć wewn. kontenerów
                          ┌──────────────▼───────────────┐
                          │  Aplikacja (Node.js / NestJS) │
                          │  - uwierzytelnianie + MFA      │
                          │  - autoryzacja (RBAC + zakres   │
                          │    danej kliniki)                │
                          │  - logika biznesowa               │
                          │  - log audytowy                    │
                          └────┬──────────────────┬───────┘
                               │                  │
                  ┌────────────▼───────┐  ┌────────▼─────────────┐
                  │ PostgreSQL          │  │ Magazyn plików         │
                  │ (dane strukturalne, │  │ (obrazy USG, załączniki│
                  │  log audytowy)      │  │  faktur) — wolumin      │
                  │  szyfrowany dysk    │  │  szyfrowany, poza        │
                  │  (LUKS/odpowiednik) │  │  katalogiem publicznym   │
                  └─────────────────────┘  └──────────────────────┘
```

Wszystkie wymienione elementy znajdują się na **jednej, nowej, dedykowanej
maszynie** (lub kilku — np. baza danych na odrębnym wolumenie/instancji), w
architekturze, którą można w przyszłości łatwo rozbić na więcej węzłów (np.
osobny serwer plików), gdy wolumen danych wzrośnie.

## 4. Wybór technologii i uzasadnienie

Użytkownik nie miał preferencji technologicznych — wybór poniżej kierował się
kryterium **bezpieczeństwa, przewidywalności i łatwości audytu**, nie modą:

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Backend | **Node.js 22 LTS + NestJS (TypeScript)** | Silne typowanie (mniej błędów klasy "pomyłka typu"), architektura oparta o Guard/Interceptor wprost odwzorowująca reguły RBAC i logowanie audytowe jako odrębne, łatwe do przeglądu warstwy. Duża, aktywnie wspierana baza bibliotek bezpieczeństwa (helmet, argon2, otplib, class-validator). |
| Baza danych | **PostgreSQL** | Pełna zgodność ACID (istotna przy danych finansowych), natywne wsparcie szyfrowania połączenia (TLS) i szyfrowania dysku, brak kosztów licencyjnych, dostęp przez Prisma ORM z zapytaniami parametryzowanymi (ochrona przed SQL injection "z definicji"). |
| ORM | **Prisma** | Generowane typy, parametryzowane zapytania, czytelne migracje wersjonowane w repozytorium (ślad audytowy zmian schematu). |
| Renderowanie UI | **Server-side rendering (EJS)** | Brak tokenów sesji przechowywanych w `localStorage` (mniejsza powierzchnia ataku XSS na dane uwierzytelniające), prostszy model bezpieczeństwa sesji opartej o ciasteczka `HttpOnly`+`Secure`+`SameSite`. |
| Reverse proxy | **nginx lub Caddy** | Terminacja TLS, automatyczne odnawianie certyfikatów (Let's Encrypt) lub integracja z certyfikatem komercyjnym, dodatkowa warstwa nagłówków/limitów. |
| Konteneryzacja | **Docker / Docker Compose** | Powtarzalne, wersjonowane środowisko; łatwe odtworzenie na nowej maszynie w razie awarii; izolacja procesów aplikacji od systemu operacyjnego hosta. |

Stos jest świadomie "nudny" (boring technology) — każdy z elementów ma wieloletnią
historię, duże community bezpieczeństwa i jest szeroko stosowany w sektorach
regulowanych. Jeśli zespół po stronie Zamawiającego ma już kompetencje w innym
stosie (np. .NET, Java), kod aplikacyjny można przepisać zachowując ten sam model
danych i te samie reguły bezpieczeństwa — najważniejsze decyzje (RBAC, audyt,
szyfrowanie, MFA) są opisane w sposób niezależny od konkretnego frameworka.

## 5. Role i model uprawnień (skrót — szczegóły w `model-danych-i-uprawnien.md`)

- **Administrator (wewnętrzny)** — zarządza kontami użytkowników klinik (tworzy,
  blokuje/odblokowuje, przypisuje uprawnienia), przegląda log audytowy, zarządza
  kontami klinik.
- **Personel wewnętrzny (staff)** — wprowadza faktury/zlecenia i wyniki USG
  (rola operacyjna, bez dostępu do zarządzania kontami).
- **Użytkownik kliniki (zewnętrzny)** — przypisany do **jednej** kliniki, widzi
  wyłącznie dane tej kliniki, w zakresie nadanych mu uprawnień:
  - `canViewInvoices` — podgląd zleceń/faktur i ich załączników,
  - `canViewUsg` — podgląd wyników USG (opisy i obrazy),
  - oba uprawnienia mogą być nadane jednocześnie.

Każde zwiększenie/zmniejszenie uprawnień oraz każda blokada/odblokowanie konta
jest odnotowywana w logu audytowym z podaniem administratora, który dokonał
zmiany, oraz znacznika czasu.

## 6. Granice bezpieczeństwa (trust boundaries)

1. **Internet ↔ reverse proxy** — wyłącznie HTTPS, HSTS, brak ruchu po porcie 80
   poza przekierowaniem na 443.
2. **Reverse proxy ↔ aplikacja** — ruch ograniczony do sieci wewnętrznej hosta
   (Docker network) lub `127.0.0.1`.
3. **Aplikacja ↔ baza danych / magazyn plików** — połączenie szyfrowane (TLS do
   PostgreSQL), dane na dysku na wolumenie szyfrowanym, dostęp tylko z procesu
   aplikacji (brak bezpośredniej ekspozycji portu 5432 do internetu).
4. **Użytkownik kliniki ↔ dane innej kliniki** — wymuszane programowo na każdym
   zapytaniu (tzw. "tenant scoping") — patrz `ClinicScopeGuard` w kodzie —
   niezależnie od warstwy UI.
5. **Użytkownik kliniki ↔ funkcje administracyjne** — całkowicie odrębna
   przestrzeń adresów URL (`/internal/...`) niedostępna dla roli `CLINIC_USER`.

## 7. Co dalej (poza zakresem obecnego MVP)

- Integracja z systemem księgowym/fakturowym Zamawiającego do automatycznego
  zasilania danych o fakturach (obecnie dane wprowadza personel wewnętrzny
  ręcznie przez panel — wystarczające dla startu, do zautomatyzowania w kolejnym
  etapie importem/ API).
  - Integracja z systemem RIS/PACS, jeśli badania USG są już gdzieś
  archiwizowane elektronicznie (uniknięcie podwójnego wprowadzania danych).
- Powiadomienia e-mail do użytkownika kliniki o nowym wyniku/fakturze (bez
  ujawniania treści w treści e-maila — wyłącznie link do zalogowania).
- Eksport danych w ustrukturyzowanym formacie (np. CSV/JSON) dla klinik, które
  chcą zaimportować dane do własnych systemów.
