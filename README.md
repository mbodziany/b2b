# Portal B2B dla przychodni

Aplikacja webowa do elektronicznego udostępniania przychodniom (klientom B2B):

1. szczegółowych informacji o zleceniach wykonanych w ramach faktur (rozbicie
   pozycji faktury + załączniki),
2. wyników badań USG (opisy + obrazy).

Logują się przychodnie (organizacje) — w ich imieniu konkretni, nazwani
użytkownicy z indywidualnie przypisanymi uprawnieniami (wyniki USG,
faktury, lub obie kategorie). Po stronie operatora systemu administrator
zarządza kontami i uprawnieniami.

Pełna dokumentacja architektury, modelu danych, bezpieczeństwa, zgodności z
RODO i wdrożenia: katalog [`docs/`](./docs):

- [`docs/architektura.md`](./docs/architektura.md)
- [`docs/model-danych-i-uprawnien.md`](./docs/model-danych-i-uprawnien.md)
- [`docs/bezpieczenstwo.md`](./docs/bezpieczenstwo.md)
- [`docs/zgodnosc-rodo.md`](./docs/zgodnosc-rodo.md)
- [`docs/wdrozenie.md`](./docs/wdrozenie.md)

## Stos technologiczny

NestJS (TypeScript) + PostgreSQL (Prisma ORM) + widoki EJS renderowane po
stronie serwera (bez SPA — brak tokenów w localStorage). Sesje
uwierzytelniające trzymane w bazie danych (`express-session` +
`connect-pg-simple`), ciasteczko `HttpOnly`/`Secure`(prod)/`SameSite=Lax`.
Uzasadnienie wyborów — patrz `docs/architektura.md` i `docs/bezpieczenstwo.md`.

## Szybki start (lokalnie, bez Dockera)

```bash
cp .env.example .env
# wypełnić .env: DATABASE_URL do lokalnego Postgresa, SESSION_SECRET i
# FIELD_ENCRYPTION_KEY wygenerowane przez `openssl rand -base64 32`
npm install
npx prisma migrate dev
npm run seed       # tworzy pierwsze konto administratora, wypisuje hasło tymczasowe
npm run start:dev
```

Aplikacja domyślnie nasłuchuje na `http://localhost:3000`.

## Szybki start (Docker Compose)

```bash
cp .env.example .env
# wypełnić sekrety w .env
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run seed
```

Szczegóły produkcyjnego wdrożenia (firewall, backup, reverse proxy z TLS,
aktualizacje) — patrz [`docs/wdrozenie.md`](./docs/wdrozenie.md).

## Komendy

```bash
npm run build        # kompilacja TypeScript (nest build)
npm run start:dev     # serwer deweloperski z auto-reload
npm test              # testy jednostkowe (Jest)
npm run lint          # ESLint
npx prisma studio     # przeglądarka danych (tylko środowisko deweloperskie)
```
