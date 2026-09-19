# Casos de uso — Hexavante API

Documento de referência dos fluxos **implementados**, com rotas reais.

---

## UC-01 — Login com aparelho novo

1. `POST /api/v1/auth/login` (e-mail/senha) → credenciais OK, aparelho desconhecido.
2. API cria código, envia e-mail e responde `202 { requiresVerification, verificationId, reason: DEVICE }` (sem sessão).
3. Cliente coleta o código → `POST /api/v1/auth/verify-device` → `200 { user, session }` + confia no aparelho + marca e-mail verificado.

## UC-02 — Cadastro com confirmação

1. `POST /api/v1/auth/register` (201, conta inativa) → cliente faz login → `202 reason: EMAIL_VERIFY`.
2. Mesmo fluxo de código do UC-01; ao confirmar, a conta ativa.

## UC-03 — Ativar 2FA

1. `POST /api/v1/users/me/2fa/enable` → código por e-mail.
2. `POST /api/v1/users/me/2fa/confirm` → `twoFactorEnabled=true`. Próximos logins sempre pedem código.

## UC-04 — Ver certificado público

`GET /api/v1/certificates/verify/:code` → dados do certificado ou 404. Sem auth.

## UC-05 — Ranking da home pública

`GET /api/v1/rankings?limit=8` → top com nível, XP e liga; vazio só se não houver XP distribuído.

## UC-06 — Revogar aparelho

`DELETE /api/v1/users/me/devices/:id` → marca revogado + derruba sessões do aparelho; se for o atual, o cliente desloga.
