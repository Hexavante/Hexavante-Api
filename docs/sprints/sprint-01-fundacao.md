# Sprint 1 — Fundação (API)

## Stack

Fastify 5 + TypeScript strict + Prisma 6 (MySQL/MariaDB) + Redis 7 + Zod + Pino + Vitest. Porta 3045 (`api.hexavante.com.br`, container `hexavante-api`).

## Estrutura por módulo (`src/modules/<dominio>/`)

```
routes/       # Registro Fastify (paths, preHandlers)
controller/   # HTTP: valida (validateBody/Query/Params) e delega
service/      # Regra de negócio
repository/   # Acesso Prisma
schemas/      # Zod (query/body/params)
types/        # DTOs e interfaces
```

Suporte em `src/`: `config/` (prisma, redis, logger), `lib/` (`session`, `email` via Resend, `errors/AppError`, `validation`, `serializers`), `middlewares/` (`authenticate`, `optionalAuth`, `authorize`), `plugins/` (cors, helmet, rate-limit, compress, cookie, swagger).

## Setup

```bash
npm install
cp .env.example .env   # DATABASE_URL, AUTH_SECRET, REDIS_URL, RESEND_API_KEY, OAuth...
npx prisma generate
npm run dev            # :3045 (docs em /docs fora de produção)
```

## Convenções

- Erros via `AppError`/`NotFoundError`/`BadRequestError` + `asyncHandler`; nunca `throw` cru no controller.
- Listas públicas: `{ data, pagination }` (`buildPagination`).
- E-mails: `src/lib/email.ts`; nunca logar códigos, só "enviado/falhou".
- Testes Vitest por módulo; mocks de `prisma`/`session`/`password` nos testes de auth.
