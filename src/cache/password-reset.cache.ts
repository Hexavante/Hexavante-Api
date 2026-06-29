import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de tokens de redefinição de senha.
 *
 * Armazena tokens temporários gerados no fluxo de "esqueci minha senha".
 * Chave: `pwd_reset:{token}`
 * TTL padrão: 1 hora (3600 segundos)
 *
 * TODO: Integrar com o fluxo de reset de senha do Better Auth.
 */
export interface IPasswordResetCache {
  set(token: string, userId: string, ttlSeconds?: number): Promise<void>;
  get(token: string): Promise<string | null>;
  invalidate(token: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 60; // 1 hora
const PREFIX = "pwd_reset";

export class PasswordResetCache implements IPasswordResetCache {
  /**
   * Armazena um token de reset associado a um userId.
   */
  async set(
    token: string,
    userId: string,
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`${PREFIX}:${token}`, ttlSeconds, userId);
  }

  /**
   * Busca o userId associado a um token de reset.
   * Retorna null se o token não existir ou estiver expirado.
   */
  async get(token: string): Promise<string | null> {
    const redis = getRedisClient();
    return redis.get(`${PREFIX}:${token}`);
  }

  /**
   * Invalida o token após uso (one-time use).
   */
  async invalidate(token: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${token}`);
  }
}
