# Instalação e desenvolvimento — Hexavante API

Documento de referência do setup **implementado** neste repositório.

---

## Pré-requisitos

Node.js 22+, MySQL 8+/MariaDB 11+, Redis 7+.

## Passo a passo

```bash
git clone https://github.com/Hexavante/Hexavante-Api.git
cd Hexavante-Api
npm install
cp .env.example .env
# DATABASE_URL=mysql://hexavante:senha@localhost:3306/hexavante
# AUTH_SECRET=segredo-forte | REDIS_URL=redis://localhost:6379
# RESEND_API_KEY=... (e-mails; sem ela, só log)
npx prisma generate
npm run dev
```

## Novo endpoint (checklist)

1. Rota em `modules/<dominio>/routes/` (path, `preHandler`, `asyncHandler`).
2. Controller fino + service com regra + repository com Prisma.
3. Schema Zod (lembrete: chaves fora do schema são **removidas** do body).
4. Teste Vitest do service/caminho feliz + erro.
5. `npx tsc --noEmit` verde.

## Comandos úteis

`npm run build` · `npm start` · `npm test -- src/modules/<m>` · `npx prisma studio` · `npx prisma db push` (dev, sem `--accept-data-loss`).

## Testes locais (MySQL/Redis sem portas publicadas)

O `docker-compose.yml` **não publica** 3306/6379 (só rede interna `hexavante-net`),
então `localhost:3306`/`localhost:6379` não alcançam os containers do host.
Para rodar a suíte local, aponte as envs de teste ao container (IP na rede
interna, descoberto via `docker inspect`) ou suba um override efêmero **fora do
repo** (ex.: `/tmp/compose.override.yml` com `127.0.0.1:3306:3306`) — nunca
recoloque portas públicas no `docker-compose.yml` versionado:

```bash
MYSQL_ROOT_PASSWORD=test_password MYSQL_PASSWORD=test_password docker compose up -d mysql redis
docker compose exec -T mysql mariadb -uroot -ptest_password -e "CREATE DATABASE IF NOT EXISTS hexavante_test;"
TEST_DATABASE_URL="mysql://root:test_password@<IP-DO-MYSQL>:3306/hexavante_test" \
TEST_REDIS_URL="redis://<IP-DO-REDIS>:6379" npm test
docker compose down   # sem -v: preserva os volumes de dados
```
