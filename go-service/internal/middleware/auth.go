package middleware

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/response"
)

type contextKey string

const UserContextKey = contextKey("user")

type AuthUser struct {
	ID       string `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
	Username string `json:"username"`
}

func extractToken(r *http.Request) string {
	// 1. Authorization: Bearer <token>
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return strings.TrimSpace(parts[1])
		}
	}

	// 2. Cookie __Secure-hexavante.session_token ou hexavante.session_token
	cookie, err := r.Cookie("__Secure-hexavante.session_token")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}
	cookie, err = r.Cookie("hexavante.session_token")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}

func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := extractToken(r)
		if token == "" {
			response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Sessão não informada ou ausente")
			return
		}

		query := `
			SELECT s.user_id, s.expires_at, u.name, u.email, COALESCE(u.username, '')
			FROM sessions s
			INNER JOIN users u ON u.id = s.user_id
			WHERE s.session_token = ?
			LIMIT 1
		`

		var userID, name, email, username string
		var expiresAt time.Time

		err := database.DB.QueryRowContext(r.Context(), query, token).Scan(&userID, &expiresAt, &name, &email, &username)
		if err != nil {
			if err == sql.ErrNoRows {
				response.Error(w, http.StatusUnauthorized, "INVALID_SESSION", "Sessão expirada ou inválida")
				return
			}
			response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao validar sessão")
			return
		}

		if time.Now().After(expiresAt) {
			// Remove sessão expirada
			go func() {
				_, _ = database.DB.Exec("DELETE FROM sessions WHERE session_token = ?", token)
			}()
			response.Error(w, http.StatusUnauthorized, "SESSION_EXPIRED", "Sessão expirada")
			return
		}

		authUser := &AuthUser{
			ID:       userID,
			FullName: name,
			Email:    email,
			Username: username,
		}

		ctx := context.WithValue(r.Context(), UserContextKey, authUser)
		next(w, r.WithContext(ctx))
	}
}

func GetUserFromContext(ctx context.Context) *AuthUser {
	if user, ok := ctx.Value(UserContextKey).(*AuthUser); ok {
		return user
	}
	return nil
}

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Hexavante-Client")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
