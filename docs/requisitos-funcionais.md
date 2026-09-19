# Requisitos funcionais — Hexavante API

Documento de referência do comportamento **implementado** nos módulos.

---

## Autenticação e segurança

| ID | Requisito | Rota |
|----|-----------|------|
| RF-01 | Cadastro com e-mail/usuário únicos, senha ≥ 8, idade 13+ | `POST /auth/register` |
| RF-02 | Login com sessão de 7 dias em cookie `httpOnly` | `POST /auth/login` |
| RF-03 | Verificação por código de 6 dígitos (e-mail novo, aparelho novo, 2FA): 10 min, 5 tentativas, reenvio 60s, códigos coexistem | `POST /auth/verify-device`, `POST /auth/resend-device-code` |
| RF-04 | 2FA opcional (ativar com confirmação, desligar autenticado) | `POST /users/me/2fa/enable`, `/confirm`, `DELETE /users/me/2fa` |
| RF-05 | Aparelhos listáveis e revogáveis (revogar derruba as sessões) | `GET/DELETE /users/me/devices` |
| RF-06 | OAuth Google/GitHub com auto-confiança de aparelho e e-mail verificado | `/auth/oauth/*` |
| RF-07 | Presença (`ONLINE/AWAY/STUDYING/DND/INVISIBLE`) + heartbeat; offline após 5 min | `PATCH /users/me/presence`, `POST /users/me/heartbeat` |

## Conteúdo

| ID | Requisito | Rota |
|----|-----------|------|
| RF-08 | Catálogo público paginado (só publicados) | `GET /courses`, `/exams`, `/tutorials` |
| RF-09 | Matrícula, progresso, favoritos e notas (autenticado) | `/courses/:id/*` |
| RF-10 | Histórico, stats e evolução de simulados | `/exams/history`, `/stats`, `/evolution` |
| RF-11 | Certificados: emissão (100% do curso), listagem, verificação pública | `/certificates*` |
| RF-12 | Stats públicos da plataforma com cache de 60s | `GET /platform/stats` |

## Engajamento e moderação

| ID | Requisito | Rota |
|----|-----------|------|
| RF-13 | Ranking por temporada com fallback all-time; conquistas | `GET /rankings`, `/achievements` |
| RF-14 | Loja, inventário, compra e equipamento | `/shop/*`, `/inventory` |
| RF-15 | Candidatura a instrutor, categorias, salas ao vivo, notificações, conversas | módulos próprios |
| RF-16 | Moderação auditada + rate-limit global e por rota | `/moderation/*` |
