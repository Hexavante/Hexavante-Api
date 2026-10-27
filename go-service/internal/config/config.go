package config

import (
	"os"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	Environment string
	FrontendURL string
	CORSOrigin  string
}

// CORSOrigins retorna a allowlist de origens (sem refletir Origin arbitrário).
func (c *Config) CORSOrigins() []string {
	if strings.TrimSpace(c.CORSOrigin) != "" {
		parts := strings.Split(c.CORSOrigin, ",")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	origins := []string{
		"https://hexavante.com.br",
		"https://www.hexavante.com.br",
		"https://app.hexavante.com.br",
		"https://painel.hexavante.com.br",
	}
	if c.FrontendURL != "" {
		found := false
		for _, o := range origins {
			if o == c.FrontendURL {
				found = true
				break
			}
		}
		if !found {
			origins = append(origins, c.FrontendURL)
		}
	}
	return origins
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3050"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Padrão de fallback para conexão MySQL local
		dbURL = "root:root@tcp(127.0.0.1:3306)/hexavante?parseTime=true&charset=utf8mb4"
	}

	env := os.Getenv("NODE_ENV")
	if env == "" {
		env = os.Getenv("APP_ENV")
	}
	if env == "" {
		env = "development"
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	return &Config{
		Port:        port,
		DatabaseURL: dbURL,
		Environment: env,
		FrontendURL: frontendURL,
		CORSOrigin:  os.Getenv("CORS_ORIGIN"),
	}
}
