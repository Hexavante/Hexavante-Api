import { prisma } from "../../../config/prisma";
import type { CoinSource, XpSource } from "@prisma/client";

export interface CourseEnrollmentRecord {
  id: string;
  progress: number;
  completedAt: Date | null;
  lessonProgresses: Array<{ lessonId: string; completed: boolean }>;
}

export interface CourseWithModulesRecord {
  id: string;
  title: string;
  slug: string;
  status: string;
  progressionType: string;
  estimatedHours: number | null;
  modules: Array<{
    id: string;
    title: string;
    orderNumber: number;
    materials: Array<{
      id: string;
      title: string;
      fileUrl: string;
      fileType: string;
    }>;
    lessons: Array<{
      id: string;
      title: string;
      description: string | null;
      videoUrl: string | null;
      videoProvider: string | null;
      duration: number | null;
      orderNumber: number;
    }>;
  }>;
}

export interface ILearningRepository {
  getUserCourse(courseId: string): Promise<CourseWithModulesRecord | null>;
  findEnrollment(userId: string, courseId: string): Promise<CourseEnrollmentRecord | null>;
  findFavoriteIds(userId: string, lessonIds: string[]): Promise<string[]>;
  isFavorite(userId: string, lessonId: string): Promise<boolean>;
  toggleFavorite(userId: string, lessonId: string): Promise<boolean>;
  getNote(userId: string, lessonId: string): Promise<string | null>;
  saveNote(userId: string, lessonId: string, content: string): Promise<void>;
  deleteNote(userId: string, lessonId: string): Promise<void>;
  getLessonProgress(
    userId: string,
    lessonId: string,
  ): Promise<{ completedAt: Date | null } | null>;
  upsertLessonProgress(enrollmentId: string, userId: string, lessonId: string): Promise<void>;
  countCompletedLessonProgress(userId: string, courseId: string): Promise<number>;
  updateEnrollment(
    enrollmentId: string,
    data: { progress: number; completedAt: Date | null },
  ): Promise<void>;
  countCompletedInModule(userId: string, moduleLessonIds: string[]): Promise<number>;
  hasXpAward(userId: string, source: XpSource, sourceId: string): Promise<boolean>;
  createXpAward(
    userId: string,
    amount: number,
    source: XpSource,
    sourceId: string,
    description: string,
  ): Promise<void>;
  hasCoinAward(userId: string, source: CoinSource, sourceId: string): Promise<boolean>;
  createCoinAward(
    userId: string,
    amount: number,
    source: CoinSource,
    sourceId: string,
    description: string,
  ): Promise<void>;
  awardXpAmount(userId: string, amount: number): Promise<void>;
  awardCoinsAmount(userId: string, amount: number): Promise<void>;
  getTotalXp(userId: string): Promise<number>;
}

export class CourseLearningRepository implements ILearningRepository {
  async getUserCourse(courseId: string): Promise<CourseWithModulesRecord | null> {
    return prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        progressionType: true,
        estimatedHours: true,
        modules: {
          orderBy: { orderNumber: "asc" },
          select: {
            id: true,
            title: true,
            orderNumber: true,
            materials: true,
            lessons: {
              orderBy: { orderNumber: "asc" },
              select: {
                id: true,
                title: true,
                description: true,
                videoUrl: true,
                videoProvider: true,
                duration: true,
                orderNumber: true,
              },
            },
          },
        },
      },
    });
  }

  async findEnrollment(userId: string, courseId: string) {
    return prisma.courseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: {
        id: true,
        progress: true,
        completedAt: true,
        lessonProgresses: { select: { lessonId: true, completed: true } },
      },
    });
  }

  async findFavoriteIds(userId: string, lessonIds: string[]) {
    if (lessonIds.length === 0) return [];
    const favs = await prisma.lessonFavorite.findMany({
      where: { userId, lessonId: { in: lessonIds } },
      select: { lessonId: true },
    });
    return favs.map((f) => f.lessonId);
  }

  async isFavorite(userId: string, lessonId: string) {
    const fav = await prisma.lessonFavorite.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { id: true },
    });
    return !!fav;
  }

  async toggleFavorite(userId: string, lessonId: string) {
    const existing = await prisma.lessonFavorite.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    if (existing) {
      await prisma.lessonFavorite.delete({ where: { id: existing.id } });
      return false;
    }
    await prisma.lessonFavorite.create({ data: { userId, lessonId } });
    return true;
  }

  async getNote(userId: string, lessonId: string) {
    const note = await prisma.lessonNote.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { content: true },
    });
    return note?.content ?? null;
  }

  async saveNote(userId: string, lessonId: string, content: string) {
    await prisma.lessonNote.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, content },
      update: { content },
    });
  }

  async deleteNote(userId: string, lessonId: string) {
    await prisma.lessonNote.deleteMany({ where: { userId, lessonId } });
  }

  async getLessonProgress(userId: string, lessonId: string) {
    return prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { completedAt: true },
    });
  }

  async upsertLessonProgress(enrollmentId: string, userId: string, lessonId: string) {
    await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        enrollmentId,
        completed: true,
        completedAt: new Date(),
      },
      update: { completed: true, completedAt: new Date() },
    });
  }

  async countCompletedLessonProgress(userId: string, courseId: string) {
    return prisma.lessonProgress.count({
      where: {
        userId,
        completed: true,
        lesson: { module: { courseId } },
      },
    });
  }

  async updateEnrollment(
    enrollmentId: string,
    data: { progress: number; completedAt: Date | null },
  ) {
    await prisma.courseEnrollment.update({ where: { id: enrollmentId }, data });
  }

  async countCompletedInModule(userId: string, moduleLessonIds: string[]) {
    if (moduleLessonIds.length === 0) return 0;
    return prisma.lessonProgress.count({
      where: { userId, completed: true, lessonId: { in: moduleLessonIds } },
    });
  }

  async hasXpAward(userId: string, source: XpSource, sourceId: string) {
    const t = await prisma.xpTransaction.findUnique({
      where: { userId_source_sourceId: { userId, source, sourceId } },
      select: { id: true },
    });
    return !!t;
  }

  async createXpAward(
    userId: string,
    amount: number,
    source: XpSource,
    sourceId: string,
    description: string,
  ) {
    await prisma.xpTransaction.create({ data: { userId, amount, source, sourceId, description } });
    await prisma.userXP.upsert({
      where: { userId },
      create: { userId, currentXp: amount, totalXp: amount },
      update: { currentXp: { increment: amount }, totalXp: { increment: amount } },
    });
  }

  async hasCoinAward(userId: string, source: CoinSource, sourceId: string) {
    const t = await prisma.coinTransaction.findUnique({
      where: { userId_source_sourceId: { userId, source, sourceId } },
      select: { id: true },
    });
    return !!t;
  }

  async createCoinAward(
    userId: string,
    amount: number,
    source: CoinSource,
    sourceId: string,
    description: string,
  ) {
    await prisma.coinTransaction.create({
      data: { userId, amount, type: "EARN", source, sourceId, description },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: amount } },
    });
  }

  async awardXpAmount(userId: string, amount: number) {
    await prisma.userXP.upsert({
      where: { userId },
      create: { userId, currentXp: amount, totalXp: amount },
      update: { currentXp: { increment: amount }, totalXp: { increment: amount } },
    });
  }

  async awardCoinsAmount(userId: string, amount: number) {
    await prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: amount } },
    });
  }

  async getTotalXp(userId: string) {
    const xp = await prisma.userXP.findUnique({
      where: { userId },
      select: { totalXp: true },
    });
    return xp?.totalXp ?? 0;
  }
}