package main

import (
	"context"
	"log"

	"mun-app/internal/config"
	"mun-app/internal/database"
)

func main() {
	cfg := config.Load()
	db, err := database.OpenSQLite(cfg.DBPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := database.RunMigrations(context.Background(), db, cfg.MigrationsPath); err != nil {
		log.Fatal(err)
	}
}
