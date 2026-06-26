# Wdrożenie i utrzymanie

## 1. Wymagania infrastrukturalne

- **Odrębna maszyna wirtualna** (zgodnie z `architektura.md` §2) — niewspółdzielona
  z serwerem EDM (Windows Server 2022). Rekomendacja: **Linux (Ubuntu LTS 22.04/24.04
  lub Debian 12)** — mniejsza powierzchnia ataku niż pełny Windows Server do
  uruchamiania kontenerów, prostsza automatyzacja aktualizacji bezpieczeństwa,
  brak dodatkowych kosztów licencyjnych. Wymagania minimalne na start: 2 vCPU,
  4 GB RAM, 60 GB dysku (więcej — w zależności od wolumenu obrazów USG;
  pojedyncze badanie USG to zwykle kilka–kilkadziesiąt MB, warto monitorować
  zużycie i skalować dysk w górę w razie potrzeby).
- Wolumen danych (baza + pliki) zamontowany na **zaszyfrowanym dysku** (LUKS) —
  konfiguracja na poziomie systemu operacyjnego, wykonywana raz przy
  przygotowaniu maszyny.
- Docker + Docker Compose (w repozytorium: `docker-compose.yml`, `Dockerfile`).
- Reverse proxy z TLS (np. Caddy — automatyczne certyfikaty Let's Encrypt, lub
  nginx + certyfikat komercyjny/Let's Encrypt przez certbot).
- Firewall: otwarte tylko porty 443 (HTTPS, z internetu) i 22 (SSH, **tylko**
  z zaufanych adresów IP / przez VPN administracyjny) — port bazy danych
  (5432) **nie** powinien być dostępny z internetu.

## 2. Zmienne środowiskowe (`.env`)

Patrz `.env.example` w repozytorium — kompletna lista z komentarzami. Najważniejsze
zasady:
- `.env` **nigdy nie jest commitowany** (w `.gitignore`).
- `FIELD_ENCRYPTION_KEY` i `SESSION_SECRET` generować przez
  `openssl rand -base64 32`, przechowywać w sejfie haseł zespołu (poza
  repozytorium i poza samym serwerem, jeśli to możliwe — np. menadżer
  sekretów).
- `DATABASE_URL` z `sslmode=require` w środowisku produkcyjnym.

## 3. Uruchomienie (środowisko produkcyjne, szkic)

```bash
git clone <repo> /opt/b2b-portal
cd /opt/b2b-portal
cp .env.example .env
# wypełnić .env (sekrety, adres bazy danych, domena)
docker compose -f docker-compose.yml up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run seed   # tworzy pierwsze konto administratora
```

Po pierwszym uruchomieniu — zalogować się jako administrator, **natychmiast**
zmienić hasło tymczasowe i założyć MFA (system wymusi to automatycznie).

## 4. Aktualizacje

```bash
git pull
docker compose build app
docker compose up -d app
docker compose exec app npx prisma migrate deploy
```

Rekomendacja: wykonywać poza godzinami pracy klinik, z wcześniejszym backupem
(§5).

## 5. Backup

- Baza danych: `docker compose exec db pg_dump -U <user> <db> | gzip > backup-$(date +%F).sql.gz`,
  uruchamiane przez cron codziennie, kopia przenoszona poza serwer (np. do
  innego ośrodka/storage).
- Pliki: katalog wskazany przez `STORAGE_ROOT` (obrazy USG, załączniki faktur)
  — codzienna kopia przyrostowa (np. `rsync`/`restic`) do osobnej lokalizacji.
- Klucz `FIELD_ENCRYPTION_KEY` — backup odrębny, w sejfie haseł, **nie** razem z
  backupem bazy danych (rozdzielenie "danych" i "klucza" — kompromitacja jednego
  backupu nie ujawnia danych szczególnej kategorii).

## 6. Monitoring (rekomendacja na kolejny etap)

- Health-check endpointu aplikacji + alert przy niedostępności.
- Alert przy serii nieudanych logowań / blokadach kont (sygnał możliwego
  ataku).
- Monitorowanie zużycia dysku (obrazy USG mogą rosnąć szybko).

## 7. Środowisko deweloperskie (lokalnie)

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate dev
npm run seed
npm run start:dev
```

Aplikacja domyślnie dostępna na `http://localhost:3000` (w deweloperskim
trybie ciasteczko sesyjne nie wymaga HTTPS — wymuszane jest tylko gdy
`NODE_ENV=production`).
