import type { FastifyRequest, FastifyReply } from "fastify";
import { NotificationService } from "../service/notification.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export class NotificationController {
  constructor(private service: NotificationService) {}

  getUserNotifications = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { limit = 20, unreadOnly = false } = request.query as { limit?: string; unreadOnly?: string };

    const result = await this.service.getUserNotifications(userId, Number(limit), unreadOnly === "true");

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
}