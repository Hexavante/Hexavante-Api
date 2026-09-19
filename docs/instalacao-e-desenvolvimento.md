# Instalação e Desenvolvimento (API)

## Pré-requisitos

Node.js 22+, MySQL 8+/MariaDB 11+, Redis 7+.

## Passo a passo

```bash
git clone https://github.com/Hexavante/Hexavante-Api.git
cd Hexavante-Api
npm install
cp .env.example .env
# DATABASE_URL=mysql://hexavante:senha@localhost:3306/hexavante
# AUTH_SECRET=segredo-forte | REDIS_URL=redis://localhost:6379
# RESEND_API_KEY=... (e-mails; sem ela, só log)
npx prisma generate
npm run dev
```

## Novo endpoint (checklist)

1. Rota em `modules/<dominio>/routes/` (path, `preHandler`, `asyncHandler`).
2. Controller fino + service com regra + repository com Prisma.
3. Schema Zod (lembrete: chaves fora do schema são **removidas** do body).
4. Teste Vitest do service/caminho feliz + erro.
5. `npx tsc --noEmit` verde.

## Comandos úteis

`npm run build` · `npm start` · `npm test -- src/modules/<m>` · `npx prisma studio` · `npx prisma db push` (dev, sem `--accept-data-loss`).
