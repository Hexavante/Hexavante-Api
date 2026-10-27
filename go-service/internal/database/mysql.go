package database

import (
	"database/sql"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var DB *sql.DB

// formatDSN converte URIs estilo mysql://usuario:senha@host:porta/banco para DSN compatível com go-sql-driver.
// url.Parse já decodifica %XX do userinfo; decodificar de novo (QueryUnescape)
// quebraria senhas com `%` literal e transformaria `+` em espaço.
func formatDSN(rawURL string) string {
	if !strings.HasPrefix(rawURL, "mysql://") {
		return rawURL
	}

	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return rawURL
	}

	auth := ""
	if u.User != nil {
		auth = u.User.Username()
		if pass, ok := u.User.Password(); ok && pass != "" {
			auth += ":" + pass
		}
	}

	dbName := strings.TrimPrefix(u.Path, "/")

	params := u.Query()
	if !params.Has("parseTime") {
		params.Set("parseTime", "true")
	}
	if !params.Has("charset") {
		params.Set("charset", "utf8mb4")
	}

	return fmt.Sprintf("%s@tcp(%s)/%s?%s", auth, u.Host, dbName, params.Encode())
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
