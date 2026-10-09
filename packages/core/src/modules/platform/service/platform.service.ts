import { prisma } from "../../../config/prisma";

export interface PlatformStats {
  totalUsers: number;
  totalCourses: number;
  totalTutorials: number;
  totalExams: number;
  totalLessons: number;
}

const CACHE_TTL_MS = 60_000;
let cached: { expiresAt: number; value: PlatformStats } | null = null;

async function countTutorials(): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*) AS total FROM tutorials WHERE is_published = 1
    `;
    return Number(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

export class PlatformService {
  async getStats(): Promise<PlatformStats> {
    if (cached && Date.now() < cached.expiresAt) return cached.value;

    const [totalUsers, totalCourses, totalTutorials, totalExams, totalLessons] =
      await Promise.all([
        prisma.user.count(),
        prisma.course.count({ where: { status: "APPROVED" } }),
        countTutorials(),
        prisma.exam.count({ where: { isPublished: true } }),
        prisma.lesson.count(),
      ]);

    const value: PlatformStats = {
      totalUsers,
      totalCourses,
      totalTutorials,
      totalExams,
      totalLessons,
    };
    cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }
}
