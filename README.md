<div align="center">
  <h1>Hexavante API</h1>
  <p>Backend oficial da plataforma educacional Hexavante</p>
  <p>
    <img alt="Status" src="https://img.shields.io/badge/status-em%20desenvolvimento-yellow">
    <img alt="Node" src="https://img.shields.io/badge/node-22.x-green">
    <img alt="License" src="https://img.shields.io/badge/license-ISC-blue">
  </p>
</div>

API REST moderna construída com **Fastify**, **Prisma**, **Better Auth** e **Redis**, servindo os clientes Web, Desktop e Mobile.

---

## Stack

| Categoria | Tecnologia |
|---|---|
| Runtime | [Node.js](https://nodejs.org) 22 + [TypeScript](https://www.typescriptlang.org) 6 |
| Framework | [Fastify](https://fastify.dev) 5 |
| ORM | [Prisma](https://www.prisma.io) + MySQL (MariaDB) |
| Autenticação | [Better Auth](https://better-auth.com) (email/senha + OAuth Google/GitHub) |
| Cache | [Redis](https://redis.io) (sessões, rate-limit, tokens) |
| Validação | [Zod](https://zod.dev) |
| Documentação | [Swagger](https://swagger.io) (`/docs`) |
| Logging | [Pino](https://getpino.io) |

---

## Pré-requisitos

- **Node.js** 22+
- **MySQL** 8+ (ou MariaDB)
- **Redis** 7+

---

## Setup

```bash
# 1. Clonar
git clone https://github.com/Hexavante/Hexavante-Api.git
cd Hexavante-Api

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais (DATABASE_URL, AUTH_SECRET, REDIS_URL)

# 4. Gerar Prisma Client e rodar migrations
npx prisma generate
npx prisma db push

# 5. Popular banco com dados iniciais (roles, permissões)
npm run seed

# 6. Iniciar servidor de desenvolvimento
npm run dev
```

Acesse `http://localhost:3045` e `http://localhost:3045/docs` (Swagger).

---

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia servidor com hot-reload (tsx watch) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Inicia servidor em produção |
| `npm run seed` | Popula banco com roles e permissões |
| `npm run lint` | Executa ESLint |
| `npm run db:generate` | Gera Prisma Client |
| `npm run db:migrate` | Executa migrations |
| `npm run db:push` | Sincroniza schema com o banco |
| `npm run db:studio` | Abre Prisma Studio |

---

## Estrutura

```
src/
├── config/          # Configurações (auth, redis, prisma, logger)
├── lib/             # Infraestrutura reutilizável
│   ├── cache/       # Redis cache (sessões, roles, permissões, rate-limit)
│   ├── errors/      # AppError + errorHandler
│   ├── serializers/ # Paginação, formatação
│   └── validation/  # validateBody/Query/Params com Zod
├── middlewares/      # authenticate, optionalAuth, authorize
├── modules/         # Módulos da aplicação (domain-driven)
│   ├── auth/        # Autenticação (login, registro, sessão)
│   ├── authorization/ # RBAC (roles, permissões)
│   ├── courses/     # Cursos, módulos, aulas
│   ├── gamification/ # XP, rankings, conquistas
│   ├── health/      # Health check
│   └── users/       # Perfil de usuário
├── plugins/          # Plugins Fastify (cors, helmet, rate-limit, auth)
└── server.ts         # Entry point

prisma/
├── schema.prisma     # Modelo de dados completo
└── seed.ts           # Seed de roles e permissões

docs/
└── auth-flow.md      # Documentação do fluxo de autenticação
```

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão MySQL |
| `AUTH_SECRET` | Sim | Chave secreta (mín. 32 caracteres) |
| `REDIS_URL` | Sim | Conexão Redis |
| `AUTH_URL` | Sim | URL pública da API |
| `PORT` | Não | Porta do servidor (default: 3045) |
| `NODE_ENV` | Não | Ambiente (development/production) |
| `GOOGLE_CLIENT_ID` | OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | OAuth | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | OAuth | GitHub OAuth client secret |

---

## Endpoints Principais

### Autenticação
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/auth/login` | Login email/senha |
| POST | `/api/v1/auth/register` | Registro de usuário |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/session` | Sessão atual |

### Usuários
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/users/me` | Perfil do usuário |
| PATCH | `/api/v1/users/me` | Atualizar perfil |
| DELETE | `/api/v1/users/me` | Deletar conta |

### Cursos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/courses` | Listar cursos publicados |
| GET | `/api/v1/courses/:id` | Detalhes do curso |
| POST | `/api/v1/courses` | Criar curso |
| PATCH | `/api/v1/courses/:id` | Atualizar curso |
| DELETE | `/api/v1/courses/:id` | Excluir curso |
| POST | `/api/v1/courses/:id/enroll` | Matricular-se |
| GET | `/api/v1/courses/:id/progress` | Progresso no curso |

### Gamificação
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/rankings` | Leaderboard |
| GET | `/api/v1/rankings/me` | Minha posição |
| GET | `/api/v1/users/:id/xp` | Histórico de XP |
| GET | `/api/v1/achievements` | Listar conquistas |
| GET | `/api/v1/users/me/achievements` | Minhas conquistas |

### Autorização
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/authorization/context` | Contexto de permissões |
| GET | `/api/v1/authorization/check/:permission` | Verificar permissão |

---

## Autenticação

O sistema usa **Better Auth** com dois modos:

1. **Session cookies** — rota proxy `/api/auth/*` (use `authenticate` middleware)
2. **Custom endpoints** — `/api/v1/auth/*` (retornam JSON)

Suporte a OAuth via Google e GitHub. Consulte [`docs/auth-flow.md`](docs/auth-flow.md) para o fluxo completo.

---

## Licença

ISC
