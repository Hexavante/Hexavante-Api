import { prisma } from '../../../config/prisma'
import type { ExamListItem, AttemptHistoryItem, PaginatedAttempts, ExamStats, EvolutionPoint, SubjectStat } from '../types/exam.types'
import { buildPagination } from '../../../lib/serializers/base'

export class ExamService {
  async list(userId: string | undefined, query: { tipo?: string; q?: string; sort?: string }): Promise<ExamListItem[]> {
    const where: Record<string, unknown> = { isPublished: true }

    if (query.tipo) where.examType = query.tipo
    if (query.q) {
      where.OR = [
        { title: { contains: query.q } },
        { description: { contains: query.q } },
      ]
    }

    const exams = await prisma.exam.findMany({
      where,
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: query.sort === 'popular'
        ? { attempts: { _count: 'desc' } }
        : { createdAt: 'desc' },
    })

    const attemptCounts = userId
      ? await prisma.examAttempt.groupBy({
          by: ['examId'],
          where: { userId, finishedAt: { not: null } },
          _count: { id: true },
        })
      : []

    const attemptMap = new Map(attemptCounts.map((a) => [a.examId, a._count.id]))

    return exams.map((exam) => ({
      id: exam.id,
      slug: exam.slug,
      title: exam.title,
      description: exam.description,
      coverImage: exam.coverImage,
      examType: exam.examType,
      questionCount: exam._count.questions,
      timeLimit: exam.timeLimit,
      isPremiumOnly: exam.isPremiumOnly,
      userAttemptCount: attemptMap.get(exam.id) ?? 0,
    }))
  }

  async getHistory(userId: string, query: { tipo?: string; page?: number }): Promise<PaginatedAttempts> {
    const page = query.page || 1
    const pageSize = 10

    const where: Record<string, unknown> = {
      userId,
      finishedAt: { not: null },
    }

    if (query.tipo) {
      where.exam = { examType: query.tipo }
    }

    const [attempts, total] = await Promise.all([
      prisma.examAttempt.findMany({
        where,
        include: {
          exam: { select: { title: true, slug: true, examType: true } },
        },
        orderBy: { finishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.examAttempt.count({ where }),
    ])

    const pagination = buildPagination({ page, limit: pageSize }, total)

    return {
      attempts: attempts.map((a) => ({
        id: a.id,
        examId: a.examId,
        examTitle: a.exam.title,
        examSlug: a.exam.slug,
        examType: a.exam.examType,
        score: a.score,
        correctAnswers: a.correctAnswers,
        totalQuestions: a.totalQuestions,
        finishedAt: a.finishedAt?.toISOString() ?? null,
      })),
      page: pagination.page,
      totalPages: pagination.totalPages,
      total: pagination.total,
    }
  }

  async getStats(userId: string): Promise<ExamStats> {
    const attempts = await prisma.examAttempt.findMany({
      where: { userId, finishedAt: { not: null } },
      select: { score: true },
    })

    if (attempts.length === 0) {
      return { totalAttempts: 0, averageScore: 0, bestScore: 0 }
    }

    const totalScore = attempts.reduce((sum, a) => sum + a.score, 0)
    const bestScore = Math.max(...attempts.map((a) => a.score))

    return {
      totalAttempts: attempts.length,
      averageScore: Math.round(totalScore / attempts.length),
      bestScore: Math.round(bestScore),
    }
  }

  async getEvolution(userId: string): Promise<EvolutionPoint[]> {
    const attempts = await prisma.examAttempt.findMany({
      where: { userId, finishedAt: { not: null } },
      orderBy: { finishedAt: 'asc' },
      select: { score: true, finishedAt: true },
      take: 20,
    })

    return attempts.map((a) => ({
      date: a.finishedAt!.toISOString(),
      score: Math.round(a.score),
    }))
  }

  async getSubjectStats(userId: string): Promise<SubjectStat[]> {
    const answers = await prisma.examAnswer.findMany({
      where: {
        attempt: { userId, finishedAt: { not: null } },
        question: { subject: { not: null } },
      },
      include: {
        question: { select: { subject: true } },
      },
    })

    const subjectMap = new Map<string, { correct: number; total: number }>()

    answers.forEach((a) => {
      const subject = a.question.subject ?? 'Geral'
      const current = subjectMap.get(subject) ?? { correct: 0, total: 0 }
      current.total++
      if (a.isCorrect) current.correct++
      subjectMap.set(subject, current)
    })

    return Array.from(subjectMap.entries())
      .map(([subject, data]) => ({ subject, ...data }))
      .sort((a, b) => b.total - a.total)
  }
}
