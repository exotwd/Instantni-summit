#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${DB_PATH:-/opt/mun-app/data/mun.db}"
BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 /path/to/backup.db" >&2
  exit 1
fi
install -m 0640 "$BACKUP_FILE" "$DB_PATH"
echo "Restored $BACKUP_FILE to $DB_PATH"
