import type { IGamificationRepository } from "../repository/gamification.repository";
import { prisma } from "../../../config/prisma";
import { buildPagination } from "../../../lib/serializers/base";
import { xpProgressPercent, xpRequiredForLevel } from "../engine/rules";

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

export function getAllAchievements() {
  return ACHIEVEMENTS;
}

/**
 * Leitura de perfil/histórico/conquistas de XP. A CONCESSÃO de XP fica
 * exclusivamente em `../engine/awards.ts` (antes havia aqui um `award` com
 * fórmula de nível diferente da usada no resto da plataforma).
 */
export class XpService {
  constructor(private readonly gamificationRepository: IGamificationRepository) {}

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
      title: (a as { title?: string; name?: string }).title ?? (a as { name?: string }).name ?? a.key,
      unlocked: unlockedKeys.has(a.key),
      unlockedAt: userAchievements.find((ua) => ua.achievementKey === a.key)?.unlockedAt.toISOString() ?? null,
    }));
  }
}
