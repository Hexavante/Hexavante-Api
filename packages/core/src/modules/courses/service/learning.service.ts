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
import {
  awardCoins,
  awardXp,
  COIN_REWARDS,
  XP_REWARDS,
} from "../../gamification/engine";

/** Motor único de recompensas (injetável em testes). */
export interface RewardEngine {
  awardXp: typeof awardXp;
  awardCoins: typeof awardCoins;
}

const defaultRewardEngine: RewardEngine = { awardXp, awardCoins };

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
  constructor(
    private readonly learningRepository: ILearningRepository,
    private readonly rewards: RewardEngine = defaultRewardEngine,
  ) {}

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

    const enrollment = await this.learningRepository.findEnrollment(userId, course.id);
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
    // Normaliza slug → id real para contagens e sourceIds
    courseId = course.id;

    const enrollment = await this.learningRepository.findEnrollment(userId, course.id);
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
      const lesson = allLessons[lessonIndex];

      // Valores BASE: booster pessoal/global e premium são aplicados pelo
      // motor de gamificação (mesma regra do Web).
      totalXpEarned += await this.grantXp(userId, XP_REWARDS.LESSON, "LESSON", lessonId, `Aula concluída: ${lesson.title}`);
      totalCoinsEarned += await this.grantCoins(userId, COIN_REWARDS.LESSON, "LESSON", lessonId, `Aula concluída: ${lesson.title}`);

      const lessonModule = course.modules.find((m) => m.id === lesson.moduleId);
      if (lessonModule && lessonModule.lessons.length > 0) {
        const moduleLessonIds = lessonModule.lessons.map((l) => l.id);
        const moduleCompleted =
          await this.learningRepository.countCompletedInModule(userId, moduleLessonIds);
        if (moduleCompleted === moduleLessonIds.length) {
          totalXpEarned += await this.grantXp(userId, XP_REWARDS.MODULE, "MODULE", lessonModule.id, `Módulo concluído: ${lessonModule.title}`);
          totalCoinsEarned += await this.grantCoins(userId, COIN_REWARDS.MODULE, "MODULE", lessonModule.id, `Módulo concluído: ${lessonModule.title}`);
        }
      }

      if (progress >= 100 && !wasCourseComplete) {
        totalXpEarned += await this.grantXp(userId, XP_REWARDS.COURSE, "COURSE", courseId, `Curso concluído: ${course.title}`);
        totalCoinsEarned += await this.grantCoins(userId, COIN_REWARDS.COURSE, "COURSE", courseId, `Curso concluído: ${course.title}`);
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
    const enrollment = await this.learningRepository.findEnrollment(userId, course.id);
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
    const enrollment = await this.learningRepository.findEnrollment(userId, course.id);
    if (!enrollment) {
      throw new ForbiddenError("Você precisa estar matriculado no curso");
    }
  }

  private async grantXp(
    userId: string,
    amount: number,
    source: "LESSON" | "MODULE" | "COURSE",
    sourceId: string,
    description: string,
  ): Promise<number> {
    const award = await this.rewards.awardXp(userId, amount, source, sourceId, description);
    return award?.amount ?? 0;
  }

  private async grantCoins(
    userId: string,
    amount: number,
    source: "LESSON" | "MODULE" | "COURSE",
    sourceId: string,
    description: string,
  ): Promise<number> {
    const award = await this.rewards.awardCoins(userId, amount, source, sourceId, description);
    return award?.amount ?? 0;
  }
}