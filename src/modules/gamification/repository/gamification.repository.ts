import { prisma } from "../../../config/prisma";
import type { PaginationParams } from "../../../lib/serializers/base";

export interface IGamificationRepository {
  getCurrentSeason(): Promise<{ seasonKey: string; startsAt: Date; endsAt: Date } | null>;

  getLeaderboard(seasonKey: string, skip: number, limit: number): Promise<{
    entries: Array<{
      userId: string;
      username: string;
      fullName: string;
      avatarUrl: string | null;
      level: number;
      totalXp: number;
      league: string;
      rank: number;
    }>;
    total: number;
  }>;

  getUserRank(userId: string, seasonKey: string): Promise<number | null>;

  getXpHistory(userId: string, skip: number, limit: number): Promise<{
    transactions: Array<{
      id: string;
      amount: number;
      source: string;
      sourceId: string;
      description: string | null;
      createdAt: Date;
    }>;
    total: number;
  }>;

  getOrCreateUserXp(userId: string): Promise<{
    id: string;
    level: number;
    currentXp: number;
    totalXp: number;
    league: string;
  }>;

  createXpTransaction(
    userId: string,
    amount: number,
    source: string,
    sourceId: string,
    description?: string,
  ): Promise<void>;

  updateUserXp(
    userXpId: string,
    data: { level: number; currentXp: number; totalXp: number; league?: string },
  ): Promise<void>;

  getUserAchievements(userId: string): Promise<Array<{ achievementKey: string; unlockedAt: Date }>>;
  createUserAchievement(userId: string, achievementKey: string): Promise<void>;
}

export class GamificationRepository implements IGamificationRepository {
  async getCurrentSeason() {
    const now = new Date();
    const season = await prisma.rankingSeason.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gte: now } },
      select: { seasonKey: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "desc" },
    });
    return season;
  }

  async getLeaderboard(seasonKey: string, skip: number, limit: number) {
    const where = { seasonKey };

    const [rows, total] = await Promise.all([
      prisma.rankingSeasonResult.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
              xp: { select: { level: true, totalXp: true, league: true } },
            },
          },
        },
        orderBy: { finalRank: "asc" },
        skip,
        take: limit,
      }),
      prisma.rankingSeasonResult.count({ where }),
    ]);

    const entries = rows.map((r) => ({
      userId: r.user.id,
      username: r.user.username,
      fullName: r.user.fullName,
      avatarUrl: r.user.avatarUrl,
      level: r.user.xp?.level ?? 1,
      totalXp: r.user.xp?.totalXp ?? 0,
      league: r.league,
      rank: r.finalRank,
    }));

    return { entries, total };
  }

  async getUserRank(userId: string, seasonKey: string) {
    const result = await prisma.rankingSeasonResult.findUnique({
      where: { userId_seasonKey: { userId, seasonKey } },
      select: { finalRank: true },
    });
    return result?.finalRank ?? null;
  }

  async getXpHistory(userId: string, skip: number, limit: number) {
    const where = { userId };

    const [transactions, total] = await Promise.all([
      prisma.xpTransaction.findMany({
        where,
        select: {
          id: true,
          amount: true,
          source: true,
          sourceId: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.xpTransaction.count({ where }),
    ]);

    return { transactions, total };
  }

  async getOrCreateUserXp(userId: string) {
    let userXp = await prisma.userXP.findUnique({
      where: { userId },
    });

    if (!userXp) {
      userXp = await prisma.userXP.create({
        data: { userId },
      });
    }

    return {
      id: userXp.id,
      level: userXp.level,
      currentXp: userXp.currentXp,
      totalXp: userXp.totalXp,
      league: userXp.league,
    };
  }

  async createXpTransaction(
    userId: string,
    amount: number,
    source: string,
    sourceId: string,
    description?: string,
  ): Promise<void> {
    await prisma.xpTransaction.create({
      data: {
        userId,
        amount,
        source: source as any,
        sourceId,
        description,
      },
    });
  }

  async updateUserXp(
    userXpId: string,
    data: { level: number; currentXp: number; totalXp: number; league?: string },
  ): Promise<void> {
    await prisma.userXP.update({
      where: { id: userXpId },
      data: {
        level: data.level,
        currentXp: data.currentXp,
        totalXp: data.totalXp,
        ...(data.league && { league: data.league as any }),
      },
    });
  }

  async getUserAchievements(userId: string) {
    const achievements = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementKey: true, unlockedAt: true },
      orderBy: { unlockedAt: "asc" },
    });
    return achievements;
  }

  async createUserAchievement(userId: string, achievementKey: string): Promise<void> {
    await prisma.userAchievement.create({
      data: { userId, achievementKey },
    });
  }
}
