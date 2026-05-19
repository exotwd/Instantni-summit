package middleware

import (
	"net/http"
	"strings"
)

func CacheStatic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/admin" || r.URL.Path == "/screen" || r.URL.Path == "/vote" || strings.HasSuffix(r.URL.Path, ".html") {
			w.Header().Set("Cache-Control", "no-store")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=60")
		}
		next.ServeHTTP(w, r)
	})
}
