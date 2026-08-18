import { NotificationRepository } from "../repository/notification.repository";
import type { Notification, NotificationWithUnreadCount } from "../types/notification.types";
import { AppError } from "../../../lib/errors/AppError";

export class NotificationService {
  private repository: NotificationRepository;

  constructor() {
    this.repository = new NotificationRepository();
  }

  async getUserNotifications(userId: string, limit: number, unreadOnly: boolean): Promise<NotificationWithUnreadCount> {
    return this.repository.getNotificationsWithUnreadCount(userId, limit, unreadOnly);
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const count = await this.repository.markAsRead(notificationId, userId);
    if (count === 0) {
      throw new AppError(404, "Notificação não encontrada");
    }
  }

  async markAllAsRead(userId: string): Promise<number> {
    return this.repository.markAllAsRead(userId);
  }
}