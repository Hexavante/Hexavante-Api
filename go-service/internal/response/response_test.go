package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func decodeBody(t *testing.T, raw []byte) map[string]interface{} {
	t.Helper()
	var body map[string]interface{}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("json inválido: %v (%s)", err, raw)
	}
	return body
}

func TestJSON(t *testing.T) {
	rec := httptest.NewRecorder()

	JSON(rec, http.StatusCreated, map[string]interface{}{"id": "abc"})

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperado %d", rec.Code, http.StatusCreated)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("content-type = %q", got)
	}

	body := decodeBody(t, rec.Body.Bytes())
	if body["success"] != true {
		t.Fatalf("success = %v, esperado true", body["success"])
	}
	data, ok := body["data"].(map[string]interface{})
	if !ok || data["id"] != "abc" {
		t.Fatalf("data inesperado: %v", body["data"])
	}
	if _, exists := body["error"]; exists {
		t.Fatalf("resposta de sucesso não deve ter error: %v", body)
	}
}

// Erro deve seguir o contrato da Fastify: error é string e code fica na raiz.
func TestErrorShape(t *testing.T) {
	rec := httptest.NewRecorder()

	Error(rec, http.StatusBadRequest, "INVALID_CODE", "Código inválido ou expirado.")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}

	body := decodeBody(t, rec.Body.Bytes())
	if body["success"] != false {
		t.Fatalf("success = %v, esperado false", body["success"])
	}
	if msg, ok := body["error"].(string); !ok || msg != "Código inválido ou expirado." {
		t.Fatalf("error deveria ser string, veio %T: %v", body["error"], body["error"])
	}
	if body["code"] != "INVALID_CODE" {
		t.Fatalf("code = %v", body["code"])
	}
	if _, exists := body["data"]; exists {
		t.Fatalf("resposta de erro não deve ter data: %v", body)
	}
}
