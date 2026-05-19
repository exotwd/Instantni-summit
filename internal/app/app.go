package app

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"mun-app/internal/config"
	"mun-app/internal/database"
	"mun-app/internal/middleware"
)

type App struct {
	cfg  config.Config
	db   *sql.DB
	mux  *http.ServeMux
	deps *Dependencies
}

func New() (*App, error) {
	cfg := config.Load()
	db, err := database.OpenSQLite(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	if err := database.RunMigrations(context.Background(), db, cfg.MigrationsPath); err != nil {
		_ = db.Close()
		return nil, err
	}
	deps := newDependencies(db, cfg)
	if err := deps.Auth.EnsureDefaults(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	a := &App{cfg: cfg, db: db, mux: http.NewServeMux(), deps: deps}
	a.routes()
	return a, nil
}

func (a *App) Run() error {
	go a.autoCloseVoting()
	slog.Info("starting server", "addr", a.cfg.Addr)
	return http.ListenAndServe(a.cfg.Addr, middleware.Recovery(middleware.Logging(middleware.SecurityHeaders(a.mux))))
}

func (a *App) autoCloseVoting() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if err := a.deps.Voting.AutoCloseExpiredVoting(context.Background()); err != nil {
			slog.Warn("auto close voting failed", "error", err)
		}
	}
}
