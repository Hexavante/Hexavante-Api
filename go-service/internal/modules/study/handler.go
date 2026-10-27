package study

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/ids"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

type CompleteLessonRequest struct {
	LessonID string `json:"lessonId"`
	CourseID string `json:"courseId"`
}

// CompleteLesson registra a conclusão de uma aula de forma idempotente e
// recalcula o progresso da matrícula (0-100), igual ao fluxo da Web.
// Não concede XP: gamificação continua na Server Action da Web.
func CompleteLesson(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromRequest(w, r)
	if !ok {
		return
	}

	var req CompleteLessonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Corpo da requisição inválido")
		return
	}
	req.LessonID = strings.TrimSpace(req.LessonID)
	req.CourseID = strings.TrimSpace(req.CourseID)
	if req.LessonID == "" || req.CourseID == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "lessonId e courseId são obrigatórios")
		return
	}

	tx, err := database.DB.BeginTx(r.Context(), nil)
	if err != nil {
		slog.Error("erro ao abrir transação de conclusão", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var enrollmentID string
	err = tx.QueryRowContext(r.Context(),
		`SELECT id FROM course_enrollments WHERE user_id = ? AND course_id = ? LIMIT 1`,
		user.ID, req.CourseID).Scan(&enrollmentID)
	if err != nil {
		if err == sql.ErrNoRows {
			response.Error(w, http.StatusNotFound, "NOT_ENROLLED", "Matrícula não encontrada para este curso")
			return
		}
		slog.Error("erro ao buscar matrícula", "error", err, "userId", user.ID, "courseId", req.CourseID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}

	var lessonInCourse int
	err = tx.QueryRowContext(r.Context(), `
		SELECT 1 FROM lessons l
		INNER JOIN modules m ON m.id = l.module_id
		WHERE l.id = ? AND m.course_id = ?
		LIMIT 1
	`, req.LessonID, req.CourseID).Scan(&lessonInCourse)
	if err != nil {
		if err == sql.ErrNoRows {
			response.Error(w, http.StatusBadRequest, "LESSON_NOT_IN_COURSE", "Aula não pertence a este curso")
			return
		}
		slog.Error("erro ao validar aula do curso", "error", err, "lessonId", req.LessonID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}

	now := time.Now()
	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO lesson_progress (id, user_id, lesson_id, enrollment_id, completed, completed_at, updated_at)
		VALUES (?, ?, ?, ?, 1, ?, ?)
		ON DUPLICATE KEY UPDATE
			enrollment_id = VALUES(enrollment_id),
			completed = 1,
			completed_at = COALESCE(completed_at, VALUES(completed_at)),
			updated_at = VALUES(updated_at)
	`, ids.NewCUID(), user.ID, req.LessonID, enrollmentID, now, now); err != nil {
		slog.Error("erro ao salvar progresso da aula", "error", err, "userId", user.ID, "lessonId", req.LessonID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}

	var completedCount, totalLessons int
	if err := tx.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM lesson_progress lp
		INNER JOIN lessons l ON l.id = lp.lesson_id
		INNER JOIN modules m ON m.id = l.module_id
		WHERE lp.user_id = ? AND lp.completed = 1 AND m.course_id = ?
	`, user.ID, req.CourseID).Scan(&completedCount); err != nil {
		slog.Error("erro ao contar aulas concluídas", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}
	if err := tx.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM lessons l
		INNER JOIN modules m ON m.id = l.module_id
		WHERE m.course_id = ?
	`, req.CourseID).Scan(&totalLessons); err != nil {
		slog.Error("erro ao contar aulas do curso", "error", err, "courseId", req.CourseID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}

	progress := 0
	if totalLessons > 0 {
		progress = int(math.Round(float64(completedCount) / float64(totalLessons) * 100))
		if progress > 100 {
			progress = 100
		}
	}

	if _, err := tx.ExecContext(r.Context(), `
		UPDATE course_enrollments
		SET progress = ?,
			completed_at = CASE WHEN ? >= 100 THEN COALESCE(completed_at, ?) ELSE NULL END
		WHERE id = ?
	`, progress, progress, now, enrollmentID); err != nil {
		slog.Error("erro ao atualizar progresso da matrícula", "error", err, "enrollmentId", enrollmentID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}

	if err := tx.Commit(); err != nil {
		slog.Error("erro ao confirmar transação de conclusão", "error", err, "userId", user.ID)
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao registrar progresso")
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"completed":        true,
		"lessonId":         req.LessonID,
		"courseId":         req.CourseID,
		"progress":         progress,
		"completedLessons": completedCount,
		"totalLessons":     totalLessons,
		"completedAt":      now,
	})
}
