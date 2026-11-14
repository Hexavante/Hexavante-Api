import { prisma } from "../../../config/prisma";
import { CACHE_NAMESPACES, responseCache } from "../../../lib/cache/response.cache";

export interface PlatformStats {
  totalUsers: number;
  totalCourses: number;
  totalTutorials: number;
  totalExams: number;
  totalLessons: number;
}

const CACHE_TTL_MS = 60_000;
const CACHE_TTL_SECONDS = CACHE_TTL_MS / 1000;
// L1 em memória por processo + L2 no Redis compartilhado entre as três APIs
// (gateway, desktop, mobile): os 5 COUNTs rodam uma vez por minuto no total,
// não uma vez por processo.
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

async function computeStats(): Promise<PlatformStats> {
  const [totalUsers, totalCourses, totalTutorials, totalExams, totalLessons] =
    await Promise.all([
      prisma.user.count(),
      prisma.course.count({ where: { status: "APPROVED" } }),
      countTutorials(),
      prisma.exam.count({ where: { isPublished: true } }),
      prisma.lesson.count(),
    ]);

  return { totalUsers, totalCourses, totalTutorials, totalExams, totalLessons };
}

export class PlatformService {
  async getStats(): Promise<PlatformStats> {
    if (cached && Date.now() < cached.expiresAt) return cached.value;

    const value = await responseCache.wrap(
      CACHE_NAMESPACES.platformStats,
      "all",
      CACHE_TTL_SECONDS,
      computeStats,
    );
    cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }
}
