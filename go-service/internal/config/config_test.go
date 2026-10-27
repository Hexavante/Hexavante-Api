package config

import "testing"

func TestCORSOriginsCSV(t *testing.T) {
	cfg := &Config{CORSOrigin: " https://a.example , ,https://b.example "}
	got := cfg.CORSOrigins()

	if len(got) != 2 {
		t.Fatalf("esperado 2 origens, veio %v", got)
	}
	if got[0] != "https://a.example" || got[1] != "https://b.example" {
		t.Fatalf("origens inesperadas: %v", got)
	}
}

func TestCORSOriginsDefaults(t *testing.T) {
	cfg := &Config{FrontendURL: "https://staging.hexavante.com.br"}
	got := cfg.CORSOrigins()

	found := false
	for _, origin := range got {
		if origin == "https://app.hexavante.com.br" {
			found = true
		}
	}
	if !found {
		t.Fatalf("allowlist padrão deveria conter o app: %v", got)
	}
	if got[len(got)-1] != "https://staging.hexavante.com.br" {
		t.Fatalf("FrontendURL deveria ser anexado no fim: %v", got)
	}
}

func TestCORSOriginsDoesNotDuplicateFrontend(t *testing.T) {
	cfg := &Config{FrontendURL: "https://app.hexavante.com.br"}
	got := cfg.CORSOrigins()

	count := 0
	for _, origin := range got {
		if origin == "https://app.hexavante.com.br" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("origem duplicada %d vezes: %v", count, got)
	}
}
