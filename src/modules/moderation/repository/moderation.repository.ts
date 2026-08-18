import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import { ModerationUser, ModerationStats } from "../types/moderation.types";

export class ModerationRepository {
  async listUsers(options: {
    search?: string;
    status?: string;
    role?: string;
    limit?: number;
  }): Promise<ModerationUser[]> {
    const where: Prisma.UserWhereInput = {};
    if (options.search) {
      const q = options.search.replace(/^@/, "");
      where.OR = [
        { username: { contains: q } },
        { fullName: { contains: q } },
        { email: { contains: q } },
      ];
    }
    if (options.role && options.role !== "all") {
      where.roles = { some: { role: { name: options.role } } };
    }
    if (options.status === "banned") {
      where.bansReceived = { some: { isActive: true } };
    } else if (options.status === "muted") {
      where.mutesReceived = { some: { isActive: true } };
    }

    const users = await prisma.user.findMany({
      where,
      take: options.limit ?? 50,
      orderBy: { createdAt: "desc" },
      include: {
        xp: true,
        roles: { include: { role: true } },
        bansReceived: { where: { isActive: true }, take: 1 },
        mutesReceived: { where: { isActive: true }, take: 1 },
        _count: { select: { warningsReceived: true } },
      },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      avatarUrl: u.avatarUrl,
      level: u.xp?.level ?? 1,
      xp: u.xp?.totalXp ?? 0,
      coins: u.coins,
      roles: u.roles.map((r) => r.role.name),
      isBanned: u.bansReceived.length > 0,
      isMuted: u.mutesReceived.length > 0,
      warnings: u._count.warningsReceived,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
    }));
  }

  async findActiveBan(userId: string) {
    return prisma.userBan.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findActiveMute(userId: string) {
    return prisma.userMute.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async banUser(userId: string, moderatorId: string, reason: string, expiresAt?: Date) {
    return prisma.userBan.create({
      data: { userId, moderatorId, reason, expiresAt },
    });
  }

  async liftBan(banId: string, liftedById: string) {
    return prisma.userBan.update({
      where: { id: banId },
      data: { isActive: false, liftedAt: new Date(), liftedById },
    });
  }

  async muteUser(userId: string, moderatorId: string, reason: string, expiresAt?: Date) {
    return prisma.userMute.create({
      data: { userId, moderatorId, reason, expiresAt },
    });
  }

  async liftMute(muteId: string, liftedById: string) {
    return prisma.userMute.update({
      where: { id: muteId },
      data: { isActive: false, liftedAt: new Date(), liftedById },
    });
  }

  async warnUser(userId: string, moderatorId: string, reason: string) {
    return prisma.userWarning.create({
      data: { userId, moderatorId, reason },
    });
  }

  async writeLog(input: {
    moderatorId: string;
    action: string;
    description: string;
    targetUserId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.moderationLog.create({
      data: {
        moderatorId: input.moderatorId,
        action: input.action as never,
        description: input.description,
        targetUserId: input.targetUserId,
        metadata: input.metadata,
      },
    });
  }

  async getStats(): Promise<ModerationStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      activeToday,
      activeBans,
      activeMutes,
      totalUsers,
      totalCoins,
      xpToday,
      pendingCourses,
      pendingApplications,
      pendingReports,
    ] = await Promise.all([
      prisma.user.count({ where: { lastLogin: { gte: today } } }),
      prisma.userBan.count({ where: { isActive: true } }),
      prisma.userMute.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { coins: true } }),
      prisma.xpTransaction.aggregate({
        where: { createdAt: { gte: today }, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      prisma.course.count({ where: { status: "PENDING_REVIEW" as never } }),
      prisma.instructorApplication.count({ where: { status: "PENDING" as never } }),
      prisma.communityReport.count({ where: { status: "PENDING" as never } }),
    ]);

    const activityData = await this.getActivityLast7Days();

    return {
      activeToday,
      activeBans,
      activeMutes,
      pendingReports,
      newMessages: 0,
      xpToday: xpToday._sum.amount ?? 0,
      totalCoins: totalCoins._sum.coins ?? 0,
      totalUsers,
      pendingCourses,
      pendingApplications,
      activityData,
    };
  }

  private async getActivityLast7Days() {
    const days: { date: string; usuarios: number; simulados: number; xpGanho: number }[] =
      [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);

      const [usuarios, simulados, xpGanho] = await Promise.all([
        prisma.user.count({ where: { lastLogin: { gte: d, lte: end } } }),
        prisma.examAttempt.count({ where: { startedAt: { gte: d, lte: end } } }),
        prisma.xpTransaction.aggregate({
          where: { createdAt: { gte: d, lte: end }, amount: { gt: 0 } },
          _sum: { amount: true },
        }),
      ]);

      days.push({
        date: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
        usuarios,
        simulados,
        xpGanho: xpGanho._sum.amount ?? 0,
      });
    }
    return days;
  }
}