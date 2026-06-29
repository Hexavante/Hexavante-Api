import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de tokens de verificação de email.
 *
 * Armazena tokens temporários enviados por email para verificação de conta.
 * Chave: `email_verify:{token}`
 * TTL padrão: 24 horas (86400 segundos)
 *
 * TODO: Integrar com o fluxo de verificação de email do Better Auth.
 */
export interface IEmailVerificationCache {
  set(token: string, userId: string, ttlSeconds?: number): Promise<void>;
  get(token: string): Promise<string | null>;
  invalidate(token: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 60 * 24; // 24 horas
const PREFIX = "email_verify";

export class EmailVerificationCache implements IEmailVerificationCache {
  /**
   * Armazena um token de verificação associado a um userId.
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
   * Busca o userId associado a um token de verificação.
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
