import type { CoinSource, XpSource } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import { logger } from "../../../config/logger";
import { applyXp, COIN_SOURCE_LABELS, XP_SOURCE_LABELS } from "./rules";
import { getTotalRewardMultiplier } from "./reward-multiplier";
import { createNotification, recordSocialActivity } from "./notify";

/**
 * Concessão de XP e moedas — ÚNICA implementação da plataforma.
 *
 * Porta fiel de `awardXp` (`Hexavante/src/services/xp.service.ts`) e
 * `awardCoins` (`wallet.service.ts`) do Web. Usada pelas aulas e simulados
 * da própria API (Desktop/Mobile), pelo Web via `/internal/v1/gamification/*`
 * e pelo fechamento de temporada.
 *
 * Garantias:
 * - idempotente por (userId, source, sourceId): reenvio devolve `null`;
 * - leitura e escrita de saldo/nível na MESMA transação;
 * - `amount` é o valor BASE — os multiplicadores são aplicados aqui
 *   (XP: booster pessoal × global; moedas: premium × pessoal × global).
 *   Chamadores nunca aplicam booster por conta própria.
 */

export interface XpAward {
  amount: number;
  description: string;
  leveledUp: boolean;
  newLevel?: number;
}

export interface CoinAward {
  amount: number;
  description: string;
  multiplier: number;
  balance: number;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

function formatMultiplier(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export async function awardXp(
  userId: string,
  amount: number,
  source: XpSource,
  sourceId: string,
  description?: string,
): Promise<XpAward | null> {
  if (amount <= 0) return null;

  const rewards = await getTotalRewardMultiplier(userId);
  const boosterMultiplier = rewards.booster;
  const finalAmount = Math.round(amount * boosterMultiplier);
  const label = description ?? XP_SOURCE_LABELS[source] ?? "XP ganho";

  const boosterParts: string[] = [];
  if (rewards.global > 1) boosterParts.push(`global x${rewards.global}`);
  if (rewards.booster / rewards.global > 1) {
    boosterParts.push(`pessoal x${formatMultiplier(rewards.booster / rewards.global)}`);
  }
  const awardLabel =
    boosterMultiplier > 1
      ? `${label} (booster ${boosterParts.join(" · ") || `x${boosterMultiplier}`})`
      : label;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.xpTransaction.findUnique({
        where: { userId_source_sourceId: { userId, source, sourceId } },
      });
      if (existing) return null;

      let userXp = await tx.userXP.findUnique({ where: { userId } });
      if (!userXp) userXp = await tx.userXP.create({ data: { userId } });

      const updated = applyXp(userXp.level, userXp.currentXp, userXp.totalXp, finalAmount);
      const leveledUp = updated.level > userXp.level;

      await tx.xpTransaction.create({
        data: { userId, amount: finalAmount, source, sourceId, description: awardLabel },
      });
      await tx.userXP.update({ where: { userId }, data: updated });

      return {
        amount: finalAmount,
        description: awardLabel,
        leveledUp,
        newLevel: leveledUp ? updated.level : undefined,
      } satisfies XpAward;
    });

    if (result?.leveledUp && result.newLevel) {
      await recordSocialActivity(
        userId,
        "LEVEL_UP",
        { newLevel: result.newLevel },
        `level:${result.newLevel}`,
      );
      try {
        await createNotification({
          userId,
          type: "LEVEL_UP",
          title: `Nível ${result.newLevel}!`,
          message: `Parabéns! Você subiu para o nível ${result.newLevel}.`,
          link: "/perfil",
        });
      } catch (err) {
        logger.warn({ err, userId }, "Falha ao criar notificação de XP");
      }
    }

    return result;
  } catch (error) {
    // Corrida perdida no @@unique([userId, source, sourceId]): outra
    // requisição concedeu o mesmo XP — não é erro.
    if (isUniqueViolation(error)) return null;
    logger.error({ err: error, userId, source, sourceId }, "Erro ao conceder XP");
    return null;
  }
}

export async function awardCoins(
  userId: string,
  baseAmount: number,
  source: CoinSource,
  sourceId: string,
  description?: string,
): Promise<CoinAward | null> {
  if (baseAmount <= 0) return null;

  const rewards = await getTotalRewardMultiplier(userId);
  const multiplier = rewards.total;
  const amount = Math.round(baseAmount * multiplier);
  const label = description ?? COIN_SOURCE_LABELS[source] ?? "Moedas ganhas";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.coinTransaction.findUnique({
        where: { userId_source_sourceId: { userId, source, sourceId } },
      });
      if (existing) return null;

      const user = await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: amount } },
        select: { coins: true },
      });

      await tx.coinTransaction.create({
        data: {
          userId,
          amount,
          type: "EARN",
          source,
          sourceId,
          description: multiplier > 1 ? `${label} (x${multiplier})` : label,
        },
      });

      return { amount, description: label, multiplier, balance: user.coins } satisfies CoinAward;
    });

    if (result) {
      // Espelho legado do saldo (o Web lê `user_wallets` em alguns lugares).
      await prisma.userWallet.upsert({
        where: { userId },
        create: { userId, coins: result.balance },
        update: { coins: result.balance },
      });
      try {
        await createNotification({
          userId,
          type: "COIN_EARNED",
          title: "Moedas ganhas",
          message: `+${result.amount} moedas — ${result.description}`,
          link: "/shop",
        });
      } catch (err) {
        logger.warn({ err, userId }, "Falha ao notificar moedas");
      }
    }

    return result;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}
