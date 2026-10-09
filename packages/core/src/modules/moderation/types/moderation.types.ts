export type ModerationUserStatus = "active" | "banned" | "muted";

export interface ModerationUser {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  coins: number;
  roles: string[];
  isBanned: boolean;
  isMuted: boolean;
  warnings: number;
  createdAt: Date;
  lastLogin: Date | null;
}

export interface ModerationStats {
  activeToday: number;
  activeBans: number;
  activeMutes: number;
  pendingReports: number;
  newMessages: number;
  xpToday: number;
  totalCoins: number;
  totalUsers: number;
  pendingCourses: number;
  pendingApplications: number;
  activityData: {
    date: string;
    usuarios: number;
    simulados: number;
    xpGanho: number;
  }[];
}