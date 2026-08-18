import type { IInstructorRepository } from "../repository/instructor.repository";
import {
  ConflictError,
  NotFoundError,
} from "../../../lib/errors/AppError";

export class InstructorService {
  constructor(private readonly repository: IInstructorRepository) {}

  async getStatus(userId: string) {
    const application = await this.repository.getLatestApplication(userId);
    return { application };
  }

  async apply(userId: string, data: {
    motivation: string;
    experience: string;
    portfolioUrl?: string | null;
  }) {
    const hasPending = await this.repository.hasActivePendingApplication(userId);
    if (hasPending) {
      throw new ConflictError("Já existe uma solicitação em análise");
    }

    const application = await this.repository.createApplication(userId, {
      motivation: data.motivation,
      experience: data.experience,
      portfolioUrl: data.portfolioUrl || null,
    });

    return application;
  }

  async getCategories() {
    const categories = await this.repository.listCategories();
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));
  }

  async getMyCourses(userId: string) {
    const courses = await this.repository.listMyCourses(userId);
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      status: c.status,
      thumbnailUrl: c.thumbnailUrl,
      coverImage: c.coverImage,
      level: c.level,
      estimatedHours: c.estimatedHours,
      categoryName: c.categoryName,
      moduleCount: c.moduleCount,
      enrollmentCount: c.enrollmentCount,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async assertOwnsCourse(userId: string, courseId: string) {
    const isOwner = await this.repository.isCourseOwner(userId, courseId);
    if (!isOwner) {
      throw new NotFoundError("Você não possui acesso a este curso");
    }
  }
}