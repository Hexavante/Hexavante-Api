import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de permissões de usuário.
 *
 * Evita consultas repetidas ao banco para checar permissões granulares.
 * Chave: `permissions:{userId}`
 * TTL padrão: 5 minutos (300 segundos)
 */
export interface IPermissionCache {
  get(userId: string): Promise<string[] | null>;
  set(
    userId: string,
    permissions: string[],
    ttlSeconds?: number,
  ): Promise<void>;
  invalidate(userId: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 5; // 5 minutos
const PREFIX = "permissions";

export class PermissionCache implements IPermissionCache {
  /**
   * Busca as permissões de um usuário no cache.
   * Retorna null se não houver cache (deve buscar no banco).
   */
  async get(userId: string): Promise<string[] | null> {
    const redis = getRedisClient();
    const data = await redis.get(`${PREFIX}:${userId}`);
    if (!data) return null;
    return JSON.parse(data) as string[];
  }

  /**
   * Armazena as permissões de um usuário no cache.
   */
  async set(
    userId: string,
    permissions: string[],
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(
      `${PREFIX}:${userId}`,
      ttlSeconds,
      JSON.stringify(permissions),
    );
  }

  /**
   * Invalida o cache de permissões de um usuário.
   * Deve ser chamado sempre que as permissões do usuário forem alteradas.
   */
  async invalidate(userId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${userId}`);
  }
}
