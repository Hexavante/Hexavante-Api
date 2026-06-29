import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de tokens de verificação de e-mail.
 *
 * Armazena tokens temporários enviados por e-mail para confirmar
 * o endereço de e-mail do usuário durante o cadastro ou alteração.
 * Chave: `email_verify:{token}`
 *
 * @remarks
 * TTL padrão: 24 horas (86400 segundos).
 * O token deve ser invalidado após verificação bem-sucedida.
 */
export interface IEmailVerificationCache {
  set(token: string, userId: string, ttlSeconds?: number): Promise<void>;
  get(token: string): Promise<string | null>;
  invalidate(token: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 60 * 24;

const PREFIX = "email_verify";

export class EmailVerificationCache implements IEmailVerificationCache {
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
