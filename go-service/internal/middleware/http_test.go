package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRecover(t *testing.T) {
	handler := Recover(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, esperado 500", rec.Code)
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json inválido: %v", err)
	}
	if body["success"] != false || body["code"] != "INTERNAL_ERROR" {
		t.Fatalf("corpo inesperado: %v", body)
	}
}

func TestBodyLimit(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := BodyLimit(4, next)

	big := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("12345"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, big)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("corpo grande: status = %d, esperado 413", rec.Code)
	}

	small := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("123"))
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, small)
	if rec.Code != http.StatusOK {
		t.Fatalf("corpo pequeno: status = %d, esperado 200", rec.Code)
	}

	get := httptest.NewRequest(http.MethodGet, "/", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, get)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET: status = %d, esperado 200", rec.Code)
	}
}

func TestRateLimit(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RateLimit(2, time.Minute, next)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req.RemoteAddr = "203.0.113.10:1234"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("requisição %d: status = %d, esperado 200", i+1, rec.Code)
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.RemoteAddr = "203.0.113.10:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, esperado 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("Retry-After ausente")
	}

	// Outro IP não é afetado.
	other := httptest.NewRequest(http.MethodPost, "/", nil)
	other.RemoteAddr = "203.0.113.11:1234"
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, other)
	if rec.Code != http.StatusOK {
		t.Fatalf("outro IP: status = %d, esperado 200", rec.Code)
	}
}

func TestClientIPUsesLastForwardedHop(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "127.0.0.1:9999"
	req.Header.Set("X-Forwarded-For", "10.0.0.1, 198.51.100.7")

	if got := clientIP(req); got != "198.51.100.7" {
		t.Fatalf("clientIP = %q, esperado 198.51.100.7", got)
	}
}

func TestSecurityHeaders(t *testing.T) {
	handler := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q", got)
	}
	if got := rec.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("X-Frame-Options = %q", got)
	}
}

func TestCORSAllowlist(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := CORSWithConfig(next, []string{"https://app.hexavante.com.br"})

	allowed := httptest.NewRequest(http.MethodGet, "/", nil)
	allowed.Header.Set("Origin", "https://app.hexavante.com.br")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, allowed)
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://app.hexavante.com.br" {
		t.Fatalf("origem permitida não refletida")
	}
	if rec.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("credenciais não permitidas")
	}

	blocked := httptest.NewRequest(http.MethodGet, "/", nil)
	blocked.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, blocked)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("origem não permitida refletida")
	}

	preflight := httptest.NewRequest(http.MethodOptions, "/", nil)
	preflight.Header.Set("Origin", "https://app.hexavante.com.br")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, preflight)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, esperado 204", rec.Code)
	}
}
