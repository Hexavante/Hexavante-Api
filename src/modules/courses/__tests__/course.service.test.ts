import { describe, it, expect, vi, beforeEach } from "vitest";
import { CourseService } from "../service/course.service";
import { ICourseRepository } from "../repository/course.repository";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../../lib/errors/AppError";

// Mock repository
const mockCourseRepository: ICourseRepository = {
  findAllPublished: vi.fn(),
  findById: vi.fn(),
  findBySlug: vi.fn(),
  findFullCourseById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findEnrollment: vi.fn(),
  createEnrollment: vi.fn(),
  findLessonProgress: vi.fn(),
};

// Mock buildPagination
vi.mock("../../../lib/serializers/base", () => ({
  buildPagination: vi.fn().mockReturnValue({
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  }),
}));

describe("CourseService", () => {
  let courseService: CourseService;

  beforeEach(() => {
    vi.clearAllMocks();
    courseService = new CourseService(mockCourseRepository);
  });

  describe("list", () => {
    it("should return paginated courses", async () => {
      const mockCourses = [
        {
          id: "course-1",
          title: "Test Course",
          slug: "test-course",
          shortDescription: "A test course",
          thumbnailUrl: null,
          courseType: "self-paced",
          level: "beginner",
          estimatedHours: 10,
          totalModules: 5,
          totalLessons: 20,
          instructorName: "Test Instructor",
          createdAt: new Date(),
        },
      ];

      vi.mocked(mockCourseRepository.findAllPublished).mockResolvedValue({
        courses: mockCourses,
        total: 1,
      });

      const result = await courseService.list({
        page: 1,
        limit: 10,
      });

      expect(mockCourseRepository.findAllPublished).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.pagination).toBeDefined();
    });

    it("should return empty array when no courses exist", async () => {
      vi.mocked(mockCourseRepository.findAllPublished).mockResolvedValue({
        courses: [],
        total: 0,
      });

      const result = await courseService.list({
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
    });
  });

  describe("getById", () => {
    it("should return course details when course exists", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Test Course",
        slug: "test-course",
        shortDescription: "A test course",
        description: "Course description",
        thumbnailUrl: null,
        coverImage: null,
        courseType: "self-paced",
        level: "beginner",
        estimatedHours: 10,
        progressionType: "linear",
        status: "published",
        instructorName: "Test Instructor",
        createdAt: new Date(),
        updatedAt: new Date(),
        modules: [
          {
            id: "module-1",
            title: "Module 1",
            description: "Module description",
            orderNumber: 1,
            lessons: [
              {
                id: "lesson-1",
                title: "Lesson 1",
                description: "Lesson description",
                duration: 300,
                orderNumber: 1,
              },
            ],
          },
        ],
      };

      vi.mocked(mockCourseRepository.findById).mockResolvedValue(
        mockCourse as any
      );

      const result = await courseService.getById("course-1");

      expect(mockCourseRepository.findById).toHaveBeenCalledWith("course-1");
      expect(result.id).toBe("course-1");
      expect(result.totalModules).toBe(1);
      expect(result.totalLessons).toBe(1);
    });

    it("should throw NotFoundError when course does not exist", async () => {
      vi.mocked(mockCourseRepository.findById).mockResolvedValue(null);

      await expect(courseService.getById("nonexistent")).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("create", () => {
    it("should create a new course successfully", async () => {
      const courseData = {
        title: "New Course",
        slug: "new-course",
        shortDescription: "A new course",
        description: "Course description",
        courseType: "self-paced",
        level: "beginner",
        estimatedHours: 10,
        progressionType: "linear",
      };

      vi.mocked(mockCourseRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(mockCourseRepository.create).mockResolvedValue({
        id: "course-1",
        ...courseData,
      } as any);

      const result = await courseService.create(courseData, "instructor-1");

      expect(mockCourseRepository.findBySlug).toHaveBeenCalledWith(
        "new-course"
      );
      expect(mockCourseRepository.create).toHaveBeenCalledWith(
        courseData,
        "instructor-1"
      );
      expect(result.id).toBe("course-1");
    });

    it("should throw ConflictError when slug already exists", async () => {
      const courseData = {
        title: "New Course",
        slug: "existing-slug",
        shortDescription: "A new course",
        description: "Course description",
        courseType: "self-paced",
        level: "beginner",
        estimatedHours: 10,
        progressionType: "linear",
      };

      vi.mocked(mockCourseRepository.findBySlug).mockResolvedValue({
        id: "existing-course",
      } as any);

      await expect(
        courseService.create(courseData, "instructor-1")
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("update", () => {
    it("should update course successfully", async () => {
      const updateData = {
        title: "Updated Course",
      };

      const mockCourse = {
        id: "course-1",
        title: "Test Course",
        slug: "test-course",
      };

      vi.mocked(mockCourseRepository.findById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.update).mockResolvedValue({
        ...mockCourse,
        ...updateData,
      } as any);

      const result = await courseService.update("course-1", updateData);

      expect(mockCourseRepository.findById).toHaveBeenCalledWith("course-1");
      expect(mockCourseRepository.update).toHaveBeenCalledWith(
        "course-1",
        updateData
      );
      expect(result.title).toBe("Updated Course");
    });

    it("should throw NotFoundError when course does not exist", async () => {
      vi.mocked(mockCourseRepository.findById).mockResolvedValue(null);

      await expect(
        courseService.update("nonexistent", { title: "Updated" })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ConflictError when new slug already exists", async () => {
      const mockCourse = {
        id: "course-1",
        slug: "test-course",
      };

      vi.mocked(mockCourseRepository.findById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.findBySlug).mockResolvedValue({
        id: "other-course",
      } as any);

      await expect(
        courseService.update("course-1", { slug: "existing-slug" })
      ).rejects.toThrow(ConflictError);
    });

    it("should allow keeping same slug", async () => {
      const mockCourse = {
        id: "course-1",
        slug: "test-course",
      };

      vi.mocked(mockCourseRepository.findById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.findBySlug).mockResolvedValue({
        id: "course-1",
      } as any);
      vi.mocked(mockCourseRepository.update).mockResolvedValue({
        ...mockCourse,
      } as any);

      const result = await courseService.update("course-1", {
        slug: "test-course",
      });

      expect(result.slug).toBe("test-course");
    });
  });

  describe("delete", () => {
    it("should delete course successfully", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Test Course",
      };

      vi.mocked(mockCourseRepository.findById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.delete).mockResolvedValue(undefined);

      await courseService.delete("course-1");

      expect(mockCourseRepository.findById).toHaveBeenCalledWith("course-1");
      expect(mockCourseRepository.delete).toHaveBeenCalledWith("course-1");
    });

    it("should throw NotFoundError when course does not exist", async () => {
      vi.mocked(mockCourseRepository.findById).mockResolvedValue(null);

      await expect(courseService.delete("nonexistent")).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("enroll", () => {
    it("should enroll user in course successfully", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Test Course",
      };

      vi.mocked(mockCourseRepository.findById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.findEnrollment).mockResolvedValue(null);
      vi.mocked(mockCourseRepository.createEnrollment).mockResolvedValue({
        id: "enrollment-1",
        userId: "user-1",
        courseId: "course-1",
        enrolledAt: new Date(),
      } as any);

      const result = await courseService.enroll("user-1", "course-1");

      expect(mockCourseRepository.findById).toHaveBeenCalledWith("course-1");
      expect(mockCourseRepository.findEnrollment).toHaveBeenCalledWith(
        "user-1",
        "course-1"
      );
      expect(mockCourseRepository.createEnrollment).toHaveBeenCalledWith(
        "user-1",
        "course-1"
      );
      expect(result.id).toBe("enrollment-1");
    });

    it("should throw NotFoundError when course does not exist", async () => {
      vi.mocked(mockCourseRepository.findById).mockResolvedValue(null);

      await expect(
        courseService.enroll("user-1", "nonexistent")
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ConflictError when already enrolled", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Test Course",
      };

      vi.mocked(mockCourseRepository.findById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.findEnrollment).mockResolvedValue({
        id: "existing-enrollment",
      } as any);

      await expect(
        courseService.enroll("user-1", "course-1")
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("getProgress", () => {
    it("should return course progress when enrolled", async () => {
      const mockEnrollment = {
        id: "enrollment-1",
        userId: "user-1",
        courseId: "course-1",
        enrolledAt: new Date(),
        completedAt: null,
      };

      const mockCourse = {
        id: "course-1",
        modules: [
          {
            id: "module-1",
            title: "Module 1",
            orderNumber: 1,
            lessons: [
              {
                id: "lesson-1",
                title: "Lesson 1",
                orderNumber: 1,
              },
            ],
          },
        ],
      };

      const mockProgress = [
        {
          lessonId: "lesson-1",
          completed: true,
          completedAt: new Date(),
        },
      ];

      vi.mocked(mockCourseRepository.findEnrollment).mockResolvedValue(
        mockEnrollment as any
      );
      vi.mocked(mockCourseRepository.findFullCourseById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.findLessonProgress).mockResolvedValue(
        mockProgress as any
      );

      const result = await courseService.getProgress("user-1", "course-1");

      expect(mockCourseRepository.findEnrollment).toHaveBeenCalledWith(
        "user-1",
        "course-1"
      );
      expect(result.courseId).toBe("course-1");
      expect(result.progress).toBe(100);
      expect(result.modules).toHaveLength(1);
    });

    it("should throw BadRequestError when not enrolled", async () => {
      vi.mocked(mockCourseRepository.findEnrollment).mockResolvedValue(null);

      await expect(
        courseService.getProgress("user-1", "course-1")
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError when course does not exist", async () => {
      vi.mocked(mockCourseRepository.findEnrollment).mockResolvedValue({
        id: "enrollment-1",
      } as any);
      vi.mocked(mockCourseRepository.findFullCourseById).mockResolvedValue(
        null
      );

      await expect(
        courseService.getProgress("user-1", "course-1")
      ).rejects.toThrow(NotFoundError);
    });

    it("should calculate progress correctly with partial completion", async () => {
      const mockEnrollment = {
        id: "enrollment-1",
        enrolledAt: new Date(),
        completedAt: null,
      };

      const mockCourse = {
        id: "course-1",
        modules: [
          {
            id: "module-1",
            title: "Module 1",
            orderNumber: 1,
            lessons: [
              { id: "lesson-1", title: "Lesson 1", orderNumber: 1 },
              { id: "lesson-2", title: "Lesson 2", orderNumber: 2 },
            ],
          },
        ],
      };

      const mockProgress = [
        { lessonId: "lesson-1", completed: true, completedAt: new Date() },
        { lessonId: "lesson-2", completed: false, completedAt: null },
      ];

      vi.mocked(mockCourseRepository.findEnrollment).mockResolvedValue(
        mockEnrollment as any
      );
      vi.mocked(mockCourseRepository.findFullCourseById).mockResolvedValue(
        mockCourse as any
      );
      vi.mocked(mockCourseRepository.findLessonProgress).mockResolvedValue(
        mockProgress as any
      );

      const result = await courseService.getProgress("user-1", "course-1");

      expect(result.progress).toBe(50);
    });
  });
});
