# Casos de Uso (API)

## UC-01 — Login com dispositivo novo

1. `POST /auth/login` (e-mail/senha) → credenciais OK, aparelho desconhecido.
2. API cria código, envia e-mail, responde `202 { requiresVerification, verificationId, reason: DEVICE }` (sem sessão).
3. Cliente coleta o código → `POST /auth/verify-device` → `200 { user, session }` + confia no aparelho + marca e-mail verificado.

## UC-02 — Cadastro com confirmação

1. `POST /auth/register` (201, conta inativa) → cliente faz login → `202 reason: EMAIL_VERIFY`.
2. Mesmo fluxo de código do UC-01; ao confirmar, a conta ativa.

## UC-03 — Ativar 2FA

1. `POST /users/me/2fa/enable` → código por e-mail.
2. `POST /users/me/2fa/confirm` → `twoFactorEnabled=true`. Próximos logins sempre pedem código.

## UC-04 — Ver certificado público

`GET /certificates/verify/:code` → dados do certificado ou 404. Sem auth.

## UC-05 — Ranking da home pública

`GET /rankings?limit=8` → top com nível, XP e liga; vazio só se não houver XP distribuído.

## UC-06 — Revogar dispositivo

`DELETE /users/me/devices/:id` → marca revogado + derruba sessões do aparelho; se for o atual, o cliente desloga.
