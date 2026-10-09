import { prisma } from "../../../config/prisma";
import type { ApplicationStatus } from "@prisma/client";

export interface InstructorApplicationRecord {
  id: string;
  motivation: string;
  experience: string;
  portfolioUrl: string | null;
  status: ApplicationStatus;
  reviewedNotes: string | null;
  createdAt: Date;
}

export interface MyCourseRecord {
  id: string;
  title: string;
  slug: string;
  status: string;
  thumbnailUrl: string | null;
  coverImage: string | null;
  level: string;
  estimatedHours: number | null;
  categoryName: string | null;
  moduleCount: number;
  enrollmentCount: number;
  createdAt: Date;
}

export interface CategoryRecord {
  id: string;
  name: string;
  description: string | null;
}

export interface IInstructorRepository {
  getLatestApplication(userId: string): Promise<InstructorApplicationRecord | null>;
  createApplication(
    userId: string,
    data: {
      motivation: string;
      experience: string;
      portfolioUrl?: string | null;
    },
  ): Promise<InstructorApplicationRecord>;
  hasActivePendingApplication(userId: string): Promise<boolean>;
  listCategories(): Promise<CategoryRecord[]>;
  listMyCourses(userId: string): Promise<MyCourseRecord[]>;
  isCourseOwner(userId: string, courseId: string): Promise<boolean>;
}

export class InstructorRepository implements IInstructorRepository {
  async getLatestApplication(userId: string) {
    const app = await prisma.instructorApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        motivation: true,
        experience: true,
        portfolioUrl: true,
        status: true,
        reviewNotes: true,
        createdAt: true,
      },
    });

    if (!app) return null;

    return {
      id: app.id,
      motivation: app.motivation,
      experience: app.experience,
      portfolioUrl: app.portfolioUrl,
      status: app.status,
      reviewedNotes: app.reviewNotes,
      createdAt: app.createdAt,
    };
  }

  async createApplication(userId: string, data: {
    motivation: string;
    experience: string;
    portfolioUrl?: string | null;
  }) {
    const app = await prisma.instructorApplication.create({
      data: {
        userId,
        motivation: data.motivation,
        experience: data.experience,
        portfolioUrl: data.portfolioUrl ?? null,
        status: "PENDING",
      },
      select: {
        id: true,
        motivation: true,
        experience: true,
        portfolioUrl: true,
        status: true,
        reviewNotes: true,
        createdAt: true,
      },
    });

    return {
      id: app.id,
      motivation: app.motivation,
      experience: app.experience,
      portfolioUrl: app.portfolioUrl,
      status: app.status,
      reviewedNotes: app.reviewNotes,
      createdAt: app.createdAt,
    };
  }

  async hasActivePendingApplication(userId: string) {
    const count = await prisma.instructorApplication.count({
      where: { userId, status: "PENDING" },
    });
    return count > 0;
  }

  async listCategories() {
    const rows = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    });
    return rows;
  }

  async listMyCourses(userId: string) {
    const courses = await prisma.course.findMany({
      where: { instructors: { some: { userId } } },
      include: {
        category: { select: { name: true } },
        _count: { select: { modules: true, enrollments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      status: c.status,
      thumbnailUrl: c.thumbnailUrl,
      coverImage: c.coverImage,
      level: c.level,
      estimatedHours: c.estimatedHours,
      categoryName: c.category?.name ?? null,
      moduleCount: c._count.modules,
      enrollmentCount: c._count.enrollments,
      createdAt: c.createdAt,
    }));
  }

  async isCourseOwner(userId: string, courseId: string) {
    const rel = await prisma.courseInstructor.findUnique({
      where: {
        courseId_userId: { courseId, userId },
      },
      select: { id: true },
    });
    return !!rel;
  }
}