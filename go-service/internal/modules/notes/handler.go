package notes

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

const (
	maxContentLength = 20000
	defaultListLimit = 100
	maxListLimit     = 200
)

type Note struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	LessonID   *string   `json:"lessonId,omitempty"`
	LessonName *string   `json:"lessonName,omitempty"`
	Content    string    `json:"content"`
	IsFavorite bool      `json:"isFavorite"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type SaveNoteRequest struct {
	LessonID   *string `json:"lessonId,omitempty"`
	Content    string  `json:"content"`
	IsFavorite *bool   `json:"isFavorite,omitempty"`
}

func generateID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "nt_" + hex.EncodeToString(b)
}

// GetLessonNote retorna a nota de uma aula específica para o usuário logado.
func GetLessonNote(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}
	lessonID := strings.TrimSpace(r.URL.Query().Get("lessonId"))
	if lessonID == "" {
		response.Error(w, http.StatusBadRequest, "BAD_REQUEST", "lessonId obrigatório")
		return
	}

	query := `
		SELECT id, user_id, lesson_id, content, is_favorite, updated_at
		FROM lesson_notes
		WHERE user_id = ? AND lesson_id = ?
		LIMIT 1
	`
	var n Note
	err := database.DB.QueryRowContext(r.Context(), query, user.ID, lessonID).
		Scan(&n.ID, &n.UserID, &n.LessonID, &n.Content, &n.IsFavorite, &n.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			// Nota vazia pronta para edição.
			response.JSON(w, http.StatusOK, map[string]interface{}{
				"id":         "",
				"userId":     user.ID,
				"lessonId":   lessonID,
				"content":    "",
				"isFavorite": false,
				"updatedAt":  nil,
			})
			return
		}
		slog.Error("erro ao buscar anotação", "error", err, "userId", user.ID, "lessonId", lessonID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao buscar anotação")
		return
	}

	response.JSON(w, http.StatusOK, n)
}

// SaveLessonNote salva/atualiza a anotação da aula (autosave do Smart Notes).
func SaveLessonNote(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}

	var req SaveNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Corpo da requisição inválido")
		return
	}

	if req.LessonID == nil || strings.TrimSpace(*req.LessonID) == "" {
		response.Error(w, http.StatusBadRequest, "BAD_REQUEST", "lessonId é obrigatório")
		return
	}
	if len(req.Content) > maxContentLength {
		response.Error(w, http.StatusBadRequest, "CONTENT_TOO_LARGE", "A anotação excede o limite de 20.000 caracteres")
		return
	}

	lessonID := strings.TrimSpace(*req.LessonID)
	now := time.Now()

	hasFavorite := 0
	favorite := false
	if req.IsFavorite != nil {
		hasFavorite = 1
		favorite = *req.IsFavorite
	}

	// UPSERT nativo no MySQL. Quando o cliente não manda isFavorite, o valor
	// existente é preservado (autosave do painel manda só lessonId + content).
	query := `
		INSERT INTO lesson_notes (id, user_id, lesson_id, content, is_favorite, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			content = VALUES(content),
			is_favorite = IF(? = 1, VALUES(is_favorite), is_favorite),
			updated_at = VALUES(updated_at)
	`

	_, err := database.DB.ExecContext(r.Context(), query,
		generateID(), user.ID, lessonID, req.Content, favorite, now, hasFavorite)
	if err != nil {
		slog.Error("erro ao salvar anotação", "error", err, "userId", user.ID, "lessonId", lessonID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao salvar anotação")
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"saved":     true,
		"lessonId":  lessonID,
		"updatedAt": now,
	})
}

// ListUserNotes lista todas as anotações do estudante (Biblioteca Central).
func ListUserNotes(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}

	search := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := defaultListLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
			if limit > maxListLimit {
				limit = maxListLimit
			}
		}
	}

	baseQuery := `
		SELECT ln.id, ln.user_id, ln.lesson_id, l.title, ln.content, ln.is_favorite, ln.updated_at
		FROM lesson_notes ln
		LEFT JOIN lessons l ON l.id = ln.lesson_id
		WHERE ln.user_id = ?
	`
	args := []interface{}{user.ID}

	if search != "" {
		baseQuery += " AND (ln.content LIKE ? OR l.title LIKE ?)"
		like := "%" + search + "%"
		args = append(args, like, like)
	}

	baseQuery += " ORDER BY ln.updated_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := database.DB.QueryContext(r.Context(), baseQuery, args...)
	if err != nil {
		slog.Error("erro ao listar anotações", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao carregar anotações")
		return
	}
	defer rows.Close()

	notesList := make([]Note, 0)
	for rows.Next() {
		var n Note
		var lessonTitle sql.NullString
		if err := rows.Scan(&n.ID, &n.UserID, &n.LessonID, &lessonTitle, &n.Content, &n.IsFavorite, &n.UpdatedAt); err != nil {
			slog.Error("erro ao ler anotação", "error", err, "userId", user.ID)
			continue
		}
		if lessonTitle.Valid {
			n.LessonName = &lessonTitle.String
		}
		notesList = append(notesList, n)
	}
	if err := rows.Err(); err != nil {
		slog.Error("erro ao iterar anotações", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao carregar anotações")
		return
	}

	response.JSON(w, http.StatusOK, notesList)
}

// ToggleFavorite marca/desmarca uma anotação como favorita. Não altera
// updated_at para não reordenar a biblioteca a cada clique.
func ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}

	noteID := strings.TrimSpace(r.PathValue("id"))
	if noteID == "" {
		response.Error(w, http.StatusBadRequest, "BAD_REQUEST", "id da anotação é obrigatório")
		return
	}

	var body struct {
		IsFavorite *bool `json:"isFavorite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.IsFavorite == nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "isFavorite booleano é obrigatório")
		return
	}

	result, err := database.DB.ExecContext(r.Context(),
		`UPDATE lesson_notes SET is_favorite = ? WHERE id = ? AND user_id = ?`,
		*body.IsFavorite, noteID, user.ID)
	if err != nil {
		slog.Error("erro ao favoritar anotação", "error", err, "userId", user.ID, "noteId", noteID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao atualizar anotação")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Anotação não encontrada")
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"id":         noteID,
		"isFavorite": *body.IsFavorite,
	})
}
