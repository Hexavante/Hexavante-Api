import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de tokens de redefinição de senha.
 *
 * Armazena tokens temporários gerados durante o fluxo de "esqueci minha senha".
 * Cada token é de uso único (one-time) e associado a um userId.
 * Chave: `pwd_reset:{token}`
 *
 * @remarks
 * TTL padrão: 1 hora (3600 segundos).
 * O token deve ser invalidado imediatamente após o uso.
 */
export interface IPasswordResetCache {
  set(token: string, userId: string, ttlSeconds?: number): Promise<void>;
  get(token: string): Promise<string | null>;
  invalidate(token: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 60;

const PREFIX = "pwd_reset";

export class PasswordResetCache implements IPasswordResetCache {
  async set(
    token: string,
    userId: string,
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`${PREFIX}:${token}`, ttlSeconds, userId);
  }

  async get(token: string): Promise<string | null> {
    const redis = getRedisClient();
    return redis.get(`${PREFIX}:${token}`);
  }

  async invalidate(token: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${token}`);
  }
}
