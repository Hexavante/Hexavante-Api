# Stack (API)

| Camada | Tecnologia | Versão/Notas |
|---|---|---|
| Runtime/linguagem | Node.js 22 + TypeScript strict | `tsc` no build |
| Framework | Fastify 5 | `trustProxy: true`, plugins próprios |
| ORM/Banco | Prisma 6 + MySQL/MariaDB | `db push` no boot do container |
| Cache/rate-limit | Redis 7 + `rate-limit.ts` | Sessões e janelas por IP |
| Auth | Sessão própria + OAuth Google/GitHub | Cookie 7 dias, domínio `.hexavante.com.br` |
| Validação | Zod | `validateBody/Query/Params` (remove chaves desconhecidas!) |
| E-mail | Resend (`src/lib/email.ts`) | `RESEND_API_KEY`, `RESEND_FROM` |
| Logs | Pino | JSON por request |
| Docs | Swagger UI | `/docs` fora de produção |
| Testes | Vitest | Por módulo (`__tests__/`, mocks de prisma/sessão) |
