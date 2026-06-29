import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de permissões de usuário.
 *
 * Armazena permissões granulares por usuário para evitar consultas
 * repetidas ao banco durante a verificação de autorização.
 * Chave: `permissions:{userId}`
 *
 * @remarks
 * TTL padrão: 5 minutos (300 segundos).
 * Deve ser invalidado sempre que as permissões do usuário forem alteradas.
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

const DEFAULT_TTL = 60 * 5;

const PREFIX = "permissions";

export class PermissionCache implements IPermissionCache {
  async get(userId: string): Promise<string[] | null> {
    const redis = getRedisClient();
    const data = await redis.get(`${PREFIX}:${userId}`);
    if (!data) return null;
    return JSON.parse(data) as string[];
  }

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

  async invalidate(userId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${userId}`);
  }
}
