# MUN Chair System

Webova aplikace pro rizeni MUN vyboru: admin panel, projekce, mobilni hlasovani delegatu, SQLite persistence a realtime synchronizace pres SSE.

## Lokalni spusteni

```bash
cp .env.example .env
make dev
```

Vychozi pristupy:

- admin PIN: `1234`
- screen PIN: `5678`

Rozhrani:

- admin: `http://localhost:8080/admin`
- projekce: `http://localhost:8080/screen`
- hlasovani: `http://localhost:8080/vote`
- healthcheck: `http://localhost:8080/healthz`

## Testy a build

```bash
make test
make build
```

SQLite migrace se spousti automaticky pri startu serveru. Databaze bezi ve WAL rezimu a server je zdrojem pravdy pro vsechny stavy.
