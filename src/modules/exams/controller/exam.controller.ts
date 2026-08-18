import { FastifyRequest, FastifyReply } from 'fastify'
import { ExamService } from '../service/exam.service'
import { examQuerySchema, historyQuerySchema } from '../schemas/exam.schemas'
import { validateQuery } from '../../../lib/validation/validate'

export class ExamController {
  constructor(private readonly examService: ExamService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateQuery(examQuerySchema)(request, reply)
    const query = request.query as any
    const userId = request.user?.id
    const exams = await this.examService.list(userId, query)
    reply.send(exams)
  }

  async getHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateQuery(historyQuerySchema)(request, reply)
    const userId = request.user!.id
    const query = request.query as any
    const history = await this.examService.getHistory(userId, query)
    reply.send(history)
  }

  async getStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const stats = await this.examService.getStats(userId)
    reply.send(stats)
  }

  async getEvolution(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const evolution = await this.examService.getEvolution(userId)
    reply.send(evolution)
  }

  async getSubjectStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const stats = await this.examService.getSubjectStats(userId)
    reply.send(stats)
  }
}
