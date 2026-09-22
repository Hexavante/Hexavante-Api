<div align="center">
  <h1>Hexavante API</h1>
  <p><strong>Backend oficial da plataforma educacional Hexavante</strong></p>
  <p>
    <img alt="Status" src="https://img.shields.io/badge/status-produção-green">
    <img alt="Node" src="https://img.shields.io/badge/node-22.x-green">
    <img alt="Fastify" src="https://img.shields.io/badge/fastify-5-black">
    <img alt="Prisma" src="https://img.shields.io/badge/prisma-6-2D3748">
  </p>
  <p>
    <a href="https://api.hexavante.com.br/docs">📚 Swagger</a> <em>(protegido — credenciais swagger)</em> · <a href="https://api.hexavante.com.br/api/v1/platform/stats">📊 Stats públicos</a>
  </p>
  <p>
    <a href="#português">🇧🇷 Português</a> · <a href="#english">🇺🇸 English</a> · <a href="docs/visao-geral.md">📖 Docs</a>
  </p>
  <p>
    ⚡ <a href="#endpoints-principais">Endpoints</a> · 🚀 <a href="#setup">Setup</a> · 🗄️ <a href="#banco-de-dados">Banco</a> · 🚢 <a href="#deploy">Deploy</a> · 📖 <a href="docs/visao-geral.md">Docs</a>
  </p>
</div>

---

<a id="português"></a>

## Português

### Índice

- [Sobre](#sobre)
- [Quem consome](#quem-consome)
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
- [Documentação técnica](#documentação-técnica)

### Sobre

API REST em `api.hexavante.com.br` (porta 3045, container `hexavante-api`). Dona da autenticação, das regras de negócio e do schema de referência do banco compartilhado. Serve web, landing, desktop e mobile.

### Quem consome

| Cliente | Repositório | O que consome |
|---|---|---|
| 🌐 Web (`app.hexavante.com.br`) | [Hexavante-web](https://github.com/Hexavante/Hexavante-web) | Sessão/auth, catálogo, matrículas, gamificação |
| 🏠 Landing (`hexavante.com.br`) | [Hexavante-landing](https://github.com/Hexavante/Hexavante-landing) | API pública: stats, catálogo |
| 🛡️ Admin (`painel.hexavante.com.br`) | [Hexavante-admin](https://github.com/Hexavante/Hexavante-admin) | Moderação e ações auditadas |
| 🖥️ Desktop (Electron) | [Hexavante-Desktop](https://github.com/Hexavante/Hexavante-Desktop) | Sessão/auth, cursos, provas, progresso |
| 📱 Mobile (Expo) | [Hexavante-Mobile](https://github.com/Hexavante/Hexavante-Mobile) | Sessão/auth, cursos, provas, progresso |

> [!IMPORTANT]
> **Atenção ao 202**: `Response.ok` é `true` para 202 — clientes devem checar `status === 202` antes de `!res.ok`.

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

> 🔎 Lista completa e interativa no [Swagger](https://api.hexavante.com.br/docs) *(protegido — credenciais swagger)*. Ping público: [`GET /api/v1/platform/stats`](https://api.hexavante.com.br/api/v1/platform/stats).

#### 🔐 Auth

| Método/rota | Auth | O quê |
|---|---|---|
| `POST /api/v1/auth/register` | — | Cadastro (valida 13+, unicidade) |
| `POST /api/v1/auth/login` | — | Sessão ou `202 {requiresVerification, reason}` |
| `POST /api/v1/auth/verify-device` | — | Confirma código → sessão + confia + verifica e-mail |
| `GET /api/v1/auth/session` | Cookie | Sessão atual |

#### 📚 Cursos, Provas e Tutoriais

| Método/rota | Auth | O quê |
|---|---|---|
| `GET /api/v1/courses` | Opcional | Catálogo público paginado |
| `GET /api/v1/exams` | Opcional | Provas/simulados públicos paginados |
| `GET /api/v1/tutorials` | Opcional | Tutoriais públicos paginados (SQL read-only) |

#### 🏆 Gamificação

| Método/rota | Auth | O quê |
|---|---|---|
| `GET /api/v1/rankings` | Opcional | Leaderboard (fallback all-time) |
| `GET /api/v1/achievements` | Opcional | Conquistas e XP |

#### 🛒 Loja

| Método/rota | Auth | O quê |
|---|---|---|
| Módulo `shop/` — ver Swagger | Cookie | Loja, inventário e compras |

#### 🎓 Certificados

| Método/rota | Auth | O quê |
|---|---|---|
| `GET /api/v1/certificates/verify/:code` | — | Verificação pública |
| Módulo `certificates/` — ver Swagger | Cookie | Emissão e listagem |

#### 💬 Social

| Método/rota | Auth | O quê |
|---|---|---|
| Módulos `conversations/` + `live-rooms/` + `notifications/` — ver Swagger | Cookie | Mensagens diretas, salas (join/leave) e notificações |

#### 📊 Plataforma

| Método/rota | Auth | O quê |
|---|---|---|
| `GET /api/v1/platform/stats` | — | Stats com cache (60s) |

> [!IMPORTANT]
> **Atenção ao 202**: `Response.ok` é `true` para 202 — clientes devem checar `status === 202` antes de `!res.ok`.

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
