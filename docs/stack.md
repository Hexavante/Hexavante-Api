# Stack técnica — Hexavante API

Documento de referência da arquitetura **implementada** no repositório.

---

## Visão geral

| Camada | Tecnologia | Versão (referência) |
|--------|------------|---------------------|
| Runtime/linguagem | Node.js + TypeScript strict | 22 / 6.x |
| Framework | Fastify | 5.x (`trustProxy: true`) |
| ORM/Banco | Prisma + MySQL (MariaDB) | 6.x (`db push` no boot) |
| Cache/rate-limit | Redis | 7.x |
| Autenticação | Sessão própria + OAuth Google/GitHub | Cookie 7 dias, domínio `.hexavante.com.br` |
| Validação | Zod | `validateBody/Query/Params` (remove chaves desconhecidas!) |
| E-mail | Resend (`src/lib/email.ts`) | `RESEND_API_KEY`, `RESEND_FROM` |
| Logs | Pino | JSON por request |
| Docs | Swagger UI | `/docs` fora de produção |
| Testes | Vitest | Por módulo (`__tests__/`, mocks de prisma/sessão) |

---

## Arquitetura em camadas

```
┌─────────────────────────────────────────┐
│  Nginx :443 → Fastify :3045             │
│  ┌────────────┐  ┌──────────────────┐   │
│  │ middlewares │  │ plugins (cors,   │   │
│  │ auth/rate   │  │ helmet, cookie)  │   │
│  └────────────┘  └──────────────────┘   │
│  ┌────────────┐  ┌──────────────────┐   │
│  │ routes →   │  │ controller →     │   │
│  │ controller │  │ service → repo   │   │
│  └────────────┘  └──────────────────┘   │
└────────────────────────────┬────────────┘
                             │
┌────────────────────────────▼────────────┐
│   Prisma Client → MySQL │ Redis │ Resend │
└─────────────────────────────────────────┘
```

### Responsabilidades por pasta

| Pasta | Responsabilidade |
|-------|------------------|
| `src/server.ts` | Fastify, `trustProxy`, registro de rotas |
| `src/config/` | Prisma, Redis, logger |
| `src/lib/` | Sessão, e-mail, erros, validação, serializers |
| `src/middlewares/` | `authenticate`, `optionalAuth`, `authorize` |
| `src/modules/*/` | Domínio em `routes/controller/service/repository/schemas/types` |
