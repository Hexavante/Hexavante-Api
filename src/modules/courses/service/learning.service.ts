import type { ILearningRepository } from "../repository/learning.repository";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors/AppError";
import {
  estimateRemainingStudyMinutes,
  formatStudyDuration,
  getNextIncompleteLesson,
} from "../../../lib/course-learning";
import type { LessonProgressContext, LessonCompleteResult } from "../types/learning.types";
import type { CoinSource, XpSource } from "@prisma/client";

const XP_REWARDS = { LESSON: 10, MODULE: 25, COURSE: 100, EXAM: 20, EXAM_PASS_BONUS: 30 };
const COIN_REWARDS = { EXAM_CORRECT: 5, LESSON: 3, MODULE: 10, COURSE: 25 };

function applyBoosterAmount(base: number, booster: number): number {
  if (base <= 0) return 0;
  return Math.max(1, Math.round(base * booster));
}

interface FlatLesson {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  videoProvider: string | null;
  duration: number | null;
  orderNumber: number;
  moduleId: string;
  moduleOrder: number;
  moduleTitle: string;
}

interface CourseModule {
  id: string;
  title: string;
  orderNumber: number;
  materials: Array<{ id: string; title: string; fileUrl: string; fileType: string }>;
  lessons: Array<{
    id: string;
    title: string;
    description: string | null;
    videoUrl: string | null;
    videoProvider: string | null;
    duration: number | null;
    orderNumber: number;
  }>;
}

export class LearningService {
  constructor(private readonly learningRepository: ILearningRepository) {}

  private flattenLessons(modules: CourseModule[]): FlatLesson[] {
    return modules.flatMap((m) =>
      m.lessons.map((l) => ({
        ...l,
        moduleId: m.id,
        moduleOrder: m.orderNumber,
        moduleTitle: m.title,
      })),
    );
  }

  async getLessonDetail(userId: string, courseId: string, lessonId: string) {
    const course = await this.learningRepository.getUserCourse(courseId);
    if (!course || course.status !== "APPROVED") {
      throw new NotFoundError("Curso não encontrado");
    }

    const enrollment = await this.learningRepository.findEnrollment(userId, courseId);
    if (!enrollment) {
      throw new ForbiddenError("Você precisa estar matriculado no curso");
    }

    const allLessons = this.flattenLessons(course.modules);
    const lessonIndex = allLessons.findIndex((l) => l.id === lessonId);
    if (lessonIndex === -1) {
      throw new NotFoundError("Aula não encontrada");
    }

    const lesson = allLessons[lessonIndex];

    if (course.progressionType === "PROGRESSIVE" && lessonIndex > 0) {
      const previous = allLessons[lessonIndex - 1];
      const previousCompleted = enrollment.lessonProgresses.some(
        (p) => p.lessonId === previous.id && p.completed,
      );
      if (!previousCompleted) {
        throw new BadRequestError("Conclua a aula anterior para desbloquear esta.");
      }
    }

    const courseModule = course.modules.find((m) => m.id === lesson.moduleId) ?? null;
    const completedIds = new Set(
      enrollment.lessonProgresses.filter((p) => p.completed).map((p) => p.lessonId),
    );

    const lessonIds = allLessons.map((l) => l.id);
    const [favoriteLessonIds, note] = await Promise.all([
      this.learningRepository.findFavoriteIds(userId, lessonIds),
      this.learningRepository.getNote(userId, lessonId),
    ]);

    const completedLessons = allLessons.filter((l) => completedIds.has(l.id)).length;
    const remainingMinutes = estimateRemainingStudyMinutes(
      allLessons,
      completedIds,
      course.estimatedHours,
      enrollment.progress,
    );
    const next = getNextIncompleteLesson(allLessons, completedIds, lessonId);

    const learning: LessonProgressContext = {
      completedLessons,
      totalLessons: allLessons.length,
      currentLessonNumber: lessonIndex + 1,
      remainingMinutes,
      remainingLabel: formatStudyDuration(remainingMinutes),
      nextLesson: next ? { id: next.id, title: next.title } : null,
      isFavorite: favoriteLessonIds.includes(lessonId),
      note,
      favoriteLessonIds,
    };

    const sidebarLessons = allLessons.map((l) => ({
      id: l.id,
      title: l.title,
      orderNumber: l.orderNumber,
      moduleId: l.moduleId,
      moduleOrder: l.moduleOrder,
      moduleTitle: l.moduleTitle,
      isCompleted: completedIds.has(l.id),
    }));

    return {
      course: {
        id: course.id,
        title: course.title,
        slug: course.slug,
        progressionType: course.progressionType,
        estimatedHours: course.estimatedHours,
      },
      enrollment: { id: enrollment.id, progress: enrollment.progress },
      // Aliases de topo para clientes mobile (espelham `learning`)
      isFavorite: favoriteLessonIds.includes(lessonId),
      note,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        videoProvider: lesson.videoProvider,
        durationMinutes: lesson.duration,
        orderNumber: lesson.orderNumber,
        moduleId: lesson.moduleId,
        isCompleted: completedIds.has(lesson.id),
      },
      module: courseModule
        ? {
            id: courseModule.id,
            title: courseModule.title,
            orderNumber: courseModule.orderNumber,
            materials: courseModule.materials,
          }
        : null,
      sidebarLessons,
      learning,
      isCompleted: completedIds.has(lesson.id),
    };
  }

  async completeLesson(
    userId: string,
    courseId: string,
    lessonId: string,
  ): Promise<LessonCompleteResult> {
    const course = await this.learningRepository.getUserCourse(courseId);
    if (!course || course.status !== "APPROVED") {
      throw new NotFoundError("Curso não encontrado");
    }

    const enrollment = await this.learningRepository.findEnrollment(userId, courseId);
    if (!enrollment) {
      throw new BadRequestError("Você precisa estar matriculado no curso");
    }

    const allLessons = this.flattenLessons(course.modules);
    const lessonIndex = allLessons.findIndex((l) => l.id === lessonId);
    if (lessonIndex === -1) {
      throw new BadRequestError("Aula não pertence a este curso");
    }

    if (course.progressionType === "PROGRESSIVE" && lessonIndex > 0) {
      const previous = allLessons[lessonIndex - 1];
      const previousCompleted = enrollment.lessonProgresses.some(
        (p) => p.lessonId === previous.id && p.completed,
      );
      if (!previousCompleted) {
        throw new BadRequestError("Conclua a aula anterior para desbloquear esta.");
      }
    }

    const alreadyCompleted = enrollment.lessonProgresses.some(
      (p) => p.lessonId === lessonId && p.completed,
    );
    const wasCourseComplete = enrollment.completedAt !== null;

    await this.learningRepository.upsertLessonProgress(enrollment.id, userId, lessonId);

    const totalLessons = allLessons.length;
    const completedCount = await this.learningRepository.countCompletedLessonProgress(
      userId,
      courseId,
    );
    const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    await this.learningRepository.updateEnrollment(enrollment.id, {
      progress,
      completedAt: progress >= 100 ? new Date() : null,
    });

    let totalXpEarned = 0;
    let totalCoinsEarned = 0;

    const levelBefore = (await this.learningRepository.getUserXpProfile(userId)).level;

    if (!alreadyCompleted) {
      const booster = await this.learningRepository.getBoosterMultiplier(userId);
      const lesson = allLessons[lessonIndex];

      totalXpEarned += await this.awardUnique(
        userId,
        "LESSON",
        lessonId,
        applyBoosterAmount(XP_REWARDS.LESSON, booster),
        `Aula concluída: ${lesson.title}`,
        "xp",
      );
      totalCoinsEarned += await this.awardUnique(
        userId,
        "LESSON",
        lessonId,
        applyBoosterAmount(COIN_REWARDS.LESSON, booster),
        `Aula concluída: ${lesson.title}`,
        "coin",
      );

      const lessonModule = course.modules.find((m) => m.id === lesson.moduleId);
      if (lessonModule && lessonModule.lessons.length > 0) {
        const moduleLessonIds = lessonModule.lessons.map((l) => l.id);
        const moduleCompleted =
          await this.learningRepository.countCompletedInModule(userId, moduleLessonIds);
        if (moduleCompleted === moduleLessonIds.length) {
          totalXpEarned += await this.awardUnique(
            userId,
            "MODULE",
            lessonModule.id,
            applyBoosterAmount(XP_REWARDS.MODULE, booster),
            `Módulo concluído: ${lessonModule.title}`,
            "xp",
          );
          totalCoinsEarned += await this.awardUnique(
            userId,
            "MODULE",
            lessonModule.id,
            applyBoosterAmount(COIN_REWARDS.MODULE, booster),
            `Módulo concluído: ${lessonModule.title}`,
            "coin",
          );
        }
      }

      if (progress >= 100 && !wasCourseComplete) {
        totalXpEarned += await this.awardUnique(
          userId,
          "COURSE",
          courseId,
          applyBoosterAmount(XP_REWARDS.COURSE, booster),
          `Curso concluído: ${course.title}`,
          "xp",
        );
        totalCoinsEarned += await this.awardUnique(
          userId,
          "COURSE",
          courseId,
          applyBoosterAmount(COIN_REWARDS.COURSE, booster),
          `Curso concluído: ${course.title}`,
          "coin",
        );
      }
    }

    const profile = await this.learningRepository.getUserXpProfile(userId);

    return {
      progress,
      totalXpEarned,
      xpAwarded: totalXpEarned,
      coinsAwarded: totalCoinsEarned,
      newLevels: [{ level: profile.level, leveledUp: profile.level > levelBefore }],
    };
  }

  async toggleFavorite(userId: string, courseId: string, lessonId: string): Promise<boolean> {
    const course = await this.learningRepository.getUserCourse(courseId);
    if (!course || course.status !== "APPROVED") {
      throw new NotFoundError("Curso não encontrado");
    }
    const enrollment = await this.learningRepository.findEnrollment(userId, courseId);
    if (!enrollment) {
      throw new ForbiddenError("Você precisa estar matriculado no curso");
    }
    return this.learningRepository.toggleFavorite(userId, lessonId);
  }

  async getNote(userId: string, courseId: string, lessonId: string): Promise<string | null> {
    await this.assertEnrolled(userId, courseId);
    return this.learningRepository.getNote(userId, lessonId);
  }

  async saveNote(userId: string, courseId: string, lessonId: string, content: string) {
    await this.assertEnrolled(userId, courseId);
    const trimmed = content.trim();
    if (!trimmed) {
      await this.learningRepository.deleteNote(userId, lessonId);
      return;
    }
    await this.learningRepository.saveNote(userId, lessonId, trimmed);
  }

  private async assertEnrolled(userId: string, courseId: string) {
    const course = await this.learningRepository.getUserCourse(courseId);
    if (!course || course.status !== "APPROVED") {
      throw new NotFoundError("Curso não encontrado");
    }
    const enrollment = await this.learningRepository.findEnrollment(userId, courseId);
    if (!enrollment) {
      throw new ForbiddenError("Você precisa estar matriculado no curso");
    }
  }

  private async computeLevel(userId: string): Promise<number> {
    const profile = await this.learningRepository.getUserXpProfile(userId);
    return profile.level;
  }

  private async awardUnique(
    userId: string,
    source: XpSource | CoinSource,
    sourceId: string,
    amount: number,
    description: string,
    kind: "xp" | "coin",
  ): Promise<number> {
    if (amount <= 0) return 0;
    const has =
      kind === "xp"
        ? await this.learningRepository.hasXpAward(userId, source as XpSource, sourceId)
        : await this.learningRepository.hasCoinAward(userId, source as CoinSource, sourceId);

    if (has) return 0;

    if (kind === "xp") {
      await this.learningRepository.createXpAward(
        userId,
        amount,
        source as XpSource,
        sourceId,
        description,
      );
    } else {
      await this.learningRepository.createCoinAward(
        userId,
        amount,
        source as CoinSource,
        sourceId,
        description,
      );
    }
    return amount;
  }
}