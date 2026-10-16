package database

import (
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var DB *sql.DB

// formatDSN converte URIs estilo mysql://usuario:senha@host:porta/banco para DSN compatível com go-sql-driver
func formatDSN(rawURL string) string {
	if !strings.HasPrefix(rawURL, "mysql://") {
		return rawURL
	}

	// Remove mysql://
	trimmed := strings.TrimPrefix(rawURL, "mysql://")
	
	// auth@host/db
	parts := strings.SplitN(trimmed, "@", 2)
	if len(parts) != 2 {
		return rawURL
	}
	auth := parts[0]
	rest := parts[1]

	slashIdx := strings.Index(rest, "/")
	if slashIdx == -1 {
		return rawURL
	}
	hostPort := rest[:slashIdx]
	dbAndParams := rest[slashIdx+1:]

	dsn := fmt.Sprintf("%s@tcp(%s)/%s", auth, hostPort, dbAndParams)
	if !strings.Contains(dsn, "parseTime=true") {
		if strings.Contains(dsn, "?") {
			dsn += "&parseTime=true"
		} else {
			dsn += "?parseTime=true"
		}
	}
	return dsn
}

func Connect(dbURL string) (*sql.DB, error) {
	dsn := formatDSN(dbURL)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("falha ao abrir conexão com banco: %w", err)
	}

	// Configuração do pool de alta performance
	db.SetMaxOpenConns(50)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	if err := db.Ping(); err != nil {
		slog.Warn("Aviso: Banco não respondeu ao ping inicial, aguardando conexão ativa", "error", err)
	} else {
		slog.Info("Conectado ao banco de dados MySQL com sucesso!")
	}

	DB = db
	return db, nil
}
