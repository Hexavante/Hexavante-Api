import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de roles (papéis) de usuário.
 *
 * Armazena as roles atribuídas a cada usuário para evitar consultas
 * repetidas ao banco de dados durante a autorização de requisições.
 * Chave: `roles:{userId}`
 *
 * @remarks
 * TTL padrão: 5 minutos (300 segundos).
 * Deve ser invalidado sempre que as roles do usuário forem alteradas.
 */
export interface IRoleCache {
  get(userId: string): Promise<string[] | null>;
  set(userId: string, roles: string[], ttlSeconds?: number): Promise<void>;
  invalidate(userId: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 5;

const PREFIX = "roles";

export class RoleCache implements IRoleCache {
  async get(userId: string): Promise<string[] | null> {
    const redis = getRedisClient();
    const data = await redis.get(`${PREFIX}:${userId}`);
    if (!data) return null;
    return JSON.parse(data) as string[];
  }

  async set(
    userId: string,
    roles: string[],
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`${PREFIX}:${userId}`, ttlSeconds, JSON.stringify(roles));
  }

  async invalidate(userId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${userId}`);
  }
}
