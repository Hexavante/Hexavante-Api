# Sprint 4 — Engajamento (API)

## Gamificação (`/api/v1/rankings`, `/api/v1/achievements`, `/api/v1/users/me/xp-profile`)

- Leaderboard público paginado; **fallback all-time** (XP total) quando não há temporada ativa ou ela está vazia — igual ao app.
- `/rankings/me`, conquistas (lista pública fixa + `achievements` do usuário), histórico de XP.

## Loja (`/api/v1/shop`, `/api/v1/inventory`)

- Estado da loja, compra, equipar e inventário (tudo autenticado). Cosméticos por categoria/raridade.

## Instrutores, salas e moderação

- `POST /api/v1/instructor/apply` + `GET /status`, `GET /instructor/courses`.
- Live rooms: `GET /api/v1/live-rooms` (pública), CRUD e join/leave/start/end, mensagens (autenticado).
- Moderação (`/api/v1/moderation/*`): ações auditadas em `moderation_logs`.

## Notificações e conversas

- `/api/v1/notifications/*` (lista, lida, preferências) e `/api/v1/conversations/*` (DMs).
