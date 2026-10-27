package response

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// APIResponse segue o contrato da Fastify: em erro, `error` é uma string e
// `code` fica no nível raiz. Não usar envelope aninhado para erro — os
// clientes (Web, Landing, Mobile) leem `body.error` como string.
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Code    string      `json:"code,omitempty"`
}

func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    data,
	}); err != nil {
		slog.Error("falha ao serializar resposta JSON", "error", err, "status", status)
	}
}

func Error(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(APIResponse{
		Success: false,
		Error:   message,
		Code:    code,
	}); err != nil {
		slog.Error("falha ao serializar resposta de erro", "error", err, "status", status)
	}
}
