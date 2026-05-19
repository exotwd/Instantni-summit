package middleware

import (
	"log/slog"
	"net/http"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("panic recovered", "error", recovered)
				http.Error(w, "server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
