import { FastifyInstance } from "fastify";
import { NotificationController } from "../controller/notification.controller";
import { NotificationService } from "../service/notification.service";
import { NotificationRepository } from "../repository/notification.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";
import { listNotificationsSchema, markReadSchema, markAllReadSchema } from "../schemas/notification.schemas";
import { validateQuery, validateParams, validateBody } from "../../../lib/validation/validate";

export async function notificationRoutes(fastify: FastifyInstance) {
  const repository = new NotificationRepository();
  const service = new NotificationService();
  const controller = new NotificationController(service);

  fastify.get(
    "/api/v1/notifications",
    { preHandler: [authenticate, validateQuery(listNotificationsSchema)] },
    asyncHandler(controller.getUserNotifications.bind(controller)),
  );

  fastify.patch(
    "/api/v1/notifications/:id/read",
    { preHandler: [authenticate, validateParams(markReadSchema)] },
    asyncHandler(controller.markAsRead.bind(controller)),
  );

  fastify.patch(
    "/api/v1/notifications/read-all",
    { preHandler: [authenticate, validateBody(markAllReadSchema)] },
    asyncHandler(controller.markAllAsRead.bind(controller)),
  );
}