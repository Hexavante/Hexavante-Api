import type { IGamificationRepository } from "../repository/gamification.repository";
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
      return {
        data: [],
        pagination: buildPagination({ page, limit: maxLimit }, 0),
        season: null,
      };
    }

    const { entries, total } = await this.gamificationRepository.getLeaderboard(
      season.seasonKey,
      skip,
      maxLimit,
    );

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

  async getUserPosition(userId: string) {
    const season = await this.gamificationRepository.getCurrentSeason();
    if (!season) {
      throw new NotFoundError("Nenhuma temporada ativa no momento");
    }

    const rank = await this.gamificationRepository.getUserRank(userId, season.seasonKey);
    if (rank === null) {
      throw new NotFoundError("Você ainda não possui pontuação nesta temporada");
    }

    const userXp = await this.gamificationRepository.getOrCreateUserXp(userId);

    return {
      rank,
      seasonKey: season.seasonKey,
      league: userXp.league,
      totalXp: userXp.totalXp,
      level: userXp.level,
    };
  }

}
