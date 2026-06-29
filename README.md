# Oratorij app

Preprost Node/Express app za vpise v delavnice na Oratoriju.

App lokalno uporablja SQLite. V produkciji uporabi Postgres/Supabase prek `DATABASE_URL`, da se podatki ne izgubijo ob restartu ali uspavanju hostinga.

## Online deploy: Render + Supabase

1. V Supabase ustvari nov projekt.
2. V Supabase odpri **Project Settings -> Database** in skopiraj Postgres connection string.
3. Na Render ustvari nov **Blueprint** iz tega GitHub repozitorija.
4. Render bo prebral `render.yaml` in ustvaril free web service iz mape `backend`.
5. V Render environment variables nastavi:

```text
DATABASE_URL=postgresql://...
```

Render app nato dobi javen HTTPS URL. Podatki se shranjujejo v Supabase Postgres bazo, ne v lokalni disk Renderja.

## Prenos lokalne SQLite baze v Supabase/Postgres

Ko imas `DATABASE_URL`, lahko enkrat preneses trenutne lokalne podatke:

```bash
cd backend
DATABASE_URL="postgresql://..." npm run migrate:postgres
```

Ce je SQLite baza na drugi lokaciji, dodaj `SQLITE_PATH`:

```bash
cd backend
SQLITE_PATH="../data/regs.db" DATABASE_URL="postgresql://..." npm run migrate:postgres
```

## Zagon z Docker Compose

```bash
docker compose up --build
```

App bo dosegljiv na:

```text
http://localhost:3000
```

## Lokalni zagon

```bash
cd backend
npm install
DATA_DIR=../data npm start
```

Lokalno s Postgres/Supabase:

```bash
cd backend
DATABASE_URL="postgresql://..." npm start
```

## Opombe

- Mapa `data/` in datoteke baze `regs.db*` niso objavljene na GitHub.
- Arhiv `oratorijapp.tar.gz` ni del repozitorija.
- Ce app tece za podpotjo, nastavi `BASE_PATH`, npr. `BASE_PATH=/oratorijapp`.
