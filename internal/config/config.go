package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Addr             string
	DBPath           string
	MigrationsPath   string
	StaticDir        string
	BackupDir        string
	AppSecret        string
	CookieSecure     bool
	AdminTokenTTL    time.Duration
	ScreenTokenTTL   time.Duration
	DelegateTokenTTL time.Duration
	DefaultAdminPIN   string
	DefaultScreenPIN  string
	ConferenceName   string
	CommitteeName    string
}

func Load() Config {
	return Config{
		Addr:             env("APP_ADDR", "127.0.0.1:8067"),
		DBPath:           env("DB_PATH", "/opt/mun-app/data/mun.db"),
		MigrationsPath:   env("MIGRATIONS_PATH", "migrations"),
		StaticDir:        env("STATIC_DIR", "web"),
		BackupDir:        env("BACKUP_DIR", "/opt/mun-app/backups"),
		AppSecret:        env("APP_SECRET", randomDevelopmentSecret()),
		CookieSecure:     envBool("COOKIE_SECURE", false),
		AdminTokenTTL:    envDurationHours("ADMIN_SESSION_HOURS", 12),
		ScreenTokenTTL:   envDurationHours("SCREEN_SESSION_HOURS", 24),
		DelegateTokenTTL: envDurationHours("DELEGATE_SESSION_HOURS", 12),
		DefaultAdminPIN:   safeAdminPIN(env("DEFAULT_ADMIN_PIN", "summit-admin-2026")),
		DefaultScreenPIN:  env("DEFAULT_SCREEN_PIN", "5678"),
		ConferenceName:   env("CONFERENCE_NAME", "Instantni Summit"),
		CommitteeName:    env("COMMITTEE_NAME", "Rada EU"),
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDurationHours(key string, fallback int) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return time.Duration(fallback) * time.Hour
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return time.Duration(fallback) * time.Hour
	}
	return time.Duration(parsed) * time.Hour
}

func safeAdminPIN(value string) string {
	if value == "1234" || len(value) < 8 {
		return "summit-admin-2026"
	}
	return value
}

func randomDevelopmentSecret() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "development-secret-change-me"
	}
	return hex.EncodeToString(buf)
}
