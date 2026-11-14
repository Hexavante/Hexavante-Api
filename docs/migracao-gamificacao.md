# Migração da gamificação para a API (fase 1)

## O que mudou

Antes havia quatro implementações de "conceder XP/moedas", com regras
diferentes:

| Onde | Transação | Booster | Premium (moedas 2×) | Notificação |
|---|---|---|---|---|
| Web `awardXp`/`awardCoins` | sim | pessoal × global | sim | sim |
| Admin (cópia do Web) | sim | pessoal × global | sim | sim |
| API — aulas (Desktop/Mobile) | **não** | só pessoal | **não** | **não** |
| API — simulados (Desktop/Mobile) | **não** | só pessoal | **não** | **não** |

Agora existe **uma** implementação, na API:
`packages/core/src/modules/gamification/engine/` (cópia fiel das regras do
Web, que era a referência de produção).

- **Desktop/Mobile**: aulas e simulados chamam o motor direto.
- **Web e Admin**: `awardXp`/`awardCoins` mantêm a mesma assinatura, mas
  chamam `POST /internal/v1/gamification/{xp,coins}` na API.
- **Fechamento de temporada** (promoção/rebaixamento/prêmios): saiu do Web
  e do Admin, onde rodava na primeira visita ao ranking, e virou job
  agendado na API (fila `hx-maintenance`, a cada hora, idempotente).

## Mudanças que usuários do Desktop/Mobile vão notar

Todas alinham o Desktop/Mobile ao que o Web já fazia:

- XP passa a considerar o **booster global** da plataforma.
- Moedas passam a considerar **premium (2×)** e o **booster global**.
- Simulados: moedas viram uma transação **por questão certa**
  (`{attemptId}-q-{questionId}`), como no Web.
- Arredondamento do multiplicador diário igual ao Web
  (`round(round(base × diário) × booster)`).
- Passam a ser criadas notificações de **subida de nível** e **moedas
  ganhas**, respeitando as preferências do usuário.

## Implantação (nesta ordem)

1. **Redis com `noeviction`** (obrigatório para as filas BullMQ):
   ```sh
   bash scripts/redis-noeviction.sh           # mostra o estado atual
   bash scripts/redis-noeviction.sh --apply   # aplica
   ```
   e persistir no comando de criação do container do Redis no VPS (o
   `docker-compose.yml` deste repositório já foi atualizado). Com
   `allkeys-lru`, o Redis pode apagar jobs, como a reconciliação de
   pagamento, quando a memória enche.

2. **Gerar o token** (uma vez) e configurar na **API**:
   ```sh
   openssl rand -base64 48
   ```
   `INTERNAL_API_TOKEN=<valor>` no ambiente do container da API Fastify.

3. **Deploy da API.** Conferir:
   - log `Workers de fila iniciados (email, payments, maintenance)`;
   - `POST /internal/v1/gamification/xp` sem token → **401**;
     com token e corpo inválido → **400**.

4. **Configurar o mesmo token no Web e no Admin** (`INTERNAL_API_TOKEN`;
   no Admin também `INTERNAL_API_URL`) e fazer o **deploy dos dois**. Os
   composes de produção recusam subir sem o token.

> Não faça os passos 3 e 4 perto da virada do mês: enquanto o Web antigo
> estiver no ar, ele ainda fecha a temporada "na primeira visita", e os dois
> poderiam disputar o fechamento.

### Rollback

- Web/Admin: reverter o deploy volta a gravar direto no banco (regras
  antigas, que são as mesmas do motor).
- API: reverter é seguro; o Web novo passaria a receber 404 em
  `/internal/*` e o XP daquela ação não seria concedido (fica registrado
  em log). Por isso, reverta o Web/Admin antes da API.

## Recomendado

- Restringir `/internal/` no nginx ao IP do servidor do Web/Admin. O token
  já protege, mas isso tira a rota da internet.

## Próximas fases (fora deste escopo)

- **Leituras** (ranking por período, perfil de XP, histórico, liga) ainda
  consultam o banco direto no Web/Admin.
- **Conquistas**: a lista da API (`XpService`) é diferente da do Web
  (`lib/achievements.ts`).
- **Ajustes manuais da moderação** (`adminAdjustXp`/`adminAdjustCoins`):
  remover XP usa `applyXp` com valor negativo, que nunca baixa o nível e pode
  deixar `currentXp` negativo. Migrar junto com a moderação.
- **Gasto de moedas** (`spendCoins`, loja) ainda é feito no Web/Admin.
