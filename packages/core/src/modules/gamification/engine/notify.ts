import type { NotificationType, Prisma, SocialActivityType } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_DEDUPE_MINUTES,
  getPreferenceKeyForType,
  isRankingSeasonNotification,
} from "./rules";

/**
 * Notificações in-app e feed social disparados pela gamificação — porta fiel
 * de `createNotification` (com checagem de preferência e dedupe) e
 * `recordSocialActivity` do Web.
 */

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  skipPreferenceCheck?: boolean;
  skipDedupe?: boolean;
}

async function isNotificationTypeEnabled(
  userId: string,
  type: NotificationType,
  link: string | null,
): Promise<boolean> {
  const row = await prisma.userNotificationSettings.findUnique({ where: { userId } });
  const settings = row ?? DEFAULT_NOTIFICATION_SETTINGS;
  if (isRankingSeasonNotification(type, link)) return settings.rankingSeason;
  return settings[getPreferenceKeyForType(type)];
}

export async function createNotification(input: CreateNotificationInput) {
  const link = input.link ?? null;

  if (!input.skipPreferenceCheck) {
    const enabled = await isNotificationTypeEnabled(input.userId, input.type, link);
    if (!enabled) return null;
  }

  if (!input.skipDedupe) {
    const dedupeMinutes = NOTIFICATION_DEDUPE_MINUTES[input.type];
    if (dedupeMinutes) {
      const since = new Date(Date.now() - dedupeMinutes * 60_000);
      const existing = await prisma.notification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          ...(link ? { link } : {}),
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;
    }
  }

  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link,
    },
  });
}

/** Feed social é opcional: nunca derruba o fluxo principal. */
export async function recordSocialActivity(
  userId: string,
  type: SocialActivityType,
  metadata: Record<string, unknown>,
  sourceKey: string,
) {
  try {
    return await prisma.socialActivity.upsert({
      where: { userId_sourceKey: { userId, sourceKey } },
      create: { userId, type, sourceKey, metadata: metadata as Prisma.InputJsonValue },
      update: {},
    });
  } catch {
    return null;
  }
}
