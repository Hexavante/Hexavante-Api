import { beforeEach, describe, expect, it, vi } from "vitest";
import RedisMock from "ioredis-mock";
import type Redis from "ioredis";
import {
  LeaderboardCache,
  LEADERBOARD_MAX_STALENESS_MS,
  type XpRowSource,
} from "../../../packages/core/src/lib/cache/leaderboard.cache";

vi.mock("../../../packages/core/src/config/prisma", () => ({ prisma: {} }));

function readyMock(): Redis {
  const redis = new RedisMock() as unknown as Redis;
  // ioredis-mock não expõe `status`; o cache só lê quando está "ready".
  Object.defineProperty(redis, "status", { value: "ready", configurable: true });
  return redis;
}

function sourceFrom(rows: Array<{ userId: string; totalXp: number }>): XpRowSource {
  const all = rows.map((r, i) => ({ id: `xp_${String(i).padStart(4, "0")}`, ...r }));
  return async (cursor, take) => {
    const start = cursor ? all.findIndex((r) => r.id === cursor) + 1 : 0;
    return all.slice(start, start + take);
  };
}

describe("LeaderboardCache", () => {
  let redis: Redis;

  beforeEach(async () => {
    redis = readyMock();
    await redis.flushall();
  });

  it("reconstrói o sorted set e pagina em ordem decrescente de XP", async () => {
    const cache = new LeaderboardCache(
      () => redis,
      sourceFrom([
        { userId: "ana", totalXp: 300 },
        { userId: "bia", totalXp: 900 },
        { userId: "caio", totalXp: 50 },
        { userId: "duda", totalXp: 600 },
      ]),
      true,
    );

    expect(await cache.rebuild()).toEqual({ members: 4 });

    expect(await cache.getPage(0, 2)).toEqual({
      entries: [
        { userId: "bia", totalXp: 900 },
        { userId: "duda", totalXp: 600 },
      ],
      total: 4,
    });
    expect(await cache.getPage(2, 2)).toEqual({
      entries: [
        { userId: "ana", totalXp: 300 },
        { userId: "caio", totalXp: 50 },
      ],
      total: 4,
    });
  });

  it("a chave final não herda o TTL do temporário", async () => {
    const cache = new LeaderboardCache(() => redis, sourceFrom([{ userId: "a", totalXp: 1 }]), true);
    await cache.rebuild();
    expect(await redis.ttl("leaderboard:alltime")).toBe(-1);
    expect((await redis.keys("leaderboard:alltime:tmp:*")).length).toBe(0);
  });

  it("reconstrução substitui o conjunto inteiro (usuário removido some)", async () => {
    let rows = [
      { userId: "a", totalXp: 10 },
      { userId: "b", totalXp: 20 },
    ];
    const cache = new LeaderboardCache(() => redis, (c, t) => sourceFrom(rows)(c, t), true);
    await cache.rebuild();
    rows = [{ userId: "a", totalXp: 50 }];
    await cache.rebuild();

    expect(await cache.getPage(0, 10)).toEqual({ entries: [{ userId: "a", totalXp: 50 }], total: 1 });
  });

  it("tabela vazia → set vazio, mas marcado como reconstruído", async () => {
    const cache = new LeaderboardCache(() => redis, sourceFrom([]), true);
    expect(await cache.rebuild()).toEqual({ members: 0 });
    expect(await cache.getPage(0, 10)).toEqual({ entries: [], total: 0 });
  });

  it("não reconstrói enquanto outro processo segura o lock", async () => {
    await redis.set("leaderboard:alltime:lock", "outro", "EX", 60);
    const source = vi.fn(sourceFrom([{ userId: "a", totalXp: 1 }]));
    const cache = new LeaderboardCache(() => redis, source, true);

    expect(await cache.rebuild()).toBeNull();
    expect(source).not.toHaveBeenCalled();
  });

  it("libera o lock mesmo se a leitura do banco falhar", async () => {
    const cache = new LeaderboardCache(
      () => redis,
      async () => {
        throw new Error("banco fora");
      },
      true,
    );
    await expect(cache.rebuild()).rejects.toThrow("banco fora");
    expect(await redis.get("leaderboard:alltime:lock")).toBeNull();
  });

  it("nunca construído → null (serviço usa o banco)", async () => {
    const cache = new LeaderboardCache(() => redis, sourceFrom([]), true);
    expect(await cache.getPage(0, 10)).toBeNull();
  });

  it("set velho demais (job parado) → null", async () => {
    const cache = new LeaderboardCache(() => redis, sourceFrom([{ userId: "a", totalXp: 1 }]), true);
    await cache.rebuild();
    await redis.set(
      "leaderboard:alltime:built_at",
      String(Date.now() - LEADERBOARD_MAX_STALENESS_MS - 1_000),
    );
    expect(await cache.getPage(0, 10)).toBeNull();
  });

  it("Redis não conectado → null sem tocar no Redis", async () => {
    const offline = new RedisMock() as unknown as Redis;
    Object.defineProperty(offline, "status", { value: "reconnecting" });
    const multi = vi.spyOn(offline, "multi");
    const cache = new LeaderboardCache(() => offline, sourceFrom([]), true);

    expect(await cache.getPage(0, 10)).toBeNull();
    expect(multi).not.toHaveBeenCalled();
  });

  it("desligado (testes/flag) → null", async () => {
    const cache = new LeaderboardCache(() => redis, sourceFrom([]), false);
    expect(await cache.getPage(0, 10)).toBeNull();
  });
});
