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

export interface ExamStartResponse {
  attemptId: string
  examId: string
  title: string
  timeLimit: number | null
  startedAt: string
  questions: ExamQuestionItem[]
}

export interface ExamQuestionItem {
  id: string
  statement: string
  imageUrl: string | null
  imageWidth: number | null
  imageHeight: number | null
  orderNumber: number
  points: number
  type: string
  subject: string | null
  alternatives: ExamAlternativeItem[]
}

export interface ExamAlternativeItem {
  id: string
  text: string
}

export interface ExamSubmitRequest {
  attemptId: string
  answers: {
    questionId: string
    alternativeId?: string
    essayAnswer?: string
  }[]
}

export interface ExamSubmitResponse {
  attemptId: string
  score: number
  correctAnswers: number
  totalQuestions: number
  percentage: number
  finishedAt: string
}
