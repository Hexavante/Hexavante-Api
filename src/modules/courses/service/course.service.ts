import type { ICourseRepository } from "../repository/course.repository";
import type {
  CourseQueryInput,
  CreateCourseInput,
  UpdateCourseInput,
} from "../schemas/course.schemas";
import type {
  CourseListItem,
  CourseDetail,
  CourseProgress,
  ModuleProgressDto,
  LessonProgressDto,
} from "../types/course.types";
import { buildPagination } from "../../../lib/serializers/base";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../../lib/errors/AppError";
import { prisma } from "../../../config/prisma";

export class CourseService {
  constructor(private readonly courseRepository: ICourseRepository) {}

  async list(query: CourseQueryInput) {
    const { courses: raw, total } = await this.courseRepository.findAllPublished(query);

    const courses: CourseListItem[] = raw.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      shortDescription: c.shortDescription,
      thumbnailUrl: c.thumbnailUrl,
      courseType: c.courseType,
      level: c.level,
      estimatedHours: c.estimatedHours,
      totalModules: c.totalModules,
      totalLessons: c.totalLessons,
      instructorName: c.instructorName,
      createdAt: c.createdAt.toISOString(),
    }));

    const pagination = buildPagination(query, total);

    return { data: courses, pagination };
  }

  async getById(id: string): Promise<CourseDetail> {
    const course = await this.courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    const totalLessons = course.modules.reduce(
      (acc, m) => acc + m.lessons.length,
      0,
    );

    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      shortDescription: course.shortDescription,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      coverImage: course.coverImage,
      courseType: course.courseType,
      level: course.level,
      estimatedHours: course.estimatedHours,
      progressionType: course.progressionType,
      status: course.status,
      totalModules: course.modules.length,
      totalLessons,
      instructorName: course.instructorName,
      modules: course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        orderNumber: m.orderNumber,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          duration: l.duration,
          orderNumber: l.orderNumber,
        })),
      })),
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
    };
  }

  async create(data: CreateCourseInput, instructorId: string) {
    const existing = await this.courseRepository.findBySlug(data.slug);
    if (existing) {
      throw new ConflictError("Já existe um curso com este slug");
    }

    return this.courseRepository.create(data, instructorId);
  }

  async update(id: string, data: UpdateCourseInput, userId?: string) {
    const course = await this.courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    if (userId) {
      const isInstructor = await prisma.courseInstructor.findUnique({
        where: { courseId_userId: { courseId: id, userId } },
      });
      if (!isInstructor) {
        throw new NotFoundError("Curso não encontrado");
      }
    }

    if (data.slug) {
      const existing = await this.courseRepository.findBySlug(data.slug);
      if (existing && existing.id !== id) {
        throw new ConflictError("Já existe um curso com este slug");
      }
    }

    return this.courseRepository.update(id, data);
  }

  async delete(id: string, userId?: string): Promise<void> {
    const course = await this.courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    if (userId) {
      const isInstructor = await prisma.courseInstructor.findUnique({
        where: { courseId_userId: { courseId: id, userId } },
      });
      if (!isInstructor) {
        throw new NotFoundError("Curso não encontrado");
      }
    }

    await this.courseRepository.delete(id);
  }

  async enroll(userId: string, courseId: string) {
    const course = await this.courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    const existing = await this.courseRepository.findEnrollment(userId, courseId);
    if (existing) {
      throw new ConflictError("Você já está matriculado neste curso");
    }

    return this.courseRepository.createEnrollment(userId, courseId);
  }

  async getProgress(userId: string, courseId: string): Promise<CourseProgress> {
    const enrollment = await this.courseRepository.findEnrollment(userId, courseId);
    if (!enrollment) {
      throw new BadRequestError("Você não está matriculado neste curso");
    }

    const course = await this.courseRepository.findFullCourseById(courseId);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    const allLessonIds = course.modules.flatMap((m) =>
      m.lessons.map((l) => l.id),
    );

    const progresses = await this.courseRepository.findLessonProgress(
      enrollment.id,
      allLessonIds,
    );

    const progressMap = new Map(progresses.map((p) => [p.lessonId, p]));

    let totalCompleted = 0;

    const modules: ModuleProgressDto[] = course.modules.map((m) => {
      const lessons: LessonProgressDto[] = m.lessons.map((l) => {
        const prog = progressMap.get(l.id);
        const completed = prog?.completed ?? false;
        if (completed) totalCompleted++;
        return {
          lessonId: l.id,
          title: l.title,
          orderNumber: l.orderNumber,
          completed,
          completedAt: prog?.completedAt?.toISOString() ?? null,
        };
      });

      return {
        moduleId: m.id,
        title: m.title,
        orderNumber: m.orderNumber,
        totalLessons: m.lessons.length,
        completedLessons: lessons.filter((l) => l.completed).length,
        lessons,
      };
    });

    const overallProgress =
      allLessonIds.length > 0
        ? Math.round((totalCompleted / allLessonIds.length) * 100)
        : 0;

    return {
      courseId,
      enrollmentId: enrollment.id,
      progress: overallProgress,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      completedAt: enrollment.completedAt?.toISOString() ?? null,
      modules,
    };
  }
}
