# Ubuntu VPS Deployment

Install dependencies:

```bash
sudo apt update
sudo apt install -y build-essential sqlite3 curl git rsync ufw
curl -fsSL https://go.dev/dl/go1.25.0.linux-amd64.tar.gz -o /tmp/go.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf /tmp/go.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs caddy
```

Create user and directories:

```bash
sudo useradd --system --home /opt/mun-app --shell /usr/sbin/nologin munapp
sudo mkdir -p /opt/mun-app/{data,backups,web,migrations}
sudo chown -R munapp:munapp /opt/mun-app
```

Build and install:

```bash
git clone <repo-url> mun-app
cd mun-app
npm run build
go build -o bin/mun-app ./cmd/server
sudo install -m 0755 bin/mun-app /opt/mun-app/mun-app
sudo rsync -a web/ /opt/mun-app/web/
sudo rsync -a migrations/ /opt/mun-app/migrations/
sudo rsync -a scripts/ /opt/mun-app/scripts/
sudo cp .env.example /opt/mun-app/.env
sudo chown -R munapp:munapp /opt/mun-app
```

Edit `/opt/mun-app/.env` and set a long random `APP_SECRET`. The default app listener is `APP_ADDR=127.0.0.1:8067`, which keeps the Go process inside the allowed 8067-8070 range.

Install systemd:

```bash
sudo cp deploy/mun-app.service /etc/systemd/system/mun-app.service
sudo systemctl daemon-reload
sudo systemctl enable --now mun-app
sudo journalctl -u mun-app -f
```

Configure Caddy:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Firewall and healthcheck:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8068/tcp
sudo ufw enable
curl -f http://127.0.0.1:8067/healthz
```

The bundled Caddy example listens on public port `8068`, proxies to the Go app on `127.0.0.1:8067`, and disables Caddy's default admin port `2019`. If you cannot use ports `80` or `443`, access the app as `http://your-server:8068/admin` and keep `COOKIE_SECURE=false` unless you provide TLS on a custom allowed port.

Backup and restore:

```bash
sudo -u munapp DB_PATH=/opt/mun-app/data/mun.db BACKUP_DIR=/opt/mun-app/backups /opt/mun-app/scripts/backup.sh
sudo systemctl stop mun-app
sudo -u munapp DB_PATH=/opt/mun-app/data/mun.db /opt/mun-app/scripts/restore.sh /opt/mun-app/backups/mun-YYYY-MM-DD-HHMMSS.db
sudo systemctl start mun-app
```
