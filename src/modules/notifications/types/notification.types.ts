export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationWithUnreadCount {
  notifications: Notification[];
  unreadCount: number;
}

export interface MarkReadResponse {
  success: true;
}