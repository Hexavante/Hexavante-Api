# Permissões (API)

## Papéis (`roles` + `user_roles`)

`USER`, `INSTRUCTOR`, `MODERATOR`, `ADMIN`, `SUPERADMIN` (legado `users.role` ignorado).

## Middlewares

| Middleware | Exige | Uso |
|---|---|---|
| (nenhum) | Nada | Catálogo público, `platform/stats`, `achievements`, `verify/:code` |
| `optionalAuth` | Sessão se houver | Listas que personalizam logado (ex. tentativas) |
| `authenticate` | Sessão válida + não banido | Todo o resto privado |
| `authorize`/`permission()` | Permissão granular | Criação/edição (`course.create`...) |

## Matriz resumida

| Ação | Quem |
|---|---|
| Matricular, progresso, comprar, heartbeat | Qualquer logado |
| Criar/editar conteúdo | `INSTRUCTOR` (+ aprovação p/ publicar) |
| Moderar, banir, booster global | `MODERATOR`/`ADMIN` |
| `users/me/2fa/*`, `devices/*` | O próprio usuário |
| Verificação de certificado | Pública |
