import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

const isDevelopment = process.env.NODE_ENV !== 'production';

export async function rateLimitPlugin(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
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
    redis: undefined, // TODO: Integrate Redis when ready
    // Redis integration example:
    // redis: new Redis(process.env.REDIS_URL),
  });
}
