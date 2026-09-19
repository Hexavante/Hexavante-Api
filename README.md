<div align="center">
  <h1>Hexavante API</h1>
  <p>Backend oficial da plataforma educacional Hexavante</p>
  <p>
    <img alt="Status" src="https://img.shields.io/badge/status-produção-green">
    <img alt="Node" src="https://img.shields.io/badge/node-22.x-green">
    <img alt="Fastify" src="https://img.shields.io/badge/fastify-5-black">
  </p>
</div>

---

## Português

API REST em `api.hexavante.com.br` (porta 3045, container `hexavante-api`). Dona da autenticação, regras de negócio e do schema de referência do banco compartilhado (`hexavante`).

### Estrutura

```
src/
├── server.ts                 # Fastify + trustProxy + registro de rotas
├── config/                   # prisma, redis, logger
├── lib/                      # session, email (Resend), erros, validação, serializers
├── middlewares/              # authenticate, optionalAuth, authorize
└── modules/
    ├── auth/                 # login (202 p/ verificação), register, OAuth, logout, session
    ├── security/             # dispositivos confiáveis, 2FA, presença, heartbeat, códigos
    ├── users/                # perfil público (com presença), /me
    ├── courses/              # catálogo publicado, detalhe, matrícula, progresso
    ├── exams/                # lista pública, detalhe, histórico, stats
    ├── tutorials/            # lista/detalhe públicos (leitura via SQL, sem migration)
    ├── platform/             # stats públicos com cache de 60s
    ├── certificates/         # emissão, listagem, verificação por código
    ├── gamification/         # ranking (com fallback all-time), XP, conquistas
    ├── shop/                 # loja, inventário, compras (autenticado)
    ├── instructor/           # candidatura, categorias
    ├── live-rooms/           # salas ao vivo
    ├── moderation/           # ações de moderação
    ├── notifications/        # notificações
    └── conversations/        # mensagens
prisma/
└── schema.prisma             # Espelha o schema do web + models próprios (devices, códigos)
```

### Regras de banco (importante)

- O entrypoint roda `prisma db push` no boot — o schema precisa espelhar o banco exato.
- **Nunca** `--accept-data-loss`, nunca `DROP`. Drift? `prisma migrate diff --from-url ... --to-schema-datamodel ...` (leitura).
- Qualquer mudança de model/campo/enum/índice deve ser espelhada em `Hexavante/prisma/schema.prisma`.

### Setup

```bash
npm install
cp .env.example .env   # DATABASE_URL, AUTH_SECRET, REDIS_URL, RESEND_API_KEY...
npx prisma generate
npm run dev            # http://localhost:3045 (docs em /docs fora de produção)
```

### Scripts

| Comando | Para que |
|---|---|
| `npm run dev` | Desenvolvimento com reload (`tsx watch`) |
| `npm run build` | Compila (`tsc`) |
| `npm start` | Produção (`node dist/server.js`) |
| `npx tsc --noEmit` | Verificação de tipos (obrigatória) |
| `npm test -- src/modules/<modulo>` | Testes Vitest do módulo |
| `npx prisma db push` | Aplica schema (cuidado: sem `--accept-data-loss`) |

### Auth (resumo)

Sessão em cookie `__Secure-hexavante.session_token` (7 dias, domínio `.hexavante.com.br`). Login com senha pode responder `202 { requiresVerification, verificationId, reason }` (`EMAIL_VERIFY` | `DEVICE` | `TWO_FACTOR`); o cliente confirma o código em `POST /api/v1/auth/verify-device`. OAuth confia no dispositivo. 2FA opcional por usuário (`/users/me/2fa/*`). Presença via `PATCH /users/me/presence` + `POST /users/me/heartbeat` (offline após 5 min).

### Deploy

Container `hexavante-api` na VPS (`/opt/hexavante-api`): `git pull` → `docker build --no-cache -t hexavante-api .` → `stop/rm/run` com envs inline (inclui `RESEND_API_KEY`). Verificação: `curl` nos endpoints + `docker logs`.

### Documentação técnica

Guias por sprint em [`docs/sprints/`](docs/sprints/) (fundação → auth → módulos → operações).

---

## English (summary)

Official Hexavante backend (Fastify 5, TypeScript, Prisma + MySQL, Redis, Zod, Pino, Vitest). Owns auth, business rules and the reference DB schema; serves web, landing, desktop and mobile. Typecheck with `npx tsc --noEmit`, test per module, deploys to the VPS (`hexavante-api` container). See `docs/sprints/` for technical guides (in Portuguese).
