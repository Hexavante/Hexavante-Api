package notes

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

type Note struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	LessonID   *string   `json:"lessonId,omitempty"`
	LessonName *string   `json:"lessonName,omitempty"`
	ExamID     *string   `json:"examId,omitempty"`
	ExamTitle  *string   `json:"examTitle,omitempty"`
	QuestionID *string   `json:"questionId,omitempty"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	IsFavorite bool      `json:"isFavorite"`
	UpdatedAt  time.Time `json:"updatedAt"`
	CreatedAt  time.Time `json:"createdAt"`
}

type SaveNoteRequest struct {
	LessonID   *string `json:"lessonId,omitempty"`
	ExamID     *string `json:"examId,omitempty"`
	QuestionID *string `json:"questionId,omitempty"`
	Title      string  `json:"title"`
	Content    string  `json:"content"`
	IsFavorite *bool   `json:"isFavorite,omitempty"`
}

func generateID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "nt_" + hex.EncodeToString(b)
}

// GetLessonNote retorna a nota de uma aula específica para o usuário logado
func GetLessonNote(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	lessonID := r.URL.Query().Get("lessonId")
	if lessonID == "" {
		response.Error(w, http.StatusBadRequest, "BAD_REQUEST", "lessonId obrigatório")
		return
	}

	query := `
		SELECT id, user_id, lesson_id, content, updated_at
		FROM lesson_notes
		WHERE user_id = ? AND lesson_id = ?
		LIMIT 1
	`
	var n Note
	var content string
	var updatedAt time.Time
	err := database.DB.QueryRowContext(r.Context(), query, user.ID, lessonID).Scan(&n.ID, &n.UserID, &n.LessonID, &content, &updatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			// Retorna nota vazia pronta para edição
			response.JSON(w, http.StatusOK, map[string]interface{}{
				"id":        "",
				"userId":    user.ID,
				"lessonId":  lessonID,
				"content":   "",
				"updatedAt": nil,
			})
			return
		}
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao buscar anotação")
		return
	}

	n.Content = content
	n.UpdatedAt = updatedAt
	response.JSON(w, http.StatusOK, n)
}

// SaveLessonNote salva/atualiza a anotação da aula com alta performance (Autosave do Smart Notes)
func SaveLessonNote(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())

	var req SaveNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Corpo da requisição inválido")
		return
	}

	if req.LessonID == nil || *req.LessonID == "" {
		response.Error(w, http.StatusBadRequest, "BAD_REQUEST", "lessonId é obrigatório")
		return
	}

	lessonID := *req.LessonID
	newID := generateID()
	now := time.Now()

	// UPSERT nativo no MySQL para latência sub-5ms
	query := `
		INSERT INTO lesson_notes (id, user_id, lesson_id, content, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			content = VALUES(content),
			updated_at = VALUES(updated_at)
	`

	_, err := database.DB.ExecContext(r.Context(), query, newID, user.ID, lessonID, req.Content, now)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", fmt.Sprintf("Erro ao salvar anotação: %v", err))
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"saved":     true,
		"lessonId":  lessonID,
		"updatedAt": now,
	})
}

// ListUserNotes lista todas as anotações do estudante (Biblioteca Central de Smart Notes)
func ListUserNotes(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	search := strings.TrimSpace(r.URL.Query().Get("q"))

	baseQuery := `
		SELECT ln.id, ln.user_id, ln.lesson_id, l.title, ln.content, ln.updated_at
		FROM lesson_notes ln
		LEFT JOIN lessons l ON l.id = ln.lesson_id
		WHERE ln.user_id = ?
	`
	var args []interface{}
	args = append(args, user.ID)

	if search != "" {
		baseQuery += " AND (ln.content LIKE ? OR l.title LIKE ?)"
		like := "%" + search + "%"
		args = append(args, like, like)
	}

	baseQuery += " ORDER BY ln.updated_at DESC LIMIT 100"

	rows, err := database.DB.QueryContext(r.Context(), baseQuery, args...)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao carregar anotações")
		return
	}
	defer rows.Close()

	notesList := make([]Note, 0)
	for rows.Next() {
		var n Note
		var lessonTitle sql.NullString
		if err := rows.Scan(&n.ID, &n.UserID, &n.LessonID, &lessonTitle, &n.Content, &n.UpdatedAt); err != nil {
			continue
		}
		if lessonTitle.Valid {
			n.LessonName = &lessonTitle.String
		}
		notesList = append(notesList, n)
	}

	response.JSON(w, http.StatusOK, notesList)
}
