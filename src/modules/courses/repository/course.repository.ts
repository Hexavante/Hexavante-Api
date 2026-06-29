import { prisma } from "../../../config/prisma";
import type { CourseQueryInput, CreateCourseInput, UpdateCourseInput } from "../schemas/course.schemas";

const courseListSelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  thumbnailUrl: true,
  courseType: true,
  level: true,
  estimatedHours: true,
  status: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
  instructors: {
    select: { user: { select: { id: true, fullName: true } } },
    take: 1,
  },
  _count: { select: { modules: true } },
} as const;

const lessonInModuleSelect = {
  id: true,
  title: true,
  description: true,
  duration: true,
  orderNumber: true,
} as const;

const moduleWithLessonsSelect = {
  id: true,
  title: true,
  description: true,
  orderNumber: true,
  lessons: {
    select: lessonInModuleSelect,
    orderBy: { orderNumber: "asc" as const },
  },
} as const;

export interface ICourseRepository {
  findAllPublished(query: CourseQueryInput): Promise<{
    courses: Array<{
      id: string;
      title: string;
      slug: string;
      shortDescription: string | null;
      thumbnailUrl: string | null;
      courseType: string;
      level: string;
      estimatedHours: number | null;
      totalModules: number;
      instructorName: string | null;
      createdAt: Date;
    }>;
    total: number;
  }>;

  findById(id: string): Promise<{
    id: string;
    title: string;
    slug: string;
    shortDescription: string | null;
    description: string | null;
    thumbnailUrl: string | null;
    coverImage: string | null;
    courseType: string;
    level: string;
    estimatedHours: number | null;
    progressionType: string;
    status: string;
    instructorName: string | null;
    modules: Array<{
      id: string;
      title: string;
      description: string | null;
      orderNumber: number;
      lessons: Array<{
        id: string;
        title: string;
        description: string | null;
        duration: number | null;
        orderNumber: number;
      }>;
    }>;
    createdAt: Date;
    updatedAt: Date;
  } | null>;

  create(data: CreateCourseInput, instructorId: string): Promise<{ id: string }>;
  update(id: string, data: UpdateCourseInput): Promise<{ id: string }>;
  delete(id: string): Promise<void>;
  findBySlug(slug: string): Promise<{ id: string } | null>;
}

export class CourseRepository implements ICourseRepository {
  async findAllPublished(query: CourseQueryInput) {
    const where: any = { status: "APPROVED" };

    if (query.level) where.level = query.level;
    if (query.courseType) where.courseType = query.courseType;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      where.title = { contains: query.search, mode: "insensitive" };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.course.findMany({
        where,
        select: courseListSelect,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.course.count({ where }),
    ]);

    const courses = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      shortDescription: row.shortDescription,
      thumbnailUrl: row.thumbnailUrl,
      courseType: row.courseType,
      level: row.level,
      estimatedHours: row.estimatedHours,
      totalModules: row._count.modules,
      instructorName: row.instructors[0]?.user.fullName ?? null,
      createdAt: row.createdAt,
    }));

    return { courses, total };
  }

  async findById(id: string) {
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        shortDescription: true,
        description: true,
        thumbnailUrl: true,
        coverImage: true,
        courseType: true,
        level: true,
        estimatedHours: true,
        progressionType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        instructors: {
          select: { user: { select: { fullName: true } } },
          take: 1,
        },
        modules: {
          select: moduleWithLessonsSelect,
          orderBy: { orderNumber: "asc" },
        },
      },
    });

    if (!course) return null;

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
      instructorName: course.instructors[0]?.user.fullName ?? null,
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
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  }

  async create(data: CreateCourseInput, instructorId: string) {
    const course = await prisma.course.create({
      data: {
        title: data.title,
        slug: data.slug,
        categoryId: data.categoryId,
        shortDescription: data.shortDescription ?? null,
        description: data.description ?? null,
        thumbnailUrl: data.thumbnailUrl || null,
        coverImage: data.coverImage || null,
        courseType: data.courseType ?? "FREE",
        level: data.level ?? "BEGINNER",
        estimatedHours: data.estimatedHours ?? null,
        progressionType: data.progressionType ?? "FREE",
        status: "PENDING_REVIEW",
        instructors: {
          create: { userId: instructorId },
        },
      },
      select: { id: true },
    });

    return course;
  }

  async update(id: string, data: UpdateCourseInput) {
    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.shortDescription !== undefined && { shortDescription: data.shortDescription }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.thumbnailUrl !== undefined && { thumbnailUrl: data.thumbnailUrl || null }),
        ...(data.coverImage !== undefined && { coverImage: data.coverImage || null }),
        ...(data.courseType !== undefined && { courseType: data.courseType }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.estimatedHours !== undefined && { estimatedHours: data.estimatedHours }),
        ...(data.progressionType !== undefined && { progressionType: data.progressionType }),
        ...(data.status !== undefined && { status: data.status }),
      },
      select: { id: true },
    });

    return course;
  }

  async delete(id: string): Promise<void> {
    await prisma.course.delete({ where: { id } });
  }

  async findBySlug(slug: string) {
    return prisma.course.findUnique({
      where: { slug },
      select: { id: true },
    });
  }
}
