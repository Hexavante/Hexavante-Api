# Fluxo de Autenticação — Hexavante API

## Stack

- **Better Auth** (v1.x) — gerenciamento completo de autenticação
- **Prisma** + **MySQL** — persistência (usuários, sessões, contas OAuth)
- **Redis** — cache de sessões, rate-limit, tokens de verificação, OTP
- **Fastify** — servidor HTTP

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  Fastify                                             │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  authPlugin (preHandler global)               │    │
│  │  ├── proxy /api/auth/* → Better Auth handler  │    │
│  │  ├── decora fastify.auth                      │    │
│  │  └── anexa request.auth e request.user        │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  Middlewares                                   │    │
│  │  ├── authenticate  → sessão obrigatória       │    │
│  │  ├── optionalAuth  → sessão opcional          │    │
│  │  └── authorize     → RBAC por roles           │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  Módulo auth (custom)                         │    │
│  │  POST /api/v1/auth/login                      │    │
│  │  POST /api/v1/auth/register                   │    │
│  │  POST /api/v1/auth/logout                     │    │
│  │  GET  /api/v1/auth/session                    │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  Better Auth (built-in)                       │    │
│  │  /api/auth/*  → handler nativo                │    │
│  │  Gerencia cookies, CSRF, OAuth callbacks      │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Fluxos

### 1. Login (email/senha)

```
Cliente                     API                    Better Auth / Prisma
  │                          │                            │
  │ POST /api/v1/auth/login  │                            │
  │ { email, password }      │                            │
  │─────────────────────────>│                            │
  │                          │  signInEmail()             │
  │                          │───────────────────────────>│
  │                          │  valida credenciais        │
  │                          │  <────────────────────────│
  │                          │  busca dados do usuário    │
  │  { user: { id, name,    │                            │
  │    email, username,      │                            │
  │    roles } }             │                            │
  │<─────────────────────────│                            │
```

### 2. Registro

```
Cliente                     API                    Better Auth / Prisma
  │                          │                            │
  │ POST /api/v1/auth/register                            │
  │ { username, fullName,    │                            │
  │   email, password,       │                            │
  │   birthDate }            │                            │
  │─────────────────────────>│                            │
  │                          │  verifica duplicatas       │
  │                          │  signUpEmail()             │
  │                          │───────────────────────────>│
  │                          │  cria usuário (hash senha) │
  │                          │  <────────────────────────│
  │                          │  atualiza campos custom    │
  │                          │  (username, birthDate,     │
  │                          │   roles, xp, wallet)       │
  │  { user: { id, name,    │                            │
  │    email, username } }   │                            │
  │<─────────────────────────│                            │
```

### 3. Logout

```
Cliente                     API                    Better Auth
  │                          │                            │
  │ POST /api/v1/auth/logout │                            │
  │ (cookie/token no header) │                            │
  │─────────────────────────>│                            │
  │                          │  signOut()                 │
  │                          │───────────────────────────>│
  │                          │  revoga sessão no Redis   │
  │                          │  <────────────────────────│
  │  { success: true }       │                            │
  │<─────────────────────────│                            │
```

### 4. Sessão (verificar usuário atual)

```
Cliente                     API                    Better Auth
  │                          │                            │
  │ GET /api/v1/auth/session │                            │
  │ (cookie/token no header) │                            │
  │─────────────────────────>│                            │
  │                          │  getSession()              │
  │                          │───────────────────────────>│
  │                          │  <────────────────────────│
  │                          │  busca user no banco       │
  │  { user: { id, name,    │                            │
  │    email, username,      │                            │
  │    roles } }             │                            │
  │<─────────────────────────│                            │
```

### 5. Middleware de rota (authenticate)

```ts
// Uso em rotas protegidas
fastify.get('/admin', {
  preHandler: [authenticate],
}, handler)
```

O middleware `authenticate` chama `auth.api.getSession()` com os headers da requisição. Se não houver sessão válida, retorna **401**. Caso contrário, anexa `request.auth` e `request.user`.

### 6. OAuth (Google / GitHub)

As rotas OAuth são gerenciadas pelo Better Auth via proxy `/api/auth/*`:

```
GET  /api/auth/sign-in/google → redireciona para Google
GET  /api/auth/callback/google → processa callback
GET  /api/auth/sign-in/github → redireciona para GitHub
GET  /api/auth/callback/github → processa callback
```

**Configuração necessária:**

1. No Google Cloud Console: criar OAuth 2.0 credentials, adicionar redirect URI `http://localhost:3045/api/auth/callback/google`
2. No GitHub Developer Settings: criar OAuth App, adicionar redirect URI `http://localhost:3045/api/auth/callback/github`
3. Preencher `.env` com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

## Redis

O Better Auth usa Redis para:

| Finalidade | Chave | TTL |
|---|---|---|
| Cache de sessão | gerenciado internamente | 7 dias |
| Cache de cookie de sessão | gerenciado internamente | 5 min |
| Rate-limit customizado | `rl:{action}:{identifier}` | 15 min |
| Tokens de verificação de email | `email_verify:{token}` | 24h |
| Tokens de redefinição de senha | `pwd_reset:{token}` | 1h |
| OTP (2FA, ações sensíveis) | `otp:{action}:{userId}` | 10 min |
| Roles de usuário (cache) | `roles:{userId}` | 5 min |
| Permissões de usuário (cache) | `permissions:{userId}` | 5 min |

## Cookie de Sessão

- Prefixo: `hexavante`
- Nome do cookie (exemplo): `hexavante_session_token`
- Secure: `true` em produção
- SameSite: `Lax`
- HTTP Only: `true`
- Expiração: 7 dias (configurável em `config/auth.ts`)

A sessão é automaticamente renovada (slide session) a cada requisição dentro da janela de 1 dia.

## Endpoints

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | `/api/auth/*` | Endpoints nativos do Better Auth | — |
| POST | `/api/v1/auth/login` | Login email/senha | Não |
| POST | `/api/v1/auth/register` | Registro de novo usuário | Não |
| POST | `/api/v1/auth/logout` | Logout (revoga sessão) | Sim |
| GET | `/api/v1/auth/session` | Dados da sessão atual | Sim |

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão MySQL |
| `AUTH_SECRET` | Sim | Chave secreta (min 32 caracteres) |
| `REDIS_URL` | Sim | Conexão Redis |
| `AUTH_URL` | Sim | URL pública da API |
| `GOOGLE_CLIENT_ID` | OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | OAuth | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | OAuth | GitHub OAuth client secret |
