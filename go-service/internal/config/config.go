package config

import (
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	Environment string
	FrontendURL string
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
	}
}
