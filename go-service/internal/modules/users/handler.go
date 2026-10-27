package users

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)

// Me replica GET /api/v1/users/me → { user: profile }.
func Me(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	profile, ok := loadProfile(r, user.ID)
	if !ok {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Usuário não encontrado")
		return
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"user": profile})
}

// PublicProfile replica GET /api/v1/users/:username → { user }.
func PublicProfile(w http.ResponseWriter, r *http.Request) {
	username := strings.TrimSpace(r.PathValue("username"))
	if username == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Nome de usuário é obrigatório")
		return
	}
	var (
		id, fullName       string
		uname, avatar, bio sql.NullString
		visibility         string
		isVerified         bool
		isPremium          bool
		presence           string
		lastSeen           sql.NullTime
		createdAt          time.Time
	)
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT id, full_name, username, avatar_url, bio, profile_visibility,
		       is_verified, is_premium, presence, last_seen_at, created_at
		FROM users WHERE username = ? LIMIT 1
	`, username).Scan(&id, &fullName, &uname, &avatar, &bio, &visibility,
		&isVerified, &isPremium, &presence, &lastSeen, &createdAt)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Usuário não encontrado")
		return
	}
	var lastSeenPtr *time.Time
	if lastSeen.Valid {
		t := lastSeen.Time
		lastSeenPtr = &t
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{
		"user": map[string]interface{}{
			"id": id, "username": nullStr(uname), "fullName": fullName,
			"avatarUrl": nullStr(avatar), "bio": nullStr(bio),
			"profileVisibility": visibility, "isVerified": isVerified,
			"isPremium": isPremium, "presence": effectivePresence(presence, lastSeenPtr),
			"createdAt": createdAt,
		},
	})
}

// UpdateMe replica PATCH /api/v1/users/me → { user: profile }.
func UpdateMe(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	var body struct {
		FullName  *string `json:"fullName"`
		Username  *string `json:"username"`
		BirthDate *string `json:"birthDate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Corpo da requisição inválido")
		return
	}
	if body.FullName != nil {
		name := strings.TrimSpace(*body.FullName)
		if len(name) < 2 || len(name) > 120 {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Nome deve ter entre 2 e 120 caracteres")
			return
		}
		*body.FullName = name
	}
	if body.BirthDate != nil {
		raw := strings.TrimSpace(*body.BirthDate)
		if raw != "" {
			birth, err := time.Parse("2006-01-02", raw)
			if err != nil {
				response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Data de nascimento inválida")
				return
			}
			if birth.After(time.Now()) {
				response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Data de nascimento no futuro")
				return
			}
		}
		*body.BirthDate = raw
	}
	if body.Username != nil {
		u := strings.TrimSpace(*body.Username)
		if len(u) < 3 || len(u) > 30 || !usernameRe.MatchString(u) {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Nome de usuário inválido")
			return
		}
		var other string
		err := database.DB.QueryRowContext(r.Context(),
			`SELECT id FROM users WHERE username = ? LIMIT 1`, u).Scan(&other)
		if err == nil && other != user.ID {
			response.Error(w, http.StatusConflict, "CONFLICT", "Este nome de usuário já está em uso")
			return
		}
		if err != nil && err != sql.ErrNoRows {
			response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao verificar usuário")
			return
		}
		*body.Username = u
	}
	sets := []string{"updated_at = ?"}
	args := []interface{}{time.Now()}
	if body.FullName != nil {
		sets = append(sets, "full_name = ?")
		args = append(args, strings.TrimSpace(*body.FullName))
	}
	if body.Username != nil {
		sets = append(sets, "username = ?")
		args = append(args, *body.Username)
	}
	if body.BirthDate != nil {
		sets = append(sets, "birth_date = ?")
		args = append(args, strings.TrimSpace(*body.BirthDate))
	}
	args = append(args, user.ID)
	q := "UPDATE users SET " + strings.Join(sets, ", ") + " WHERE id = ?"
	if _, err := database.DB.ExecContext(r.Context(), q, args...); err != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao atualizar perfil")
		return
	}
	profile, ok := loadProfile(r, user.ID)
	if !ok {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Usuário não encontrado")
		return
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"user": profile})
}

// DeleteMe replica DELETE /api/v1/users/me (anonimização, igual ao Fastify).
func DeleteMe(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}

	tx, err := database.DB.BeginTx(r.Context(), nil)
	if err != nil {
		slog.Error("erro ao abrir transação de exclusão de conta", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao excluir conta")
		return
	}
	defer func() { _ = tx.Rollback() }()

	// Revoga acessos antes de anonimizar: sessão e devices confiáveis de uma
	// conta "excluída" continuariam válidos.
	for _, stmt := range []string{
		`DELETE FROM sessions WHERE user_id = ?`,
		`DELETE FROM trusted_devices WHERE user_id = ?`,
		`DELETE FROM device_verification_codes WHERE user_id = ?`,
	} {
		if _, err := tx.ExecContext(r.Context(), stmt, user.ID); err != nil {
			slog.Error("erro ao revogar acesso na exclusão de conta", "error", err, "userId", user.ID)
			response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao excluir conta")
			return
		}
	}

	if _, err := tx.ExecContext(r.Context(), `
		UPDATE users SET username = ?, email = ?, password_hash = NULL,
			phone = NULL, city = NULL, state = NULL, bio = NULL,
			avatar_url = NULL, banner_url = NULL
		WHERE id = ?
	`, "deleted_"+user.ID, "deleted_"+user.ID+"@deleted.hexavante.com", user.ID); err != nil {
		slog.Error("erro ao anonimizar usuário", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao excluir conta")
		return
	}

	if err := tx.Commit(); err != nil {
		slog.Error("erro ao confirmar exclusão de conta", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao excluir conta")
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func loadProfile(r *http.Request, userID string) (map[string]interface{}, bool) {
	var (
		id, fullName, email, visibility, presence string
		username, avatar, banner, birth, phone    sql.NullString
		city, state, bio                          sql.NullString
		isVerified, isPremium, twoFA              bool
		coins                                     int
		createdAt, updatedAt                      time.Time
	)
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT id, username, full_name, email, avatar_url, banner_url, birth_date,
		       phone, city, state, bio, profile_visibility, is_verified, is_premium,
		       coins, two_factor_enabled, presence, created_at, updated_at
		FROM users WHERE id = ? LIMIT 1
	`, userID).Scan(&id, &username, &fullName, &email, &avatar, &banner, &birth,
		&phone, &city, &state, &bio, &visibility, &isVerified, &isPremium,
		&coins, &twoFA, &presence, &createdAt, &updatedAt)
	if err != nil {
		return nil, false
	}
	return map[string]interface{}{
		"id": id, "username": nullStr(username), "fullName": fullName, "email": email,
		"avatarUrl": nullStr(avatar), "bannerUrl": nullStr(banner), "birthDate": nullStr(birth),
		"phone": nullStr(phone), "city": nullStr(city), "state": nullStr(state), "bio": nullStr(bio),
		"profileVisibility": visibility, "isVerified": isVerified, "isPremium": isPremium,
		"coins": coins, "twoFactorEnabled": twoFA, "presence": presence,
		"createdAt": createdAt, "updatedAt": updatedAt,
	}, true
}

func nullStr(ns sql.NullString) interface{} {
	if ns.Valid {
		return ns.String
	}
	return nil
}

// effectivePresence replica SecurityService.effectivePresence (offline após 5 min).
func effectivePresence(presence string, lastSeen *time.Time) string {
	if presence == "INVISIBLE" {
		return "OFFLINE"
	}
	if lastSeen == nil || time.Since(*lastSeen) > 5*time.Minute {
		return "OFFLINE"
	}
	switch presence {
	case "ONLINE", "AWAY", "STUDYING", "DND":
		return presence
	}
	return "ONLINE"
}
