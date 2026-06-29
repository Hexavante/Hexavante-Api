import { FastifyInstance } from "fastify";
import { GamificationRepository } from "../repository/gamification.repository";
import { RankingService } from "../service/ranking.service";
import { XpService, getAllAchievements } from "../service/xp.service";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function gamificationRoutes(fastify: FastifyInstance) {
  const repository = new GamificationRepository();
  const rankingService = new RankingService(repository);
  const xpService = new XpService(repository);

  fastify.get(
    "/api/v1/rankings",
    async (request, reply) => {
      const query = request.query as { page?: string; limit?: string };
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

      const result = await rankingService.getLeaderboard(page, limit);
      reply.send(result);
    },
  );

  fastify.get(
    "/api/v1/rankings/me",
    { preHandler: [authenticate] },
    asyncHandler(async (request, reply) => {
      const userId = request.user!.id;
      const result = await rankingService.getUserPosition(userId);
      reply.send(result);
    }),
  );

  fastify.get(
    "/api/v1/users/:id/xp",
    asyncHandler(async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { page?: string; limit?: string };
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

      const result = await xpService.getHistory(id, page, limit);
      reply.send(result);
    }),
  );

  fastify.get(
    "/api/v1/achievements",
    async (_request, reply) => {
      reply.send({ achievements: getAllAchievements() });
    },
  );

  fastify.get(
    "/api/v1/users/me/achievements",
    { preHandler: [authenticate] },
    asyncHandler(async (request, reply) => {
      const userId = request.user!.id;
      const achievements = await xpService.getUserAchievements(userId);
      reply.send({ achievements });
    }),
  );
}
