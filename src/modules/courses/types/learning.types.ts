export interface LessonProgressContext {
  completedLessons: number;
  totalLessons: number;
  currentLessonNumber: number;
  remainingMinutes: number;
  remainingLabel: string;
  nextLesson: { id: string; title: string } | null;
  isFavorite: boolean;
  note: string | null;
  favoriteLessonIds: string[];
}

export interface LessonCompleteResult {
  progress: number;
  totalXpEarned: number;
  newLevels: Array<{ level: number; leveledUp: boolean }>;
}