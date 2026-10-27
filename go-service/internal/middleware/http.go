package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"hexavante-api-go/internal/response"
)

// statusRecorder captura o status para o log de acesso.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(status int) {
	s.status = status
	s.ResponseWriter.WriteHeader(status)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

func newRequestID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(b)
}

// clientIP usa a ÚLTIMA entrada de X-Forwarded-For (a acrescentada pelo proxy
// confiável) em vez da primeira, que é controlada pelo cliente. Isso evita
// burlar o rate limit rotacionando o primeiro valor do header.
func clientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		if last := strings.TrimSpace(parts[len(parts)-1]); last != "" {
			return last
		}
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// RequestLogger registra uma linha JSON por requisição (equivalente ao pino da
// Fastify) e propaga X-Request-Id para correlação com o nginx.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		requestID := strings.TrimSpace(r.Header.Get("X-Request-Id"))
		if requestID == "" {
			requestID = newRequestID()
		}
		w.Header().Set("X-Request-Id", requestID)

		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)

		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelError
		} else if status >= 400 {
			level = slog.LevelWarn
		}

		slog.Log(r.Context(), level, "http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"bytes", rec.bytes,
			"duration_ms", time.Since(start).Milliseconds(),
			"ip", clientIP(r),
			"request_id", requestID,
		)
	})
}

// Recover converte panic em 500 JSON, em vez de derrubar a conexão sem
// resposta. Sem isso, um nil pointer em qualquer handler deixa o cliente
// com "empty reply from server".
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recuperado",
					"error", rec,
					"method", r.Method,
					"path", r.URL.Path,
					"stack", string(debug.Stack()),
				)
				response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Erro interno do servidor")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// SecurityHeaders aplica o mínimo do helmet da Fastify.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-site")
		next.ServeHTTP(w, r)
	})
}

// BodyLimit rejeita corpos maiores que maxBytes. Sem limite, um POST anônimo
// consegue alocar memória sem teto no json.Decoder.
func BodyLimit(maxBytes int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch {
			if r.ContentLength > maxBytes {
				response.Error(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "Corpo da requisição muito grande")
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		}
		next.ServeHTTP(w, r)
	})
}

type rateBucket struct {
	count int
	reset time.Time
}

// rateLimiter é um contador por IP e por janela, em memória. Suficiente para
// conter abuso em um único container; não substitui Redis se houver réplicas.
type rateLimiter struct {
	mu     sync.Mutex
	hits   map[string]*rateBucket
	limit  int
	window time.Duration
	lastGC time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		hits:   make(map[string]*rateBucket),
		limit:  limit,
		window: window,
		lastGC: time.Now(),
	}
}

func (l *rateLimiter) allow(key string) (bool, int) {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastGC) > l.window {
		for k, b := range l.hits {
			if now.After(b.reset) {
				delete(l.hits, k)
			}
		}
		l.lastGC = now
	}
	// Limite de memória: sob ataque com IPs rotativos, zera o mapa em vez de
	// crescer sem teto dentro da mesma janela.
	if len(l.hits) > 50000 {
		l.hits = make(map[string]*rateBucket)
	}

	b, ok := l.hits[key]
	if !ok || now.After(b.reset) {
		l.hits[key] = &rateBucket{count: 1, reset: now.Add(l.window)}
		return true, 0
	}
	if b.count >= l.limit {
		retry := int(time.Until(b.reset).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	b.count++
	return true, 0
}

// RateLimit limita requisições por IP dentro de uma janela.
func RateLimit(limit int, window time.Duration, next http.HandlerFunc) http.HandlerFunc {
	limiter := newRateLimiter(limit, window)
	return func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		ok, retryAfter := limiter.allow(ip)
		if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			response.Error(w, http.StatusTooManyRequests, "RATE_LIMITED", "Muitas requisições. Tente novamente em instantes.")
			return
		}
		next(w, r)
	}
}
