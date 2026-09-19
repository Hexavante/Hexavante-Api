# Hexavante API — visão geral

Documento de referência da arquitetura **implementada** no repositório.

---

## Descrição

A Hexavante API é o backend oficial da plataforma: autenticação, regras de negócio e dados para web, landing, desktop e mobile, servido em `https://api.hexavante.com.br` (porta interna 3045).

**Stack atual:** Fastify 5, TypeScript, Prisma, MySQL/MariaDB, Redis, Zod, Pino, Vitest. Ver [stack.md](stack.md) e [instalacao-e-desenvolvimento.md](instalacao-e-desenvolvimento.md).

---

## Responsabilidades

| Área | O que a API faz |
|------|-----------------|
| **Autenticação** | Cadastro, login (com verificação 202), OAuth Google/GitHub, sessão em cookie, logout |
| **Segurança** | Dispositivos confiáveis, 2FA por e-mail, presença/heartbeat, códigos com tentativas |
| **Conteúdo** | Catálogo publicado (cursos, simulados, tutoriais), stats com cache |
| **Estudo** | Matrícula, progresso de aulas, favoritos, notas, tentativas de simulado |
| **Gamificação** | Ranking (com fallback all-time), XP, conquistas, loja e inventário |
| **Social/tempo real** | Salas ao vivo, notificações, conversas, perfis públicos |
| **Moderação** | Ações auditadas em `moderation_logs`, rate-limit |

---

## Contratos

| Tema | Padrão |
|------|--------|
| Listas | `{ data, pagination }` (`buildPagination`) |
| Erros | `{ success: false, error, code }` via `AppError` |
| Verificação | `202 { requiresVerification, verificationId, reason }` — atenção: `Response.ok` é `true` para 202 |
| Validação | Zod (`validateBody/Query/Params` — chaves fora do schema são **removidas**) |
