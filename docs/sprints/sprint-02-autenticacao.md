# Sprint 2 — Autenticação e Segurança (API)

## Sessão

Cookie `__Secure-hexavante.session_token` (7 dias, `httpOnly`, `secure`, `lax`, domínio `.hexavante.com.br`). `POST /api/v1/auth/login` cria via `createSession(userId, ip, userAgent)`; `GET /api/v1/auth/session` valida; `POST /logout` encerra. `trustProxy: true` (nginx) para IP real.

## Login com verificação (202)

`signIn` retorna `{ requiresVerification, verificationId, reason }` (HTTP 202) quando: e-mail não confirmado (`EMAIL_VERIFY`), dispositivo desconhecido (`DEVICE`) ou 2FA ativo (`TWO_FACTOR`). **Clientes: `Response.ok` é `true` para 202 — checar `status === 202` antes de `!res.ok`.**

## Dispositivos e 2FA (`src/modules/security/`)

- Fingerprint `sha256(UA|IP)`; `TrustedDevice` (revogável, derruba sessões do aparelho).
- Códigos de 6 dígitos (`DeviceVerificationCode`): 10 min, 5 tentativas, reenvio com cooldown 60s, **coexistem até expirar**.
- `POST /auth/verify-device` → confia no aparelho, marca `emailVerified`, cria sessão. `POST /auth/resend-device-code`.
- 2FA opcional: `POST /users/me/2fa/enable` → confirma com código → `DELETE /users/me/2fa` desliga.
- OAuth (`/auth/oauth/*`) confia no dispositivo (auth forte) e marca e-mail verificado.

## Presença e dispositivos do usuário

- `PATCH /users/me/presence` (`ONLINE/AWAY/STUDYING/DND/INVISIBLE`), `POST /users/me/heartbeat`; offline após 5 min sem sinal (`effectivePresence`).
- `GET/DELETE /users/me/devices` — lista e revoga aparelhos.
