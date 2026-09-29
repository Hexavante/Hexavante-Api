import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';
 import { getRedisClient } from '../config/redis';

 const isDevelopment = process.env.NODE_ENV !== 'production';

 /**
  * Opções padrão do rate-limit (Redis, allowlist de dev, headers).
  *
  * `@fastify/rate-limit` é fastify-plugin: ele protege o contexto em que é
  * registrado — e só ele. Rotas que precisam de limite próprio devem
  * registrá-lo no MESMO escopo da rota (ex.: `POST /oauth/exchange`);
  * usar `fastify.register(rateLimitPlugin)` num contexto aninhado não
  * alcança as rotas irmãs.
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
     redis: getRedisClient(),
   };
 }

 export async function rateLimitPlugin(fastify: FastifyInstance) {
   await fastify.register(rateLimit, buildRateLimitOptions());
 }
