package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"

	"mun-app/internal/config"
	"mun-app/internal/domain"
	"mun-app/internal/repository"
)

type AuthService struct {
	db  *sql.DB
	cfg config.Config
}

func NewAuthService(db *sql.DB, cfg config.Config) *AuthService {
	return &AuthService{db: db, cfg: cfg}
}

func (s *AuthService) EnsureDefaults(ctx context.Context) error {
	settings := repository.NewSettingsRepository(s.db)
	values := map[string]string{}
	if _, ok, err := settings.Get(ctx, "admin_pin_hash"); err != nil {
		return err
	} else if !ok {
		hash, err := HashPIN(s.cfg.DefaultAdminPIN)
		if err != nil {
			return err
		}
		values["admin_pin_hash"] = hash
		values["admin_pin_is_default"] = "true"
	}
	if _, ok, err := settings.Get(ctx, "screen_pin_hash"); err != nil {
		return err
	} else if !ok {
		hash, err := HashPIN(s.cfg.DefaultScreenPIN)
		if err != nil {
			return err
		}
		values["screen_pin_hash"] = hash
		values["screen_pin_is_default"] = "true"
	}
	if len(values) > 0 {
		return settings.SetMany(ctx, values)
	}
	return nil
}

func (s *AuthService) Login(ctx context.Context, role, pin string) (string, time.Time, error) {
	if role != domain.RoleAdmin && role != domain.RoleScreen {
		return "", time.Time{}, NewUserError("forbidden", "Neplatná role.")
	}
	if len(pin) < 4 {
		return "", time.Time{}, NewUserError("invalid_pin", "PIN musí mít alespoň 4 znaky.")
	}
	key := role + "_pin_hash"
	settings := repository.NewSettingsRepository(s.db)
	hash, ok, err := settings.Get(ctx, key)
	if err != nil {
		return "", time.Time{}, err
	}
	if !ok || !VerifyPIN(pin, hash) {
		return "", time.Time{}, NewUserError("bad_credentials", "Nesprávný PIN.")
	}
	token, err := randomHex(32)
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt := time.Now().UTC().Add(s.ttlForRole(role))
	if err := repository.NewAuthRepository(s.db).CreateToken(ctx, role, tokenHash(token), expiresAt); err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

func (s *AuthService) ValidateToken(ctx context.Context, role, token string) (bool, error) {
	if token == "" {
		return false, nil
	}
	found, err := repository.NewAuthRepository(s.db).FindValidToken(ctx, role, tokenHash(token), time.Now().UTC())
	return found != nil, err
}

func (s *AuthService) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return repository.NewAuthRepository(s.db).RevokeToken(ctx, tokenHash(token))
}

func (s *AuthService) DelegateToken(delegationID int64) string {
	exp := time.Now().UTC().Add(s.cfg.DelegateTokenTTL).Unix()
	body := fmt.Sprintf("%d:%d", delegationID, exp)
	return body + ":" + sign(body, s.cfg.AppSecret)
}

func (s *AuthService) ValidateDelegateToken(token string) (int64, bool) {
	parts := strings.Split(token, ":")
	if len(parts) != 3 {
		return 0, false
	}
	body := parts[0] + ":" + parts[1]
	if subtle.ConstantTimeCompare([]byte(parts[2]), []byte(sign(body, s.cfg.AppSecret))) != 1 {
		return 0, false
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.Now().UTC().Unix() > exp {
		return 0, false
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	return id, err == nil
}

func (s *AuthService) ttlForRole(role string) time.Duration {
	if role == domain.RoleScreen {
		return s.cfg.ScreenTokenTTL
	}
	return s.cfg.AdminTokenTTL
}

func HashPIN(pin string) (string, error) {
	salt, err := randomHex(16)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(salt + ":" + pin))
	return "sha256$" + salt + "$" + hex.EncodeToString(sum[:]), nil
}

func VerifyPIN(pin, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "sha256" {
		return false
	}
	sum := sha256.Sum256([]byte(parts[1] + ":" + pin))
	return subtle.ConstantTimeCompare([]byte(parts[2]), []byte(hex.EncodeToString(sum[:]))) == 1
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func sign(body, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(body))
	return hex.EncodeToString(mac.Sum(nil))
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
