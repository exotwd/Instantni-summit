#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${DB_PATH:-/opt/mun-app/data/mun.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/mun-app/backups}"
mkdir -p "$BACKUP_DIR"
if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/mun-$(date +%F-%H%M%S).db'"
find "$BACKUP_DIR" -name 'mun-*.db' -mtime +30 -delete
