import type { IGamificationRepository } from "../repository/gamification.repository";
import { prisma } from "../../../config/prisma";
import { buildPagination } from "../../../lib/serializers/base";
import { NotFoundError } from "../../../lib/errors/AppError";
import type { RankingLeague, XpSource } from "@prisma/client";

function countConsecutiveDays(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const uniqueDays = [...new Set(dates.map((d) => d.toISOString().slice(0, 10)))].sort().reverse();
  let streak = 1;
  const today = new Date().toISOString().slice(0, 10);
  if (uniqueDays[0] !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (uniqueDays[0] !== yesterday.toISOString().slice(0, 10)) return 0;
  }
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]);
    const curr = new Date(uniqueDays[i]);
    const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

const ACHIEVEMENTS = [
  { key: "first_lesson", name: "Primeira Aula", description: "Complete sua primeira aula" },
  { key: "ten_lessons", name: "Dedicado", description: "Complete 10 aulas" },
  { key: "fifty_lessons", name: "Viciado em Estudo", description: "Complete 50 aulas" },
  { key: "hundred_lessons", name: "Mestre dos Estudos", description: "Complete 100 aulas" },
  { key: "first_course", name: "Primeiro Curso", description: "Complete seu primeiro curso" },
  { key: "five_courses", name: "Poliglota", description: "Complete 5 cursos" },
  { key: "first_exam", name: "Primeiro Teste", description: "Responda seu primeiro exame" },
  { key: "perfect_exam", name: "Nota Máxima", description: "100% de acerto em um exame" },
  { key: "level_5", name: "Aprendiz", description: "Atinga o nível 5" },
  { key: "level_10", name: "Experiente", description: "Atinga o nível 10" },
  { key: "level_25", name: "Veterano", description: "Atinga o nível 25" },
  { key: "level_50", name: "Lendário", description: "Atinga o nível 50" },
];

export function calculateLevel(totalXp: number): number {
  return Math.floor(Math.sqrt(totalXp / 100));
}

export function xpRequiredForLevel(level: number): number {
  return level * 100;
}

export function xpProgressPercent(level: number, currentXp: number): number {
  const needed = xpRequiredForLevel(level);
  return needed > 0 ? Math.min(100, Math.round((currentXp / needed) * 100)) : 0;
}

export function getAllAchievements() {
  return ACHIEVEMENTS;
}

interface AwardXpResult {
  xpAwarded: number;
  previousLevel: number;
  currentLevel: number;
  leveledUp: boolean;
  newAchievements: string[];
}

export class XpService {
  constructor(private readonly gamificationRepository: IGamificationRepository) {}

  async award(
    userId: string,
    amount: number,
    source: XpSource,
    sourceId: string,
    description?: string,
  ): Promise<AwardXpResult> {
    const userXp = await this.gamificationRepository.getOrCreateUserXp(userId);
    const previousLevel = userXp.level;

    await this.gamificationRepository.createXpTransaction(
      userId,
      amount,
      source,
      sourceId,
      description,
    );

    const newTotalXp = userXp.totalXp + amount;
    const newLevel = calculateLevel(newTotalXp);

    const league = this.calculateLeague(newLevel);

    await this.gamificationRepository.updateUserXp(userXp.id, {
      level: newLevel,
      currentXp: userXp.currentXp + amount,
      totalXp: newTotalXp,
      league,
    });

    const leveledUp = newLevel > previousLevel;

    const newAchievements: string[] = [];
    const unlocked = await this.gamificationRepository.getUserAchievements(userId);
    const unlockedKeys = new Set(unlocked.map((a) => a.achievementKey));

    for (const achievement of ACHIEVEMENTS) {
      if (unlockedKeys.has(achievement.key)) continue;
      if (this.checkAchievementCondition(achievement.key, userId, { newLevel, newTotalXp })) {
        await this.gamificationRepository.createUserAchievement(userId, achievement.key);
        newAchievements.push(achievement.key);
      }
    }

    return {
      xpAwarded: amount,
      previousLevel,
      currentLevel: newLevel,
      leveledUp,
      newAchievements,
    };
  }

  async getProfile(userId: string) {
    const userXp = await this.gamificationRepository.getOrCreateUserXp(userId);
    const recentActivity = await prisma.xpTransaction.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 90,
    });
    const dates = recentActivity.map((t) => t.createdAt);
    return {
      level: userXp.level,
      currentXp: userXp.currentXp,
      totalXp: userXp.totalXp,
      league: userXp.league,
      xpToNextLevel: xpRequiredForLevel(userXp.level),
      progressPercent: xpProgressPercent(userXp.level, userXp.currentXp),
      streakDays: countConsecutiveDays(dates),
      activeDays: new Set(dates.map((d) => d.toISOString().slice(0, 10))).size,
    };
  }

  async getHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const { transactions, total } = await this.gamificationRepository.getXpHistory(
      userId,
      skip,
      limit,
    );

    const data = transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      source: t.source,
      sourceId: t.sourceId,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    }));

    const pagination = buildPagination({ page, limit }, total);
    return { data, pagination };
  }

  async getUserAchievements(userId: string) {
    const userAchievements = await this.gamificationRepository.getUserAchievements(userId);
    const unlockedKeys = new Set(userAchievements.map((a) => a.achievementKey));

    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: unlockedKeys.has(a.key),
      unlockedAt: userAchievements.find((ua) => ua.achievementKey === a.key)?.unlockedAt.toISOString() ?? null,
    }));
  }

  private calculateLeague(level: number): RankingLeague {
    if (level >= 25) return "GOLD" as RankingLeague;
    if (level >= 10) return "SILVER" as RankingLeague;
    return "BRONZE" as RankingLeague;
  }

  private checkAchievementCondition(
    key: string,
    _userId: string,
    context: { newLevel: number; newTotalXp: number },
  ): boolean {
    switch (key) {
      case "level_5": return context.newLevel >= 5;
      case "level_10": return context.newLevel >= 10;
      case "level_25": return context.newLevel >= 25;
      case "level_50": return context.newLevel >= 50;
      default: return false;
    }
  }
}
