# Visão Geral (API)

A **Hexavante API** é o backend oficial da plataforma: autenticação, regras de negócio e dados para web, landing, desktop e mobile, servidos em `https://api.hexavante.com.br` (porta interna 3045).

## Papel no ecossistema

| Cliente | Usa a API para |
|---|---|
| App web | Sessão, login/cadastro, rankings, certificados, heartbeat |
| Landing | Catálogo público (cursos, tutoriais, simulados, stats) — somente leitura |
| Desktop/Mobile | Mesmos contratos do web |

## Princípios

1. **Contratos estáveis**: `{ data, pagination }` em listas; erros `{ success: false, error, code }`.
2. **Auth em camadas**: `optionalAuth` (público personalizável) vs `authenticate` (privado).
3. **Nada destrutivo**: `db push` sem `--accept-data-loss`; auditoria em `moderation_logs`.
4. **Observabilidade**: logs Pino por request; códigos de e-mail nunca em log (só "enviado/falhou").

## Diagrama

```
Cliente → Nginx (:443) → Fastify :3045 → middlewares → controller → service → repository → MySQL
                                              └→ Redis (cache/rate-limit) · Resend (e-mail)
```
