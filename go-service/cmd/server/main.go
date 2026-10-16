package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"hexavante-api-go/internal/config"
	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/modules/notes"
	"hexavante-api-go/internal/modules/study"
	"hexavante-api-go/internal/modules/visual"
	"hexavante-api-go/internal/response"
)

func main() {
	// Logger estruturado nativo
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := config.Load()

	slog.Info("Iniciando Hexavante Go API Service...", "port", cfg.Port, "env", cfg.Environment)

	// Conexão com o banco
	_, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		slog.Error("Erro ao inicializar conexão MySQL", "error", err)
	}

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusOK, map[string]interface{}{
			"status":    "healthy",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"service":   "hexavante-api-go",
		})
	})

	// === Rotas de Smart Notes ===
	// Obter anotação de uma aula específica
	mux.HandleFunc("GET /api/v1/notes/lesson", middleware.RequireAuth(notes.GetLessonNote))
	// Salvar ou atualizar anotação de uma aula (Autosave veloz)
	mux.HandleFunc("POST /api/v1/notes/lesson", middleware.RequireAuth(notes.SaveLessonNote))
	// Listar/Pesquisar na Biblioteca Central de Anotações
	mux.HandleFunc("GET /api/v1/notes", middleware.RequireAuth(notes.ListUserNotes))

	// === Rotas de Visual Learning ===
	// Obter preferências de aprendizado visual do estudante
	mux.HandleFunc("GET /api/v1/visual/preferences", middleware.RequireAuth(visual.GetPreferences))
	// Atualizar preferências de estudo
	mux.HandleFunc("PUT /api/v1/visual/preferences", middleware.RequireAuth(visual.UpdatePreferences))

	// === Rotas de Estudo de Alta Performance (Substitui Server Actions lentas) ===
	mux.HandleFunc("POST /api/v1/study/complete-lesson", middleware.RequireAuth(study.CompleteLesson))

	// Aplica middlewares globais: CORS
	handler := middleware.CORS(mux)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info(fmt.Sprintf("Servidor Go escutando na porta %s", cfg.Port))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Falha na execução do servidor HTTP", "error", err)
			os.Exit(1)
		}
	}()

	<-stop
	slog.Info("Encerrando servidor gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("Erro durante desligamento do servidor", "error", err)
	}

	if database.DB != nil {
		_ = database.DB.Close()
	}

	slog.Info("Servidor Go finalizado.")
}
