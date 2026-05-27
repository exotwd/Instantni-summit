# Ubuntu VPS Deployment

These commands assume the repository is already cloned to `/home/ubuntu/instantni-summit` and the app may only use ports `8067-8070`.

## 1. Install dependencies

```bash
sudo apt update
sudo apt install -y build-essential sqlite3 curl git rsync iptables-persistent

curl -fsSL https://go.dev/dl/go1.25.0.linux-amd64.tar.gz -o /tmp/go.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf /tmp/go.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh
export PATH="$PATH:/usr/local/go/bin"

curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

## 2. Build from the cloned repository

```bash
cd /home/ubuntu/instantni-summit
bun install
bun run build
go build -o bin/mun-app ./cmd/server
```

## 3. Install to `/opt/mun-app`

```bash
sudo useradd --system --home /opt/mun-app --shell /usr/sbin/nologin munapp || true
sudo mkdir -p /opt/mun-app/{data,backups,web,migrations,scripts}
sudo install -m 0755 bin/mun-app /opt/mun-app/mun-app
sudo rsync -a --delete web/ /opt/mun-app/web/
sudo rsync -a --delete migrations/ /opt/mun-app/migrations/
sudo rsync -a --delete scripts/ /opt/mun-app/scripts/
sudo cp .env.example /opt/mun-app/.env
sudo chown -R munapp:munapp /opt/mun-app
```

Edit `/opt/mun-app/.env`:

```bash
sudo nano /opt/mun-app/.env
```

Use this port-safe baseline:

```env
APP_ADDR=127.0.0.1:8067
DB_PATH=/opt/mun-app/data/mun.db
MIGRATIONS_PATH=/opt/mun-app/migrations
STATIC_DIR=/opt/mun-app/web
BACKUP_DIR=/opt/mun-app/backups
COOKIE_SECURE=false
```

Set a long random `APP_SECRET`.

## 4. Install and start systemd service

```bash
cd /home/ubuntu/instantni-summit
sudo cp deploy/mun-app.service /etc/systemd/system/mun-app.service
sudo systemctl daemon-reload
sudo systemctl enable --now mun-app
sudo systemctl status mun-app --no-pager
sudo journalctl -u mun-app -f
```

Health check:

```bash
curl -f http://127.0.0.1:8067/healthz
```

## 5. Public access

The examples below use `iptables`, not `ufw`. Keep SSH open before changing default input policy.

Common baseline for both options:

```bash
sudo iptables -I INPUT -i lo -j ACCEPT
sudo iptables -I INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT
```

### Option A: no reverse proxy

Expose the Go app directly on allowed port `8067`:

```bash
sudo sed -i 's/^APP_ADDR=.*/APP_ADDR=0.0.0.0:8067/' /opt/mun-app/.env
sudo systemctl restart mun-app
sudo iptables -I INPUT -p tcp --dport 8067 -j ACCEPT
sudo iptables -P INPUT DROP
sudo netfilter-persistent save
```

Open `http://YOUR_SERVER_IP:8067/admin`.

### Option B: Caddy on allowed port `8068`

If `sudo systemctl restart caddy` says `Unit caddy.service not found`, Caddy is not installed:

```bash
sudo apt update
sudo apt install -y caddy
sudo systemctl stop caddy || true
```

Then install the bundled Caddy config:

```bash
cd /home/ubuntu/instantni-summit
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo iptables -I INPUT -p tcp --dport 8068 -j ACCEPT
sudo iptables -P INPUT DROP
sudo netfilter-persistent save
```

Open `http://YOUR_SERVER_IP:8068/admin`.

The bundled Caddyfile disables Caddy's default admin listener and proxies `:8068` to the Go app on `127.0.0.1:8067`, keeping all application ports in the `8067-8070` range.

## 6. Domain and SSL

Use this when the site should be available as `https://summit.example.com` instead of `http://SERVER_IP:8067`.

### DNS

Create an `A` record at your DNS provider:

```text
summit.example.com  A  YOUR_SERVER_IP
```

Wait until it resolves:

```bash
dig +short summit.example.com
```

### App environment

Keep the Go app private on localhost and let Caddy terminate HTTPS:

```bash
sudo sed -i 's/^APP_ADDR=.*/APP_ADDR=127.0.0.1:8067/' /opt/mun-app/.env
sudo sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' /opt/mun-app/.env
sudo systemctl restart mun-app
```

### Caddy with automatic HTTPS

Install Caddy if needed:

```bash
sudo apt update
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
{
	admin off
}

summit.example.com {
	reverse_proxy 127.0.0.1:8067
	encode zstd gzip
}
EOF
```

Replace `summit.example.com` with the real domain. Then validate and restart:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl restart caddy
```

### iptables for HTTPS

Allow HTTP and HTTPS for Caddy. Port `80` is required for Let's Encrypt HTTP validation and redirect; port `443` serves the site.

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -P INPUT DROP
sudo netfilter-persistent save
```

Open `https://summit.example.com/admin`.

Troubleshooting:

```bash
sudo journalctl -u caddy -f
sudo journalctl -u mun-app -f
curl -f http://127.0.0.1:8067/healthz
```

## 7. Push code changes to the app on port `8067`

The Go app listens on `127.0.0.1:8067`. Pushing code changes means pulling the new code on the server, rebuilding, installing files into `/opt/mun-app`, and restarting `mun-app`.

```bash
cd /home/ubuntu/instantni-summit
git pull
export PATH="$HOME/.bun/bin:/usr/local/go/bin:$PATH"
bun install
bun run build
go build -o bin/mun-app ./cmd/server
sudo ./scripts/deploy.sh
```

If `scripts/deploy.sh` is missing on the server, use the manual install commands:

```bash
sudo install -m 0755 bin/mun-app /opt/mun-app/mun-app
sudo rsync -a --delete web/ /opt/mun-app/web/
sudo rsync -a --delete migrations/ /opt/mun-app/migrations/
sudo rsync -a --delete scripts/ /opt/mun-app/scripts/
sudo chown -R munapp:munapp /opt/mun-app
sudo systemctl restart mun-app
```

Verify that the updated app is running on `8067`:

```bash
curl -f http://127.0.0.1:8067/healthz
sudo systemctl status mun-app --no-pager
```

If new migrations were added, they run automatically at app startup.

## 8. Backup and restore

Backup:

```bash
sudo -u munapp DB_PATH=/opt/mun-app/data/mun.db BACKUP_DIR=/opt/mun-app/backups /opt/mun-app/scripts/backup.sh
```

Restore:

```bash
sudo systemctl stop mun-app
sudo -u munapp DB_PATH=/opt/mun-app/data/mun.db /opt/mun-app/scripts/restore.sh /opt/mun-app/backups/mun-YYYY-MM-DD-HHMMSS.db
sudo systemctl start mun-app
```
