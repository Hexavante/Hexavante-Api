import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { ExamService } from '../service/exam.service'
import { examQuerySchema, historyQuerySchema, submitExamSchema } from '../schemas/exam.schemas'
import { validateQuery, validateBody } from '../../../lib/validation/validate'

export class ExamController {
  constructor(private readonly examService: ExamService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateQuery(examQuerySchema)(request, reply)
    const query = request.query as any
    const userId = request.user?.id
    const exams = await this.examService.list(userId, query)
    reply.send(exams)
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const exam = await this.examService.getPublicBySlugOrId(id);
    reply.send({ exam });
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

  async startExam(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const { id } = request.params as { id: string }
    const result = await this.examService.startExam(userId, id)
    reply.send(result)
  }

  async submitExam(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    await validateBody(submitExamSchema)(request, reply)
    const data = request.body as z.infer<typeof submitExamSchema>
    const result = await this.examService.submitExam(userId, data)
    reply.send(result)
  }
}
