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
    { preHandler: [optionalAuth], schema: { summary: 'Listar provas', tags: ['Exams'] } },
    asyncHandler(examController.list.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/history',
    { preHandler: [authenticate], schema: { summary: 'Histórico de provas', tags: ['Exams'], security: [{ session: [] }] } },
    asyncHandler(examController.getHistory.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/stats',
    { preHandler: [authenticate], schema: { summary: 'Estatísticas de provas', tags: ['Exams'], security: [{ session: [] }] } },
    asyncHandler(examController.getStats.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/evolution',
    { preHandler: [authenticate], schema: { summary: 'Evolução de notas', tags: ['Exams'], security: [{ session: [] }] } },
    asyncHandler(examController.getEvolution.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/subject-stats',
    { preHandler: [authenticate], schema: { summary: 'Estatísticas por matéria', tags: ['Exams'], security: [{ session: [] }] } },
    asyncHandler(examController.getSubjectStats.bind(examController)),
  )

  fastify.get(
    '/api/v1/exams/:id',
    { preHandler: [optionalAuth], schema: { summary: 'Detalhes da prova', tags: ['Exams'] } },
    asyncHandler(examController.getById.bind(examController)),
  )

  fastify.post(
    '/api/v1/exams/:id/start',
    { preHandler: [authenticate], schema: { summary: 'Iniciar prova', tags: ['Exams'], security: [{ session: [] }] } },
    asyncHandler(examController.startExam.bind(examController)),
  )

  fastify.post(
    '/api/v1/exams/submit',
    { preHandler: [authenticate], schema: { summary: 'Submeter respostas', tags: ['Exams'], security: [{ session: [] }] } },
    asyncHandler(examController.submitExam.bind(examController)),
  )
}
