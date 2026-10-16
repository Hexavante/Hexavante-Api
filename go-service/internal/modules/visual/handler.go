package visual

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

type StudyPreferences struct {
	UserID         string    `json:"userId"`
	DiagramType    string    `json:"diagramType"`    // auto, flowchart, mindmap, timeline, sequence
	DetailLevel    string    `json:"detailLevel"`    // simple, intermediate, advanced
	AutoSuggest    bool      `json:"autoSuggest"`    // sugestões automáticas
	Animations     bool      `json:"animations"`     // animações de transição
	AutoSaveNotes  bool      `json:"autoSaveNotes"`  // salvamento automático de notas
	UpdatedAt      time.Time `json:"updatedAt"`
}

type UpdatePreferencesRequest struct {
	DiagramType   *string `json:"diagramType,omitempty"`
	DetailLevel   *string `json:"detailLevel,omitempty"`
	AutoSuggest   *bool   `json:"autoSuggest,omitempty"`
	Animations    *bool   `json:"animations,omitempty"`
	AutoSaveNotes *bool   `json:"autoSaveNotes,omitempty"`
}

// GetPreferences retorna as configurações de aprendizado visual do estudante
func GetPreferences(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())

	// Verifica se a tabela user_study_preferences existe ou se usamos valores default
	query := `
		SELECT diagram_type, detail_level, auto_suggest, animations, autosave_notes, updated_at
		FROM user_study_preferences
		WHERE user_id = ?
		LIMIT 1
	`

	var prefs StudyPreferences
	prefs.UserID = user.ID

	err := database.DB.QueryRowContext(r.Context(), query, user.ID).Scan(
		&prefs.DiagramType,
		&prefs.DetailLevel,
		&prefs.AutoSuggest,
		&prefs.Animations,
		&prefs.AutoSaveNotes,
		&prefs.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Valores padrão descritos no documento conceitual
			response.JSON(w, http.StatusOK, StudyPreferences{
				UserID:        user.ID,
				DiagramType:   "auto",
				DetailLevel:   "intermediate",
				AutoSuggest:   true,
				Animations:    true,
				AutoSaveNotes: true,
				UpdatedAt:     time.Now(),
			})
			return
		}
		// Caso a tabela ainda não tenha sido criada via migração, retornar defaults graciosamente
		response.JSON(w, http.StatusOK, StudyPreferences{
			UserID:        user.ID,
			DiagramType:   "auto",
			DetailLevel:   "intermediate",
			AutoSuggest:   true,
			Animations:    true,
			AutoSaveNotes: true,
			UpdatedAt:     time.Now(),
		})
		return
	}

	response.JSON(w, http.StatusOK, prefs)
}

// UpdatePreferences salva as preferências de Visual Learning do estudante
func UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())

	var req UpdatePreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Corpo da requisição inválido")
		return
	}

	diagramType := "auto"
	if req.DiagramType != nil {
		diagramType = *req.DiagramType
	}
	detailLevel := "intermediate"
	if req.DetailLevel != nil {
		detailLevel = *req.DetailLevel
	}
	autoSuggest := true
	if req.AutoSuggest != nil {
		autoSuggest = *req.AutoSuggest
	}
	animations := true
	if req.Animations != nil {
		animations = *req.Animations
	}
	autoSaveNotes := true
	if req.AutoSaveNotes != nil {
		autoSaveNotes = *req.AutoSaveNotes
	}

	upsertQuery := `
		INSERT INTO user_study_preferences 
			(user_id, diagram_type, detail_level, auto_suggest, animations, autosave_notes, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			diagram_type = VALUES(diagram_type),
			detail_level = VALUES(detail_level),
			auto_suggest = VALUES(auto_suggest),
			animations = VALUES(animations),
			autosave_notes = VALUES(autosave_notes),
			updated_at = VALUES(updated_at)
	`
	now := time.Now()
	_, err := database.DB.ExecContext(r.Context(), upsertQuery, user.ID, diagramType, detailLevel, autoSuggest, animations, autoSaveNotes, now)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "DB_ERROR", "Erro ao salvar preferências")
		return
	}

	response.JSON(w, http.StatusOK, StudyPreferences{
		UserID:        user.ID,
		DiagramType:   diagramType,
		DetailLevel:   detailLevel,
		AutoSuggest:   autoSuggest,
		Animations:    animations,
		AutoSaveNotes: autoSaveNotes,
		UpdatedAt:     now,
	})
}
