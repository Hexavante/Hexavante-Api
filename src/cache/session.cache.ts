import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de sessões de usuário.
 *
 * Armazena sessões criadas pelo Better Auth.
 * Chave: `session:{sessionId}`
 * TTL padrão: 7 dias (604800 segundos)
 */
export interface ISessionCache {
  get(sessionId: string): Promise<string | null>;
  set(sessionId: string, data: string, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deleteAllByUserId(userId: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 7 dias
const PREFIX = "session";
const USER_INDEX_PREFIX = "user_sessions";

export class SessionCache implements ISessionCache {
  /**
   * Busca dados de uma sessão pelo ID.
   */
  async get(sessionId: string): Promise<string | null> {
    const redis = getRedisClient();
    return redis.get(`${PREFIX}:${sessionId}`);
  }

  /**
   * Armazena dados de uma sessão.
   * Também mantém um índice de sessões por usuário para invalidação em massa.
   */
  async set(
    sessionId: string,
    data: string,
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`${PREFIX}:${sessionId}`, ttlSeconds, data);
  }

  /**
   * Remove uma sessão específica.
   */
  async delete(sessionId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${sessionId}`);
  }

  /**
   * Remove todas as sessões de um usuário (ex: logout de todos os dispositivos).
   * TODO: Implementar índice userId → sessionIds quando Better Auth estiver configurado.
   */
  async deleteAllByUserId(userId: string): Promise<void> {
    const redis = getRedisClient();
    const sessionIds = await redis.smembers(`${USER_INDEX_PREFIX}:${userId}`);
    if (sessionIds.length > 0) {
      await redis.del(...sessionIds.map((id) => `${PREFIX}:${id}`));
      await redis.del(`${USER_INDEX_PREFIX}:${userId}`);
    }
  }
}
