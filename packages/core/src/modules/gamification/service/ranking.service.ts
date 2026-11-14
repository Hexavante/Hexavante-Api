import type { IGamificationRepository } from "../repository/gamification.repository";
import { prisma } from "../../../config/prisma";
import { buildPagination } from "../../../lib/serializers/base";
import {
  leaderboardCache,
  type ILeaderboardCache,
} from "../../../lib/cache/leaderboard.cache";

const userSelect = { id: true, username: true, fullName: true, avatarUrl: true } as const;

export class RankingService {
  constructor(
    private readonly gamificationRepository: IGamificationRepository,
    private readonly leaderboard: ILeaderboardCache = leaderboardCache,
  ) {}

  async getLeaderboard(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const maxLimit = Math.min(limit, 100);

    const season = await this.gamificationRepository.getCurrentSeason();
    if (!season) {
      return this.getAllTimeLeaderboard(page, maxLimit);
    }

    const { entries, total } = await this.gamificationRepository.getLeaderboard(
      season.seasonKey,
      skip,
      maxLimit,
    );

    if (total === 0) {
      return this.getAllTimeLeaderboard(page, maxLimit);
    }

    const data = entries.map((e) => ({
      rank: e.rank,
      userId: e.userId,
      username: e.username,
      fullName: e.fullName,
      avatarUrl: e.avatarUrl,
      level: e.level,
      totalXp: e.totalXp,
      league: e.league,
    }));

    const pagination = buildPagination({ page, limit: maxLimit }, total);

    return {
      data,
      pagination,
      season: {
        seasonKey: season.seasonKey,
        startsAt: season.startsAt.toISOString(),
        endsAt: season.endsAt.toISOString(),
      },
    };
  }

  /**
   * Fallback usado quando não há temporada ativa: mesmo ranking "geral"
   * do app (UserXP ordenado por XP total). Mantém a landing igual ao app.
   */
  private async getAllTimeLeaderboard(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const fromRedis = await this.getAllTimeFromRedis(page, skip, limit);
    if (fromRedis) return fromRedis;

    const [rows, total] = await Promise.all([
      prisma.userXP.findMany({
        orderBy: [{ totalXp: "desc" }, { level: "desc" }],
        skip,
        take: limit,
        include: { user: { select: userSelect } },
      }),
      prisma.userXP.count(),
    ]);

    return {
      data: rows.map((row, i) => ({
        rank: skip + i + 1,
        userId: row.userId,
        username: row.user.username,
        fullName: row.user.fullName,
        avatarUrl: row.user.avatarUrl,
        level: row.level,
        totalXp: row.totalXp,
        league: row.league,
      })),
      pagination: buildPagination({ page, limit }, total),
      season: null,
    };
  }

  /**
   * Ordem e total vêm do Sorted Set; nome/avatar/nível vêm do banco só para
   * os `limit` usuários da página (WHERE IN pela chave primária).
   */
  private async getAllTimeFromRedis(page: number, skip: number, limit: number) {
    const cached = await this.leaderboard.getPage(skip, limit);
    if (!cached) return null;

    const ids = cached.entries.map((e) => e.userId);
    const rows = ids.length
      ? await prisma.userXP.findMany({
          where: { userId: { in: ids } },
          include: { user: { select: userSelect } },
        })
      : [];
    const byUser = new Map(rows.map((r) => [r.userId, r]));

    const data = cached.entries.flatMap((entry, i) => {
      const row = byUser.get(entry.userId);
      // Usuário removido desde a última reconstrução: pula.
      if (!row) return [];
      return [
        {
          rank: skip + i + 1,
          userId: row.userId,
          username: row.user.username,
          fullName: row.user.fullName,
          avatarUrl: row.user.avatarUrl,
          level: row.level,
          totalXp: row.totalXp,
          league: row.league,
        },
      ];
    });

    return {
      data,
      pagination: buildPagination({ page, limit }, cached.total),
      season: null,
    };
  }

  async getUserPosition(userId: string) {
    const season = await this.gamificationRepository.getCurrentSeason();
    const userXp = await this.gamificationRepository.getOrCreateUserXp(userId);

    // Sem temporada ativa ou sem pontuação: 200 com rank nulo
    // (404 quebrava dashboards que consomem este endpoint junto a outros).
    if (!season) {
      return {
        rank: null,
        seasonKey: null,
        league: userXp.league,
        totalXp: userXp.totalXp,
        level: userXp.level,
      };
    }

    const rank = await this.gamificationRepository.getUserRank(userId, season.seasonKey);

    return {
      rank,
      seasonKey: season.seasonKey,
      league: userXp.league,
      totalXp: userXp.totalXp,
      level: userXp.level,
    };
  }

}
