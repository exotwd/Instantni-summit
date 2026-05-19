#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/mun-app}"
BIN="${BIN:-bin/mun-app}"
if [ ! -x "$BIN" ]; then
  echo "Build binary first: make build" >&2
  exit 1
fi
sudo install -d -o munapp -g munapp "$APP_DIR" "$APP_DIR/data" "$APP_DIR/backups"
sudo install -m 0755 "$BIN" "$APP_DIR/mun-app"
sudo rsync -a --delete web/ "$APP_DIR/web/"
sudo rsync -a --delete migrations/ "$APP_DIR/migrations/"
sudo rsync -a --delete scripts/ "$APP_DIR/scripts/"
sudo systemctl restart mun-app
sudo systemctl status mun-app --no-pager
