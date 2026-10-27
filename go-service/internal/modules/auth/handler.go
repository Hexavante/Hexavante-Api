package auth

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/ids"
	"hexavante-api-go/internal/mail"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

var (
	emailRe    = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	DeviceUa string `json:"deviceUa"`
	DeviceIp string `json:"deviceIp"`
	DeviceID string `json:"deviceId"`
}

type apiUser struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Username  *string  `json:"username"`
	AvatarURL *string  `json:"avatarUrl"`
	Roles     []string `json:"roles"`
}

func userPayload(id, fullName, email string, username, avatarURL sql.NullString, roles []string) apiUser {
	u := apiUser{ID: id, Name: fullName, Email: email, Roles: roles}
	if username.Valid {
		v := username.String
		u.Username = &v
	}
	if avatarURL.Valid {
		v := avatarURL.String
		u.AvatarURL = &v
	}
	if u.Roles == nil {
		u.Roles = []string{}
	}
	return u
}

func clientIP(r *http.Request) string {
	return ids.RequestIP(r.RemoteAddr, r.Header.Get("X-Forwarded-For"), r.Header.Get("X-Real-IP"))
}

func setSessionCookie(w http.ResponseWriter, token string) {
	prod := os.Getenv("NODE_ENV") == "production"
	c := "__Secure-hexavante.session_token=" + token + "; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax"
	if prod {
		c += "; Secure; Domain=.hexavante.com.br"
	}
	w.Header().Add("Set-Cookie", c)
}

func clearSessionCookie(w http.ResponseWriter) {
	prod := os.Getenv("NODE_ENV") == "production"
	c := "__Secure-hexavante.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
	if prod {
		c += "; Secure; Domain=.hexavante.com.br"
	}
	w.Header().Add("Set-Cookie", c)
}

// Login replica POST /api/v1/auth/login (inclui fluxo 202 de verificação).
func Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Corpo da requisição inválido")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if !emailRe.MatchString(email) || req.Password == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "E-mail ou senha inválidos")
		return
	}
	if database.DB == nil {
		response.Error(w, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "Banco indisponível")
		return
	}

	var (
		id, fullName, dbEmail, hash string
		username, avatarURL         sql.NullString
		emailVerified               bool
		twoFactorEnabled            bool
		passwordHash                sql.NullString
	)
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT id, full_name, email, username, avatar_url, email_verified, two_factor_enabled, password_hash
		FROM users WHERE email = ? LIMIT 1
	`, email).Scan(&id, &fullName, &dbEmail, &username, &avatarURL, &emailVerified, &twoFactorEnabled, &passwordHash)
	if err != nil || !passwordHash.Valid {
		response.Error(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Credenciais inválidas")
		return
	}
	hash = passwordHash.String
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		response.Error(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Credenciais inválidas")
		return
	}

	ua := req.DeviceUa
	if ua == "" {
		ua = r.Header.Get("User-Agent")
	}
	ip := ids.ResolveIP(req.DeviceIp, clientIP(r))
	fingerprint := ids.ResolveFingerprint(req.DeviceID, ua, ip)

	trusted := isDeviceTrusted(r, id, fingerprint)
	skipDevice := os.Getenv("SKIP_DEVICE_VERIFICATION") == "true"

	var reason string
	switch {
	case !emailVerified:
		reason = "EMAIL_VERIFY"
	case !trusted && !skipDevice:
		reason = "DEVICE"
	case twoFactorEnabled:
		reason = "TWO_FACTOR"
	}
	if reason != "" {
		purpose := "DEVICE"
		if reason == "EMAIL_VERIFY" {
			purpose = "EMAIL_VERIFY"
		} else if reason == "TWO_FACTOR" {
			purpose = "TWO_FACTOR_LOGIN"
		}
		vid, ierr := issueCode(r, id, dbEmail, fingerprint, purpose, ids.DeviceDisplayName(ua, ip))
		if ierr != nil {
			response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao emitir verificação")
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"requiresVerification": true,
			"verificationId":       vid,
			"reason":               reason,
		})
		return
	}

	touchDevice(r, id, fingerprint, ua, ip)
	token, expiresAt, serr := createSession(r, id, ip, ua)
	if serr != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao criar sessão")
		return
	}
	roles := middleware.FetchRoles(r.Context(), id)
	setSessionCookie(w, token)
	response.JSON(w, http.StatusOK, map[string]interface{}{
		"user":    userPayload(id, fullName, dbEmail, username, avatarURL, roles),
		"session": map[string]interface{}{"token": token, "expiresAt": expiresAt},
	})
}

type registerRequest struct {
	Username  string `json:"username"`
	FullName  string `json:"fullName"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	BirthDate string `json:"birthDate"`
	Phone     string `json:"phone"`
	City      string `json:"city"`
	State     string `json:"state"`
}

// Register replica POST /api/v1/auth/register (201 + presente de boas-vindas).
func Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Corpo da requisição inválido")
		return
	}
	username := strings.TrimSpace(req.Username)
	fullName := strings.TrimSpace(req.FullName)
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if len(username) < 3 || len(username) > 30 || !usernameRe.MatchString(username) {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Nome de usuário inválido")
		return
	}
	if len(fullName) < 2 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Nome muito curto")
		return
	}
	if !emailRe.MatchString(email) {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "E-mail inválido")
		return
	}
	if len(req.Password) < 8 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Senha deve ter no mínimo 8 caracteres")
		return
	}
	birth, ok := parseBirthDate(req.BirthDate)
	if !ok {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Data de nascimento inválida")
		return
	}
	if !minimumAge(birth, 13) {
		response.Error(w, http.StatusBadRequest, "UNDERAGE", "É necessário ter no mínimo 13 anos para se cadastrar.")
		return
	}
	if database.DB == nil {
		response.Error(w, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "Banco indisponível")
		return
	}

	var exists string
	err := database.DB.QueryRowContext(r.Context(),
		`SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1`, email, username).Scan(&exists)
	if err != sql.ErrNoRows {
		if err == nil {
			response.Error(w, http.StatusConflict, "CONFLICT", "Este e-mail ou nome de usuário já está em uso.")
			return
		}
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao verificar cadastro")
		return
	}

	hash, herr := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if herr != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao processar senha")
		return
	}

	userID := ids.NewCUID()
	now := time.Now()
	_, err = database.DB.ExecContext(r.Context(), `
		INSERT INTO users (id, username, full_name, email, password_hash, birth_date, phone, city, state, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, username, fullName, email, string(hash), birth.Format("2006-01-02"),
		nullIfEmpty(req.Phone), nullIfEmpty(req.City), nullIfEmpty(req.State), now, now)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao criar conta")
		return
	}

	// Papel USER + XP + wallet (ignora falhas individuais como o Fastify tolera itens).
	var roleID string
	if err := database.DB.QueryRowContext(r.Context(), `SELECT id FROM roles WHERE name = 'USER' LIMIT 1`).Scan(&roleID); err == nil {
		_, _ = database.DB.ExecContext(r.Context(),
			`INSERT IGNORE INTO user_roles (id, user_id, role_id, assigned_at) VALUES (?, ?, ?, ?)`,
			ids.NewCUID(), userID, roleID, now)
	}
	_, _ = database.DB.ExecContext(r.Context(),
		`INSERT IGNORE INTO user_xp (id, user_id) VALUES (?, ?)`, ids.NewCUID(), userID)
	_, _ = database.DB.ExecContext(r.Context(),
		`INSERT IGNORE INTO user_wallets (id, user_id) VALUES (?, ?)`, ids.NewCUID(), userID)

	// Presente de boas-vindas: itens gratuitos + tema padrão ativo.
	rows, err := database.DB.QueryContext(r.Context(), `SELECT id FROM store_items WHERE cost = 0 AND is_active = 1`)
	if err == nil {
		var itemIDs []string
		for rows.Next() {
			var iid string
			if rows.Scan(&iid) == nil {
				itemIDs = append(itemIDs, iid)
			}
		}
		rows.Close()
		for _, iid := range itemIDs {
			_, _ = database.DB.ExecContext(r.Context(),
				`INSERT IGNORE INTO user_inventory (id, user_id, store_item_id, is_equipped) VALUES (?, ?, ?, 0)`,
				ids.NewCUID(), userID, iid)
		}
	}
	ensureActiveTheme(r, userID)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"user": map[string]interface{}{
			"id": userID, "name": fullName, "email": email, "username": username, "roles": []string{"USER"},
		},
	})
}

// Logout replica POST /api/v1/auth/logout.
func Logout(w http.ResponseWriter, r *http.Request) {
	token := extractToken(r)
	if token != "" && database.DB != nil {
		_, _ = database.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE session_token = ?`, token)
	}
	clearSessionCookie(w)
	response.JSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// Session replica GET /api/v1/auth/session.
func Session(w http.ResponseWriter, r *http.Request) {
	token := extractToken(r)
	if token == "" || database.DB == nil {
		response.Error(w, http.StatusUnauthorized, "INVALID_SESSION", "Sessão inválida ou expirada")
		return
	}
	var (
		sessionID, userID   string
		expiresAt           time.Time
		id, fullName, email string
		username, avatarURL sql.NullString
	)
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT s.id, s.user_id, s.expires_at, u.id, u.full_name, u.email, u.username, u.avatar_url
		FROM sessions s INNER JOIN users u ON u.id = s.user_id
		WHERE s.session_token = ? LIMIT 1
	`, token).Scan(&sessionID, &userID, &expiresAt, &id, &fullName, &email, &username, &avatarURL)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "INVALID_SESSION", "Sessão inválida ou expirada")
		return
	}
	if time.Now().After(expiresAt) {
		_, _ = database.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE id = ?`, sessionID)
		response.Error(w, http.StatusUnauthorized, "INVALID_SESSION", "Sessão inválida ou expirada")
		return
	}
	roles := middleware.FetchRoles(r.Context(), userID)
	response.JSON(w, http.StatusOK, map[string]interface{}{
		"user":    userPayload(id, fullName, email, username, avatarURL, roles),
		"session": map[string]interface{}{"expiresAt": expiresAt},
	})
}

func extractToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		parts := strings.SplitN(h, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return strings.TrimSpace(parts[1])
		}
	}
	if c, err := r.Cookie("__Secure-hexavante.session_token"); err == nil && c.Value != "" {
		return c.Value
	}
	if c, err := r.Cookie("hexavante.session_token"); err == nil && c.Value != "" {
		return c.Value
	}
	return ""
}

func isDeviceTrusted(r *http.Request, userID, fingerprint string) bool {
	if database.DB == nil {
		return false
	}
	var revoked sql.NullTime
	err := database.DB.QueryRowContext(r.Context(),
		`SELECT revoked_at FROM trusted_devices WHERE user_id = ? AND fingerprint = ? LIMIT 1`,
		userID, fingerprint).Scan(&revoked)
	if err != nil {
		return false
	}
	return !revoked.Valid
}

func touchDevice(r *http.Request, userID, fingerprint, ua, ip string) {
	if database.DB == nil {
		return
	}
	now := time.Now()
	_, _ = database.DB.ExecContext(r.Context(),
		`UPDATE trusted_devices SET last_seen_at = ?, ip_address = ? WHERE user_id = ? AND fingerprint = ? AND revoked_at IS NULL`,
		now, ip, userID, fingerprint)
	_, _ = database.DB.ExecContext(r.Context(),
		`UPDATE users SET last_seen_at = ? WHERE id = ?`, now, userID)
}

func createSession(r *http.Request, userID, ip, ua string) (string, time.Time, error) {
	token, err := ids.NewSessionToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	_, err = database.DB.ExecContext(r.Context(), `
		INSERT INTO sessions (id, session_token, user_id, expires_at, ip_address, user_agent, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, ids.NewCUID(), token, userID, expiresAt, nullIfEmpty(ip), nullIfEmpty(ua), time.Now(), time.Now())
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

// issueCode cria o registro de verificação e envia o e-mail (Resend ou log dev).
func issueCode(r *http.Request, userID, email, fingerprint, purpose, deviceName string) (string, error) {
	code, err := ids.NewCode()
	if err != nil {
		return "", err
	}
	vid := ids.NewCUID()
	_, err = database.DB.ExecContext(r.Context(), `
		INSERT INTO device_verification_codes (id, user_id, fingerprint, purpose, code, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, vid, userID, nullIfEmpty(fingerprint), purpose, code, time.Now().Add(10*time.Minute), time.Now())
	if err != nil {
		return "", err
	}
	mail.SendVerificationCode(email, code, purpose, deviceName)
	return vid, nil
}

// ensureActiveTheme replica ShopService.ensureActiveTheme (tema padrão).
func ensureActiveTheme(r *http.Request, userID string) {
	if database.DB == nil {
		return
	}
	var active string
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT ui.id FROM user_inventory ui
		INNER JOIN store_items si ON si.id = ui.store_item_id
		WHERE ui.user_id = ? AND ui.is_equipped = 1 AND si.category = 'THEME'
		  AND (ui.expires_at IS NULL OR ui.expires_at > NOW())
		LIMIT 1
	`, userID).Scan(&active)
	if err == nil {
		return
	}
	var defID string
	if err := database.DB.QueryRowContext(r.Context(),
		`SELECT id FROM store_items WHERE slug = 'theme-hexavante' LIMIT 1`).Scan(&defID); err != nil {
		return
	}
	_, _ = database.DB.ExecContext(r.Context(), `
		INSERT INTO user_inventory (id, user_id, store_item_id, is_equipped)
		VALUES (?, ?, ?, 1)
		ON DUPLICATE KEY UPDATE is_equipped = 1
	`, ids.NewCUID(), userID, defID)
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func parseBirthDate(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func minimumAge(birth time.Time, min int) bool {
	now := time.Now()
	age := now.Year() - birth.Year()
	if now.Month() < birth.Month() || (now.Month() == birth.Month() && now.Day() < birth.Day()) {
		age--
	}
	return age >= min
}
