package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func RunMigrations(ctx context.Context, db *sql.DB, dir string) error {
	if _, err := db.ExecContext(ctx, `create table if not exists schema_migrations (
		version text primary key,
		applied_at datetime not null default current_timestamp
	)`); err != nil {
		return err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	var files []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		files = append(files, entry.Name())
	}
	sort.Strings(files)

	for _, file := range files {
		var already int
		if err := db.QueryRowContext(ctx, `select count(*) from schema_migrations where version = ?`, file).Scan(&already); err != nil {
			return err
		}
		if already > 0 {
			continue
		}
		sqlBytes, err := os.ReadFile(filepath.Join(dir, file))
		if err != nil {
			return err
		}
		if err := WithTx(ctx, db, func(tx *sql.Tx) error {
			if _, err := tx.ExecContext(ctx, string(sqlBytes)); err != nil {
				return fmt.Errorf("%s: %w", file, err)
			}
			_, err := tx.ExecContext(ctx, `insert into schema_migrations(version) values (?)`, file)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}
