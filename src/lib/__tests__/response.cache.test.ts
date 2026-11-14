import { beforeEach, describe, expect, it, vi } from "vitest";
import RedisMock from "ioredis-mock";
import type Redis from "ioredis";
import {
  CACHE_NAMESPACES,
  ResponseCache,
  stableKey,
} from "../../../packages/core/src/lib/cache/response.cache";

function readyMock(): Redis {
  const redis = new RedisMock() as unknown as Redis;
  Object.defineProperty(redis, "status", { value: "ready", configurable: true });
  return redis;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ResponseCache", () => {
  let redis: Redis;
  let cache: ResponseCache;

  beforeEach(async () => {
    redis = readyMock();
    await redis.flushall();
    cache = new ResponseCache(() => redis, true);
  });

  it("miss chama o loader; hit devolve do Redis sem chamar de novo", async () => {
    const loader = vi.fn().mockResolvedValue({ total: 3, at: "2026-11-13T00:00:00.000Z" });

    expect(await cache.wrap(CACHE_NAMESPACES.courses, "list:a", 60, loader)).toEqual({
      total: 3,
      at: "2026-11-13T00:00:00.000Z",
    });
    await flush();
    expect(await cache.wrap(CACHE_NAMESPACES.courses, "list:a", 60, loader)).toEqual({
      total: 3,
      at: "2026-11-13T00:00:00.000Z",
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("grava com TTL", async () => {
    await cache.wrap(CACHE_NAMESPACES.courses, "k", 60, async () => 1);
    await flush();
    const [key] = await redis.keys("cache:courses:*:k");
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("invalidate descarta todas as chaves do namespace", async () => {
    const loader = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    await cache.wrap(CACHE_NAMESPACES.courses, "detail:1", 60, loader);
    await flush();

    await cache.invalidate(CACHE_NAMESPACES.courses);

    expect(await cache.wrap(CACHE_NAMESPACES.courses, "detail:1", 60, loader)).toBe("v2");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidar um namespace não afeta outro", async () => {
    const stats = vi.fn().mockResolvedValue({ users: 1 });
    await cache.wrap(CACHE_NAMESPACES.platformStats, "all", 60, stats);
    await flush();

    await cache.invalidate(CACHE_NAMESPACES.courses);
    await cache.wrap(CACHE_NAMESPACES.platformStats, "all", 60, stats);
    expect(stats).toHaveBeenCalledTimes(1);
  });

  it("erro do loader propaga e nada é gravado", async () => {
    await expect(
      cache.wrap(CACHE_NAMESPACES.courses, "detail:x", 60, async () => {
        throw new Error("404");
      }),
    ).rejects.toThrow("404");
    await flush();
    expect(await redis.keys("cache:courses:*")).toEqual([]);
  });

  it("Redis fora → usa o loader direto", async () => {
    const offline = new RedisMock() as unknown as Redis;
    Object.defineProperty(offline, "status", { value: "reconnecting" });
    const off = new ResponseCache(() => offline, true);
    const loader = vi.fn().mockResolvedValue("db");

    expect(await off.wrap(CACHE_NAMESPACES.courses, "k", 60, loader)).toBe("db");
    expect(await off.wrap(CACHE_NAMESPACES.courses, "k", 60, loader)).toBe("db");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("falha de leitura no Redis → usa o loader direto", async () => {
    vi.spyOn(redis, "get").mockRejectedValue(new Error("conexão caiu"));
    expect(await cache.wrap(CACHE_NAMESPACES.courses, "k", 60, async () => "db")).toBe("db");
  });
});

describe("stableKey", () => {
  it("independe da ordem das chaves e ignora vazios", () => {
    expect(stableKey({ page: 1, limit: 20, search: undefined, level: "" })).toBe(
      stableKey({ limit: 20, page: 1 }),
    );
  });

  it("escapa valores para não colidir", () => {
    expect(stableKey({ search: "a&b=c" })).toBe("search=a%26b%3Dc");
  });
});
