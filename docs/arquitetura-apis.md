# Arquitetura das APIs — Go + Fastify (convivência)

Estado verificado em **27/10/2026** contra `https://api.hexavante.com.br`.

## Resumo

Não existe "uma API" em produção: existem **duas**, atrás do mesmo hostname, com
posse de rotas dividida pelo nginx.

| Prefixo | Upstream | Observação |
|---|---|---|
| `/health`, `/api/v1/health` | **Go** (`go-service/`) | health check do container Go |
| `/api/v1/notes*` | **Go** | Smart Notes (biblioteca central) |
| `/api/v1/visual/*` | **Go** | preferências de aprendizado visual |
| `/api/v1/study/*` | **Go** | conclusão de aula de alta performance |
| `/api/v1/auth/*` | **Fastify** | login, cadastro, sessão, devices, 2FA |
| `/api/v1/users/*` | **Fastify** | perfil, avatar, banner, heartbeat |
| `/api/v1/courses*` | **Fastify** | catálogo e conteúdo |
| `/api/v1/shop*`, `/api/v1/inventory` | **Fastify** | loja e moedas |
| `/api/v1/payments/*` | **Fastify** | Mercado Pago |
| `/api/v1/notifications*`, `/api/v1/moderation/*` | **Fastify** | social/admin |
| `/` e `/docs` | **Fastify** | raiz e Swagger |

Evidência rápida:

```bash
curl -s https://api.hexavante.com.br/health
# {"success":true,"data":{"service":"hexavante-api-go",...}}

curl -s https://api.hexavante.com.br/api/v1/auth/session
# {"success":false,"error":"Sessão inválida ou expirada"}   <- Fastify (error string)

curl -s https://api.hexavante.com.br/api/v1/notes
# {"success":false,"error":"Sessão não informada ou ausente","code":"UNAUTHORIZED"} <- Go
```

## Regras

1. **Rota tem dono único.** Não monte a mesma rota nas duas APIs: contrato,
   cookies e formato de erro divergem.
2. O `docker-compose.yml` deste repositório sobe **apenas o Go** (MySQL, Redis e
   o container `api`). Ele **não** substitui a Fastify; o Fastify continua em
   outro container, roteado pelo nginx.
3. O serviço Go **não** é dono do schema. O Prisma com migrations vive em
   `Webs/Site/Hexavante/prisma`. O `prisma/schema.prisma` daqui é uma cópia de
   referência e pode estar atrasado — não rode `db push` a partir dele.
4. Rate limit do Go é **em memória, por instância** (não usa Redis). Com mais de
   uma réplica, o limite efetivo é `limite × réplicas`.
5. `X-Forwarded-For` é lido pela **última** entrada (a acrescentada pelo proxy).
   Não exponha a porta do Go diretamente na internet.

## Mudanças de schema (ordem obrigatória)

O Go usa SQL cru e não roda migration. Se ele passar a ler uma coluna nova:

1. Adicione a migration no app: `Webs/Site/Hexavante/prisma/migrations/`.
2. Aplique no banco: `cd Webs/Site/Hexavante && npx prisma db push` (fluxo
   usado na VPS) ou `prisma migrate deploy` se a base tiver `_prisma_migrations`
   em dia. A mudança precisa ser aditiva.
3. Só então faça o deploy do serviço Go.
4. Valide `GET /api/v1/notes` autenticado antes de liberar o tráfego.

Reverter a ordem derruba a rota com `1054 Unknown column`.

Exemplo já aplicado: `20261027_add_lesson_note_favorite` adiciona
`lesson_notes.is_favorite`, usada pela biblioteca `/anotacoes`.

## Código Go sem rota em produção

`go-service/internal/modules/{auth,users,security,authorization}` estão montados
no `mux` do Go, mas o nginx manda esses prefixos para a Fastify. São código
**não exercitado em produção**; qualquer mudança neles exige teste manual ou
mover a rota de propósito (com atualização deste documento e do nginx).

## Pendências conhecidas

- `Webs/Hexavante-api-go/` é uma cópia byte-a-byte de `go-service/` **sem git**.
  A fonte versionada é `go-service/`.
- `docs/deploy-producao.md` descreve o deploy antigo (Node em 3045).
- `go-service/README.md` pode mencionar "substituição total" — vale conferir
  antes de seguir como runbook.
