package ids

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"math/big"
	"net"
	"strings"
	"time"
)

const base36 = "0123456789abcdefghijklmnopqrstuvwxyz"

// NewCUID gera um id único estilo cuid ("c" + 24 chars base36).
func NewCUID() string {
	var sb strings.Builder
	sb.WriteByte('c')
	// timestamp base36 (7 chars) + aleatório (17 chars)
	ts := uint64(time.Now().UnixMilli())
	tsPart := make([]byte, 0, 8)
	for ts > 0 {
		tsPart = append([]byte{base36[ts%36]}, tsPart...)
		ts /= 36
	}
	for len(tsPart) < 7 {
		tsPart = append([]byte{'0'}, tsPart...)
	}
	sb.Write(tsPart)
	for sb.Len() < 25 {
		n, _ := rand.Int(rand.Reader, big.NewInt(36))
		sb.WriteByte(base36[n.Int64()])
	}
	return sb.String()
}

// NewSessionToken gera token de sessão igual ao Fastify: 32 bytes em base64url.
func NewSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// NewCode gera código numérico de 6 dígitos (100000-999999).
func NewCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%d", 100000+n.Int64()), nil
}

// FingerprintDevice replica o fingerprint legado: SHA256(ua|ip) hex (64 chars).
func FingerprintDevice(userAgent, ip string) string {
	if userAgent == "" {
		userAgent = "unknown"
	}
	if ip == "" {
		ip = "unknown"
	}
	sum := sha256.Sum256([]byte(userAgent + "|" + ip))
	return fmt.Sprintf("%x", sum)
}

// ResolveFingerprint aplica a regra P1-6: deviceId opt-in vira "did:<id>".
func ResolveFingerprint(deviceID, userAgent, ip string) string {
	id := strings.TrimSpace(deviceID)
	if id != "" {
		if len(id) > 128 {
			id = id[:128]
		}
		return "did:" + id
	}
	return FingerprintDevice(userAgent, ip)
}

// DeviceDisplayName replica a regra do Fastify (browser + SO + IP).
func DeviceDisplayName(userAgent, ip string) string {
	ua := userAgent
	os := "Dispositivo"
	switch {
	case matchFold(ua, "windows"):
		os = "Windows"
	case matchFold(ua, "macintosh") || matchFold(ua, "mac os"):
		os = "macOS"
	case matchFold(ua, "android"):
		os = "Android"
	case matchFold(ua, "iphone") || matchFold(ua, "ipad"):
		os = "iOS"
	case matchFold(ua, "linux"):
		os = "Linux"
	}
	browser := "Navegador"
	switch {
	case matchFold(ua, "edg"):
		browser = "Edge"
	case matchFold(ua, "chrome"):
		browser = "Chrome"
	case matchFold(ua, "firefox"):
		browser = "Firefox"
	case matchFold(ua, "safari"):
		browser = "Safari"
	}
	name := browser + " em " + os
	if ip != "" {
		name += " · " + ip
	}
	return name
}

func matchFold(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), sub)
}

// ResolveIP aplica a regra P1-5: IP do body só vale se válido.
func ResolveIP(forwarded, requestIP string) string {
	if forwarded != "" && net.ParseIP(forwarded) != nil {
		return forwarded
	}
	return requestIP
}

// RandBytes preenche b com bytes criptográficos.
func RandBytes(b []byte) (int, error) {
	return rand.Read(b)
}
func RequestIP(remoteAddr, xff, xri string) string {
	if xff != "" {
		if idx := strings.Index(xff, ","); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}
