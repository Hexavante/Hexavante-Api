export interface CourseListItem {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  courseType: string;
  level: string;
  estimatedHours: number | null;
  totalModules: number;
  totalLessons: number;
  instructorName: string | null;
  createdAt: string;
}

export interface ModuleDto {
  id: string;
  title: string;
  description: string | null;
  orderNumber: number;
  lessons: LessonDto[];
}

export interface LessonDto {
  id: string;
  title: string;
  description: string | null;
  duration: number | null;
  orderNumber: number;
}

export interface CourseDetail {
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
  totalModules: number;
  totalLessons: number;
  instructorName: string | null;
  modules: ModuleDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CourseProgress {
  courseId: string;
  enrollmentId: string;
  progress: number;
  enrolledAt: string;
  completedAt: string | null;
  modules: ModuleProgressDto[];
}

export interface ModuleProgressDto {
  moduleId: string;
  title: string;
  orderNumber: number;
  totalLessons: number;
  completedLessons: number;
  lessons: LessonProgressDto[];
}

export interface LessonProgressDto {
  lessonId: string;
  title: string;
  orderNumber: number;
  completed: boolean;
  completedAt: string | null;
}
