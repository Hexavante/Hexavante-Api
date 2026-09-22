import { prisma } from '../../../config/prisma'
import { NotFoundError, ForbiddenError } from '../../../lib/errors/AppError'
import type { ExamListItem, AttemptHistoryItem, PaginatedAttempts, ExamStats, EvolutionPoint, SubjectStat, ExamStartResponse, ExamSubmitRequest, ExamSubmitResponse } from '../types/exam.types'
import { buildPagination } from '../../../lib/serializers/base'

const XP_REWARDS = { LESSON: 10, MODULE: 25, COURSE: 100, EXAM: 20, EXAM_PASS_BONUS: 30 } as const
const COIN_REWARDS = { EXAM_CORRECT: 5, LESSON: 3, MODULE: 10, COURSE: 25 } as const
const PASS_SCORE = 70
const DAILY_MULTIPLIERS = [1, 0.35, 0.12, 0.05] as const
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000

function getSaoPauloDayBounds(reference = new Date()) {
  const spInstant = new Date(reference.getTime() - SAO_PAULO_OFFSET_MS)
  const y = spInstant.getUTCFullYear()
  const m = spInstant.getUTCMonth()
  const d = spInstant.getUTCDate()
  const start = new Date(Date.UTC(y, m, d, 3, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, d + 1, 3, 0, 0, 0))
  return { start, end }
}

function getMultiplierForDailyAttempt(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber, 1) - 1, DAILY_MULTIPLIERS.length - 1)
  return DAILY_MULTIPLIERS[index]
}

function applyRewardAmount(base: number, daily: number, booster: number): number {
  if (base <= 0) return 0
  return Math.max(1, Math.round(base * daily * booster))
}

async function getBoosterMultiplier(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { boosterMultiplier: true, boosterExpiresAt: true },
  })
  if (!user?.boosterExpiresAt || user.boosterExpiresAt <= new Date()) return 1
  const m = user.boosterMultiplier ?? 1
  return m > 0 ? m : 1
}

function isPremiumActive(user: { isPremium: boolean; premiumExpiresAt: Date | null }): boolean {
  if (!user.isPremium) return false
  if (!user.premiumExpiresAt) return true
  return user.premiumExpiresAt > new Date()
}

async function hasEarlyExamPass(userId: string, examSlug: string): Promise<boolean> {
  const now = new Date()
  const entries = await prisma.userInventory.findMany({
    where: {
      userId,
      storeItem: { category: 'PASS' },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { storeItem: true },
  })
  return entries.some((entry) => {
    const meta = entry.storeItem.metadata as { passType?: string; examSlug?: string } | null
    return meta?.passType === 'early_exam' && meta.examSlug === examSlug
  })
}

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

  async getPublicBySlugOrId(slugOrId: string): Promise<ExamListItem> {
    const exam = await prisma.exam.findFirst({
      where: {
        isPublished: true,
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
    })

    if (!exam) {
      throw new NotFoundError('Simulado não encontrado')
    }

    return {
      id: exam.id,
      slug: exam.slug,
      title: exam.title,
      description: exam.description,
      coverImage: exam.coverImage,
      examType: exam.examType,
      questionCount: exam._count.questions,
      timeLimit: exam.timeLimit,
      isPremiumOnly: exam.isPremiumOnly,
      userAttemptCount: 0,
    }
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

  async startExam(userId: string, examId: string): Promise<ExamStartResponse> {
    const exam = await prisma.exam.findFirst({
      where: {
        isPublished: true,
        OR: [{ id: examId }, { slug: examId }],
      },
    })

    if (!exam) {
      throw new NotFoundError('Simulado não encontrado')
    }

    if (exam.isPremiumOnly) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isPremium: true, premiumExpiresAt: true },
      })
      const premiumActive = user ? isPremiumActive(user) : false
      if (!premiumActive) {
        const hasPass = await hasEarlyExamPass(userId, exam.slug)
        if (!hasPass) {
          throw new ForbiddenError('Conteúdo Premium')
        }
      }
    }

    const ongoingAttempt = await prisma.examAttempt.findFirst({
      where: {
        userId,
        examId: exam.id,
        finishedAt: null,
      },
    })

    let attempt = ongoingAttempt

    if (!attempt) {
      attempt = await prisma.examAttempt.create({
        data: {
          examId: exam.id,
          userId,
          startedAt: new Date(),
        },
      })
    }

    const questions = await prisma.examQuestion.findMany({
      where: { examId: exam.id },
      include: {
        alternatives: {
          select: { id: true, text: true },
        },
      },
      orderBy: { orderNumber: 'asc' },
    })

    return {
      attemptId: attempt.id,
      examId: exam.id,
      title: exam.title,
      timeLimit: exam.timeLimit,
      startedAt: attempt.startedAt.toISOString(),
      questions: questions.map((q) => ({
        id: q.id,
        statement: q.statement,
        imageUrl: q.imageUrl,
        imageWidth: q.imageWidth,
        imageHeight: q.imageHeight,
        orderNumber: q.orderNumber,
        points: q.points,
        type: q.type,
        subject: q.subject,
        alternatives: q.alternatives,
      })),
    }
  }

  async submitExam(userId: string, data: ExamSubmitRequest): Promise<ExamSubmitResponse> {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: data.attemptId },
      include: {
        exam: {
          include: { questions: { include: { alternatives: true } } },
        },
      },
    })

    if (!attempt) {
      throw new NotFoundError('Tentativa não encontrada')
    }

    if (attempt.userId !== userId) {
      throw new ForbiddenError('Esta tentativa não pertence a você')
    }

    if (attempt.finishedAt) {
      throw new ForbiddenError('Esta tentativa já foi finalizada')
    }

    const questionMap = new Map(attempt.exam.questions.map((q) => [q.id, q]))

    let score = 0
    let correctAnswers = 0
    const totalQuestions = attempt.exam.questions.length

    const answerRecords: {
      attemptId: string
      questionId: string
      alternativeId: string | null
      essayAnswer: string | null
      isCorrect: boolean
    }[] = []

    for (const answer of data.answers) {
      const question = questionMap.get(answer.questionId)
      if (!question) continue

      let isCorrect = false

      if (question.type === 'MULTIPLE_CHOICE' && answer.alternativeId) {
        const correctAlternative = question.alternatives.find((a) => a.isCorrect)
        isCorrect = correctAlternative?.id === answer.alternativeId
      }

      if (isCorrect) {
        score += question.points
        correctAnswers++
      }

      answerRecords.push({
        attemptId: attempt.id,
        questionId: answer.questionId,
        alternativeId: answer.alternativeId ?? null,
        essayAnswer: answer.essayAnswer ?? null,
        isCorrect,
      })
    }

    await prisma.examAnswer.createMany({ data: answerRecords })

    const totalPoints = attempt.exam.questions.reduce((sum, q) => sum + q.points, 0)
    const finalScore = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0
    const finishedAt = new Date()

    const { start, end } = getSaoPauloDayBounds(finishedAt)
    const finishedToday = await prisma.examAttempt.count({
      where: { userId, finishedAt: { gte: start, lt: end } },
    })
    const dailyAttemptNumber = finishedToday + 1
    const dailyMultiplier = getMultiplierForDailyAttempt(dailyAttemptNumber)
    const booster = await getBoosterMultiplier(userId)
    const passed = finalScore >= PASS_SCORE

    const xpBase = applyRewardAmount(XP_REWARDS.EXAM, dailyMultiplier, booster)
    const xpBonus = passed ? applyRewardAmount(XP_REWARDS.EXAM_PASS_BONUS, dailyMultiplier, booster) : 0
    const coinsPerCorrect = correctAnswers > 0
      ? applyRewardAmount(COIN_REWARDS.EXAM_CORRECT, dailyMultiplier, booster)
      : 0
    const coinsAwarded = correctAnswers * coinsPerCorrect
    let xpAwarded = 0

    if (xpBase > 0) {
      const existingBase = await prisma.xpTransaction.findUnique({
        where: { userId_source_sourceId: { userId, source: 'EXAM', sourceId: attempt.id } },
        select: { id: true },
      })
      if (!existingBase) {
        await prisma.xpTransaction.create({
          data: {
            userId,
            amount: xpBase,
            source: 'EXAM',
            sourceId: attempt.id,
            description: `Simulado finalizado: ${attempt.exam.title}`,
          },
        })
        xpAwarded += xpBase
      }
    }

    if (xpBonus > 0) {
      const bonusSourceId = `${attempt.id}-pass`
      const existingBonus = await prisma.xpTransaction.findUnique({
        where: { userId_source_sourceId: { userId, source: 'EXAM', sourceId: bonusSourceId } },
        select: { id: true },
      })
      if (!existingBonus) {
        await prisma.xpTransaction.create({
          data: {
            userId,
            amount: xpBonus,
            source: 'EXAM',
            sourceId: bonusSourceId,
            description: `Aprovado no simulado: ${attempt.exam.title}`,
          },
        })
        xpAwarded += xpBonus
      }
    }

    if (coinsAwarded > 0) {
      const existingCoin = await prisma.coinTransaction.findUnique({
        where: { userId_source_sourceId: { userId, source: 'EXAM_CORRECT', sourceId: attempt.id } },
        select: { id: true },
      })
      if (!existingCoin) {
        await prisma.coinTransaction.create({
          data: {
            userId,
            amount: coinsAwarded,
            type: 'EARN',
            source: 'EXAM_CORRECT',
            sourceId: attempt.id,
            description: `Questões corretas: ${attempt.exam.title}`,
          },
        })
        await prisma.user.update({
          where: { id: userId },
          data: { coins: { increment: coinsAwarded } },
        })
      }
    }

    if (xpAwarded > 0) {
      let userXp = await prisma.userXP.findUnique({ where: { userId } })
      if (!userXp) {
        userXp = await prisma.userXP.create({ data: { userId } })
      }
      let newLevel = Math.max(1, userXp.level)
      let newCurrentXp = userXp.currentXp + xpAwarded
      const newTotalXp = userXp.totalXp + xpAwarded
      while (newCurrentXp >= newLevel * 100) {
        newCurrentXp -= newLevel * 100
        newLevel += 1
      }
      await prisma.userXP.update({
        where: { userId },
        data: { level: newLevel, currentXp: newCurrentXp, totalXp: newTotalXp },
      })
    }

    await prisma.examAttempt.update({
      where: { id: attempt.id },
      data: {
        score: finalScore,
        correctAnswers,
        totalQuestions,
        finishedAt,
        dailyAttemptIndex: dailyAttemptNumber,
        dailyRewardMultiplier: dailyMultiplier,
      },
    })

    return {
      attemptId: attempt.id,
      score: finalScore,
      correctAnswers,
      totalQuestions,
      percentage: finalScore,
      finishedAt: finishedAt.toISOString(),
      xpAwarded,
      coinsAwarded,
      dailyMultiplier,
    }
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
