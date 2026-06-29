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
      totalLessons: 0,
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

  async update(id: string, data: UpdateCourseInput) {
    const course = await this.courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    if (data.slug) {
      const existing = await this.courseRepository.findBySlug(data.slug);
      if (existing && existing.id !== id) {
        throw new ConflictError("Já existe um curso com este slug");
      }
    }

    return this.courseRepository.update(id, data);
  }

  async delete(id: string): Promise<void> {
    const course = await this.courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    await this.courseRepository.delete(id);
  }

  async getProgress(userId: string, courseId: string): Promise<CourseProgress> {
    const course = await this.courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError("Curso não encontrado");
    }

    throw new BadRequestError("Progress endpoint not implemented - requires enrollment repository");
  }
}
