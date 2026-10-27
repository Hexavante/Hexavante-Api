package database

import (
	"strings"
	"testing"
)

func TestFormatDSN(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		contains []string
		absent   []string
	}{
		{
			name:     "dsn nativo passa direto",
			raw:      "root:root@tcp(127.0.0.1:3306)/hexavante?parseTime=true",
			contains: []string{"root:root@tcp(127.0.0.1:3306)/hexavante?parseTime=true"},
		},
		{
			name:     "url mysql com senha percent-encoded",
			raw:      "mysql://user:p%2Fss@mysql:3306/hexavante",
			contains: []string{"user:p/ss@tcp(mysql:3306)/hexavante", "parseTime=true", "charset=utf8mb4"},
		},
		{
			name:     "mais na senha nao vira espaco",
			raw:      "mysql://user:a+b@mysql:3306/hexavante",
			contains: []string{"user:a+b@tcp(mysql:3306)/hexavante"},
			absent:   []string{"a b@"},
		},
		{
			name:     "percent literal nao e decodificado duas vezes",
			raw:      "mysql://user:p%252Fss@mysql:3306/hexavante",
			contains: []string{"p%2Fss@tcp(mysql:3306)"},
			absent:   []string{"p/ss@tcp"},
		},
		{
			name:     "parseTime existente nao duplica",
			raw:      "mysql://user:pass@mysql:3306/hexavante?parseTime=true&loc=UTC",
			contains: []string{"parseTime=true", "loc=UTC"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatDSN(tt.raw)

			for _, want := range tt.contains {
				if !strings.Contains(got, want) {
					t.Fatalf("formatDSN(%q) = %q; esperado conter %q", tt.raw, got, want)
				}
			}
			for _, unwanted := range tt.absent {
				if strings.Contains(got, unwanted) {
					t.Fatalf("formatDSN(%q) = %q; não deveria conter %q", tt.raw, got, unwanted)
				}
			}

			if tt.name == "parseTime existente nao duplica" {
				if n := strings.Count(got, "parseTime="); n != 1 {
					t.Fatalf("parseTime apareceu %d vezes em %q", n, got)
				}
			}
		})
	}
}
