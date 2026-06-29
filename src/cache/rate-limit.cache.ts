import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de rate limiting customizado.
 *
 * Complementa o @fastify/rate-limit para casos específicos de negócio
 * (ex: limite de tentativas de login, envio de email, etc).
 * Chave: `rl:{action}:{identifier}`
 * TTL padrão: 15 minutos (900 segundos)
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

const DEFAULT_TTL = 60 * 15; // 15 minutos
const PREFIX = "rl";

export class RateLimitCache implements IRateLimitCache {
  /**
   * Incrementa o contador de tentativas para uma ação/identificador.
   * Retorna o valor atual após incremento.
   * O TTL só é definido na primeira chamada (quando a chave não existe).
   */
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

  /**
   * Retorna o número atual de tentativas. Retorna 0 se não houver registro.
   */
  async get(action: string, identifier: string): Promise<number> {
    const redis = getRedisClient();
    const data = await redis.get(`${PREFIX}:${action}:${identifier}`);
    return data ? parseInt(data, 10) : 0;
  }

  /**
   * Reseta o contador (ex: após login bem-sucedido).
   */
  async reset(action: string, identifier: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${action}:${identifier}`);
  }
}
