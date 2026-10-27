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
	"hexavante-api-go/internal/modules/auth"
	"hexavante-api-go/internal/modules/authorization"
	"hexavante-api-go/internal/modules/notes"
	"hexavante-api-go/internal/modules/security"
	"hexavante-api-go/internal/modules/study"
	"hexavante-api-go/internal/modules/users"
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

	// Health check — compatível com Fastify antigo (/health) e com
	// script de deploy (/api/v1/health). Igual à Fastify:
	// healthy/degraded -> 200, unhealthy (sem DB) -> 503.
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		status := http.StatusOK
		payload := map[string]interface{}{
			"status":    "healthy",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"service":   "hexavante-api-go",
		}
		if database.DB == nil {
			status = http.StatusServiceUnavailable
			payload["status"] = "unhealthy"
		} else if err := database.DB.PingContext(r.Context()); err != nil {
			payload["status"] = "degraded"
			payload["warning"] = "database ping falhou"
		}
		response.JSON(w, status, payload)
	}
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("GET /api/v1/health", healthHandler)

	// Raiz — mesmo contrato mínimo da Fastify antiga.
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusOK, map[string]interface{}{
			"status":    "ok",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"version":   "2.0.0",
			"health":    "/health",
		})
	})

	// === Auth (contratos idênticos à Fastify) ===
	// Hoje o nginx manda /api/v1/auth/* para a Fastify; estas rotas ficam
	// prontas para a migração e já têm limite de tentativas.
	mux.HandleFunc("POST /api/v1/auth/login", middleware.RateLimit(10, time.Minute, auth.Login))
	mux.HandleFunc("POST /api/v1/auth/register", middleware.RateLimit(5, time.Minute, auth.Register))
	mux.HandleFunc("POST /api/v1/auth/logout", auth.Logout)
	mux.HandleFunc("GET /api/v1/auth/session", auth.Session)
	mux.HandleFunc("POST /api/v1/auth/verify-device", middleware.RateLimit(10, time.Minute, security.VerifyDevice))
	mux.HandleFunc("POST /api/v1/auth/resend-device-code", middleware.RateLimit(3, time.Minute, security.ResendCode))
	mux.HandleFunc("POST /api/v1/auth/forgot-password", middleware.RateLimit(5, time.Minute, security.ForgotPassword))
	mux.HandleFunc("POST /api/v1/auth/reset-password", middleware.RateLimit(5, time.Minute, security.ResetPassword))

	// === Usuário logado ===
	mux.HandleFunc("GET /api/v1/users/me", middleware.RequireAuth(users.Me))
	mux.HandleFunc("PATCH /api/v1/users/me", middleware.RequireAuth(users.UpdateMe))
	mux.HandleFunc("DELETE /api/v1/users/me", middleware.RequireAuth(users.DeleteMe))
	mux.HandleFunc("GET /api/v1/users/me/devices", middleware.RequireAuth(security.ListDevices))
	mux.HandleFunc("DELETE /api/v1/users/me/devices/{id}", middleware.RequireAuth(security.RevokeDevice))
	mux.HandleFunc("POST /api/v1/users/me/2fa/enable", middleware.RequireAuth(security.EnableTwoFactor))
	mux.HandleFunc("POST /api/v1/users/me/2fa/confirm", middleware.RequireAuth(security.ConfirmTwoFactor))
	mux.HandleFunc("DELETE /api/v1/users/me/2fa", middleware.RequireAuth(security.DisableTwoFactor))
	mux.HandleFunc("PATCH /api/v1/users/me/presence", middleware.RequireAuth(security.SetPresence))
	mux.HandleFunc("POST /api/v1/users/me/heartbeat", middleware.RequireAuth(security.Heartbeat))
	mux.HandleFunc("GET /api/v1/users/{username}", users.PublicProfile)

	// === Autorização ===
	mux.HandleFunc("GET /api/v1/authorization/context", middleware.RequireAuth(authorization.Context))
	mux.HandleFunc("GET /api/v1/authorization/check/{permission}", middleware.RequireAuth(authorization.Check))
	mux.HandleFunc("GET /api/v1/authorization/permissions", middleware.RequireAuth(authorization.Permissions))

	// === Rotas de Smart Notes ===
	// Obter anotação de uma aula específica
	mux.HandleFunc("GET /api/v1/notes/lesson", middleware.RequireAuth(notes.GetLessonNote))
	// Salvar ou atualizar anotação de uma aula (Autosave veloz)
	mux.HandleFunc("POST /api/v1/notes/lesson", middleware.RateLimit(120, time.Minute, middleware.RequireAuth(notes.SaveLessonNote)))
	// Listar/Pesquisar na Biblioteca Central de Anotações
	mux.HandleFunc("GET /api/v1/notes", middleware.RequireAuth(notes.ListUserNotes))
	// Favoritar/desfavoritar uma anotação
	mux.HandleFunc("PATCH /api/v1/notes/{id}/favorite", middleware.RateLimit(120, time.Minute, middleware.RequireAuth(notes.ToggleFavorite)))

	// === Rotas de Visual Learning ===
	// Obter preferências de aprendizado visual do estudante
	mux.HandleFunc("GET /api/v1/visual/preferences", middleware.RequireAuth(visual.GetPreferences))
	// Atualizar preferências de estudo
	mux.HandleFunc("PUT /api/v1/visual/preferences", middleware.RateLimit(30, time.Minute, middleware.RequireAuth(visual.UpdatePreferences)))

	// === Rotas de Estudo de Alta Performance (Substitui Server Actions lentas) ===
	mux.HandleFunc("POST /api/v1/study/complete-lesson", middleware.RateLimit(60, time.Minute, middleware.RequireAuth(study.CompleteLesson)))

	// Middlewares globais: log de acesso, panic recovery, headers de
	// segurança, CORS com allowlist e limite de corpo.
	handler := middleware.RequestLogger(
		middleware.Recover(
			middleware.SecurityHeaders(
				middleware.CORSWithConfig(
					middleware.BodyLimit(1<<20, mux),
					cfg.CORSOrigins(),
				),
			),
		),
	)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       120 * time.Second,
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
