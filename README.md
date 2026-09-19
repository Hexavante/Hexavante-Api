<div align="center">
  <h1>Hexavante API</h1>
  <p>Backend oficial da plataforma educacional Hexavante</p>
  <p>
    <img alt="Status" src="https://img.shields.io/badge/status-produção-green">
    <img alt="Node" src="https://img.shields.io/badge/node-22.x-green">
    <img alt="Fastify" src="https://img.shields.io/badge/fastify-5-black">
    <img alt="Prisma" src="https://img.shields.io/badge/prisma-6-2D3748">
  </p>
  <p>
    <a href="#português">🇧🇷 Português</a> · <a href="#english">🇺🇸 English</a> · <a href="docs/visao-geral.md">Docs</a>
  </p>
</div>

---

<a id="português"></a>

## Português

### Índice

- [Sobre](#sobre)
- [Arquitetura](#arquitetura)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Endpoints principais](#endpoints-principais)
- [Setup](#setup)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Banco de dados](#banco-de-dados)
- [Deploy](#deploy)
- [Solução de problemas](#solução-de-problemas)
- [Como contribuir](#como-contribuir)

### Sobre

API REST em `api.hexavante.com.br` (porta 3045, container `hexavante-api`). Dona da autenticação, das regras de negócio e do schema de referência do banco compartilhado. Serve web, landing, desktop e mobile.

### Arquitetura

```
Clientes ──HTTPS──▶ Nginx ──▶ hexavante-api:3045 (Fastify)
                              │  ├─ middlewares (auth, rate-limit, cors)
                              │  ├─ modules/* (routes→controller→service→repository)
                              │  ├─ MySQL (Prisma) + Redis (cache/sessão/rate-limit)
                              │  └─ Resend (e-mails) + Swagger (/docs fora de produção)
```

### Estrutura de pastas

```
src/
├── server.ts                 # Fastify + trustProxy + registro de rotas
├── config/                   # prisma, redis, logger
├── lib/                      # session, email, errors, validation, serializers
├── middlewares/              # authenticate, optionalAuth, authorize
└── modules/
    ├── auth/                 # login (202 p/ verificação), register, OAuth, logout, session
    ├── security/             # dispositivos, 2FA, presença, heartbeat, códigos
    ├── users/                # perfil público (com presença), /me
    ├── courses/              # catálogo, detalhe, matrícula, progresso, aulas
    ├── exams/                # lista, detalhe, histórico, stats
    ├── tutorials/            # lista/detalhe públicos (SQL read-only)
    ├── platform/             # stats públicos (cache 60s)
    ├── certificates/         # emissão, listagem, verificação
    ├── gamification/         # ranking (fallback all-time), XP, conquistas
    ├── shop/                 # loja, inventário, compras
    ├── instructor/           # candidatura, categorias, meus cursos
    ├── live-rooms/           # salas, join/leave, mensagens
    ├── moderation/           # ações auditadas
    ├── notifications/        # notificações e preferências
    └── conversations/        # mensagens diretas
prisma/schema.prisma          # Espelho exato do banco (ver docs/der-logico.md)
```

### Endpoints principais

| Método/rota | Auth | O quê |
|---|---|---|
| `POST /api/v1/auth/register` | — | Cadastro (valida 13+, unicidade) |
| `POST /api/v1/auth/login` | — | Sessão ou `202 {requiresVerification, reason}` |
| `POST /api/v1/auth/verify-device` | — | Confirma código → sessão + confia + verifica e-mail |
| `GET /api/v1/auth/session` | Cookie | Sessão atual |
| `GET /api/v1/courses`, `/exams`, `/tutorials` | Opcional | Listas públicas paginadas |
| `GET /api/v1/platform/stats` | — | Stats com cache |
| `GET /api/v1/rankings`, `/achievements` | Opcional | Leaderboard e conquistas |
| `GET /api/v1/certificates/verify/:code` | — | Verificação pública |

**Atenção ao 202**: `Response.ok` é `true` para 202 — clientes devem checar `status === 202` antes de `!res.ok`.

### Setup

```bash
npm install
cp .env.example .env
npx prisma generate
npm run dev            # :3045
```

### Variáveis de ambiente

| Variável | Para que |
|---|---|
| `DATABASE_URL` | MySQL (`mysql://...`, `%2F` na senha) |
| `AUTH_SECRET` | Assinatura de sessão/cookies |
| `REDIS_URL` / `REDIS_PASSWORD` | Cache e rate-limit |
| `BETTER_AUTH_URL` / `AUTH_URL` | URL pública da API |
| `CORS_ORIGIN` | Origens permitidas (web, landing, app) |
| `GOOGLE_/GITHUB_CLIENT_*` | OAuth |
| `RESEND_API_KEY` / `RESEND_FROM` | E-mails transacionais |
| `PORT` / `HOST` | `3045` / `0.0.0.0` |

### Scripts

| Comando | Para que |
|---|---|
| `npm run dev` | Reload (`tsx watch`) |
| `npm run build` / `npm start` | Produção |
| `npx tsc --noEmit` | Tipos (**obrigatório**) |
| `npm test -- src/modules/<m>` | Vitest do módulo |
| `npx prisma db push` | Aplica schema (**nunca** `--accept-data-loss`) |
| `npm run seed` | Dados iniciais |

### Banco de dados

Schema = espelho exato da produção (`migrate diff` vazio). Mudança de model/campo/enum/índice: editar **os dois** schemas (API + web), validar, gerar, typecheck, testar. Ver `docs/der-logico.md`.

### Deploy

```bash
git pull                       # em /opt/hexavante-api
docker build --no-cache -t hexavante-api .
docker stop hexavante-api && docker rm hexavante-api
docker run -d --name hexavante-api --network hexavante_default -p 3045:3045 \
  -e DATABASE_URL='...' -e AUTH_SECRET='...' -e REDIS_URL='...' \
  -e AUTH_URL='https://api.hexavante.com.br' -e CORS_ORIGIN='...' \
  -e RESEND_API_KEY='...' -e RESEND_FROM='...' \
  --restart unless-stopped hexavante-api
```

Verificação: `curl /` e `/api/v1/platform/stats` + `docker logs` (DB/Redis conectados, sem `error`).

### Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| `db push` quer derrubar tabela | Schema divergente do banco | Alinhar models/enums/índices, nunca `--accept-data-loss` |
| Login sempre 401 | `passwordHash` nulo (conta OAuth) ou senha errada | Conferir `provider`/`passwordHash` |
| Código nunca chega | Resend sem chave ou domínio não verificado | Ver `RESEND_*` + logs `[email]` |
| 202 tratado como sucesso | `Response.ok` true para 202 | Checar `status === 202` primeiro |
| Sessão inválida | `trustProxy` desligado atrás do nginx | Manter `trustProxy: true` no `server.ts` |

### Como contribuir

1. Branch de `main`, commits curtos em português.
2. Novo endpoint: rota + controller + service + repository + schema Zod + teste.
3. `tsc` + testes do módulo verdes; nunca commitar segredos.

### Documentação técnica (`docs/`)

`visao-geral`, `requisitos-funcionais`, `regras-de-negocio`, `casos-de-uso`, `der-conceitual`, `der-logico`, `glossario`, `stack`, `permissoes`, `instalacao-e-desenvolvimento`, `deploy-producao`, `escopo-mvp` (+ `auth-flow` existente).

---

<a id="english"></a>

## English (summary)

Official Hexavante backend: Fastify 5, TypeScript, Prisma/MySQL, Redis, Zod, Pino, Vitest. Owns auth, business rules and the reference DB schema; serves all clients on `:3045`. Typecheck, test per module, never destructive `db push`. See `docs/` (in Portuguese) for full technical documentation.
