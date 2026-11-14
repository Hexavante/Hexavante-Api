import Redis from 'ioredis';
import { logger } from './logger';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const password = process.env.REDIS_PASSWORD;
    const baseUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisUrl = password
      ? baseUrl.replace('redis://', `redis://:${encodeURIComponent(password)}@`)
      : baseUrl;

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisClient;
}

/**
 * `true` só quando o cliente compartilhado já está conectado. Caminhos de
 * leitura usam isso para cair direto no banco sem esperar timeout de rede.
 */
export function isRedisReady(): boolean {
  return getRedisClient().status === 'ready';
}

/**
 * Conexão dedicada para o BullMQ. Workers exigem `maxRetriesPerRequest: null`
 * (comandos bloqueantes); produtores usam `enableOfflineQueue: false` para
 * falhar rápido quando o Redis está fora, em vez de enfileirar em memória e
 * travar a requisição HTTP.
 */
export function createBullConnection(role: 'producer' | 'worker'): Redis {
  const password = process.env.REDIS_PASSWORD;
  const baseUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisUrl = password
    ? baseUrl.replace('redis://', `redis://:${encodeURIComponent(password)}@`)
    : baseUrl;

  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: role === 'worker',
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  connection.on('error', (err) => {
    logger.error({ err, role }, 'Redis (BullMQ) connection error');
  });
  return connection;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}
