export interface ExamListItem {
  id: string
  slug: string
  title: string
  description: string | null
  coverImage: string | null
  examType: string
  questionCount: number
  timeLimit: number | null
  isPremiumOnly: boolean
  userAttemptCount: number
}

export interface AttemptHistoryItem {
  id: string
  examId: string
  examTitle: string
  examSlug: string
  examType: string
  score: number
  correctAnswers: number
  totalQuestions: number
  finishedAt: string | null
}

export interface PaginatedAttempts {
  attempts: AttemptHistoryItem[]
  page: number
  totalPages: number
  total: number
}

export interface ExamStats {
  totalAttempts: number
  averageScore: number
  bestScore: number
}

export interface EvolutionPoint {
  date: string
  score: number
}

export interface SubjectStat {
  subject: string
  correct: number
  total: number
}
