import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CoinSource, XpSource } from "@prisma/client";
import { asyncHandler } from "../../lib/errors/errorHandler";
import { validateBody } from "../../lib/validation/validate";
import { awardCoins, awardXp } from "../../../packages/core/src/modules/gamification/engine";
import { requireInternalToken } from "./internal-auth";

/**
 * Gamificação para os servidores do Web/Admin.
 *
 * Contrato idêntico ao das funções `awardXp`/`awardCoins` que viviam no Web:
 * `amount` é o valor BASE (multiplicadores aplicados aqui) e a resposta é
 * `{ award: null }` quando a recompensa daquela fonte já tinha sido dada.
 */

const MAX_AMOUNT = 100_000;

const awardBase = {
  userId: z.string().min(1).max(64),
  amount: z.number().int().positive().max(MAX_AMOUNT),
  sourceId: z.string().min(1).max(191),
  description: z.string().max(255).optional(),
};

export const awardXpBodySchema = z.object({ ...awardBase, source: z.nativeEnum(XpSource) });
export const awardCoinsBodySchema = z.object({ ...awardBase, source: z.nativeEnum(CoinSource) });

type AwardXpBody = z.infer<typeof awardXpBodySchema>;
type AwardCoinsBody = z.infer<typeof awardCoinsBodySchema>;

/**
 * O Web inteiro sai do mesmo IP; o limite global (por IP) não serve aqui.
 * Limite próprio, alto, só para conter um cliente em loop.
 */
const internalRateLimit = { rateLimit: { max: 6000, timeWindow: "1 minute" } };

export async function gamificationInternalRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/internal/v1/gamification/xp",
    {
      preHandler: [requireInternalToken, validateBody(awardXpBodySchema)],
      config: internalRateLimit,
      schema: { hide: true },
    },
    asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as AwardXpBody;
      const award = await awardXp(body.userId, body.amount, body.source, body.sourceId, body.description);
      reply.send({ award });
    }),
  );

  fastify.post(
    "/internal/v1/gamification/coins",
    {
      preHandler: [requireInternalToken, validateBody(awardCoinsBodySchema)],
      config: internalRateLimit,
      schema: { hide: true },
    },
    asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as AwardCoinsBody;
      const award = await awardCoins(body.userId, body.amount, body.source, body.sourceId, body.description);
      reply.send({ award });
    }),
  );
}
