package security

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/ids"
	"hexavante-api-go/internal/mail"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

var validPresence = map[string]bool{
	"ONLINE": true, "AWAY": true, "STUDYING": true, "DND": true, "INVISIBLE": true,
}

func clientIP(r *http.Request) string {
	return ids.RequestIP(r.RemoteAddr, r.Header.Get("X-Forwarded-For"), r.Header.Get("X-Real-IP"))
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = ids.RandBytes(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

type verifyRequest struct {
	VerificationID string `json:"verificationId"`
	Code           string `json:"code"`
	DeviceUa       string `json:"deviceUa"`
	DeviceIp       string `json:"deviceIp"`
	DeviceID       string `json:"deviceId"`
}

// VerifyDevice replica POST /api/v1/auth/verify-device.
func VerifyDevice(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VerificationID == "" || req.Code == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Verificação inválida")
		return
	}
	if database.DB == nil {
		response.Error(w, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "Banco indisponível")
		return
	}
	rec, err := consumeCode(r, req.VerificationID, req.Code)
	if err != nil {
		response.Error(w, err.status, err.code, err.msg)
		return
	}

	// Só códigos de login podem virar sessão. PASSWORD_RESET e o TWO_FACTOR
	// de configuração têm fluxos próprios.
	switch rec.purpose {
	case "DEVICE", "EMAIL_VERIFY", "TWO_FACTOR_LOGIN":
	default:
		response.Error(w, http.StatusBadRequest, "INVALID_PURPOSE", "Verificação inválida.")
		return
	}

	ua := req.DeviceUa
	if ua == "" {
		ua = r.Header.Get("User-Agent")
	}
	ip := ids.ResolveIP(req.DeviceIp, clientIP(r))
	fp := rec.fingerprint
	if fp == "" {
		fp = ids.ResolveFingerprint(req.DeviceID, ua, ip)
	}

	if rec.purpose != "TWO_FACTOR_LOGIN" {
		trustDevice(r, rec.userID, fp, ua, ip)
		_, _ = database.DB.ExecContext(r.Context(),
			`UPDATE users SET email_verified = 1 WHERE id = ? AND email_verified = 0`, rec.userID)
	}

	var twoFactor bool
	var email string
	if err := database.DB.QueryRowContext(r.Context(),
		`SELECT two_factor_enabled, email FROM users WHERE id = ? LIMIT 1`, rec.userID).
		Scan(&twoFactor, &email); err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Usuário não encontrado")
		return
	}

	// 2FA nunca é pulado: dispositivo/e-mail confirmados ainda não bastam.
	if twoFactor && rec.purpose != "TWO_FACTOR_LOGIN" {
		vid, ierr := issueCode(r, rec.userID, email, fp, "TWO_FACTOR_LOGIN")
		if ierr != nil {
			response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao emitir código")
			return
		}
		response.JSON(w, http.StatusOK, map[string]interface{}{
			"requiresVerification": true,
			"verificationId":       vid,
			"reason":               "TWO_FACTOR",
		})
		return
	}

	user, ok := loadSessionUser(r, rec.userID)
	if !ok {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Usuário não encontrado")
		return
	}
	token, expiresAt, serr := createSession(r, rec.userID, ip, ua)
	if serr != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao criar sessão")
		return
	}
	user["session"] = map[string]interface{}{"token": token, "expiresAt": expiresAt}
	response.JSON(w, http.StatusOK, user)
}

// ResendCode replica POST /api/v1/auth/resend-device-code.
func ResendCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VerificationID string `json:"verificationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VerificationID == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Verificação inválida")
		return
	}
	if database.DB == nil {
		response.Error(w, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "Banco indisponível")
		return
	}
	var userID, email, fingerprint, purpose, code string
	var expiresAt, createdAt time.Time
	var used bool
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT dvc.user_id, u.email, COALESCE(dvc.fingerprint,''), dvc.purpose, dvc.code, dvc.expires_at, dvc.created_at, dvc.used
		FROM device_verification_codes dvc INNER JOIN users u ON u.id = dvc.user_id
		WHERE dvc.id = ? AND dvc.used = 0 LIMIT 1
	`, req.VerificationID).Scan(&userID, &email, &fingerprint, &purpose, &code, &expiresAt, &createdAt, &used)
	if err != nil || time.Now().After(expiresAt) {
		response.Error(w, http.StatusBadRequest, "EXPIRED", "Verificação expirada. Faça login novamente.")
		return
	}
	if time.Since(createdAt) < 60*time.Second {
		wait := 60 - int(time.Since(createdAt).Seconds())
		response.Error(w, http.StatusTooManyRequests, "COOLDOWN", fmt.Sprintf("Aguarde %ds antes de solicitar um novo código.", wait))
		return
	}
	if purpose != "DEVICE" && purpose != "EMAIL_VERIFY" && purpose != "TWO_FACTOR" && purpose != "TWO_FACTOR_LOGIN" {
		response.Error(w, http.StatusBadRequest, "INVALID_PURPOSE", "Verificação inválida.")
		return
	}
	vid, ierr := issueCode(r, userID, email, fingerprint, purpose)
	if ierr != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao emitir código")
		return
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"verificationId": vid})
}

// ForgotPassword replica POST /api/v1/auth/forgot-password (anti-enumeração).
func ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "E-mail inválido")
		return
	}
	vid := newUUID()
	if database.DB != nil {
		var userID, email string
		err := database.DB.QueryRowContext(r.Context(),
			`SELECT id, email FROM users WHERE email = ? LIMIT 1`, req.Email).Scan(&userID, &email)
		if err == nil {
			if v, ierr := issueCode(r, userID, email, "", "PASSWORD_RESET"); ierr == nil {
				vid = v
			}
		}
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"ok": true, "verificationId": vid})
}

// ResetPassword replica POST /api/v1/auth/reset-password.
func ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VerificationID string `json:"verificationId"`
		Code           string `json:"code"`
		Password       string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VerificationID == "" || req.Code == "" || len(req.Password) < 8 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Dados inválidos")
		return
	}
	if database.DB == nil {
		response.Error(w, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "Banco indisponível")
		return
	}
	rec, err := consumeCode(r, req.VerificationID, req.Code)
	if err != nil {
		response.Error(w, err.status, err.code, err.msg)
		return
	}
	if rec.purpose != "PASSWORD_RESET" {
		response.Error(w, http.StatusBadRequest, "INVALID_PURPOSE", "Código inválido para redefinição de senha.")
		return
	}
	hash, herr := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if herr != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao processar senha")
		return
	}
	_, _ = database.DB.ExecContext(r.Context(), `UPDATE users SET password_hash = ? WHERE id = ?`, string(hash), rec.userID)
	_, _ = database.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id = ?`, rec.userID)
	response.JSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}

// ListDevices replica GET /api/v1/users/me/devices.
func ListDevices(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	rows, err := database.DB.QueryContext(r.Context(), `
		SELECT id, COALESCE(name,'Dispositivo'), COALESCE(ip_address,''), last_seen_at, revoked_at IS NOT NULL, created_at
		FROM trusted_devices WHERE user_id = ? ORDER BY last_seen_at DESC
	`, user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao listar dispositivos")
		return
	}
	defer rows.Close()
	devices := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, name, ip string
		var lastSeen, created time.Time
		var revoked bool
		if rows.Scan(&id, &name, &ip, &lastSeen, &revoked, &created) == nil {
			devices = append(devices, map[string]interface{}{
				"id": id, "name": name, "ipAddress": ip,
				"lastSeenAt": lastSeen, "revoked": revoked, "createdAt": created,
			})
		}
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"devices": devices})
}

// RevokeDevice replica DELETE /api/v1/users/me/devices/:id.
func RevokeDevice(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	var fingerprint string
	var userAgent, ipAddress sql.NullString
	err := database.DB.QueryRowContext(r.Context(),
		`SELECT fingerprint, user_agent, ip_address FROM trusted_devices WHERE id = ? AND user_id = ? LIMIT 1`,
		id, user.ID).Scan(&fingerprint, &userAgent, &ipAddress)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Dispositivo não encontrado.")
		return
	}
	now := time.Now()
	_, _ = database.DB.ExecContext(r.Context(),
		`UPDATE trusted_devices SET revoked_at = ? WHERE id = ?`, now, id)
	if userAgent.Valid || ipAddress.Valid {
		q := `DELETE FROM sessions WHERE user_id = ?`
		args := []interface{}{user.ID}
		if ipAddress.Valid {
			q += ` AND ip_address = ?`
			args = append(args, ipAddress.String)
		}
		if userAgent.Valid {
			q += ` AND user_agent = ?`
			args = append(args, userAgent.String)
		}
		_, _ = database.DB.ExecContext(r.Context(), q, args...)
	}
	current := ids.ResolveFingerprint(r.URL.Query().Get("deviceId"), r.Header.Get("User-Agent"), clientIP(r))
	response.JSON(w, http.StatusOK, map[string]interface{}{
		"revoked": true, "currentRevoked": current == fingerprint,
	})
}

// EnableTwoFactor replica POST /api/v1/users/me/2fa/enable.
func EnableTwoFactor(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	var enabled bool
	var email string
	if err := database.DB.QueryRowContext(r.Context(),
		`SELECT two_factor_enabled, email FROM users WHERE id = ? LIMIT 1`, user.ID).Scan(&enabled, &email); err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Usuário não encontrado")
		return
	}
	if !enabled {
		vid, ierr := issueCode(r, user.ID, email, "", "TWO_FACTOR")
		if ierr != nil {
			response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao emitir código")
			return
		}
		response.JSON(w, http.StatusOK, map[string]interface{}{"verificationId": vid})
		return
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"enabled": true})
}

// ConfirmTwoFactor replica POST /api/v1/users/me/2fa/confirm.
func ConfirmTwoFactor(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	var req verifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VerificationID == "" || req.Code == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Verificação inválida")
		return
	}
	// O verificationId vem do corpo: sem checar o dono, qualquer sessão
	// autenticada habilitaria 2FA na conta de outro usuário.
	var owner string
	if err := database.DB.QueryRowContext(r.Context(),
		`SELECT user_id FROM device_verification_codes WHERE id = ? AND used = 0 LIMIT 1`,
		req.VerificationID).Scan(&owner); err != nil || owner != user.ID {
		response.Error(w, http.StatusBadRequest, "INVALID_CODE", "Código inválido ou expirado.")
		return
	}
	rec, err := consumeCode(r, req.VerificationID, req.Code)
	if err != nil {
		response.Error(w, err.status, err.code, err.msg)
		return
	}
	if rec.purpose != "TWO_FACTOR" {
		response.Error(w, http.StatusBadRequest, "INVALID_PURPOSE", "Verificação inválida.")
		return
	}
	_, _ = database.DB.ExecContext(r.Context(), `UPDATE users SET two_factor_enabled = 1 WHERE id = ?`, rec.userID)
	response.JSON(w, http.StatusOK, map[string]interface{}{"enabled": true})
}

// DisableTwoFactor replica DELETE /api/v1/users/me/2fa.
func DisableTwoFactor(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	_, _ = database.DB.ExecContext(r.Context(), `UPDATE users SET two_factor_enabled = 0 WHERE id = ?`, user.ID)
	response.JSON(w, http.StatusOK, map[string]interface{}{"enabled": false})
}

// SetPresence replica PATCH /api/v1/users/me/presence.
func SetPresence(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !validPresence[req.Status] {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Status inválido")
		return
	}
	now := time.Now()
	_, _ = database.DB.ExecContext(r.Context(),
		`UPDATE users SET presence = ?, presence_updated_at = ?, last_seen_at = ? WHERE id = ?`,
		req.Status, now, now, user.ID)
	response.JSON(w, http.StatusOK, map[string]interface{}{"status": req.Status})
}

// Heartbeat replica POST /api/v1/users/me/heartbeat.
func Heartbeat(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	now := time.Now()
	if req.Status != "" && validPresence[req.Status] {
		_, _ = database.DB.ExecContext(r.Context(),
			`UPDATE users SET last_seen_at = ?, presence = ?, presence_updated_at = ? WHERE id = ?`,
			now, req.Status, now, user.ID)
	} else {
		_, _ = database.DB.ExecContext(r.Context(), `UPDATE users SET last_seen_at = ? WHERE id = ?`, now, user.ID)
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}

type codeError struct {
	status int
	code   string
	msg    string
}

type codeRecord struct {
	userID      string
	fingerprint string
	purpose     string
}

func consumeCode(r *http.Request, verificationID, code string) (*codeRecord, *codeError) {
	var (
		id, userID, fingerprint, purpose, dbCode string
		attempts                                 int
		used                                     bool
		expiresAt                                time.Time
	)
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT id, user_id, COALESCE(fingerprint,''), purpose, code, attempts, used, expires_at
		FROM device_verification_codes WHERE id = ? LIMIT 1
	`, verificationID).Scan(&id, &userID, &fingerprint, &purpose, &dbCode, &attempts, &used, &expiresAt)
	if err != nil || used || time.Now().After(expiresAt) {
		return nil, &codeError{http.StatusBadRequest, "INVALID_CODE", "Código inválido ou expirado."}
	}
	if attempts >= 5 {
		_, _ = database.DB.ExecContext(r.Context(), `UPDATE device_verification_codes SET used = 1 WHERE id = ?`, id)
		return nil, &codeError{http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "Muitas tentativas. Solicite um novo código."}
	}
	if dbCode != code {
		_, _ = database.DB.ExecContext(r.Context(), `UPDATE device_verification_codes SET attempts = attempts + 1 WHERE id = ?`, id)
		return nil, &codeError{http.StatusBadRequest, "INVALID_CODE", "Código inválido ou expirado."}
	}
	_, _ = database.DB.ExecContext(r.Context(), `UPDATE device_verification_codes SET used = 1 WHERE id = ?`, id)
	return &codeRecord{userID: userID, fingerprint: fingerprint, purpose: purpose}, nil
}

func trustDevice(r *http.Request, userID, fingerprint, ua, ip string) {
	now := time.Now()
	_, _ = database.DB.ExecContext(r.Context(), `
		INSERT INTO trusted_devices (id, user_id, fingerprint, name, ip_address, user_agent, last_seen_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE revoked_at = NULL, last_seen_at = ?, ip_address = ?
	`, ids.NewCUID(), userID, fingerprint, ids.DeviceDisplayName(ua, ip), nullStr(ip), nullStr(ua), now, now, now, ip)
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func loadSessionUser(r *http.Request, userID string) (map[string]interface{}, bool) {
	var (
		id, fullName, email string
		username, avatarURL sql.NullString
	)
	err := database.DB.QueryRowContext(r.Context(), `
		SELECT id, full_name, email, username, avatar_url FROM users WHERE id = ? LIMIT 1
	`, userID).Scan(&id, &fullName, &email, &username, &avatarURL)
	if err != nil {
		return nil, false
	}
	roles := middleware.FetchRoles(r.Context(), userID)
	u := map[string]interface{}{"id": id, "name": fullName, "email": email, "roles": roles}
	if username.Valid {
		u["username"] = username.String
	}
	if avatarURL.Valid {
		u["avatarUrl"] = avatarURL.String
	}
	return map[string]interface{}{"user": u}, true
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
	`, ids.NewCUID(), token, userID, expiresAt, nullStr(ip), nullStr(ua), time.Now(), time.Now())
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

func issueCode(r *http.Request, userID, email, fingerprint, purpose string) (string, error) {
	code, err := ids.NewCode()
	if err != nil {
		return "", err
	}
	vid := ids.NewCUID()
	_, err = database.DB.ExecContext(r.Context(), `
		INSERT INTO device_verification_codes (id, user_id, fingerprint, purpose, code, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, vid, userID, nullStr(fingerprint), purpose, code, time.Now().Add(10*time.Minute), time.Now())
	if err != nil {
		return "", err
	}
	mail.SendVerificationCode(email, code, purpose, "")
	return vid, nil
}
