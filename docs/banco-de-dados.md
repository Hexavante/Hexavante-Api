# Banco de Dados e Redis — Hexavante API

> Documentação completa e canônica da camada de persistência da Hexavante API.
> Escopo: `Hexavante-api/prisma/schema.prisma` (lido integralmente, 1355 linhas),
> `src/config/redis.ts`, `src/lib/cache/*.ts` (7 arquivos), `src/plugins/rate-limit.ts`,
> usos reais via grep em `src/` (`lib/session.ts`, `modules/auth`, `modules/security`,
> `modules/authorization`, `modules/shop`, `modules/exams`, `modules/gamification`,
> `modules/platform`, `docker-compose.yml`, `.env.example`, `package.json`).
> Idioma: PT-BR. Nenhum nome de model/campo foi inventado — tudo abaixo confere com o schema.

---

## 1. Visão geral

### 1.1. Os três pilares

| Pilar | Tecnologia real (verificada) | Onde está declarado |
|---|---|---|
| Banco relacional | **MariaDB 11** (`mariadb:11` no `docker-compose.yml`) | `Hexavante-api/docker-compose.yml` |
| ORM | **Prisma 6** (`@prisma/client ^6.19.3`, `prisma ^6.19.3`) | `Hexavante-api/package.json` |
| Cache / efêmero | **Redis 7** (`redis:7-alpine`, `ioredis ^5.11.1` + `redis ^6.0.1`) | `docker-compose.yml`, `package.json`, `src/config/redis.ts` |

Detalhes do Redis em produção/dev (ver `docker-compose.yml`):

- `redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru`
- `appendonly yes`: persistência AOF — se o container reiniciar, os dados efêmeros
  (rate-limit, caches) sobrevivem ao restart. Não é backup de verdade (Redis não é
  fonte de verdade de nada crítico), mas evita "thundering herd" de cache frio.
- `maxmemory 256mb` + `allkeys-lru`: quando a memória enche, o Redis despeja as
  chaves **menos recentemente usadas** (inclusive sem TTL). Decisão consciente:
  nenhum dado no Redis pode ser insubstituível — tudo pode ser reconstruído a
  partir do MySQL. Se uma chave de sessão cacheada for despejada, o fallback é o banco.
- MySQL: `mariadb:11`, `utf8mb4` / `utf8mb4_unicode_ci`, `max-connections=200`,
  `innodb-buffer-pool-size=512M`, database `hexavante`, healthcheck via
  `healthcheck.sh --connect --innodb_initialized`.

### 1.2. UM banco `hexavante` compartilhado

Existe **um único banco lógico `hexavante`**, compartilhado pelo app web Next.js
(`Hexavante/`) e pela API Fastify (`Hexavante-api/`). Não há um banco "do web" e
um banco "da API" — há dois clientes Prisma apontando para o mesmo schema físico.

Consequências diretas:

1. **Toda escrita precisa ser legível pelos dois lados.** Se a API cria uma coluna,
   o web precisa conhecê-la (e vice-versa). Campos "só da API" que o web ignora
   são tolerados apenas se forem anuláveis ou tiverem default — nunca `NOT NULL`
   sem default em tabela que o outro lado escreve.
2. **Não existe migração de dados "interna da API"** que o web não veja. Backfills
   precisam ser idempotentes e rodar uma vez (ver §6).
3. **Transações cruzadas não existem.** Web e API nunca participam da mesma
   transação Prisma. A consistência entre escritas dos dois lados é **eventual e
   por convenção** (ex.: `ShopService.ensureActiveTheme` existe espelhado nos dois
   lados — o comentário no código diz explicitamente "espelha ... do web").

### 1.3. Regra dura: os 2 schemas idênticos em cobertura

> **Web usa migrations; API usa `prisma db push` no boot. Os dois `schema.prisma`
> precisam ficar idênticos em cobertura (models, campos, enums, índices, maps).**

Verificado em disco:

- `Hexavante/prisma/migrations/` existe com migrations reais
  (`20260906_add_tutorials`, `20260908_add_delete_user_profile_log_types`,
  `20260908_admin_auth_tables`, `20260926_add_push_tokens`, ...).
- `Hexavante-api/prisma/` contém **apenas** `schema.prisma` + seeds
  (`seed.ts`, `seed-full.ts`, `seed-sample.ts`) — **nenhuma pasta `migrations`**.
  O `package.json` da API expõe `db:push: prisma db push` e `db:migrate` existe
  como script mas o fluxo oficial é push.

Por que essa divisão (o PORQUÊ da regra):

- O web é o **dono do histórico de migração** (migrations versionadas, revisáveis,
  reversíveis com SQL). É ele que evolui o DDL de forma auditável.
- A API usa `db push` porque ela **não pode divergir do runtime**: no deploy, o
  `db push` sincroniza o schema Prisma com o banco sem exigir que alguém gere e
  aplique migration na API. É rápido e impede o erro clássico "deployei código
  que lê coluna que não existe".
- O preço dessa conveniência é o risco de `db push` **destruir dados** se os
  schemas divergirem (ex.: um campo renomeado em só um lado vira drop+create).
  Por isso a regra dura de cobertura idêntica + a proibição de
  `--accept-data-loss` (ver §6).

### 1.4. Convenções de schema (as 4 regras)

#### a) `snake_case` no banco + `camelCase` no código, via `@map`

Todo campo cuja coluna física difere do nome Prisma usa `@map("snake_case")`.
Exemplos reais do `User`: `fullName @map("full_name")`, `passwordHash @map("password_hash")`,
`boosterExpiresAt @map("booster_expires_at")`, `lastStudyCourseSlug @map("last_study_course_slug")`.

- **Porquê:** o banco segue a convenção SQL dominante (`snake_case`, legível em
  queries manuais, dumps e no painel do DBA), enquanto o TypeScript segue a
  convenção JS (`camelCase`). O `@map` é a ponte sem custo de runtime — o Prisma
  traduz nos dois sentidos. Sem `@map`, ou o SQL fica "estrangeiro" ou o TS fica
  "estrangeiro"; o mapeamento explícito custa uma linha por campo e elimina a
  discussão para sempre.
- Exceções intencionais: campos que já são uma palavra (`coins`, `bio`, `city`,
  `phone`, `roles.name`) não precisam de `@map`. PKs `id` e timestamps
  (`createdAt @map("created_at")`) seguem o padrão.

#### b) IDs `cuid()` — nunca auto-increment, nunca UUID v4 puro

Todo `@id` de entidade de negócio é `String @id @default(cuid())`.
Exceções reais (e intencionais): `RankingSeason.seasonKey` (`String @id @map("season_key")`,
chave natural `YYYY-MM`), `UserNotificationSettings.userId` (PK = FK 1:1),
`PlatformSetting.key` (`String @id`), `CourseTag`/`TutorialTag` (`@@id([a, b])`
composta, sem `id` surrogate). Ver decisão §2.1 para o porquê.

#### c) Timestamps e a nota sobre `DateTime(3)`

Convenção pedida: `DateTime(3)` (precisão de milissegundos). **Estado real do
schema lido:** os campos estão declarados como `DateTime` puro com
`@default(now())` / `@updatedAt` (ex.: `createdAt DateTime @default(now()) @map("created_at")`,
`updatedAt DateTime @updatedAt @map("updated_at")`), **sem `@db.DateTime(3)`
explícito**. Na prática, com Prisma 6 + MariaDB 11, `DateTime` mapeia para
`DATETIME` com o padrão do conector — ou seja, a precisão efetiva depende do DDL
gerado/aplicado pela migration do web. Decisão documentada aqui para não haver
dúvida: **se precisão de ms for requisito (ordenação de chat, `lastSeenAt`,
`finishedAt` de simulado), a migration do web deve declarar `DATETIME(3)`
explicitamente**; o schema da API acompanha em cobertura. Não foi inventado
`@db.DateTime(3)` no texto abaixo onde ele não existe no arquivo.

Padrões reais de timestamp no schema:

- `createdAt @default(now())` — quase todas as tabelas.
- `updatedAt @updatedAt` — tabelas mutáveis (`users`, `courses`, `tutorials`,
  `sessions`, `accounts`, `verifications`, `roles`, `permissions`, `live_rooms`,
  `push_tokens`, `user_notification_settings`, `platform_settings`).
- Timestamps de domínio (`enrolledAt`, `completedAt`, `startedAt`, `finishedAt`,
  `issuedAt`, `joinedAt`, `leftAt`, `lastSeenAt`, `expiresAt`, `revokedAt`,
  `liftedAt`, `processedAt`, `rewardClaimedAt`, `premiumExpiresAt`,
  `boosterExpiresAt`, `banExpires`, `lastLogin`, `onboardingCompletedAt`,
  `lastStudyAt`, `presenceUpdatedAt`, `pinnedAt`, `reviewedAt`, `lastMessageAt`,
  `readAt`, `verifiedAt`, `purchasedAt`, `unlockedAt`, `assignedAt`) — cada um com
  semântica própria documentada na §4.

#### d) `@@map("tabela")` + `@@index` / `@@unique` explícitos

Toda model tem `@@map("snake_plural")` (ex.: `User → users`, `ExamQuestion → exam_questions`,
`UserXP → user_xp`, `verification → verifications`). Índices e unicidades são
**sempre explícitos** — nunca se confia no índice implícito do Prisma além do
necessário. Exemplos: `@@unique([userId, lessonId])` em `LessonProgress`,
`@@index([userId, createdAt])` em `SocialActivity`, `@@index([status, createdAt])`
em `CommunityReport`. O porquê: índice é decisão de performance e de regra de
negócio (unicidade = invariante); deixar implícito esconde custo e intenção.

---

## 2. Decisões globais (cada uma com o PORQUÊ)

### 2.1. `cuid()` vs auto-increment vs UUID

**Decisão:** PKs opacas `cuid()` (string curta, ~25 chars, prefixo `c` + timestamp + contador + fingerprint).

**Por que não auto-increment (`Int @id @default(autoincrement())`):**

1. **Enumeração e vazamento de informação.** `/api/courses/42` revela quantos
   cursos existem e permite crawling sequencial (`43`, `44`, ...). Com cuid,
   o espaço de IDs não é enumerável — segurança por opacidade (defesa em
   profundidade, não única barreira).
2. **Banco compartilhado + seeds + imports.** Auto-increment colide quando dois
   escritores (web e API, seeds, imports de simulados ENEM) inserem concorrentemente
   ou quando dumps são mesclados. Cuid é gerado no cliente — sem round-trip, sem
   lock de sequência, sem `lastInsertId`.
3. **URLs e slugs.** IDs aparecem em rotas (`getPublicBySlugOrId` aceita slug **ou**
   id). Um inteiro sequencial numa URL pública é feio e informativo demais.

**Por que não UUID v4:**

1. **Tamanho e legibilidade.** UUID tem 36 chars com hífens; cuid tem ~25, é
   case-sensitive alfanumérico, mais curto em URLs, logs e no Redis (chaves
   `session:{id}`, `roles:{userId}` — cada byte conta com `maxmemory 256mb`).
2. **Ordenabilidade aproximada.** Cuid embute timestamp — IDs criados depois
   tendem a ordenar depois (não garantido, mas útil em debug; UUID v4 é totalmente
   aleatório).
3. **Colisão suficiente.** Para o volume da Hexavante, a entropia do cuid é mais
   que adequada; UUID seria overkill com custo de espaço.

**Exceções que confirmam a regra (reais no schema):**

- `RankingSeason.seasonKey` (`VARCHAR(7)`, formato `YYYY-MM`): chave **natural e
  legível** — a temporada *é* o mês. Um cuid aqui destruiria a semântica
  ("qual temporada?" → ler `2026-09` é imediato).
- `CourseTag` / `TutorialTag` (`@@id([courseId, tagId])`): tabela de junção pura,
  sem identidade própria — PK composta é a modelagem correta, evita surrogate inútil.
- `UserNotificationSettings.userId` como `@id`: relação 1:1 estrita — a settings
  *é* do usuário, não tem vida própria.
- `PlatformSetting.key` (`String @id`): settings é um KV — a chave *é* o ID.

### 2.2. `snake_case` no banco + `camelCase` no código

Ver §1.4(a). Aprofundando o porquê:

1. **Queries manuais e operação.** O time opera o banco via SQL direto
   (`SELECT * FROM exam_attempts WHERE finished_at IS NOT NULL`). `finishedAt`
   em SQL quebra a convenção que todo DBA espera; `finished_at` é grepável,
   consistente com `information_schema` e com os dumps.
2. **Migrações legíveis.** O diff de migration mostra `ADD COLUMN premium_expires_at`
   — auto-documentado. Sem `@map`, o diff mostraria camelCase no DDL, um "code smell"
   visível em todo `SHOW CREATE TABLE`.
3. **Zero custo de runtime.** O Prisma resolve o mapeamento em tempo de geração
   do client. Não há overhead por query, ao contrário de um middleware de
   case-conversion.
4. **Contrato com o web.** Como os dois schemas precisam ser idênticos em
   cobertura, o `@map` é parte do contrato: se um lado mapear `full_name` e o
   outro esquecer, o `migrate diff` acusa drift mesmo com os mesmos nomes Prisma.

### 2.3. Soft delete vs hard delete (onde usa cada — real, por tabela)

**Regra geral do projeto: hard delete com `Cascade` na maioria das relações,
soft delete (flag/`revokedAt`/`isActive`/expiração) onde há trilha de auditoria,
segurança ou catálogo.**

**Hard delete real ( `onDelete: Cascade` no schema):**

- Quase tudo pendurado em `User`: `sessions`, `accounts`, `trustedDevices`,
  `deviceCodes`, `pushTokens`, `tutorials` (autor), `enrollments`, `lessonProgresses`,
  `lessonFavorites`, `lessonNotes`, `examAttempts`, `examQuestionFavorites`,
  `xpTransactions`, `rankingSeasonResults`, `certificates`, `coinTransactions`,
  `inventory`, `follows`, `socialActivities`, `activityLikes/Comments/Reactions`,
  `directConversations` (participantes), `sentDirectMessages`, `achievements`,
  `bans/mutes/warnings` (ambos os lados), `moderationLogsAsActor`, `userXp`, `wallet`.
- Conteúdo em cascata: `Course → modules → lessons → (progresses, favorites, notes)`;
  `Module → materials`; `Exam → questions → (alternatives, answers, favorites)`;
  `ExamAttempt → answers`; `SocialActivity → likes/reactions/comments/reports`;
  `DirectConversation → messages`; `LiveRoom → participants/messages`.
- **Porquê hard aqui:** LGPD e "excluir conta" precisam apagar de verdade. Manter
  linha órfã de `exam_answers` de usuário deletado não serve a ninguém e polui
  agregações (`AVG(score)`). Onde auditoria importa, ela vive em tabela própria
  (`moderation_logs` com `SetNull` no alvo — ver abaixo), não na linha operacional.

**Soft / flag / expiração real (sem deletar a linha):**

| Tabela.campo | Mecanismo | Porquê não deletar |
|---|---|---|
| `trusted_devices.revoked_at` | timestamp de revogação | Histórico de dispositivos é evidência de segurança; revogar ≠ esquecer. `isDeviceTrusted` checa `revokedAt IS NULL`. |
| `user_bans.is_active` + `lifted_at` | flag + timestamp | Ban precisa de histórico (reincidência, apelação). Desativar mantém a trilha. |
| `user_mutes.is_active` + `lifted_at` | idem | Idem. |
| `user_warnings` (sem flag) | linha permanente | Advertência é registro histórico por definição. |
| `store_items.is_active` | flag de catálogo | Desativar item esconde da loja sem quebrar `user_inventory` existente (FK `Cascade` só apaga se o item for *deletado* — desativar preserva). |
| `user_inventory.expires_at` | expiração temporal | Item temporário "some" por regra de negócio (`expired_temporary`), mas a linha prova a compra. |
| `users.banned` + `ban_reason` + `ban_expires` | flag + motivo + expiração | Banimento temporário auto-expira sem job: basta checar `banExpires > now()`. |
| `device_verification_codes.used` + `attempts` | flag + contador | Código consumido/bloqueado permanece para auditoria e anti-replay. |
| `admin_verification_codes.used` | flag | Idem, fluxo admin. |
| `courses.is_published` / `exams.is_published` / `tutorials.is_published` | flag de visibilidade | "Deletar" conteúdo publicado quebraria certificados e histórico; despublicar esconde sem destruir. |
| `live_rooms.status` (`CANCELLED`/`ENDED`) | enum de ciclo de vida | Sala encerrada é histórico (participantes, chat). |
| `community_reports.status` (`PENDING`/`REVIEWED`/`DISMISSED`) | enum de workflow | Denúncia resolvida é precedente de moderação. |

**O caso híbrido — `ModerationLog.targetUserId → onDelete: SetNull`:**
o log de moderação **sobrevive ao usuário**. Se o moderador apaga um usuário
(`DELETE_USER`), o log perde o alvo (`NULL`) mas preserva `moderatorId`,
`action`, `description`, `metadata`, `createdAt`. **Porquê:** auditoria de
moderação é mais importante que integridade referencial estrita — o log existe
precisamente para responder "quem fez o quê", inclusive quando o "o quê" foi
apagar alguém. O lado `moderator → Cascade` (se o moderador for deletado, seus
logs vão junto) é decisão discutível documentada aqui: assume-se que moderadores
não são deletados, apenas desabilitados.

`ContentPolicyViolation.userId → SetNull`: mesmo raciocínio — a violação
detectada sobrevive ao usuário.

`LiveRoom.courseId → SetNull`, `Tutorial.categoryId → SetNull` (sem `onDelete`
= `Restrict` padrão do Prisma... na verdade ausência de `onDelete` no Prisma
para MySQL significa `Restrict`/erro): sala/tutorial sobrevivem à categoria/curso
(ver §2.4).

### 2.4. `Cascade` vs `Restrict` (onde cada um — real)

**`Cascade` (a imensa maioria das FKs):** qualquer coisa que seja "posse" ou
"filho composicional" do pai. Exemplos por domínio:

- Identidade: `Account.userId`, `Session.userId`, `TrustedDevice.userId`,
  `DeviceVerificationCode.userId`, `AdminSession.userId`,
  `AdminVerificationCode.userId`, `PushToken.userId` → deletar usuário derruba
  credenciais e sessões (exigência de segurança: conta deletada não pode ter
  sessão viva).
- Aprendizado: `CourseInstructor.courseId/userId`, `Module.courseId`,
  `Lesson.moduleId`, `Material.moduleId`, `CourseEnrollment.userId/courseId`,
  `LessonProgress.*`, `LessonFavorite.*`, `LessonNote.*`.
- Simulado: `ExamQuestion.examId`, `ExamAlternative.questionId`,
  `ExamAttempt.examId/userId`, `ExamAnswer.attemptId/questionId`,
  `ExamAnswer.alternativeId → Cascade` (**atenção:** se uma alternativa for
  deletada, as respostas que apontavam para ela são deletadas em cascata —
  decisão agressiva mas consistente com "questão reeditada = tentativa antiga
  perde granularidade"; o `score` agregado permanece em `exam_attempts`).
- Economia: `UserXP.userId`, `UserWallet.userId`, `UserInventory.userId/storeItemId`,
  `XpTransaction.userId`, `CoinTransaction.userId`.
- Social: follows, likes, reactions, comments, comment-likes, reports,
  conversations, messages, activities.

**Sem `onDelete` explícito (= comportamento restritivo; o banco recusa o delete
do pai enquanto houver filho):**

- `Course.categoryId`, `Tutorial.categoryId` (nullable), `CourseTag.tagId`,
  `TutorialTag.tagId`, `Tag` ← junções, `CourseModeration.moderatorId`,
  `InstructorApplication.reviewedById`, `SocialActivity.pinnedById → SetNull`
  (exceção explícita).
- **Porquê Restrict aqui:** categoria/tag/moderador são **vocabulário
  compartilhado**, não posse. Deletar a categoria "Matemática" com 200 cursos
  dentro seria catástrofe silenciosa — o banco deve *recusar* e forçar o operador
  a recategorizar primeiro. É a aplicação direta da regra "Restrict protege
  entidade compartilhada; Cascade limpa entidade possuída".

**`SetNull` (3 casos, todos intencionais):**

1. `ModerationLog.targetUserId`, 2. `ContentPolicyViolation.userId`,
   3. `SocialActivity.pinnedById`, 4. `LiveRoom.courseId`.
   (4 casos — `LiveRoom.courseId` nullable: deletar o curso não apaga a live
   agendada; ela vira avulsa.)

### 2.5. Ledger transacional (transactions em vez de só contadores)

**Decisão:** `XpTransaction` e `CoinTransaction` são **ledgers append-only**;
`User.coins`, `UserXP.currentXp/totalXp/level`, `UserWallet.coins` são
**saldos derivados (cache materializado)**.

Evidência real no código:

- `ExamService.submitExam` (`exam.service.ts:380-440`): antes de creditar,
  faz `findUnique({ where: { userId_source_sourceId } })` em **ambas** as
  tabelas — idempotência por chave natural. Só cria se não existir; só então
  atualiza `userXP` / `user.coins`.
- `ShopService.purchaseItem` (`shop.service.ts:135-169`): `prisma.$transaction`
  com `user.update(coins decrement)` + `coinTransaction.create(SHOP_PURCHASE, SPEND)`.
- `@@unique([userId, source, sourceId])` nas duas tabelas — o banco impõe a
  idempotência mesmo sob race condition (a segunda inserção concorrente falha
  com violação de unicidade em vez de duplicar crédito).

**Porquê ledger e não só `coins++`:**

1. **Auditoria e suporte.** "Por que meu saldo está X?" → `SELECT * FROM coin_transactions
   WHERE user_id = ? ORDER BY created_at DESC`. Sem ledger, essa pergunta é
   irrespondível. A loja já expõe `coinHistory` (últimas 20) no `getShopState`.
2. **Idempotência real.** Retry de `submitExam` (timeout, duplo clique, reenvio)
   não duplica recompensa: a chave `(userId, EXAM, attemptId)` / `(userId, EXAM, attemptId-pass)` /
   `(userId, EXAM_CORRECT, attemptId)` garante "no máximo uma vez" no nível do banco.
3. **Anti-farm.** O multiplicador diário decrescente (`[1, 0.35, 0.12, 0.05]`,
   `dailyAttemptIndex`, `dailyRewardMultiplier` em `exam_attempts`) + ledger
   permitem detectar e auditar farm de XP pós-fato.
4. **Recomposição.** Se um bug corromper saldos, o ledger permite recalcular
   (`SUM(amount)` por usuário). Sem ledger, corrupção de contador é irreversível.
5. **Múltiplas fontes com semântica.** `CoinSource` (`EXAM_CORRECT`, `SHOP_PURCHASE`,
   `LESSON`, `MODULE`, `COURSE`, `PREMIUM_GRANT`, `LEAGUE_REWARD`, `ADMIN`) e
   `XpSource` (`LESSON`, `MODULE`, `COURSE`, `EXAM`, `ADMIN`) + `CoinTransactionType`
   (`EARN`/`SPEND`) permitem relatórios por origem — impossível com contador puro.

Nota honesta: `UserWallet` (`user_wallets`, 1:1 com `coins`) coexiste com
`User.coins` — o `getShopState` e o `purchaseItem` usam **`User.coins`**, não o
wallet. O wallet é cobertura de schema (provavelmente consumido pelo web) —
documentado aqui para que ninguém "consolide" sem ler os dois lados.

### 2.6. Verificação por código (6 dígitos, e-mail) em vez de link mágico

**Decisão:** todos os fluxos de verificação usam **código numérico de 6 dígitos**
(`String(randomInt(100000, 1000000))` em `security.service.ts:49-51`) enviado por
e-mail (Resend; templates `deviceCodeEmailHtml`, `emailVerifyHtml`,
`twoFactorEmailHtml` em `lib/email`), com `CODE_TTL_MS = 10 min`, `MAX_ATTEMPTS = 5`,
`RESEND_COOLDOWN_MS = 60s`, persistido em `device_verification_codes` (MySQL —
**não** no Redis; ver §3.7).

Fluxos cobertos pelo mesmo mecanismo (`purpose`): `DEVICE`, `TWO_FACTOR`,
`EMAIL_VERIFY`, `PASSWORD_RESET` (+ `AdminVerificationCode` separado para o painel).

**Porquê código e não link mágico (`https://...?token=...`):**

1. **Funciona em qualquer cliente.** O Hexavante tem web, desktop (Electron),
   mobile (Expo) e painel admin. Link mágico exige deep-link por plataforma;
   código de 6 dígitos funciona em todos com o mesmo backend — o usuário lê no
   e-mail e digita onde estiver.
2. **Anti-phishing.** Link mágico treina o usuário a clicar em links de e-mail —
   exatamente o comportamento que phishing explora. Código inverte o fluxo: o
   usuário vai (por conta própria) ao app e digita. O e-mail nunca contém URL
   autenticável.
3. **Tentativas limitadas no servidor.** `attempts` incrementado por erro +
   bloqueio após 5 + `used=true` após consumo: força bruta em espaço de 10⁶ com
   5 tentativas por código de 10 min é inviável (probabilidade ~5×10⁻⁶ por janela).
   Link mágico com token de alta entropia é "inadivinhável" mas *eterno até o
   clique* — se vazar (encaminhamento, preview de cliente de e-mail que pré-busca
   URLs!), a conta cai. Códigos não são pré-buscáveis.
4. **Coexistência de códigos.** Comentário explícito no código (`security.service.ts:101-103`):
   códigos anteriores **continuam válidos até expirar** — invalidá-los a cada
   reenvio prendia o usuário em loop quando o e-mail atrasava. Com link mágico,
   cada reenvio normalmente invalida o anterior (mesmo problema, sem a solução).
5. **Unificação.** Um único par de endpoints (`issue`/`consume`) serve dispositivo
   novo, 2FA, confirmação de e-mail e reset de senha — menos superfície de ataque,
   menos código, mesmos limites.

### 2.7. Sessão stateful no banco vs JWT stateless

**Decisão:** sessão **stateful**: token opaco (`randomBytes(32).toString('base64url')`,
`lib/session.ts:24`) persistido em `sessions` (`token @unique @map("session_token")`,
`expiresAt`, `ipAddress`, `userAgent`, `impersonatedBy`), transportado no cookie
`__Secure-hexavante.session_token` (domínio `.hexavante.com.br`), validado por
lookup no banco a cada request (`validateSession`: `findUnique({ token })` +
checa expiração + deleta se expirada).

**Porquê não JWT stateless:**

1. **Revogação imediata.** Reset de senha (`resetPassword` → `deleteMany({ userId })`),
   revogação de dispositivo (`revokeDevice` → deleta sessões do IP/UA),
   ban (`banned=true` checado no validate), impersonação — tudo exige matar sessões
   *agora*. Com JWT, "logout" só existe via denylist (que é... estado — ou seja,
   volta-se ao stateful, porém pior: estado só para o caso negativo).
2. **Sessão carrega contexto fresco.** `validateSession` inclui `user` + `roles`.
   Com JWT, roles ficariam congeladas no `iat` — mudança de role (promoção a
   moderador, ban) só valeria após expiração do token. Com lookup, vale no próximo request.
3. **Sessões listáveis e auditáveis.** `sessions` guarda `ipAddress`/`userAgent`/
   `createdAt` — "dispositivos conectados", detecção de anomalia, forense.
   JWT não deixa rastro no servidor.
4. **Custo aceitável.** O lookup é `findUnique` em coluna `@unique` (índice) —
   sub-milissegundo no MySQL local. O `SessionCache` Redis (`session:{id}`, TTL 7d,
   índice `user_sessions:{userId}`) existe pronto para quando o volume justificar
   (ver §3.2) — a arquitetura já prevê o upgrade sem trocar o modelo.
5. **Cookie `__Secure-` + domínio raiz.** O prefixo `__Secure-` exige HTTPS (navegador
   recusa setar via HTTP); domínio `.hexavante.com.br` compartilha a sessão entre
   `app.` e `api.` — SSO entre subdomínios sem OAuth interno.

Duração: `SESSION_DURATION_DAYS = 7`. Expirada → deletada no próprio validate
(higiene automática, sem cron).

### 2.8. RBAC (`roles` + `permissions`) vs string `role` no `User`

**Decisão:** RBAC de verdade (`roles`, `permissions`, `user_roles`, `role_permissions`)
**e** coluna legada `User.role` (`String @default("user")`) + `banned`. Os dois
coexistem no schema.

**Porquê RBAC e não só `role = "admin"`:**

1. **Permissão granular.** `Permission = (resource, action, name)` — ex.:
   `courses:publish`, `users:ban`. `hasPermission(userId, name)` no
   `AuthorizationService` checa o *contexto* (roles → permissões), não a string.
   Adicionar "revisor de simulados que não pode banir" é inserir linhas, não
   refatorar `if`s espalhados.
2. **Múltiplos papéis.** `@@unique([userId, roleId])` — um usuário pode ser
   `USER` + `INSTRUCTOR` + `MODERATOR` simultaneamente. String única exigiria
   enum explosivo (`admin_moderator_instructor`...).
3. **Cache com invalidação.** `roles:{userId}` + `permissions:{userId}` no Redis
   (TTL 5 min, `AuthorizationService.getPermissionContext` com cache-aside +
   `invalidateUserCache` em `assignRoleToUser`). Autorização por request sem
   join por request.
4. **Por que `User.role` ainda existe:** compatibilidade com o web e checagens
   rápidas (`banned`, gates simples). É o "atalho" — o RBAC é a "verdade".
   Regra operacional: **mudança de poder (ban, promoção) deve atualizar os dois**;
   leitura quente pode usar a string; decisão sensível deve usar `hasPermission`.

---

## 3. Redis — todos os usos (chave, TTL, porquê Redis e não MySQL)

> Arquivo-fonte: `src/config/redis.ts` — singleton `getRedisClient()` (ioredis,
> `REDIS_URL` + `REDIS_PASSWORD` opcional, `maxRetriesPerRequest: 3`,
> `retryStrategy` até 2s, logs connect/error/close) e `closeRedisClient()` no
> shutdown gracioso (`server.ts:218-225`).
>
> **Nota de honestidade importante (verificada por grep):** em `src/lib/cache/`
> existem **7 classes de cache** com chaves e TTLs bem definidos, mas **só
> `RoleCache` e `PermissionCache` estão instanciadas em produção**
> (`AuthorizationService`). As demais (`SessionCache`, `OtpCache`,
> `PasswordResetCache`, `EmailVerificationCache`, `RateLimitCache`) são
> **contratos prontos + implementação pronta, ainda não ligados** — a fonte de
> verdade atual desses fluxos é o MySQL (`sessions`, `device_verification_codes`).
> O rate-limit global **está ligado** via `@fastify/rate-limit` com backend Redis
> (`src/plugins/rate-limit.ts`). Cada subseção abaixo marca o status real.

### 3.1. Rate-limit global (`@fastify/rate-limit` + Redis) — ✅ ATIVO

- **Onde:** `src/plugins/rate-limit.ts` (`registerGlobalRateLimit`), chamado no
  **escopo raiz** de `src/server.ts` **antes** do registro das rotas.
- **Escopo (o bug que já foi corrigido):** `@fastify/rate-limit` é
  fastify-plugin — instala um hook `onRoute` só na instância onde é registrado
  e nas filhas criadas depois. Registrá-lo dentro de um wrapper
  (`fastify.register(rateLimitPlugin)`) criava um contexto filho **sem rotas**
  e nenhuma rota era limitada. Hoje o registro é direto na raiz; rotas com
  `config: { rateLimit: {…} }` (login 10/min, register 5/min,
  `POST /oauth/exchange` 10/min) usam **contador próprio** (chave com método+URL)
  e não incrementam o global — por isso o plugin **não** é registrado de novo no
  escopo da rota (dobraria a contagem).
- **Cobertura de `/health` e `/docs`:** decidido manter sob o limite global
  (1000/min/IP por padrão é generoso para monitoramento — 1 probe/seg = 60/min).
  Se um dia precisar isolar, basta `config.rateLimit` (ou `false`) na própria rota.
- **Chave:** gerenciada pelo plugin — `fastify-rate-limit-<ip>` (global) e
  `fastify-rate-limit-<METHOD><URL>-<ip>` (rota com `config.rateLimit`).
- **Limites:** `max = RATE_LIMIT_MAX || 1000` (default 1000: o tráfego
  server-side do Next sai todo do IP do container e compartilha o bucket global;
  com 100 a validação de sessão era derrubada e o usuário logado ia pro /login —
  a env continua sendo o override), `timeWindow = RATE_LIMIT_TIME_WINDOW || '1 minute'`.
  Dev: `allowList = ['127.0.0.1', '::1', 'localhost']` + `cache: 0`; prod: allow-list
  via env + `cache: 10000` (cache local de 10s para não bater no Redis a cada request).
  Headers `x-ratelimit-*` ativos; `continueExceeding: false`, `skipOnError: false`
  (falha do Redis **não** abre a torneira — fail-closed, decisão de segurança).
- **Observabilidade do 429:** o `errorResponseBuilder` emite
  `logger.warn({ ip, method, url, limit, max, after, ttl, rateLimited: true },
  'Rate limit exceeded')` no pino de `src/config/logger.ts` (o mesmo de
  `request.log` → `docker logs`). Sem isso o 429 só aparecia no nginx
  (175× lá vs 0 no container). `fastify.log` é no-op neste app
  (`Fastify({ logger: false })` → `abstract-logging`), por isso o pino global.
- **Porquê Redis e não MySQL:** rate-limit é escrita por request (INCR por IP).
  No MySQL seriam 100+ writes/min por usuário ativo numa tabela hot — lock,
  WAL e autovacuum para um dado que expira em 60s. No Redis é `INCR` + `EXPIRE`
  atômicos em memória, distribuído entre instâncias da API (o `memory store`
  padrão do plugin seria por-processo: com 2+ réplicas, o limite seria por
  réplica — furável). Redis centraliza a contagem.

### 3.2. Session cache (`session:{sessionId}` + `user_sessions:{userId}`) — 🟡 PRONTO, NÃO LIGADO

- **Onde:** `src/lib/cache/session.cache.ts` (`SessionCache`, `ISessionCache`).
- **Chaves:** `session:{sessionId} → data` (string serializada da sessão);
  índice `user_sessions:{userId}` (SET de sessionIds, via `SADD`).
- **TTL:** `DEFAULT_TTL = 7 dias` — espelha `SESSION_DURATION_DAYS`.
- **Operações:** `get`, `set(sessionId, data, ttl, userId?)` (com indexação),
  `delete(sessionId)`, `deleteAllByUserId(userId)` (`SMEMBERS` + `DEL` em lote +
  `DEL` do índice) — logout global ("sair de todos os dispositivos").
- **Status real:** `lib/session.ts` (`createSession`, `validateSession`,
  `deleteSession`, `deleteSessionsByUserId`) opera **só MySQL** hoje. Nenhum
  `new SessionCache()` no `src/`.
- **Porquê Redis (quando ligar):** validação de sessão é o lookup mais quente da
  API (1 por request autenticado). `GET session:{id}` evita `findUnique` + join
  de roles por request. O índice por usuário resolve o ponto fraco clássico de
  sessão em cache (invalidar "todas as sessões do usuário" sem scan). TTL = duração
  da sessão = expiração automática sem cron.
- **Por que ainda MySQL-first:** corretude antes de performance — enquanto o
  volume cabe no `findUnique` indexado, evita-se a classe inteira de bugs de
  cache (sessão revogada ainda válida no Redis, role antiga no cache). Ligar é
  trivial quando precisar: cache-aside no `validateSession` + `DEL` no
  `deleteSession`/`resetPassword`/`revokeDevice`.

### 3.3. Role cache (`roles:{userId}`) — ✅ ATIVO

- **Onde:** `src/lib/cache/role.cache.ts`, consumido em
  `AuthorizationService.getPermissionContext` (com `Promise.all` paralelo com permissões).
- **Chave:** `roles:{userId} → JSON string[]` (nomes de roles).
- **TTL:** 5 min (`60 * 5`). `get` com `try/catch` em `JSON.parse` (corrompido → `null` → fallback banco).
- **Invalidação:** `invalidateUserCache` (chamado em `assignRoleToUser`) faz `DEL` em
  `roles:{userId}` **e** `permissions:{userId}` juntos.
- **Porquê Redis e não MySQL:** autorização roda em praticamente todo request
  protegido; sem cache seriam 2+ joins (`user_roles → roles`, `role_permissions →
  permissions`) por request. 5 min é o equilíbrio: mudança de papel propaga em no
  máximo 5 min *ou imediatamente* via invalidação explícita nos writes. Stale de
  5 min em autorização é aceitável porque ações destrutivas revalidam no banco
  (e ban usa a flag `users.banned`, não o cache).

### 3.4. Permission cache (`permissions:{userId}`) — ✅ ATIVO

- **Onde:** `src/lib/cache/permission.cache.ts`, mesmo fluxo do §3.3.
- **Chave:** `permissions:{userId} → JSON string[]` (nomes de permissões).
- **TTL:** 5 min. Mesma invalidação acoplada às roles.
- **Porquê Redis e não MySQL:** idem §3.3 — é o outro lado do mesmo contexto.
  Só retorna `cachedRoles && cachedPermissions` juntos (se um `null`, busca tudo
  do banco e popula ambos — evita "meio contexto" stale).

### 3.5. Password-reset (`pwd_reset:{token}`) — 🟡 PRONTO, NÃO LIGADO (fluxo real no MySQL)

- **Onde (contrato):** `src/lib/cache/password-reset.cache.ts` —
  `set(token, userId)`, `get(token) → userId`, `invalidate(token)`.
- **Chave/TTL do contrato:** `pwd_reset:{token} → userId`, `DEFAULT_TTL = 1 hora`.
  Uso único: invalidar imediatamente após o uso.
- **Status real:** `SecurityService.requestPasswordReset` / `resetPassword`
  usam **`device_verification_codes` (MySQL, `purpose=PASSWORD_RESET`, TTL 10 min,
  `used` + `attempts`)** — não o Redis. Nenhum `new PasswordResetCache()` no `src/`.
- **Porquê Redis seria melhor aqui (e por que MySQL foi escolhido por ora):**
  token de reset é write-once/read-once com expiração curta — caso de uso canônico
  de `SETEX` + `DEL`. Redis daria expiração automática e custo zero de limpeza.
  O MySQL foi escolhido porque o fluxo **reaproveita** a máquina de códigos
  (tentativas, cooldown, auditoria, anti-enumeração com `verificationId` nulo) —
  trocar só o reset por Redis criaria dois mecanismos de "código" com semânticas
  diferentes. Decisão de coesão > micro-otimização. Se um dia o volume de resets
  justificar, o `PasswordResetCache` já está pronto com a chave e o TTL definidos.

### 3.6. Email-verification (`email_verify:{token}`) — 🟡 PRONTO, NÃO LIGADO (fluxo real no MySQL)

- **Onde (contrato):** `src/lib/cache/email-verification.cache.ts`.
- **Chave/TTL do contrato:** `email_verify:{token} → userId`, `DEFAULT_TTL = 24 horas`
  (janela generosa: usuário pode confirmar no dia seguinte).
- **Status real:** confirmação de e-mail usa `device_verification_codes`
  (`purpose=EMAIL_VERIFY`, 10 min) via `signIn(reason=EMAIL_VERIFY)` → `issueCode` →
  `finishDeviceVerification` (que marca `emailVerified=true`). Nenhum
  `new EmailVerificationCache()` no `src/`.
- **Porquê Redis e não MySQL (quando aplicar):** token de verificação é o dado
  mais efêmero do sistema — 24h e some. Guardar no MySQL exige limpeza
  (linha morta para sempre se o usuário nunca clicar). `SETEX` resolve com zero
  manutenção. Mesma ressalva de coesão do §3.5.

### 3.7. OTP (`otp:{action}:{userId}`) — 🟡 PRONTO, NÃO LIGADO (2FA real no MySQL)

- **Onde (contrato):** `src/lib/cache/otp.cache.ts` — `set(action, userId, code)`,
  `get(action, userId)`, `invalidate(action, userId)`.
- **Chave/TTL do contrato:** `otp:{action}:{userId} → code`, `DEFAULT_TTL = 10 min`.
  O `{action}` namespacia (`2fa`, `delete_account`, `payment`...) para que um
  código de uma ação não valide outra — detalhe de segurança importante.
  "Deve ser invalidado após uso ou após exceder tentativas" (docstring).
- **Status real:** 2FA (`TWO_FACTOR`) e demais códigos usam `device_verification_codes`
  (MySQL). Nenhum `new OtpCache()` no `src/`.
- **Porquê Redis e não MySQL:** OTP é o caso mais extremo de efemeridade (10 min,
  single-use). `SETEX` + `DEL` no consumo; tentativas via `INCR` com teto. No
  MySQL cada OTP é uma linha + update por tentativa + lixo permanente. A escolha
  atual (MySQL) se justifica pela **auditoria unificada** (`attempts`, `used`,
  `fingerprint`, `purpose` numa tabela só) e pela reutilização do pipeline de
  e-mail/cooldown. Migração futura: manter a tabela como *log* e o Redis como
  *gate* (valida no Redis, registra no MySQL).

### 3.8. Rate-limit de negócio (`rl:{action}:{identifier}`) — 🟡 PRONTO, NÃO LIGADO

- **Onde (contrato):** `src/lib/cache/rate-limit.cache.ts` — `increment` (com
  `EXPIRE` só na primeira criação: `if (count === 1)`), `get`, `reset`.
- **Chave/TTL do contrato:** `rl:{action}:{identifier} → contador`, `DEFAULT_TTL = 15 min`.
  Exemplos de uso pretendido (docstring): tentativas de login, envio de e-mails,
  reenvio de OTP.
- **Status real:** limites de negócio hoje são implementados **na aplicação/MySQL**
  (`MAX_ATTEMPTS=5` em `device_verification_codes.attempts`, `RESEND_COOLDOWN_MS=60s`
  via `createdAt`, rate-limit HTTP via plugin). Nenhum `new RateLimitCache()` no `src/`.
- **Porquê Redis e não MySQL:** contador com janela deslizante é `INCR`+`EXPIRE` —
  no MySQL exigiria tabela de eventos + `COUNT(*) WHERE ts > janela` (leitura
  cara) ou contadores com reset por cron (complexidade operacional). O padrão
  `EXPIRE só no count==1` implementa janela fixa sem race (o primeiro incrementador
  arma o relógio). `reset` permite "perdão" administrativo (ex.: desbloquear
  usuário que errou o código 5x após contato com suporte).

### 3.9. Resumo Redis — o que está ligado vs. pronto

| Uso | Prefixo | TTL | Status | Fonte de verdade hoje |
|---|---|---|---|---|
| Rate-limit HTTP global | (interno do plugin) | `timeWindow` (1 min) | ✅ ativo | Redis |
| Roles | `roles:{userId}` | 5 min | ✅ ativo | MySQL, cache-aside |
| Permissions | `permissions:{userId}` | 5 min | ✅ ativo | MySQL, cache-aside |
| Sessões | `session:{id}` / `user_sessions:{userId}` | 7 d | 🟡 pronto | MySQL (`sessions`) |
| Password-reset | `pwd_reset:{token}` | 1 h | 🟡 pronto | MySQL (`device_verification_codes`) |
| Email-verify | `email_verify:{token}` | 24 h | 🟡 pronto | MySQL (`device_verification_codes`) |
| OTP | `otp:{action}:{userId}` | 10 min | 🟡 pronto | MySQL (`device_verification_codes`) |
| Rate-limit negócio | `rl:{action}:{identifier}` | 15 min | 🟡 pronto | App/MySQL (contadores) |
| Health | `PING` | — | ✅ ativo | `health.service` (`redis.ping()`, status `degraded` se Redis cair) |
| Stats plataforma | (memória local, **não** Redis) | 60 s | ⚠️ local | `PlatformService` (variável `cached` em memória — por-processo, não distribuído) |

> Armadilha conhecida: `PlatformService` usa cache **em memória do processo**
> (`let cached`, 60s), não Redis. Com múltiplas réplicas, cada uma tem seu
> `cached` — aceitável para stats (levemente stale por réplica), mas **não copiar
> esse padrão para dados de autorização ou sessão**.

---

## 4. Domínios e tabelas (TODAS — nomes reais do schema)

> Convenção de leitura: para cada tabela — **propósito (1-2 linhas)**, campos-chave,
> relações, índices/constraints. `→` = FK; `Cascade`/`SetNull`/restritivo conforme o schema.

### 4.1. Auth — identidade, sessão, RBAC

#### `users` (model `User`)
**Propósito:** identidade central; quase tudo no banco pendura aqui. Perfil público + flags de poder + economia embutida + presença.
**Campos-chave:**
- Identidade: `id` (cuid), `username @unique` (nullable — OAuth pode não ter),
  `fullName`, `email @unique`, `emailVerified`, `passwordHash` (nullable — OAuth),
  `provider` (default `"local"`), `providerId`, `avatarUrl`/`bannerUrl` (`LongText`),
  `birthDate` (**`String`**, `YYYY-MM-DD` — não `DateTime`; ver `signUp`: `toISOString().split('T')[0]`),
  `phone`, `city`, `state`, `bio` (`Text`), `profileVisibility` (default `"private"`),
  `isVerified`, `isPremium` + `premiumExpiresAt`.
- Economia embutida: `coins` (saldo derivado do ledger), `boosterMultiplier`
  (default `1.0`) + `boosterExpiresAt`.
- Estudo: `onboardingCompletedAt`, `lastStudyCourseSlug`, `lastStudyLessonId`, `lastStudyAt`
  ("continuar de onde parei").
- Poder legada: `role` (default `"user"`), `banned`, `banReason`, `banExpires`.
- Segurança: `twoFactorEnabled`.
- Presença: `presence` (default `"ONLINE"` — string livre, validada contra
  `PRESENCE_STATUSES` na aplicação), `presenceUpdatedAt`, `lastSeenAt`.
- Auditoria: `createdAt`, `updatedAt`, `lastLogin`.
**Relações:** ~40 coleções (ver schema linhas 53-106 — a maior fan-out do banco).
**Índices:** `@unique(email)`, `@unique(username)`. (Nota: sem índice composto
explícito além das unicidades — lookups por `id` usam a PK.)

#### `sessions` (model `Session`)
**Propósito:** sessão stateful — um token opaco por login/dispositivo.
**Campos:** `id`, `token @unique @map("session_token")` (base64url 32 bytes),
`userId`, `expiresAt` (7 dias), `ipAddress`, `userAgent`, `impersonatedBy`
(nullable — trilha de impersonação de suporte/admin), `createdAt`, `updatedAt`.
**Relações:** `user → Cascade`.
**Índices:** `@unique(token)`, `@@index([userId])`.

#### `accounts` (model `Account`)
**Propósito:** vínculos OAuth (Google/GitHub) + credencial local — padrão Better-Auth.
**Campos:** `userId`, `providerId @map("provider")`, `accountId @map("provider_account_id")`,
`password`, `accessToken`/`refreshToken` (`Text`), expirações, `scope`, `idToken` (`Text`).
**Relações:** `user → Cascade`.
**Constraints:** `@@unique([providerId, accountId])` (um vínculo externo = um usuário),
`@@index([userId])`.

#### `verification_tokens` (model `VerificationToken`, sem `id`)
**Propósito:** tabela padrão Better-Auth de tokens de verificação (link/token por `identifier`).
**Campos:** `identifier`, `token @unique`, `expires`.
**Constraints:** `@@unique([identifier, token])`. Sem PK surrogate, sem timestamps —
é tabela de protocolo, não de domínio.

#### `verifications` (model `verification` — nome minúsculo no schema, real)
**Propósito:** KV genérico de verificação do Better-Auth (`identifier → value` com expiração).
**Campos:** `id`, `identifier`, `value` (`Text`), `expiresAt`, `createdAt`, `updatedAt`.
**Nota:** coexistir `verification_tokens` + `verifications` é herança do Better-Auth
(duas gerações do mecanismo). Não remover nenhuma sem ler o adapter do Better-Auth.

#### `roles` / `user_roles` / `permissions` / `role_permissions`
**Propósito:** RBAC completo (ver §2.8).
- `roles`: `id`, `name @unique`, `description`, timestamps.
- `user_roles`: `userId`, `roleId`, `assignedAt`, `assignedBy` (nullable — quem concedeu);
  `@@unique([userId, roleId])`.
- `permissions`: `id`, `name @unique`, `resource`, `action`, `description`, timestamps.
- `role_permissions`: `roleId`, `permissionId`, `assignedAt`;
  `@@unique([roleId, permissionId])`.
**Relações:** todas `Cascade` nos dois lados (papel deletado solta os vínculos; usuário
deletado limpa os seus).

### 4.2. Segurança — dispositivos, códigos, admin, presença

#### `trusted_devices` (model `TrustedDevice`)
**Propósito:** dispositivos conhecidos por usuário (anti-sequestro: login de fingerprint
nova exige código por e-mail).
**Campos:** `userId`, `fingerprint` (sha256 `userAgent|ip`, 64 hex — `fingerprintDevice`),
`name` (ex.: `"Chrome em Windows · 1.2.3.4"`), `ipAddress`, `userAgent` (`Text`),
`lastSeenAt`, `revokedAt` (soft — ver §2.3), `createdAt`.
**Constraints:** `@@unique([userId, fingerprint])` (o par *é* a identidade do dispositivo),
`@@index([userId])`.

#### `device_verification_codes` (model `DeviceVerificationCode`)
**Propósito:** **a** máquina de códigos de 6 dígitos (DEVICE, TWO_FACTOR, EMAIL_VERIFY,
PASSWORD_RESET) — fonte de verdade atual de todos os fluxos (§2.6).
**Campos:** `userId`, `fingerprint` (nullable — reset de senha não tem dispositivo),
`purpose` (`String` default `"DEVICE"` — **não** é enum; extensível sem migration),
`code` (6 dígitos, texto — preserva zero à esquerda), `attempts` (default 0, teto 5),
`used`, `expiresAt` (10 min), `createdAt`.
**Relações:** `user → Cascade`. `@@index([userId])`.
**Nota de design:** `purpose` como `String` em vez de enum é intencional — adicionar
`purpose=DELETE_ACCOUNT` não exige `ALTER TYPE` (MySQL emula enum via check/table,
migração mais barulhenta).

#### `admin_sessions` (model `AdminSession`)
**Propósito:** sessão **separada** do painel de moderação (`painel.hexavante.com.br :3002`).
**Campos:** `userId`, `token @unique`, `expiresAt` (**30 dias deslizantes** — renovado
a cada uso no projeto admin), `createdAt`.
**Relações:** `user → Cascade`. Índices em `token` e `userId`.
**Porquê sessão separada:** o painel é projeto/repo/origin distintos (`Hexavante-admin`,
`/opt/hexavante-admin`) com cookie próprio (`hx_admin_session`). Reutilizar a sessão
do app daria ao XSS do app acesso ao painel — separação de privilégio por cookie e
por tabela. Comprometer `sessions` não compromete `admin_sessions`.

#### `admin_verification_codes` (model `AdminVerificationCode`)
**Propósito:** 2FA do painel — código de 6 dígitos por e-mail a cada login admin.
**Campos:** `userId`, `code`, `email` (snapshot do destino — detecta troca de e-mail
entre emissão e consumo), `expiresAt`, `used`, `createdAt`.
**Relações:** `user → Cascade`. `@@index([userId, code])`.

#### Presença (colunas em `users`, sem tabela própria)
**Propósito:** status online (`ONLINE/AWAY/STUDYING/DND/INVISIBLE`) + `lastSeenAt`.
`SecurityService.effectivePresence`: `INVISIBLE` sempre vira `OFFLINE` para terceiros;
sem `lastSeenAt` recente (>5 min, `OFFLINE_AFTER_MS`) vira `OFFLINE` independente do flag.
**Porquê colunas e não tabela/Redis:** presença é lida junto do perfil em quase toda
query social — join/lookup extra por card de usuário seria desperdício; e `heartbeat`
é um `UPDATE` barato. Redis seria mais "correto" em escala, mas o volume atual não
justifica a segunda fonte de verdade.

### 4.3. Conteúdo — catálogo, cursos, progresso

#### `categories` (model `Category`)
**Propósito:** taxonomia de cursos **e** tutoriais (compartilhada).
**Campos:** `id`, `name @unique`, `description`, `isApproved` (default true —
sugestões de usuário entram pendentes), `suggestedById` (nullable, sem FK —
propositalmente desacoplado para não impedir delete do sugeridor).
**Relações:** `courses[]`, `tutorials[]`.

#### `courses` (model `Course`)
**Propósito:** curso — unidade vendável/certificável, com workflow de moderação.
**Campos:** `categoryId`, `title`, `slug @unique`, `shortDescription` (255),
`description` (`Text`), `thumbnailUrl`, `coverImage`, `courseType`
(`FREE/PAID/PREMIUM`), `level` (`BEGINNER/INTERMEDIATE/ADVANCED`),
`estimatedHours`, `progressionType` (`FREE` — pular livre / `PROGRESSIVE` —
sequencial), `status` (`PENDING_REVIEW/APPROVED/REJECTED/REVISION_REQUIRED`,
default `PENDING_REVIEW`), `isPublished` (default false — **duplo gate**:
`status=APPROVED` **e** `isPublished=true` para listar), timestamps.
**Relações:** `category` (restritivo — ver §2.4), `instructors`, `modules`,
`enrollments`, `courseTags`, `moderations`, `certificates`, `liveRooms`.
**Índices:** `@@index([categoryId])`, `@@index([status])` (a listagem pública
filtra por `status=APPROVED` — índice obrigatório).

#### `course_instructors` (model `CourseInstructor`)
**Propósito:** N:N curso↔instrutor (coautoria).
**Constraints:** `@@unique([courseId, userId])`, `@@index([userId])`. Ambos `Cascade`.

#### `instructor_applications` (model `InstructorApplication`)
**Propósito:** candidatura a instrutor com revisão humana.
**Campos:** `userId`, `motivation`/`experience` (`Text`), `portfolioUrl`,
`status` (`PENDING/APPROVED/REJECTED`), `reviewedBy @map("reviewed_by")`
(FK nullable → `User`), `reviewNotes`, `createdAt`, `reviewedAt`.
**Índices:** `[userId]`, `[status]` (fila de moderação).

#### `course_moderations` (model `CourseModeration`)
**Propósito:** **histórico** de decisões de moderação por curso (não só o estado atual).
**Campos:** `courseId`, `moderatorId`, `status` (snapshot da decisão),
`reviewNotes`, `reviewedAt`.
**Relações:** `course → Cascade`; `moderator` restritivo (não se apaga quem decidiu
sem tratar o histórico). `@@index([courseId])`.

#### `modules` (model `Module`)
**Propósito:** módulo dentro do curso (unidade de ordem).
**Campos:** `courseId`, `title`, `description`, `orderNumber`.
**Relações:** `course → Cascade`; `lessons[]`, `materials[]`. `@@index([courseId])`.

#### `lessons` (model `Lesson`)
**Propósito:** aula (vídeo + ordem).
**Campos:** `moduleId`, `title`, `description`, `videoUrl`, `videoProvider`
(`youtube/vimeo/other` — enum minúsculo, real), `duration` (segundos, nullable),
`orderNumber`. **Sem** `isPublished` próprio — visibilidade herdada do curso.
**Relações:** `module → Cascade`; `progresses[]`, `favorites[]`, `notes[]`.

#### `lesson_favorites` / `lesson_notes`
**Propósito:** favoritos (toggle) e anotações (1 por usuário/aula — `content` `Text`).
**Constraints:** ambas `@@unique([userId, lessonId])` (a unicidade *é* a regra:
sem ela, "favoritar 2x" ou "2 notas" seriam possíveis). `@@index([userId])`.
`LessonNote` tem só `updatedAt` (sem `createdAt` — a criação é irrelevante, só a
última edição importa).

#### `materials` (model `Material`)
**Propósito:** arquivo anexo do módulo (PDF etc.).
**Campos:** `moduleId`, `title`, `fileUrl`, `fileType` (default `"pdf"` — string
livre, não enum: formatos novos sem migration). `@@index([moduleId])`.

#### `course_enrollments` (model `CourseEnrollment`)
**Propósito:** matrícula — vínculo + progresso agregado + conclusão.
**Campos:** `userId`, `courseId`, `progress` (`Float` 0-100), `enrolledAt`,
`completedAt` (nullable — `NOT NULL` = concluído; alimenta `SocialActivity COURSE_COMPLETED`
e `Certificate`).
**Constraints:** `@@unique([userId, courseId])` (rematrícula é impossível por construção).

#### `lesson_progress` (model `LessonProgress` — tabela singular, real)
**Propósito:** conclusão por aula, amarrada à matrícula.
**Campos:** `userId`, `lessonId`, `enrollmentId`, `completed`, `completedAt`.
**Constraints:** `@@unique([userId, lessonId])`; `@@index([enrollmentId])`
(nome de índice explícito `lesson_progress_enrollment_id_idx`).
**Porquê `enrollmentId` redundante com `(userId, lessonId)`:** permite recalcular
`progress` da matrícula com um `COUNT WHERE enrollment_id` sem join em lessons→modules→courses.

### 4.4. Simulados — exams, questions, attempts

#### `exams` (model `Exam`)
**Propósito:** simulado (ENEM/vestibular/tecnologia) com gate premium.
**Campos:** `title`, `slug @unique`, `examType` (`ENEM/VESTIBULAR/TECNOLOGIA`),
`description`, `coverImage` (500), `timeLimit` (min, nullable = sem limite),
`isPublished` (default **true** — inverso dos cursos!), `isPremiumOnly`,
`createdAt` (**sem** `updatedAt` — simulado é versionado por questões, não por edição do cabeçalho).

#### `exam_questions` (model `ExamQuestion`)
**Propósito:** questão (múltipla escolha **ou** discursiva).
**Campos:** `examId`, `statement` (`Text`), imagem (`imageUrl`, `imageWidth`,
`imageHeight`, `imageDisplaySize SMALL/MEDIUM/LARGE/FULL` default `MEDIUM`),
`orderNumber`, `points` (default 1 — peso no score), `type`
(`MULTIPLE_CHOICE/ESSAY` default MC), `expectedAnswer` (gabarito discursivo),
`subject` (120 — alimenta `getSubjectStats`), `explanation`, `difficulty`
(default 2 — escala da aplicação, 1-5 por convenção).
**Índice:** `[examId]`.

#### `exam_alternatives` (model `ExamAlternative`)
**Propósito:** alternativa (texto + `isCorrect`).
**Nota:** sem `@@unique([questionId, ...])` — múltiplas corretas são possíveis
em dados legados; a correção (`submitExam`) considera correta a **primeira**
`isCorrect` encontrada. `@@index([questionId])`.

#### `exam_attempts` (model `ExamAttempt`)
**Propósito:** tentativa — do `startExam` (cria/abre `finishedAt=NULL`) ao
`submitExam` (fecha + premia).
**Campos:** `examId`, `userId`, `score` (0-100 normalizado), `correctAnswers`,
`totalQuestions`, `startedAt`, `finishedAt` (nullable = em andamento),
`dailyAttemptIndex` + `dailyRewardMultiplier` (anti-farm — ver §5.3),
`studyMode` (`String` default `"FULL"` — não enum, extensível).
**Índices:** `[userId]`, `[examId]`, `[userId, finishedAt]` (histórico por usuário —
a query mais quente do domínio).

#### `exam_answers` (model `ExamAnswer`)
**Propósito:** resposta por questão (MC via `alternativeId` nullable + discursiva
via `essayAnswer`/`essayStatus PENDING/CORRECT/PARTIAL/INCORRECT`/`essayComment`).
**Constraints:** `@@unique([attemptId, questionId])` (uma resposta por questão
por tentativa — reenvio atualiza, não duplica). `alternativeId → Cascade` (ver §2.4).

#### `exam_question_favorites` (model `ExamQuestionFavorite`)
**Propósito:** "questões para revisar" (lista de revisão do aluno).
`@@unique([userId, questionId])`, `@@index([userId])`.

### 4.5. Gamificação — XP, ranking, conquistas

#### `user_xp` (model `UserXP`)
**Propósito:** saldo de XP + nível + liga (cache materializado do ledger).
**Campos:** `userId @unique`, `level` (default 1), `currentXp` (progresso no nível),
`totalXp` (acumulado vitalício), `league` (`BRONZE/SILVER/GOLD` default `BRONZE`).
**Fórmula de level-up** (`exam.service.ts:448-453`): threshold `level * 100`
(custo crescente: 100 → 200 → 300...). `@@index([league])` (filtros de ranking).

#### `xp_transactions` (model `XpTransaction`)
**Propósito:** ledger de XP (ver §2.5). `userId`, `amount`, `source`
(`LESSON/MODULE/COURSE/EXAM/ADMIN`), `sourceId`, `description`, `createdAt`.
`@@unique([userId, source, sourceId])` — idempotência no banco.

#### `ranking_seasons` (model `RankingSeason`)
**Propósito:** temporada mensal. PK natural `seasonKey VARCHAR(7)` (`YYYY-MM`),
`startsAt`, `endsAt`, `processedAt` (nullable — `NULL` = ainda não apurada;
permite reprocessamento: apurar = preencher, nunca deletar).

#### `ranking_season_results` (model `RankingSeasonResult`)
**Propósito:** fotografia do usuário na temporada (rank final, promoção/rebaixamento,
recompensa e resgate).
**Campos:** `userId`, `seasonKey`, `league`, `seasonXp`, `finalRank`,
`promoted`/`demoted`, `rewardCoins`, `rewardClaimedAt` (nullable — recompensa
não resgatada), `createdAt`.
**Constraints:** `@@unique([userId, seasonKey])`, índices `[userId]`, `[seasonKey, league]`.

#### `user_achievements` (model `UserAchievement`)
**Propósito:** conquistas desbloqueadas (catálogo de `achievementKey` vive na aplicação).
`@@unique([userId, achievementKey])` — desduplicação no banco.

### 4.6. Loja e moedas

#### `user_wallets` (model `UserWallet`)
**Propósito:** carteira 1:1 (`userId @unique`, `coins`). Ver nota §2.5 — o fluxo
quente usa `User.coins`; o wallet é cobertura para o web. **Não consolidar sem
leitura bilateral.**

#### `store_items` (model `StoreItem`)
**Propósito:** catálogo da loja (cosméticos, boosters, passes, pets...).
**Campos:** `slug @unique`, `name`, `description` (`Text`), `cost`, `category`
(13 valores: `TITLE AVATAR_BORDER THEME COSMETIC BOOSTER PASS REVIEW_PACK PET
PET_COSMETIC BADGE FRAME EMOJI_PACK PROFILE_BACKGROUND`), `imageUrl`,
`isPremiumOnly`, `isPermanent` (default true — `false` = expira em 30 dias),
`metadata` (`Json` — efeitos: `multiplier`, `durationHours/Days`, `passType`,
`examSlug`), `isActive`, `createdAt`.
**Índice:** `[category]` (vitrine por categoria). `metadata Json` = extensibilidade
sem migration (item novo com efeito novo não exige DDL).

#### `user_inventory` (model `UserInventory`)
**Propósito:** posse (o que comprei) + equipamento (o que uso).
**Campos:** `userId`, `storeItemId`, `isEquipped`, `expiresAt` (nullable =
permanente), `purchasedAt`.
**Constraints:** `@@unique([userId, storeItemId])` (recompra de permanente é
bloqueada na aplicação; temporário **renova** via update do `expiresAt` —
`purchaseItem` linhas 152-159), índices `[userId]`, `[storeItemId]`.
**Regra de equipamento** (`equipItem`): toggle por categoria (equipar desequipa
os da mesma categoria em transação); `BOOSTER/PASS/REVIEW_PACK` **não equipáveis**
(são consumíveis de efeito).

#### `coin_transactions` (model `CoinTransaction`)
**Propósito:** ledger de moedas (ver §2.5). `userId`, `amount`, `type`
(`EARN/SPEND`), `source` (`EXAM_CORRECT/SHOP_PURCHASE/LESSON/MODULE/COURSE/
PREMIUM_GRANT/LEAGUE_REWARD/ADMIN`), `sourceId`, `description`, `createdAt`.
`@@unique([userId, source, sourceId])`, índices `[userId]`, `[createdAt]`.

### 4.7. Certificados

#### `certificates` (model `Certificate`)
**Propósito:** certificado por conclusão de curso (código público verificável).
**Campos:** `userId`, `courseId`, `code @unique` (verificação pública sem expor IDs),
`issuedAt`, `verifiedAt` (nullable — primeira checagem pública carimba).
**Constraints:** `@@unique([userId, courseId])` (um certificado por par —
reemissão = reuso, não duplicata), índices `[userId]`, `[courseId]`, `[code]`.

### 4.8. Tutoriais e tags

#### `tutorials` (model `Tutorial`)
**Propósito:** tutorial avulso (conteúdo livre de autor, fora da trilha curso→módulo→aula).
**Campos:** `authorId → Cascade`, `categoryId` nullable restritivo,
`title`, `slug @unique`, `description`, `videoUrl`, `thumbnailUrl`, `duration`,
`isPublished` (default false), `viewCount` (default 0 — contador simples, sem
ledger: views não são dinheiro), timestamps. Índices `[authorId]`, `[categoryId]`.

#### `tags` / `course_tags` / `tutorial_tags`
**Propósito:** vocabulário N:N compartilhado entre cursos e tutoriais.
`tags.name @unique`. Junções com `@@id` composta + `Cascade` bilateral.
`tutorials_tags` tem ainda `@@unique([tutorialId, tagId])` redundante com a PK
(herança de migration — inofensivo, documentado para ninguém "limpar" sem
`migrate diff`).

### 4.9. Salas ao vivo

#### `live_rooms` (model `LiveRoom`)
**Propósito:** sala agendada/ao vivo/encerrada, opcionalmente vinculada a curso.
**Campos:** `instructorId → Cascade`, `courseId` nullable `SetNull`,
`title`, `description`, `videoUrl`, `videoProvider` (**`String`**, não enum —
diferente de `Lesson.videoProvider`; provedores de live variam mais),
`scheduledAt`, `startedAt`, `endedAt`, `status` (`SCHEDULED/LIVE/ENDED/CANCELLED`),
`maxParticipants`, timestamps.
**Índices:** `[instructorId]`, `[courseId]`, `[status]`, `[scheduledAt]`
(agenda = query por status+data).

#### `live_room_participants` (model `LiveRoomParticipant`)
**Propósito:** presença (join/leave). `roomId`, `userId`, `joinedAt`,
`leftAt` (nullable = dentro agora). `@@unique([roomId, userId])` (rejoin =
update do `leftAt`, não nova linha — decisão de modelagem: simplifica "quem está
na sala" para `WHERE left_at IS NULL`).

#### `live_chat_messages` (model `LiveChatMessage`)
**Propósito:** chat da live (apêndice — sem edição/delete semântico, só `Cascade`).
`roomId`, `userId`, `message` (`Text`), `createdAt`.
Índices `[roomId]`, `[userId]`, `[createdAt]` (scroll por tempo).

### 4.10. Conversas e mensagens diretas

#### `direct_conversations` (model `DirectConversation`)
**Propósito:** conversa 1:1 canônica entre dois usuários.
**Campos:** `participantAId`, `participantBId`, `lastMessageAt` (nullable —
atualizado a cada mensagem; ordena a inbox sem join), `createdAt`.
**Constraints:** `@@unique([participantAId, participantBId])` — **atenção:**
a unicidade é ordenada (A,B ≠ B,A na chave). A aplicação deve normalizar
(menor id = A) ou a mesma dupla gera 2 conversas. Índices `[A, lastMessageAt]`,
`[B, lastMessageAt]` (inbox de cada lado).
**Relações:** ambas `Cascade` (deletar usuário apaga suas conversas).

#### `direct_messages` (model `DirectMessage`)
**Propósito:** mensagem (corpo 2000 chars + `readAt` para "lido").
`conversationId`, `senderId`, `body @db.VarChar(2000)`, `createdAt`, `readAt`.
Índices `[conversationId, createdAt]` (paginação do thread), `[senderId]`.

### 4.11. Social — follows, feed, interações, denúncias

#### `user_follows` (model `UserFollow`)
**Propósito:** seguir. `followerId`, `followingId`, `createdAt`.
`@@unique([followerId, followingId])` (seguir 2x é impossível no banco, não só na UI).
Relações nomeadas `UserFollowers`/`UserFollowing`, ambas `Cascade`.

#### `social_activities` (model `SocialActivity`)
**Propósito:** feed (conquistas, conclusões, discussões).
**Campos:** `userId`, `type` (`COURSE_COMPLETED/SIMULADO_PASSED/LEVEL_UP/
ACHIEVEMENT/STREAK/DISCUSSION`), `sourceKey` (nullable — idempotência:
`@@unique([userId, sourceKey])` impede publicar "concluí curso X" 2x),
`metadata` (`Json` — payload do card), `tags` (`Json` nullable),
`acceptedCommentId`, `isPinned` + `pinnedAt` + `pinnedById → SetNull`
(fixar/desfixar sem apagar), `createdAt`.
**Índices:** `[userId, createdAt]` (perfil), `[createdAt]` (feed global),
`[type, createdAt]` (feed por tipo), `[isPinned, pinnedAt]` (fixados).

#### `activity_likes` / `activity_reactions` / `activity_comments` / `activity_comment_likes`
**Propósito:** interações (like simples; reação tipada `CLAP/FIRE/IDEA`;
comentário 500 chars com `isAccepted` — resposta marcada como solução;
like de comentário).
**Constraints (o banco impõe a regra social):**
`@@unique([activityId, userId])` (1 like), `@@unique([activityId, userId, type])`
(1 de cada reação — pode aplaudir E achar genial, mas não aplaudir 2x),
`@@unique([commentId, userId])` (1 like por comentário). Tudo `Cascade`.

#### `community_reports` (model `CommunityReport`)
**Propósito:** denúncia com workflow (`SPAM/HARASSMENT/INAPPROPRIATE/
MISINFORMATION/OTHER` × `PENDING/REVIEWED/DISMISSED`).
`activityId`, `reporterId`, `reason`, `details` (500), `status`, `createdAt`.
`@@unique([activityId, reporterId])` (1 denúncia por repórter — sem brigading
via repetição), índices `[status, createdAt]` (fila), `[activityId]`.

### 4.12. Notificações e push

#### `notifications` (model `Notification`)
**Propósito:** inbox de notificações (14 tipos: `XP_EARNED COIN_EARNED LEVEL_UP
COURSE_APPROVED COURSE_REJECTED COURSE_UPDATED INSTRUCTOR_APPROVED
INSTRUCTOR_REJECTED CERTIFICATE_ISSUED SYSTEM_ANNOUNCEMENT MODERATION_ACTION
NEW_MESSAGE COMMUNITY_REPLY SOLUTION_ACCEPTED`).
**Campos:** `userId`, `type`, `title`, `message` (`Text`), `link` (deep-link
nullable), `readAt` (nullable = não lida), `createdAt`.
**Índices:** `[userId, readAt]` (badge de não-lidas), `[userId, createdAt]` (lista).

#### `user_notification_settings` (model `UserNotificationSettings`)
**Propósito:** preferências 1:1 (PK = `userId`): `learningProgress`,
`certificates`, `courseUpdates`, `messages`, `community`, `moderation`,
`coinsAndRewards`, `rankingSeason`, `systemAnnouncements` (todos default true),
`updatedAt`. Linha criada sob demanda (ausência = tudo ligado).

#### `push_tokens` (model `PushToken`)
**Propósito:** token Expo por dispositivo (migration `20260926_add_push_tokens` —
a mais recente do web).
**Campos:** `userId`, `expoToken @unique`, `deviceName`, timestamps.
`Cascade` no usuário.

### 4.13. Moderação, auditoria, plataforma

#### `user_bans` / `user_mutes` / `user_warnings`
**Propósito:** punições com histórico (ver §2.3). Ban/mute: `userId`,
`moderatorId`, `reason` (`Text`), `expiresAt` (nullable = permanente),
`liftedAt` + `liftedById`, `isActive`, `createdAt`; índices `[userId, isActive]`
(cheque "está punido agora" é O(1)), `[createdAt]`. Warning: sem expiração/lift
(advertência é para sempre).

#### `moderation_logs` (model `ModerationLog`)
**Propósito:** trilha imutável de ações de moderação (22 `ModerationLogType`:
`XP_ADD/REMOVE/SET`, `LEVEL_SET`, `COIN_*`, `ROLE_*`, `BAN/UNBAN`, `MUTE/UNMUTE`,
`WARN`, `BROADCAST`, `MAINTENANCE`, `GLOBAL_BOOSTER`, `COURSE_PUBLISH/UNPUBLISH`,
`EXAM_RESET`, `PASSWORD_RESET`, `IMPERSONATE`, `DELETE_USER`, `DELETE_PROFILE`, `OTHER`).
**Campos:** `moderatorId → Cascade`, `targetUserId → SetNull`, `action`,
`description` (`Text`), `metadata` (`Json`), `createdAt`.
**Índices:** `[moderatorId]`, `[targetUserId]`, `[action]`, `[createdAt]`
(auditoria por ator, alvo, tipo e tempo).
**Nota:** migration `20260908_add_delete_user_profile_log_types` adicionou os
tipos de delete — apagar usuário *é* evento auditável de primeira classe.

#### `platform_settings` (model `PlatformSetting`)
**Propósito:** KV de configuração (`key` = PK `String`, `value` `Json`,
`updatedAt`, `updatedById` nullable sem FK). Ex.: manutenção, booster global,
anúncios. Sem `createdAt` — setting nasce e é atualizado, nunca "criado 2x".

#### `content_policy_violations` (model `ContentPolicyViolation`)
**Propósito:** log de matches do filtro de conteúdo (automático, não denúncia humana).
`userId → SetNull`, `context` (40), `field` (80), `preview` (200 — amostra,
nunca o conteúdo integral), `matchedTerm` (80), `identifier` (120 nullable),
`createdAt`. Índices `[userId]`, `[createdAt]`.

---

## 5. Fluxos de dados chave (passo a passo, com tabelas e código reais)

### 5.1. Cadastro → login → sessão

1. **Cadastro** (`AuthService.signUp`):
   `findFirst({ email OU username })` → `409` se existir → `hashPassword`
   (bcryptjs) → `role USER` (lookup por `name='USER'`) → `user.create` com
   `roles.create`, `xp.create({})`, `wallet.create({})` aninhados (1 round-trip
   cria usuário+papel+xp+carteira) → concede itens gratuitos (`storeItem WHERE
   cost=0` → `userInventory.createMany skipDuplicates`) → `ensureActiveTheme`
   (equipa `theme-hexavante` se nenhum THEME ativo — idempotente via `upsert`).
   `birthDate` gravada como string `YYYY-MM-DD`; idade mínima 13 (`assertMinimumAge`).
2. **Login** (`AuthService.signIn`):
   `user.findUnique({ email })` + `verifyPassword` → `fingerprintDevice(UA, IP)` →
   `isDeviceTrusted` (`trusted_devices` por `[userId, fingerprint]`, `revokedAt NULL`).
   Decisão em cascata: `!emailVerified` → `EMAIL_VERIFY`; senão dispositivo novo
   (e `SKIP_DEVICE_VERIFICATION != 'true'`) → `DEVICE`; senão `twoFactorEnabled` →
   `TWO_FACTOR`; senão login direto. Qualquer exigência → `issueCode` (cria linha
   em `device_verification_codes`, envia e-mail) e retorna
   `{ requiresVerification: true, verificationId, reason }` — **sem** criar sessão.
3. **Verificação** (`SecurityService.finishDeviceVerification`):
   `consumeCode` (checa `used`, expiração, `attempts<5`, compara; erro incrementa
   `attempts`; acerto marca `used=true`) → `trustDevice` (upsert em
   `trusted_devices`) → `emailVerified=true` (prova de posse do e-mail) →
   `createSession` → `{ user, session: { token, expiresAt } }`.
   OAuth (`oauth.routes`, Better-Auth) **confia no dispositivo** (Google/GitHub já
   verificaram o e-mail) — pula o código.
4. **Sessão** (`lib/session.ts`): cookie `__Secure-hexavante.session_token`
   → `validateSession` (`sessions.findUnique({ token })` + expiração com autodelete)
   → `request.auth` nos middlewares (`authenticate.ts`, `optionalAuth.ts`,
   plugin `auth.ts`). Logout: `deleteSession(token)`; reset de senha e
   `deleteSessionsByUserId`: `deleteMany`.
5. **Presença:** `touchDevice`/`heartbeat` atualizam `trusted_devices.lastSeenAt`
   + `user.lastSeenAt`; `setPresence` valida contra `PRESENCE_STATUSES`.

Tabelas: `users`, `accounts`, `sessions`, `trusted_devices`,
`device_verification_codes`, `user_roles`, `roles`, `user_xp`, `user_wallets`,
`store_items`, `user_inventory`.

### 5.2. Compra na loja (`ShopService.purchaseItem`)

1. Lê `user(coins, isPremium)` + `storeItem` (ativo?) → gate `isPremiumOnly` →
   checa `userInventory[userId, storeItemId]` (permanente já possuído = `400`) →
   saldo suficiente?
2. **Transação atômica** (`prisma.$transaction`): `user.coins decrement` +
   `coinTransaction.create(SPEND/SHOP_PURCHASE/sourceId=item.id)` + `userInventory`
   (create, ou update de `expiresAt` +30d se temporário recomprado).
   Atomicidade aqui é inegociável: sem transação, crash entre debitar e entregar =
   moeda destruída (ou duplicada no retry).
3. **Efeitos pós-compra** (fora da transação, idempotentes por natureza):
   `BOOSTER` → `user(boosterMultiplier, boosterExpiresAt)`; `PASS premium_exams` →
   estende `isPremium/premiumExpiresAt` a partir do max(now, expiração atual).
4. **Equipamento** (`equipItem`): transação que desequipa mesma categoria +
   toggla o item; consumíveis (`BOOSTER/PASS/REVIEW_PACK`) recusados; expirado recusado.
5. Leitura (`getShopState`): itens ativos + inventário + últimas 20 `coin_transactions`
   + expiração preguiçosa de booster vencido (limpa no read — sem cron).

Tabelas: `users`, `store_items`, `user_inventory`, `coin_transactions`.

### 5.3. Submit de simulado com earn (`ExamService.submitExam`)

1. `startExam`: resolve por id **ou** slug, gate premium (`isPremiumOnly` →
   `isPremium` válido **ou** `PASS early_exam` no inventário), reutiliza tentativa
   aberta (`finishedAt NULL`) ou cria; devolve questões **sem** `isCorrect`
   (alternativas só `{ id, text }` — o gabarito nunca desce ao cliente).
2. `submitExam`: valida posse (`attempt.userId`) e `!finishedAt` (duplo submit =
   `403`) → corrige MC por `isCorrect`, ignora discursiva no score →
   `examAnswer.createMany` → `score` normalizado 0-100.
3. **Anti-farm diário** (fuso `America/Sao_Paulo` via `getSaoPauloDayBounds`):
   conta finalizadas de hoje → `dailyAttemptIndex` → multiplicador `[1, 0.35, 0.12, 0.05]`
   (1ª vale cheia, 2ª 35%...) × booster do usuário (`getBoosterMultiplier`,
   respeita `boosterExpiresAt`) com piso `max(1, round(...))` para base > 0.
4. **Ledger idempotente**: 3 chaves — base `(EXAM, attempt.id)`, bônus de aprovação
   `(EXAM, attempt.id-pass)` se `score>=70`, moedas `(EXAM_CORRECT, attempt.id)` =
   `correctAnswers × 5/d Corrigido pelo multiplicador`. Cada uma com `findUnique`
   prévio (não duplica no retry) + `@@unique` no banco (não duplica na race).
   Moedas incrementam `user.coins`; XP alimenta `user_xp` com level-up
   (`level*100`), criando a linha se ausente.
5. Fecha a tentativa (`score`, `correctAnswers`, `totalQuestions`, `finishedAt`,
   `dailyAttemptIndex`, `dailyRewardMultiplier`) e retorna `{ score, xpAwarded,
   coinsAwarded, dailyMultiplier }`.

Tabelas: `exams`, `exam_questions`, `exam_alternatives`, `exam_attempts`,
`exam_answers`, `users`, `user_inventory`, `store_items`, `xp_transactions`,
`coin_transactions`, `user_xp`.

### 5.4. Verificação de dispositivo novo

Ver §5.1 passos 2-3. Detalhes operacionais: `issueCode` **não** invalida códigos
anteriores (comentário no código — evita loop de reenvio); `resendCode` exige
cooldown 60s desde `createdAt` (`429` com segundos restantes); `consumeCode`
bloqueia após 5 erros (`used=true` + `429`); `revokeDevice` marca `revokedAt` e
derruba `sessions` do mesmo `(ipAddress, userAgent)`; `currentRevoked` avisa se o
usuário matou o próprio dispositivo atual (a UI deve deslogar graciosamente).

Tabelas: `trusted_devices`, `device_verification_codes`, `sessions`, `users`.

### 5.5. Recuperação de senha

1. `requestPasswordReset(email)`: lookup por e-mail normalizado
   (`trim().toLowerCase()`); **anti-enumeração**: e-mail inexistente retorna
   `{ verificationId: null }` com o mesmo formato (o atacante não distingue
   "e-mail cadastrado" de "não cadastrado" pela resposta).
2. `issueCode(purpose=PASSWORD_RESET)` (sem fingerprint) → e-mail com código 10 min.
3. `resetPassword(verificationId, code, newPassword)`: `consumeCode` + checa
   `purpose === 'PASSWORD_RESET'` (código de dispositivo **não** reseta senha —
   separação de poderes entre purposes) → `hashPassword` → `user.update` →
   **`session.deleteMany({ userId })`** (todas as sessões morrem — quem resetou
   expulsa inclusive o atacante com sessão ativa; o legítimo loga de novo).
4. Ação registrada como `ModerationLogType.PASSWORD_RESET` quando via suporte.

Tabelas: `users`, `device_verification_codes`, `sessions` (+ `moderation_logs`
quando administrativo). Contrato Redis correspondente (`pwd_reset:{token}`, 1h):
pronto, não ligado — ver §3.5.

---

## 6. Regras operacionais (deploy, evolução, emergência)

### 6.1. NUNCA `--accept-data-loss` (e o que fazer em vez disso)

`prisma db push --accept-data-loss` (ou qualquer variação que derrube
tabela/coluna) é **proibido em qualquer ambiente com dados reais** — incluindo
staging com dump de produção. O `db push` sem a flag **recusa** mudanças
destrutivas; a flag transforma a recusa em execução silenciosa. Com **dois
clientes** (web+API) no mesmo banco, uma perda "pequena" num lado é corrupção no outro.

Quando o `db push` reclamar de data loss, o caminho correto é sempre um destes:

1. **Renomear sem perder:** adicionar a nova coluna nullable → backfill (§6.3) →
   deploy com leitura dual → remover a antiga numa migration do web posterior.
2. **Tipo incompatível:** criar coluna nova + migrar em lote + trocar leitura.
3. **Dúvida:** `migrate diff` (§6.2) para ver o SQL exato antes de qualquer coisa.

### 6.2. `migrate diff` — diagnóstico somente-leitura

Comando canônico para investigar drift entre banco e schema (não toca em nada):

```bash
prisma migrate diff \
  --from-url "mysql://user:pass@host:3306/hexavante" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Lê o DDL vivo e o schema local e imprime o SQL de convergência. Uso:

- Antes de todo deploy da API (o `db push` do boot deveria ser no-op se os
  schemas estão idênticos — se o diff mostra algo, **alguém mudou um lado sem o outro**).
- Para auditar "o web aplicou a migration X, a API já cobre?".
- Saída vazia = schemas convergentes = deploy seguro.

### 6.3. Backfill idempotente (padrão obrigatório)

Toda coluna nova que precisa de valor em linhas antigas segue o ritual:

1. Migration do web adiciona **nullable ou com default** (nunca `NOT NULL` sem
   default em tabela populada — travaria `users`/`exam_attempts` cheias).
2. Script de backfill com `updateMany({ where: { novaColuna: null } })` em **lotes**
   (`take: 1000`, loop até `count === 0`), logando progresso. Re-rodável por
   construção: a cláusula `where null` pula o já preenchido.
3. Só então (migration seguinte, se desejado) Apertar para `NOT NULL`.
4. Exemplo real já aplicado no código: `ensureActiveTheme` (tema padrão via
   `upsert` — rodar 2x não duplica) e os itens gratuitos do `signUp`
   (`createMany skipDuplicates`).

### 6.4. Como adicionar um model novo (ordem exata — desviar quebra o deploy)

1. **Editar os DOIS `schema.prisma`** (`Hexavante/` e `Hexavante-api/`) com
   model, campos, `@map`s, `@@map`, índices e relations idênticos. Gerar o client
   nos dois (`prisma generate`).
2. **Criar a migration no web**: `prisma migrate dev --name add_<tabela>` no repo
   `Hexavante`. Revisar o SQL (tipos, defaults, FKs com `onDelete` correto).
3. **Aplicar no banco de staging**, rodar `migrate diff` da API contra staging —
   deve acusar exatamente a nova tabela (prova de cobertura idêntica).
4. **Deploy do web** (migration roda) **antes ou junto** do deploy da API.
5. **Deploy da API**: o `db push` do boot converge o que faltar (em tabela nova,
   é create puro — sem risco de data loss) e o código novo encontra a tabela.
6. **Resolver resíduos**: `migrate diff` vazio nos dois lados; seeds atualizados
   se a tabela precisa de catálogo (`store_items`, `roles`...); documentar aqui
   neste arquivo (a doc é parte do "pronto" — ver cabeçalho).

Ordem inversa (API primeiro) = código lendo tabela que não existe = 500 em
produção. Migration sem o schema da API = `db push` da API tentando **reverter**
a migration do web (ou falhando) = incidente.

### 6.5. Checklist pós-deploy (VPS `187.127.54.55`)

Checkouts `/opt/hexavante`, `/opt/hexavante-api`, `/opt/hexavante-landing`,
`/opt/hexavante-admin`; fluxo `fetch + reset --hard origin/main` →
`docker build --no-cache` → `stop/rm/run` (envs inline, sem `.env` em disco).

```bash
curl -s https://api.hexavante.com.br/health | head -c 500
curl -s -o /dev/null -w "%{http_code}\n" https://app.hexavante.com.br/login
curl -s -o /dev/null -w "%{http_code}\n" https://hexavante.com.br/
docker logs hexavante-api --tail 50   # sem exceções, Redis connected
docker logs hexavante-redis --tail 5  # PONG / ready
```

Critérios: `/health` com `database: up` (e `redis: up`; `degraded` aceitável
transitoriamente — ver `health.service determineOverallStatus`), login de teste
`teste@hexavante.com` funcionando, `docker logs` sem erro de Prisma
(`P2002` = unicidade violada em produção — investigar; `P2021` = tabela
inexistente — schema divergiu, voltar §6.4).

---

*Fim. Este documento espelha o schema e o código lidos em 2026-09-27. Qualquer
mudança em `schema.prisma`, `src/lib/cache/`, `src/config/redis.ts`,
`src/plugins/rate-limit.ts` ou nos fluxos de `auth/security/shop/exams` exige
atualização correspondente aqui — doc desatualizada é pior que doc ausente,
porque finge autoridade.*
