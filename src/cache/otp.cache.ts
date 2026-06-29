import { getRedisClient } from "../../config/redis";

/**
 * Interface do cache de OTP (One-Time Password).
 *
 * Armazena códigos temporários para autenticação de dois fatores (2FA),
 * confirmação de ações sensíveis, etc.
 * Chave: `otp:{action}:{userId}`
 * TTL padrão: 10 minutos (600 segundos)
 *
 * TODO: Integrar com o fluxo de 2FA do Better Auth.
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

const DEFAULT_TTL = 60 * 10; // 10 minutos
const PREFIX = "otp";

export class OtpCache implements IOtpCache {
  /**
   * Armazena um código OTP para um usuário e ação específica.
   * Exemplos de action: '2fa', 'confirm_delete', 'confirm_payment'
   */
  async set(
    action: string,
    userId: string,
    code: string,
    ttlSeconds = DEFAULT_TTL,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`${PREFIX}:${action}:${userId}`, ttlSeconds, code);
  }

  /**
   * Busca o código OTP ativo de um usuário para uma ação.
   * Retorna null se não existir ou estiver expirado.
   */
  async get(action: string, userId: string): Promise<string | null> {
    const redis = getRedisClient();
    return redis.get(`${PREFIX}:${action}:${userId}`);
  }

  /**
   * Invalida o OTP após uso ou após muitas tentativas incorretas.
   */
  async invalidate(action: string, userId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}:${action}:${userId}`);
  }
}
