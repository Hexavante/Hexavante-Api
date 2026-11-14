import type Redis from "ioredis";
import { getRedisClient } from "../../config/redis";
import { logger } from "../../config/logger";

/**
 * Cache de leitura (cache-aside) para dados públicos e iguais para todos os
 * usuários — catálogo de cursos e estatísticas da plataforma.
 *
 * Invalidação por versão: cada namespace tem um contador
 * `cache:{ns}:ver`. As chaves incluem a versão atual; `invalidate(ns)` só faz
 * INCR, e as entradas antigas expiram pelo TTL. Isso evita `KEYS`/`SCAN` e
 * invalida todas as páginas/filtros de uma vez.
 *
 * O TTL é curto de propósito: Web e Admin ainda gravam cursos direto no banco
 * (sem passar pela API), então só as mudanças feitas pela API invalidam na
 * hora; as demais aparecem em até TTL segundos.
 *
 * Redis fora do ar → chama o loader direto (nunca quebra a requisição).
 */

export const CACHE_NAMESPACES = {
  courses: "courses",
  platformStats: "platform-stats",
} as const;

export type CacheNamespace = (typeof CACHE_NAMESPACES)[keyof typeof CACHE_NAMESPACES];

export interface IResponseCache {
  wrap<T>(ns: CacheNamespace, key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
  invalidate(ns: CacheNamespace): Promise<void>;
}

const versionKey = (ns: CacheNamespace) => `cache:${ns}:ver`;

export class ResponseCache implements IResponseCache {
  constructor(
    private readonly getRedis: () => Redis = getRedisClient,
    private readonly enabled: boolean = process.env.NODE_ENV !== "test" &&
      process.env.RESPONSE_CACHE !== "off",
  ) {}

  async wrap<T>(
    ns: CacheNamespace,
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (!this.enabled) return loader();
    const redis = this.getRedis();
    if (redis.status !== "ready") return loader();

    let cacheKey: string | null = null;
    try {
      const version = (await redis.get(versionKey(ns))) ?? "0";
      cacheKey = `cache:${ns}:v${version}:${key}`;
      const hit = await redis.get(cacheKey);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (err) {
      logger.warn({ err, ns }, "response-cache: leitura falhou — usando banco");
      cacheKey = null;
    }

    const value = await loader();
    if (cacheKey) {
      redis
        .set(cacheKey, JSON.stringify(value), "EX", ttlSeconds)
        .catch((err) => logger.warn({ err, ns }, "response-cache: escrita falhou"));
    }
    return value;
  }

  async invalidate(ns: CacheNamespace): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.getRedis().incr(versionKey(ns));
    } catch (err) {
      logger.warn({ err, ns }, "response-cache: invalidação falhou (expira pelo TTL)");
    }
  }
}

/** Serialização estável (ordem das chaves) para montar chaves de cache. */
export function stableKey(input: Record<string, unknown>): string {
  return Object.keys(input)
    .filter((k) => input[k] !== undefined && input[k] !== null && input[k] !== "")
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(input[k]))}`)
    .join("&");
}

export const responseCache = new ResponseCache();
