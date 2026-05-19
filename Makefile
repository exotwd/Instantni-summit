APP_NAME=mun-app
BIN_DIR=bin
DB_PATH?=./data/mun.db
APP_ADDR?=127.0.0.1:8067

.PHONY: dev build test migrate backup clean

dev:
	APP_ADDR=$(APP_ADDR) DB_PATH=$(DB_PATH) MIGRATIONS_PATH=migrations STATIC_DIR=web BACKUP_DIR=./backups go run ./cmd/server

build:
	bun run build
	go build -o $(BIN_DIR)/$(APP_NAME) ./cmd/server

test:
	go test ./...

migrate:
	DB_PATH=$(DB_PATH) MIGRATIONS_PATH=migrations go run ./cmd/migrate

backup:
	DB_PATH=$(DB_PATH) BACKUP_DIR=./backups ./scripts/backup.sh

clean:
	rm -rf $(BIN_DIR) data backups web-dist
