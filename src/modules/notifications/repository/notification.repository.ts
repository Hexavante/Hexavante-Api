import { prisma } from "../../../config/prisma";
import type { Notification, NotificationWithUnreadCount } from "../types/notification.types";

export class NotificationRepository {
  async findRecentByUser(userId: string, limit: number, unreadOnly: boolean): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async countUnread(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markAsRead(notificationId: string, userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async getNotificationsWithUnreadCount(userId: string, limit: number, unreadOnly: boolean): Promise<NotificationWithUnreadCount> {
    const [notifications, unreadCount] = await Promise.all([
      this.findRecentByUser(userId, limit, unreadOnly),
      this.countUnread(userId),
    ]);
    return { notifications, unreadCount };
  }
}