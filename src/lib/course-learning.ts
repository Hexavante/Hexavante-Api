const DEFAULT_LESSON_MINUTES = 10;

export function formatStudyDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "menos de 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

export function estimateRemainingStudyMinutes(
  lessons: { id: string; duration: number | null }[],
  completedLessonIds: Set<string>,
  courseEstimatedHours?: number | null,
  courseProgressPercent?: number,
): number {
  const remainingLessons = lessons.filter((lesson) => !completedLessonIds.has(lesson.id));

  if (remainingLessons.length === 0) return 0;

  const hasLessonDurations = remainingLessons.some(
    (lesson) => lesson.duration && lesson.duration > 0,
  );

  if (hasLessonDurations) {
    return remainingLessons.reduce(
      (sum, lesson) => sum + Math.max(1, lesson.duration ?? DEFAULT_LESSON_MINUTES),
      0,
    );
  }

  if (courseEstimatedHours && courseEstimatedHours > 0 && courseProgressPercent != null) {
    const remainingFraction = Math.max(0, (100 - courseProgressPercent) / 100);
    return Math.max(1, Math.round(courseEstimatedHours * 60 * remainingFraction));
  }

  return remainingLessons.length * DEFAULT_LESSON_MINUTES;
}

export function getNextIncompleteLesson<T extends { id: string; title: string }>(
  lessons: T[],
  completedLessonIds: Set<string>,
  afterLessonId?: string,
): T | null {
  const startIndex = afterLessonId ? lessons.findIndex((l) => l.id === afterLessonId) + 1 : 0;

  for (let i = Math.max(0, startIndex); i < lessons.length; i++) {
    if (!completedLessonIds.has(lessons[i].id)) return lessons[i];
  }

  return null;
}

export function calculateLevel(totalXp: number): number {
  return Math.floor(Math.sqrt(totalXp / 100));
}