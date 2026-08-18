import { FastifyInstance } from 'fastify'
import { ExamController } from '../controller/exam.controller'
import { ExamService } from '../service/exam.service'
import { authenticate } from '../../../middlewares/authenticate'
import { optionalAuth } from '../../../middlewares/optionalAuth'
import { asyncHandler } from '../../../lib/errors/errorHandler'

export async function examRoutes(fastify: FastifyInstance) {
  const examService = new ExamService()
  const examController = new ExamController(examService)

  fastify.get(
    '/api/v1/exams',
    { preHandler: [optionalAuth] },
    asyncHandler(examController.list.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/history',
    { preHandler: [authenticate] },
    asyncHandler(examController.getHistory.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/stats',
    { preHandler: [authenticate] },
    asyncHandler(examController.getStats.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/evolution',
    { preHandler: [authenticate] },
    asyncHandler(examController.getEvolution.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/subject-stats',
    { preHandler: [authenticate] },
    asyncHandler(examController.getSubjectStats.bind(examController)),
  )
}
