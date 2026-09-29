import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors/AppError';
import { getRedisClient } from '../config/redis';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Opções padrão do rate-limit (Redis, allowlist de dev, headers).
 *
 * Mantidas exatamente como sempre estiveram: limites, windows e headers não
 * mudam com o fix de escopo.
 */
export function buildRateLimitOptions() {
  return {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: process.env.RATE_LIMIT_TIME_WINDOW || '1 minute',
    cache: isDevelopment ? 0 : 10000,
    allowList: isDevelopment
      ? ['127.0.0.1', '::1', 'localhost']
      : (process.env.RATE_LIMIT_ALLOW_LIST?.split(',') || []),
    continueExceeding: false,
    skipOnError: false,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    // Erro 429 como AppError: nas rotas registradas DIRETAMENTE em src/server.ts
    // (ex.: `GET /`) o error handler custom é o nosso `handleError`, que sem
    // isso responderia 500 para o `Error` genérico do plugin. Nas rotas de
    // módulo (escopo filho) o handler padrão do Fastify responde 429 — nos dois
    // caminhos o status vira 429 e o corpo segue o envelope da API.
    errorResponseBuilder: (
      _req: FastifyRequest,
      context: { statusCode: number; after: string }
    ) =>
      new AppError(
        context.statusCode,
        `Rate limit exceeded, retry in ${context.after}`,
        'RATE_LIMIT_EXCEEDED'
      ),
    redis: getRedisClient(),
  };
}

/**
 * Registra o rate-limit GLOBAL na instância recebida — ela precisa ser a
 * instância RAIZ do app (`src/server.ts`).
 *
 * `@fastify/rate-limit` é fastify-plugin: ele instala um hook `onRoute` (e os
 * decorators) na instância onde `fastify.register(...)` é chamado, e esse hook
 * só alcança as rotas registradas NAQUELA instância e nas filhas criadas
 * depois. Um wrapper comum (`fastify.register(rateLimitPlugin)`) cria um
 * contexto filho SEM rotas — e o hook morre ali, sem limitar nada:
 *
 *   await registerGlobalRateLimit(fastify);   // ✅ escopo raiz → todas as rotas
 *   await fastify.register(rateLimitPlugin);  // ❌ cria escopo filho vazio
 *
 * Rotas com limite próprio (login, register, `POST /oauth/exchange`) não
 * precisam (não devem) registrar o plugin de novo: basta
 * `config: { rateLimit: { max, timeWindow } }` na rota — o hook global lê essa
 * config, usa um contador próprio (chave com o método/URL) e NÃO incrementa o
 * contador global. Registrar o plugin duas vezes criaria dois hooks com
 * chaves iguais → dobraria a contagem (limite efetivo pela metade).
 */
export async function registerGlobalRateLimit(fastify: FastifyInstance) {
  // `rateLimit` é fastify-plugin: registra direto na instância recebida,
  // sem criar um escopo intermediário.
  await fastify.register(rateLimit, buildRateLimitOptions());
}
