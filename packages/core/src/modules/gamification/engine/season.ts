import type { RankingLeague } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import { logger } from "../../../config/logger";
import {
  DEMOTION_SLOTS,
  LEAGUE_ORDER,
  MIN_LEAGUE_SIZE_FOR_DEMOTION,
  PROMOTION_SLOTS,
  formatSeasonLabel,
  getCurrentSeasonKey,
  getNextLeague,
  getPreviousLeague,
  getPreviousSeasonKey,
  getSeasonBounds,
  getSeasonRewardCoins,
} from "./rules";
import { createNotification } from "./notify";

/**
 * Fechamento mensal das ligas — porta fiel de `runPreviousSeasonProcessing`
 * (`Hexavante/src/services/ranking-season.service.ts`).
 *
 * Antes rodava "preguiçoso", na primeira visita à página de ranking do Web.
 * Agora roda como job agendado da fila `hx-maintenance` (a cada hora; é
 * idempotente via `ranking_seasons.processed_at`, então só o primeiro run
 * do mês faz trabalho).
 */

export interface SeasonProcessingResult {
  seasonKey: string;
  processed: boolean;
  results: number;
}

async function getSeasonXpByUser(userIds: string[], seasonKey: string): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const { startsAt, endsAt } = getSeasonBounds(seasonKey);
  const grouped = await prisma.xpTransaction.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, createdAt: { gte: startsAt, lte: endsAt } },
    _sum: { amount: true },
  });
  return new Map(grouped.map((row) => [row.userId, row._sum.amount ?? 0]));
}

/** Garante a linha da temporada corrente (usada pelos rankings de liga). */
export async function ensureCurrentSeasonRecord(now = new Date()): Promise<void> {
  const seasonKey = getCurrentSeasonKey(now);
  const bounds = getSeasonBounds(seasonKey);
  await prisma.rankingSeason.upsert({
    where: { seasonKey },
    create: { seasonKey, startsAt: bounds.startsAt, endsAt: bounds.endsAt },
    update: {},
  });
}

export async function processPreviousSeason(now = new Date()): Promise<SeasonProcessingResult> {
  const previousKey = getPreviousSeasonKey(now);
  const currentKey = getCurrentSeasonKey(now);
  if (previousKey >= currentKey) return { seasonKey: previousKey, processed: false, results: 0 };

  const season = await prisma.rankingSeason.findUnique({ where: { seasonKey: previousKey } });
  if (season?.processedAt) return { seasonKey: previousKey, processed: false, results: 0 };

  let claimed = false;

  await prisma.$transaction(
    async (tx) => {
      const locked = await tx.rankingSeason.findUnique({ where: { seasonKey: previousKey } });
      if (locked?.processedAt) return;
      claimed = true;

      const bounds = getSeasonBounds(previousKey);
      await tx.rankingSeason.upsert({
        where: { seasonKey: previousKey },
        create: {
          seasonKey: previousKey,
          startsAt: bounds.startsAt,
          endsAt: bounds.endsAt,
          processedAt: new Date(),
        },
        update: { processedAt: new Date() },
      });

      for (const league of LEAGUE_ORDER) {
        const members = await tx.userXP.findMany({
          where: { league },
          select: { userId: true, league: true },
        });
        if (members.length === 0) continue;

        const xpMap = await getSeasonXpByUser(
          members.map((m) => m.userId),
          previousKey,
        );

        const ranked = members
          .map((member) => ({ userId: member.userId, seasonXp: xpMap.get(member.userId) ?? 0 }))
          .filter((entry) => entry.seasonXp > 0)
          .sort((a, b) => b.seasonXp - a.seasonXp);

        if (ranked.length === 0) continue;

        const promoteIds = new Set(ranked.slice(0, PROMOTION_SLOTS).map((e) => e.userId));
        const demoteIds =
          ranked.length >= MIN_LEAGUE_SIZE_FOR_DEMOTION
            ? new Set(ranked.slice(-DEMOTION_SLOTS).map((e) => e.userId))
            : new Set<string>();

        for (let index = 0; index < ranked.length; index++) {
          const entry = ranked[index];
          const finalRank = index + 1;
          const promoted = promoteIds.has(entry.userId) && getNextLeague(league) !== null;
          const demoted = demoteIds.has(entry.userId) && getPreviousLeague(league) !== null;
          const rewardCoins = getSeasonRewardCoins(league, finalRank, entry.seasonXp);

          const data = { league, seasonXp: entry.seasonXp, finalRank, promoted, demoted, rewardCoins };
          await tx.rankingSeasonResult.upsert({
            where: { userId_seasonKey: { userId: entry.userId, seasonKey: previousKey } },
            create: { userId: entry.userId, seasonKey: previousKey, ...data },
            update: data,
          });

          const newLeague: RankingLeague | null = promoted
            ? getNextLeague(league)
            : demoted
              ? getPreviousLeague(league)
              : null;
          if (newLeague) {
            await tx.userXP.update({ where: { userId: entry.userId }, data: { league: newLeague } });
          }
        }
      }
    },
    // Job em segundo plano: ligas grandes passam fácil dos 5s padrão.
    { timeout: 120_000, maxWait: 10_000 },
  );

  if (!claimed) return { seasonKey: previousKey, processed: false, results: 0 };

  const results = await prisma.rankingSeasonResult.findMany({
    where: { seasonKey: previousKey, rewardCoins: { gt: 0 } },
  });

  const label = formatSeasonLabel(previousKey);
  for (const result of results) {
    let message = `Você ficou em ${result.finalRank}º na Liga ${result.league} de ${label}.`;
    if (result.promoted) message += " Você foi promovido!";
    if (result.demoted) message += " Você foi rebaixado nesta temporada.";
    if (result.rewardCoins > 0) message += ` Resgate ${result.rewardCoins} moedas no ranking.`;

    try {
      await createNotification({
        userId: result.userId,
        type: "XP_EARNED",
        title: "Temporada encerrada",
        message,
        link: "/ranking",
      });
    } catch (err) {
      logger.warn({ err, userId: result.userId }, "temporada: falha ao notificar");
    }
  }

  logger.info({ seasonKey: previousKey, rewarded: results.length }, "temporada encerrada");
  return { seasonKey: previousKey, processed: true, results: results.length };
}
