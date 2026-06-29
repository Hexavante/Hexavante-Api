import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de sessões.
 *
 * Responsável por armazenar e recuperar sessões de usuário no Redis.
 * Utiliza prefixo `session:` para chaves e mantém índice por usuário
 * para permitir invalidação em massa (ex: logout de todos os dispositivos).
 *
 * @remarks
 * TTL padrão: 7 dias (604800 segundos).
 */
export interface ISessionCache {
  get(sessionId: string): Promise<string | null>;
  set(sessionId: string, data: string, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deleteAllByUserId(userId: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 60 * 24 * 7;

const PREFIX = "session";

const USER_INDEX_PREFIX = "user_sessions";

export class SessionCache implements ISessionCache {
  async get(sessionId: string): Promise<string | null> {
    const redis = getRedisClient();
    return redis.get(`${PREFIX}:${sessionId}`);
  }

  async set(
    sessionId: string,
    data: string,
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`${PREFIX}:${sessionId}`, ttlSeconds, data);
  }

  async delete(sessionId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${sessionId}`);
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    const redis = getRedisClient();
    const sessionIds = await redis.smembers(`${USER_INDEX_PREFIX}:${userId}`);
    if (sessionIds.length > 0) {
      await redis.del(...sessionIds.map((id) => `${PREFIX}:${id}`));
      await redis.del(`${USER_INDEX_PREFIX}:${userId}`);
    }
  }
}
