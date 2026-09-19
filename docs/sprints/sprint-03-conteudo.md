# Sprint 3 — Conteúdo (API)

## Cursos (`/api/v1/courses`)

- `GET /` público (`optionalAuth`): paginado, `search/level/courseType/categoryId`, só publicados — `{ data, pagination }`.
- `GET /:id` detalhe com módulos/aulas. `POST /` + `PATCH/DELETE /:id` (permissão `course.*`).
- `POST /:id/enroll`, `GET /:id/progress`, lições: get/complete/favorite/note (autenticado).
- Categorias públicas: `GET /api/v1/courses/categories`.

## Simulados (`/api/v1/exams`, `optionalAuth`)

- `GET /` publicados (`tipo/q/sort`, com `userAttemptCount` se logado).
- `GET /:id` prévia pública (sem questões). Histórico, stats, evolução e por matéria (autenticado).

## Tutoriais (`/api/v1/tutorials`, públicos, sem auth)

- `GET /` paginado (`q/categoryId/sort`), `GET /:id`, `POST /:id/view` (incrementa views).
- Implementados com SQL read-only (`$queryRaw`) sobre as tabelas do web — sem migration, sem escrita.

## Plataforma e certificados

- `GET /api/v1/platform/stats` público com cache de 60s (usuários, cursos, tutoriais, simulados, aulas).
- Certificados: `GET /` (meus, autenticado), `POST /` (emite), `GET /verify/:code` (público).
