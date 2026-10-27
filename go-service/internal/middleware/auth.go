package middleware

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/response"
)

type contextKey string

const UserContextKey = contextKey("user")

type AuthUser struct {
	ID        string   `json:"id"`
	FullName  string   `json:"fullName"`
	Email     string   `json:"email"`
	Username  string   `json:"username"`
	AvatarURL string   `json:"avatarUrl,omitempty"`
	Roles     []string `json:"roles,omitempty"`
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
		if database.DB == nil {
			response.Error(w, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "Banco indisponível")
			return
		}

		// Colunas reais do schema Prisma: users.full_name (não "name"),
		// sessions.session_token / user_id / expires_at.
		query := `
			SELECT s.user_id, s.expires_at, u.id, u.full_name, u.email, COALESCE(u.username, ''), COALESCE(u.avatar_url, '')
			FROM sessions s
			INNER JOIN users u ON u.id = s.user_id
			WHERE s.session_token = ?
			LIMIT 1
		`

		var userID, uid, fullName, email, username, avatarURL string
		var expiresAt time.Time

		err := database.DB.QueryRowContext(r.Context(), query, token).Scan(&userID, &expiresAt, &uid, &fullName, &email, &username, &avatarURL)
		if err != nil {
			if err == sql.ErrNoRows {
				response.Error(w, http.StatusUnauthorized, "INVALID_SESSION", "Sessão expirada ou inválida")
				return
			}
			slog.Error("erro ao validar sessão", "error", err)
			response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao validar sessão")
			return
		}

		if time.Now().After(expiresAt) {
			// Remoção síncrona: um goroutine por requisição expirada pode
			// multiplicar conexões sob ataque de sessões antigas.
			if _, err := database.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE session_token = ?`, token); err != nil {
				slog.Warn("falha ao remover sessão expirada", "error", err)
			}
			response.Error(w, http.StatusUnauthorized, "SESSION_EXPIRED", "Sessão expirada")
			return
		}

		authUser := &AuthUser{
			ID:        userID,
			FullName:  fullName,
			Email:     email,
			Username:  username,
			AvatarURL: avatarURL,
			Roles:     FetchRoles(r.Context(), userID),
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

// UserFromRequest devolve o usuário autenticado ou já responde 401 quando o
// handler foi montado sem RequireAuth. Evita panic por nil pointer.
func UserFromRequest(w http.ResponseWriter, r *http.Request) (*AuthUser, bool) {
	user := GetUserFromContext(r.Context())
	if user == nil {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Sessão não informada")
		return nil, false
	}
	return user, true
}

// FetchRoles carrega os papéis N:N (user_roles → roles). Falha silenciosa = lista vazia.
func FetchRoles(ctx context.Context, userID string) []string {
	if database.DB == nil {
		return nil
	}
	rows, err := database.DB.QueryContext(ctx, `
		SELECT r.name FROM user_roles ur
		INNER JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = ?
	`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	roles := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			roles = append(roles, name)
		}
	}
	return roles
}

func CORS(next http.Handler) http.Handler {
	return CORSWithConfig(next, nil)
}

func CORSWithConfig(next http.Handler, allowed []string) http.Handler {
	allowSet := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		allowSet[o] = struct{}{}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowedOrigin := ""
		if origin != "" {
			if len(allowSet) == 0 {
				// Sem allowlist configurada: não reflete origem arbitrária.
				// Apenas responde preflight sem CORS.
			} else if _, ok := allowSet[origin]; ok {
				allowedOrigin = origin
			}
		}
		if allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Hexavante-Client")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
