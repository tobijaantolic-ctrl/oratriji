# Oratorij app

Preprost Node/Express app za vpise v delavnice na Oratoriju. Podatki se shranjujejo v SQLite bazo, ki je namenoma izkljucena iz Git repozitorija.

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

## Opombe

- Mapa `data/` in datoteke baze `regs.db*` niso objavljene na GitHub.
- Arhiv `oratorijapp.tar.gz` ni del repozitorija.
- Ce app tece za podpotjo, nastavi `BASE_PATH`, npr. `BASE_PATH=/oratorijapp`.
