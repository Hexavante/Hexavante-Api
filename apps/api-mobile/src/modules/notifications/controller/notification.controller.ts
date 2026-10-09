import type { FastifyRequest, FastifyReply } from "fastify";
import { NotificationService } from "../service/notification.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";
import type { ListNotificationsQuery } from "../schemas/notification.schemas";

export class NotificationController {
  constructor(private service: NotificationService) {}

  getUserNotifications = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { limit, unreadOnly } = request.query as ListNotificationsQuery;

    const result = await this.service.getUserNotifications(userId, limit, unreadOnly);

    return reply.send({
      success: true,
      notifications: result.notifications,
      unreadCount: result.unreadCount,
    });
  });

  markAsRead = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { id } = request.params as { id: string };

    await this.service.markAsRead(userId, id);

    return reply.send({
      success: true,
    });
  });

  markAllAsRead = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;

    const count = await this.service.markAllAsRead(userId);

    return reply.send({
      success: true,
      count,
    });
  });

  registerPushToken = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { expoToken, deviceName } = request.body as { expoToken: string; deviceName?: string };

    await this.service.registerPushToken(userId, expoToken, deviceName);

    return reply.send({ success: true });
  });
}
