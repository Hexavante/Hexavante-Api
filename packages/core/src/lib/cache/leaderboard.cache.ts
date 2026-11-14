import type Redis from "ioredis";
import { getRedisClient } from "../../config/redis";
import { prisma } from "../../config/prisma";
import { logger } from "../../config/logger";

/**
 * Ranking geral (all-time) em um Sorted Set do Redis.
 *
 * Por que reconstrução periódica e não ZINCRBY a cada XP ganho:
 * XP é gravado em vários lugares (aulas, provas, loja, pagamentos) e também
 * pelos apps Web/Admin direto no banco. Um incremento só na API deixaria o
 * ranking divergente. O set é uma "view materializada" de `user_xp`,
 * reconstruída a cada minuto por um job da fila de manutenção e trocada de
 * forma atômica (RENAME). Leituras viram O(log N) em vez de ORDER BY + COUNT.
 *
 * Se o set estiver ausente ou velho demais (job parado), `getPage` devolve
 * `null` e o serviço usa a consulta ao banco — nunca serve ranking antigo.
 */

const KEY = "leaderboard:alltime";
const BUILT_AT_KEY = "leaderboard:alltime:built_at";
const LOCK_KEY = "leaderboard:alltime:lock";
const BATCH_SIZE = 5_000;
const LOCK_TTL_SECONDS = 120;
const TMP_TTL_SECONDS = 300;

/** Intervalo do job de reconstrução. */
export const LEADERBOARD_REFRESH_MS = 60_000;
/** Acima disso o set é considerado velho e o banco é consultado. */
export const LEADERBOARD_MAX_STALENESS_MS = 5 * 60_000;

export interface LeaderboardPage {
  entries: Array<{ userId: string; totalXp: number }>;
  total: number;
}

export interface ILeaderboardCache {
  getPage(skip: number, limit: number): Promise<LeaderboardPage | null>;
  rebuild(): Promise<{ members: number } | null>;
}

interface XpRow {
  id: string;
  userId: string;
  totalXp: number;
}

/** Leitura paginada por cursor de `user_xp` (injetável em testes). */
export type XpRowSource = (cursor: string | null, take: number) => Promise<XpRow[]>;

const prismaXpRowSource: XpRowSource = (cursor, take) =>
  prisma.userXP.findMany({
    select: { id: true, userId: true, totalXp: true },
    orderBy: { id: "asc" },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

export class LeaderboardCache implements ILeaderboardCache {
  constructor(
    private readonly getRedis: () => Redis = getRedisClient,
    private readonly readRows: XpRowSource = prismaXpRowSource,
    private readonly enabled: boolean = process.env.NODE_ENV !== "test",
  ) {}

  async getPage(skip: number, limit: number): Promise<LeaderboardPage | null> {
    if (!this.enabled) return null;
    const redis = this.getRedis();
    if (redis.status !== "ready") return null;

    try {
      const results = await redis
        .multi()
        .get(BUILT_AT_KEY)
        .zcard(KEY)
        .zrevrange(KEY, skip, skip + limit - 1, "WITHSCORES")
        .exec();
      if (!results) return null;

      const [[e1, builtAt], [e2, total], [e3, raw]] = results as Array<[Error | null, unknown]>;
      if (e1 || e2 || e3) return null;

      const builtAtMs = Number(builtAt);
      if (!builtAt || !Number.isFinite(builtAtMs)) return null;
      if (Date.now() - builtAtMs > LEADERBOARD_MAX_STALENESS_MS) return null;

      const flat = raw as string[];
      const entries: LeaderboardPage["entries"] = [];
      for (let i = 0; i < flat.length; i += 2) {
        entries.push({ userId: flat[i], totalXp: Number(flat[i + 1]) });
      }
      return { entries, total: Number(total) };
    } catch (err) {
      logger.warn({ err }, "leaderboard: falha ao ler do Redis — usando banco");
      return null;
    }
  }

  /**
   * Reconstrói o set a partir de `user_xp`. Protegido por lock (SET NX) para
   * que só um processo reconstrua por vez. Devolve `null` se outro processo
   * já está reconstruindo.
   */
  async rebuild(): Promise<{ members: number } | null> {
    const redis = this.getRedis();
    const lock = await redis.set(LOCK_KEY, String(process.pid), "EX", LOCK_TTL_SECONDS, "NX");
    if (lock !== "OK") return null;

    const tmpKey = `${KEY}:tmp:${process.pid}:${Date.now()}`;
    try {
      let cursor: string | null = null;
      let members = 0;

      for (;;) {
        const rows = await this.readRows(cursor, BATCH_SIZE);
        if (rows.length === 0) break;

        const args: Array<string | number> = [];
        for (const row of rows) args.push(row.totalXp, row.userId);
        await redis.zadd(tmpKey, ...args);
        // Se o processo morrer no meio, o temporário some sozinho.
        if (members === 0) await redis.expire(tmpKey, TMP_TTL_SECONDS);

        members += rows.length;
        cursor = rows[rows.length - 1].id;
        if (rows.length < BATCH_SIZE) break;
      }

      const tx = redis.multi();
      if (members > 0) {
        // RENAME carrega o TTL do temporário — PERSIST remove.
        tx.rename(tmpKey, KEY).persist(KEY);
      } else {
        tx.del(KEY);
      }
      tx.set(BUILT_AT_KEY, String(Date.now()));
      await tx.exec();

      return { members };
    } finally {
      await redis.del(LOCK_KEY).catch(() => undefined);
    }
  }
}

export const leaderboardCache = new LeaderboardCache();
