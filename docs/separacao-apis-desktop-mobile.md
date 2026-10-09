# Separação das APIs Desktop e Mobile

## Mapa investigado

```text
Web Next.js ── serviços locais / Server Actions / Route Handlers ── Prisma ── MySQL compartilhado
                                      │
                                      └── storage de mídia compartilhado (/uploads)

Desktop ── desktop-api.hexavante.com.br ── adaptadores HTTP Desktop ── packages/core ── Prisma ── MySQL
Mobile  ── mobile-api.hexavante.com.br  ── adaptadores HTTP Mobile  ── packages/core ── Prisma ── MySQL

api.hexavante.com.br ── gateway legado temporário ── packages/core
```

A investigação encontrou uma sessão opaca única aceita por cookie ou Bearer. Copiar o servidor preservaria validade cruzada entre plataformas. As APIs novas envolvem a sessão em JWTs HS256 independentes, com segredo, `issuer`, `audience`, escopo e campo `platform` próprios. O token é validado antes de a sessão compartilhada ser consultada. Cookies de sessão Web são removidos das requisições nativas.

O schema Prisma da API possui 67 models e é um superset do schema Web, que possui 65. `Payment`, `PushToken` e `PaymentStatus` existem somente no schema da API. Nenhuma migration ou alteração de schema integra esta separação.

## Estrutura

- `packages/core`: Prisma, repositórios, serviços, validações Zod, serializadores, tipos e storage.
- `apps/api-desktop`: composição Fastify, handlers, autenticação, CORS, rate limit, logs e Swagger Desktop.
- `apps/api-mobile`: composição Fastify, handlers, autenticação, CORS, rate limit, logs e Swagger Mobile.
- `src`: gateway legado, mantido durante a migração e marcado com `Deprecation`, `Sunset` e `Link`.

Os adaptadores HTTP são cópias independentes. Eles importam o domínio central por arquivos de compatibilidade que apenas reexportam `packages/core`; regras, consultas e schemas possuem uma única implementação.

## Inventário `/api/v1`

| Grupo | Rotas | Destino inicial |
|---|---|---|
| Autenticação | login, registro, logout, sessão, OAuth, recuperação, verificação de dispositivo | ambas |
| Usuário | perfil próprio/público, edição, exclusão, avatar e banner | ambas |
| Segurança | dispositivos, 2FA, presença e heartbeat | ambas |
| Cursos | catálogo, detalhe, matrícula, progresso, aulas, conclusão, favoritos e notas | ambas |
| Autoria de cursos | criar, editar e excluir curso | Desktop |
| Provas | catálogo, histórico, estatísticas, início e envio | ambas |
| Gamificação | ranking, XP e conquistas | ambas |
| Loja | catálogo, compra, equipamento, inventário e trial | ambas |
| Certificados | lista, emissão e verificação | ambas |
| Notificações | lista e leitura | ambas |
| Push Expo | registro de push token | Mobile |
| Conversas | conversas, mensagens e leitura | ambas |
| Instrutor | candidatura, status, cursos e categorias | ambas |
| Salas ao vivo | catálogo, gestão, entrada, saída e chat | ambas |
| Plataforma | estatísticas públicas | ambas |
| Autorização administrativa | contexto, permissões e papéis | Desktop |
| Moderação | estatísticas, usuários, ban, mute e advertência | Desktop |
| Pagamentos | catálogo, checkout, consulta e webhook | Desktop durante a migração |
| Impersonação | iniciar e encerrar | Desktop |

A Mobile API não registra autorização administrativa, moderação, pagamentos ou impersonação. A Desktop API mantém todos os grupos necessários ao cliente e ao período de compatibilidade. As rotas compartilhadas preservam corpos e status atuais na primeira fase.

## Contrato de cliente

Toda chamada nativa, exceto healthcheck, documentação e navegação GET/callback do OAuth, envia:

```http
X-Hexavante-Client: desktop
X-Hexavante-Client-Version: 1.0.0
```

ou:

```http
X-Hexavante-Client: mobile
X-Hexavante-Client-Version: 1.2.0
```

Cliente ausente ou incorreto recebe `403`. Bearer ausente em rota autenticada recebe `401`. JWT de uma plataforma recebe `401` na outra.

## Variáveis e portas

| Item | Desktop | Mobile |
|---|---|---|
| URL | `https://desktop-api.hexavante.com.br` | `https://mobile-api.hexavante.com.br` |
| Porta local | `3046` | `3047` |
| Segredo de token | `DESKTOP_TOKEN_SECRET` | `MOBILE_TOKEN_SECRET` |
| Issuer | `DESKTOP_TOKEN_ISSUER` | `MOBILE_TOKEN_ISSUER` |
| Audience | `DESKTOP_TOKEN_AUDIENCE` | `MOBILE_TOKEN_AUDIENCE` |
| CORS | `DESKTOP_CORS_ORIGIN` | `MOBILE_CORS_ORIGIN` |
| Rate limit | `DESKTOP_RATE_LIMIT_*` | `MOBILE_RATE_LIMIT_*` |
| Logs | `DESKTOP_LOG_LEVEL` | `MOBILE_LOG_LEVEL` |
| Swagger | `DESKTOP_SWAGGER_*` | `MOBILE_SWAGGER_*` |

Exemplos completos ficam em `deploy/desktop/.env.example` e `deploy/mobile/.env.example`. Os segredos devem ser diferentes. As duas APIs compartilham apenas `DATABASE_URL`, `REDIS_URL` e o volume de uploads.

Os dois composes usam projetos separados, containers e portas próprios. Na VPS atual, ambos entram pela rede externa `hexavante_default` e montam o volume Web `hexavante_uploads`; isso permite que uma imagem gravada por uma API seja servida imediatamente pelo Web. O checkout usado para construir imagens é serializado no deploy, mas a recriação e o rollback de cada container continuam independentes.

Antes de habilitar HTTPS, crie registros DNS `A` para `desktop-api.hexavante.com.br` e `mobile-api.hexavante.com.br` apontando para a VPS. O nginx e os certificados devem ser ativados somente depois de os dois nomes resolverem para o host correto.

## Storage de avatar/banner

O Web e as APIs usam os mesmos campos `avatarUrl` e `bannerUrl` e o mesmo layout `avatars/` e `banners/`. A implementação central valida magic bytes, permite JPEG/PNG/GIF/WebP, exclui SVG, gera nome no servidor, limita multipart a um arquivo (5 MB avatar, 8 MB banner), grava o novo arquivo, atualiza o banco e só então remove o anterior. Se o banco falhar, o arquivo novo é limpo quando a ausência da referência pode ser confirmada.

## Gateway legado

`https://api.hexavante.com.br` permanece disponível até **31 de março de 2027**. Toda resposta informa:

- `Deprecation: true`
- `Sunset: Wed, 31 Mar 2027 23:59:59 GMT`
- links das APIs sucessoras

Plano:

1. publicar e observar as APIs novas;
2. migrar Mobile e Desktop;
3. confirmar ausência de tráfego nativo no gateway;
4. bloquear novas versões no gateway;
5. remover o gateway após o prazo e a confirmação operacional.
