# Sprint 5 — Banco e Deploy (API)

## Schema e paridade

- `prisma/schema.prisma` é o **espelho exato** do banco de produção (validação: `migrate diff` vazio).
- Cobertura idêntica ao `Hexavante/prisma/schema.prisma` (models, campos, enums, índices, maps, PKs — ex. PK composta de `tutorial_tags`).
- Entrypoint roda `prisma db push` no boot: **nunca** `--accept-data-loss`, nunca `DROP`. Divergência = push recusa e loga aviso (não derruba nada).

## Fluxo de mudança no banco

1. Editar os **dois** schemas juntos.
2. `prisma validate` + `generate` nos dois repos; `tsc --noEmit` + testes.
3. `migrate diff --from-url <prod> --to-schema-datamodel` precisa sair vazio (`-- This is an empty migration`); qualquer SQL exige revisão explícita.

## Seeds e úteis

- `npm run seed` / `seed:full`, `npx prisma studio`.

## Deploy

1. `git pull` em `/opt/hexavante-api`
2. `docker build --no-cache -t hexavante-api .`
3. `stop/rm/run` com envs inline (`DATABASE_URL` com `%2F`, `AUTH_SECRET`, `REDIS_URL`, `AUTH_URL`, `CORS_ORIGIN`, OAuth, `RESEND_API_KEY`, `RESEND_FROM`)
4. Verificar: `curl` (`/`, `/api/v1/platform/stats`, login 202 de teste) + `docker logs` (DB/Redis conectados, sem `error`).

## Antes do "pronto"

`tsc` + testes do módulo + `migrate diff` vazio + runtime verificado.
