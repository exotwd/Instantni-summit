# MUN Chair System

Webova aplikace pro rizeni MUN vyboru: admin panel, projekce, mobilni hlasovani delegatu, SQLite persistence a realtime synchronizace pres SSE.

## Lokalni spusteni

```bash
cp .env.example .env
make dev
```

Vychozi pristupy:

- admin PIN: `summit-admin-2026`
- screen PIN: `5678`

Rozhrani:

- admin: `http://localhost:8067/admin`
- projekce: `http://localhost:8067/screen`
- hlasovani: `http://localhost:8067/vote`
- healthcheck: `http://localhost:8067/healthz`

## Testy a build

```bash
make test
make build
```

SQLite migrace se spousti automaticky pri startu serveru. Databaze bezi ve WAL rezimu a server je zdrojem pravdy pro vsechny stavy.




Spuštění
cd /home/ubuntu/instantni-summit
export PATH="$HOME/.bun/bin:/usr/local/go/bin:$PATH"

go build -a -o /tmp/mun-app-new ./cmd/server

sudo systemctl stop mun-app
sudo install -m 0755 /tmp/mun-app-new /opt/mun-app/mun-app
sudo chown munapp:munapp /opt/mun-app/mun-app
sudo systemctl start mun-app
sudo systemctl status mun-app --no-pager
