import type { NotificationType, RankingLeague } from "@prisma/client";

/**
 * Regras de gamificação — FONTE ÚNICA para Web, Admin, Desktop e Mobile.
 *
 * Cópia fiel de `Hexavante/src/lib/gamification.ts`, `lib/premium.ts`,
 * `lib/ranking-leagues.ts`, `lib/exam-daily-rewards.ts` e
 * `lib/notifications.ts` (parte de preferências) do Web, que eram a
 * referência de produção. Qualquer mudança de regra acontece AQUI; o Web
 * passa a chamar a API em vez de calcular por conta própria.
 *
 * Só funções puras e constantes — nada de banco.
 */

// ── XP e moedas ────────────────────────────────────────────────────────────

export const XP_REWARDS = {
  LESSON: 10,
  MODULE: 25,
  COURSE: 100,
  EXAM: 20,
  EXAM_PASS_BONUS: 30,
} as const;

export const COIN_REWARDS = {
  EXAM_CORRECT: 5,
  LESSON: 3,
  MODULE: 10,
  COURSE: 25,
} as const;

export const EXAM_PASS_SCORE = 70;

/** XP necessário para subir do nível `level` para o próximo. */
export function xpRequiredForLevel(level: number): number {
  return level * 100;
}

export function applyXp(level: number, currentXp: number, totalXp: number, amount: number) {
  let newLevel = level;
  let newCurrentXp = currentXp + amount;
  const newTotalXp = totalXp + amount;

  while (newCurrentXp >= xpRequiredForLevel(newLevel)) {
    newCurrentXp -= xpRequiredForLevel(newLevel);
    newLevel += 1;
  }

  return { level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp };
}

export function xpProgressPercent(level: number, currentXp: number): number {
  const needed = xpRequiredForLevel(level);
  return needed > 0 ? Math.min(100, Math.round((currentXp / needed) * 100)) : 0;
}

export const XP_SOURCE_LABELS: Record<string, string> = {
  LESSON: "Aula concluída",
  MODULE: "Módulo concluído",
  COURSE: "Curso concluído",
  EXAM: "Simulado finalizado",
  ADMIN: "Ajuste administrativo",
};

export const COIN_SOURCE_LABELS: Record<string, string> = {
  EXAM_CORRECT: "Questão correta",
  SHOP_PURCHASE: "Compra na loja",
  LESSON: "Aula concluída",
  MODULE: "Módulo concluído",
  COURSE: "Curso concluído",
  PREMIUM_GRANT: "Bônus Premium",
  LEAGUE_REWARD: "Recompensa de liga",
  ADMIN: "Ajuste administrativo",
};

// ── Premium ────────────────────────────────────────────────────────────────

export const PREMIUM_COIN_MULTIPLIER = 2;

export function isPremiumActive(user: { isPremium: boolean; premiumExpiresAt: Date | null }): boolean {
  if (!user.isPremium) return false;
  if (!user.premiumExpiresAt) return true;
  return user.premiumExpiresAt > new Date();
}

export function premiumCoinMultiplier(user: { isPremium: boolean; premiumExpiresAt: Date | null }): number {
  return isPremiumActive(user) ? PREMIUM_COIN_MULTIPLIER : 1;
}

// ── Recompensa diária de simulados ─────────────────────────────────────────

/** Multiplicadores por ordem do dia (1º, 2º, 3º, 4º+). */
export const EXAM_DAILY_REWARD_MULTIPLIERS = [1, 0.35, 0.12, 0.05] as const;

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getSaoPauloDayBounds(reference = new Date()) {
  const spInstant = new Date(reference.getTime() - SAO_PAULO_OFFSET_MS);
  const y = spInstant.getUTCFullYear();
  const m = spInstant.getUTCMonth();
  const d = spInstant.getUTCDate();

  const start = new Date(Date.UTC(y, m, d, 3, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, 3, 0, 0, 0));
  return { start, end };
}

export function getMultiplierForDailyAttempt(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber, 1) - 1, EXAM_DAILY_REWARD_MULTIPLIERS.length - 1);
  return EXAM_DAILY_REWARD_MULTIPLIERS[index];
}

export function applyDailyRewardAmount(base: number, multiplier: number): number {
  if (base <= 0) return 0;
  return Math.max(1, Math.round(base * multiplier));
}

// ── Ligas e temporadas ─────────────────────────────────────────────────────

export const LEAGUE_ORDER: RankingLeague[] = ["BRONZE", "SILVER", "GOLD"];

export const PROMOTION_SLOTS = 5;
export const DEMOTION_SLOTS = 5;
export const MIN_LEAGUE_SIZE_FOR_DEMOTION = 10;
export const PARTICIPATION_XP_MIN = 50;
export const PARTICIPATION_REWARD_COINS = 5;

const TOP_REWARDS: Record<RankingLeague, Record<number, number>> = {
  BRONZE: { 1: 50, 2: 35, 3: 25, 4: 15, 5: 15, 6: 10, 7: 10, 8: 10, 9: 10, 10: 10 },
  SILVER: { 1: 75, 2: 50, 3: 40, 4: 20, 5: 20, 6: 15, 7: 15, 8: 15, 9: 15, 10: 15 },
  GOLD: { 1: 100, 2: 75, 3: 50, 4: 25, 5: 25, 6: 20, 7: 20, 8: 20, 9: 20, 10: 20 },
};

export function getSeasonRewardCoins(league: RankingLeague, rank: number, seasonXp: number): number {
  if (rank <= 10) return TOP_REWARDS[league][rank] ?? 0;
  if (seasonXp >= PARTICIPATION_XP_MIN) return PARTICIPATION_REWARD_COINS;
  return 0;
}

export function getNextLeague(league: RankingLeague): RankingLeague | null {
  const index = LEAGUE_ORDER.indexOf(league);
  if (index < 0 || index >= LEAGUE_ORDER.length - 1) return null;
  return LEAGUE_ORDER[index + 1];
}

export function getPreviousLeague(league: RankingLeague): RankingLeague | null {
  const index = LEAGUE_ORDER.indexOf(league);
  if (index <= 0) return null;
  return LEAGUE_ORDER[index - 1];
}

export function formatSeasonLabel(seasonKey: string): string {
  const [year, month] = seasonKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getCurrentSeasonKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getPreviousSeasonKey(date = new Date()): string {
  const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return getCurrentSeasonKey(prev);
}

export function getSeasonBounds(seasonKey: string): { startsAt: Date; endsAt: Date } {
  const [year, month] = seasonKey.split("-").map(Number);
  const startsAt = new Date(year, month - 1, 1);
  const endsAt = new Date(year, month, 0, 23, 59, 59, 999);
  return { startsAt, endsAt };
}

// ── Preferências de notificação ────────────────────────────────────────────

export type NotificationPreferenceKey =
  | "learningProgress"
  | "certificates"
  | "courseUpdates"
  | "messages"
  | "community"
  | "moderation"
  | "coinsAndRewards"
  | "rankingSeason"
  | "systemAnnouncements";

export const DEFAULT_NOTIFICATION_SETTINGS: Record<NotificationPreferenceKey, boolean> = {
  learningProgress: true,
  certificates: true,
  courseUpdates: true,
  messages: true,
  community: true,
  moderation: true,
  coinsAndRewards: true,
  rankingSeason: true,
  systemAnnouncements: true,
};

const PREFERENCE_BY_TYPE: Record<NotificationType, NotificationPreferenceKey> = {
  XP_EARNED: "learningProgress",
  LEVEL_UP: "learningProgress",
  CERTIFICATE_ISSUED: "certificates",
  COURSE_UPDATED: "courseUpdates",
  NEW_MESSAGE: "messages",
  COMMUNITY_REPLY: "community",
  SOLUTION_ACCEPTED: "community",
  COIN_EARNED: "coinsAndRewards",
  COURSE_APPROVED: "moderation",
  COURSE_REJECTED: "moderation",
  INSTRUCTOR_APPROVED: "moderation",
  INSTRUCTOR_REJECTED: "moderation",
  MODERATION_ACTION: "moderation",
  SYSTEM_ANNOUNCEMENT: "systemAnnouncements",
};

export function getPreferenceKeyForType(type: NotificationType): NotificationPreferenceKey {
  return PREFERENCE_BY_TYPE[type];
}

export function isRankingSeasonNotification(type: NotificationType, link: string | null): boolean {
  return type === "XP_EARNED" && link === "/ranking";
}

export const NOTIFICATION_DEDUPE_MINUTES: Partial<Record<NotificationType, number>> = {
  XP_EARNED: 60,
  COIN_EARNED: 30,
  NEW_MESSAGE: 10,
  COMMUNITY_REPLY: 15,
  COURSE_UPDATED: 24 * 60,
};
