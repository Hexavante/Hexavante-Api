import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de rate limiting customizado.
 *
 * Complementa o rate limit global do Fastify para cenários específicos
 * de negócio como limite de tentativas de login, envio de e-mails,
 * reenvio de OTP, etc.
 * Chave: `rl:{action}:{identifier}`
 *
 * @remarks
 * TTL padrão: 15 minutos (900 segundos).
 * O TTL é definido apenas na primeira incrementação (chave nova).
 */
export interface IRateLimitCache {
  increment(
    action: string,
    identifier: string,
    ttlSeconds?: number,
  ): Promise<number>;
  get(action: string, identifier: string): Promise<number>;
  reset(action: string, identifier: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 15;

const PREFIX = "rl";

export class RateLimitCache implements IRateLimitCache {
  async increment(
    action: string,
    identifier: string,
    ttlSeconds = DEFAULT_TTL,
  ): Promise<number> {
    const redis = getRedisClient();
    const key = `${PREFIX}:${action}:${identifier}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return count;
  }

  async get(action: string, identifier: string): Promise<number> {
    const redis = getRedisClient();
    const data = await redis.get(`${PREFIX}:${action}:${identifier}`);
    return data ? parseInt(data, 10) : 0;
  }

  async reset(action: string, identifier: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${action}:${identifier}`);
  }
}
