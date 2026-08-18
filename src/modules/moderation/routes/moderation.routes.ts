import { FastifyInstance } from "fastify";
import { authenticate } from "../../../middlewares/authenticate";
import { permission } from "../../../modules/authorization/middleware/authorization.middleware";
import { asyncHandler } from "../../../lib/errors/errorHandler";
import { ModerationController } from "../controller/moderation.controller";
import { ModerationService } from "../service/moderation.service";
import { ModerationRepository } from "../repository/moderation.repository";

export async function moderationRoutes(fastify: FastifyInstance) {
  const repository = new ModerationRepository();
  const service = new ModerationService(repository);
  const controller = new ModerationController(service);

  fastify.get(
    "/api/v1/moderation/stats",
    { preHandler: [authenticate, permission("community.moderate")] },
    asyncHandler(controller.getStats.bind(controller)),
  );

  fastify.get(
    "/api/v1/moderation/users",
    { preHandler: [authenticate, permission("community.moderate")] },
    asyncHandler(controller.listUsers.bind(controller)),
  );

  fastify.post(
    "/api/v1/moderation/users/:userId/ban",
    { preHandler: [authenticate, permission("community.ban")] },
    asyncHandler(controller.ban.bind(controller)),
  );

  fastify.post(
    "/api/v1/moderation/users/:userId/unban",
    { preHandler: [authenticate, permission("community.moderate")] },
    asyncHandler(controller.unban.bind(controller)),
  );

  fastify.post(
    "/api/v1/moderation/users/:userId/mute",
    { preHandler: [authenticate, permission("community.warn")] },
    asyncHandler(controller.mute.bind(controller)),
  );

  fastify.post(
    "/api/v1/moderation/users/:userId/unmute",
    { preHandler: [authenticate, permission("community.moderate")] },
    asyncHandler(controller.unmute.bind(controller)),
  );

  fastify.post(
    "/api/v1/moderation/users/:userId/warn",
    { preHandler: [authenticate, permission("community.warn")] },
    asyncHandler(controller.warn.bind(controller)),
  );
}