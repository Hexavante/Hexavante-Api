package study

import (
	"encoding/json"
	"net/http"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

type CompleteLessonRequest struct {
	LessonID string `json:"lessonId"`
	CourseID string `json:"courseId"`
}

// CompleteLesson registra a conclusão de uma aula com latência mínima e idempotência
func CompleteLesson(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())

	var req CompleteLessonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.LessonID == "" {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "lessonId obrigatório")
		return
	}

	now := time.Now()

	// 1. Marca conclusão no lesson_progress de maneira transacional/idempotente
	query := `
		INSERT INTO lesson_progress (id, user_id, lesson_id, completed, completed_at, updated_at)
		VALUES (UUID(), ?, ?, 1, ?, ?)
		ON DUPLICATE KEY UPDATE
			completed = 1,
			completed_at = COALESCE(completed_at, VALUES(completed_at)),
			updated_at = VALUES(updated_at)
	`

	_, err := database.DB.ExecContext(r.Context(), query, user.ID, req.LessonID, now, now)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"completed":   true,
		"lessonId":    req.LessonID,
		"completedAt": now,
	})
}
