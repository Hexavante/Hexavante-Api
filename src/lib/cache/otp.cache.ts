import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de OTP (One-Time Password).
 *
 * Armazena códigos temporários usados em fluxos de autenticação de
 * dois fatores (2FA), confirmação de ações sensíveis (exclusão de conta,
 * pagamento), ou verificação alternativa de identidade.
 * Chave: `otp:{action}:{userId}`
 *
 * @remarks
 * TTL padrão: 10 minutos (600 segundos).
 * Deve ser invalidado após uso bem-sucedido ou após exceder
 * o limite de tentativas.
 */
export interface IOtpCache {
  set(
    action: string,
    userId: string,
    code: string,
    ttlSeconds?: number,
  ): Promise<void>;
  get(action: string, userId: string): Promise<string | null>;
  invalidate(action: string, userId: string): Promise<void>;
}

const DEFAULT_TTL = 60 * 10;

const PREFIX = "otp";

export class OtpCache implements IOtpCache {
  async set(
    action: string,
    userId: string,
    code: string,
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`${PREFIX}:${action}:${userId}`, ttlSeconds, code);
  }

  async get(action: string, userId: string): Promise<string | null> {
    const redis = getRedisClient();
    return redis.get(`${PREFIX}:${action}:${userId}`);
  }

  async invalidate(action: string, userId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${action}:${userId}`);
  }
}
