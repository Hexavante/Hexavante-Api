package mail

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"
)

var client = &http.Client{Timeout: 15 * time.Second}

func fromAddr() string {
	if v := os.Getenv("RESEND_FROM"); v != "" {
		return v
	}
	return "Hexavante <seguranca@hexavante.com.br>"
}

// Send envia e-mail via Resend. Sem RESEND_API_KEY, apenas registra (dev),
// igual ao comportamento do Fastify sem chave.
func Send(to, subject, html, text, label string) error {
	key := os.Getenv("RESEND_API_KEY")
	if key == "" {
		slog.Info("[mail:dev] e-mail não enviado (sem RESEND_API_KEY)", "to", to, "label", label)
		return nil
	}
	payload := map[string]interface{}{
		"from":    fromAddr(),
		"to":      []string{to},
		"subject": subject,
		"html":    html,
		"text":    text,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		slog.Info("[mail] enviado", "to", to, "label", label)
		return nil
	}
	slog.Error("[mail] falha no envio", "to", to, "label", label, "status", resp.Status)
	return nil
}

func DeviceCodeHTML(code, device string) string {
	return "<p>Um acesso à sua conta Hexavante foi feito de " + device +
		".<br>Código: <strong>" + code + "</strong> (expira em 10 minutos).</p>"
}

func EmailVerifyHTML(code string) string {
	return "<p>Confirme seu e-mail na Hexavante com o código: <strong>" + code + "</strong> (expira em 10 minutos).</p>"
}

func TwoFactorHTML(code string) string {
	return "<p>Seu código de verificação Hexavante: <strong>" + code + "</strong> (expira em 10 minutos).</p>"
}

// SendVerificationCode escolhe assunto/template por propósito (DEVICE,
// EMAIL_VERIFY, PASSWORD_RESET, TWO_FACTOR), igual ao Fastify.
func SendVerificationCode(to, code, purpose, device string) {
	var subject, html, text string
	switch purpose {
	case "EMAIL_VERIFY":
		subject = "Confirme seu e-mail — Hexavante"
		html = EmailVerifyHTML(code)
		text = "Confirme seu e-mail na Hexavante com o código: " + code + " (expira em 10 minutos)"
	case "PASSWORD_RESET":
		subject = "Redefinir senha — Hexavante"
		html = EmailVerifyHTML(code)
		text = "Use este código para redefinir sua senha na Hexavante: " + code + " (expira em 10 minutos). Se não foi você, ignore este e-mail."
	case "TWO_FACTOR", "TWO_FACTOR_LOGIN":
		subject = "Seu código de verificação — Hexavante"
		html = TwoFactorHTML(code)
		text = "Seu código de verificação Hexavante: " + code + " (expira em 10 minutos)"
	default:
		subject = "Novo dispositivo detectado — Hexavante"
		if device == "" {
			device = "um novo dispositivo"
		}
		html = DeviceCodeHTML(code, device)
		text = "Um acesso à sua conta Hexavante foi feito de " + device + ". Código: " + code + " (expira em 10 minutos)"
	}
	_ = Send(to, subject, html, text, "verify:"+purpose)
}
