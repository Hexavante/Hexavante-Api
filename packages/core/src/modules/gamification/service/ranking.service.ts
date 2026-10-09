import type { IGamificationRepository } from "../repository/gamification.repository";
import { prisma } from "../../../config/prisma";
import { buildPagination } from "../../../lib/serializers/base";
import { NotFoundError } from "../../../lib/errors/AppError";

export class RankingService {
  constructor(
    private readonly gamificationRepository: IGamificationRepository,
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
    const [rows, total] = await Promise.all([
      prisma.userXP.findMany({
        orderBy: [{ totalXp: "desc" }, { level: "desc" }],
        skip,
        take: limit,
        include: {
          user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        },
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
