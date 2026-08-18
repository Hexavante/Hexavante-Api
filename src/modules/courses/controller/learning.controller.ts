import { FastifyRequest, FastifyReply } from "fastify";
import { LearningService } from "../service/learning.service";
import { validateBody } from "../../../lib/validation/validate";
import { saveNoteSchema } from "../schemas/learning.schemas";

interface LessonParams {
  courseId: string;
  lessonId: string;
}

export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  async getLesson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { courseId, lessonId } = request.params as LessonParams;
    const userId = request.user!.id;

    const result = await this.learningService.getLessonDetail(userId, courseId, lessonId);
    reply.send({ ...result, success: true });
  }

  async completeLesson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { courseId, lessonId } = request.params as LessonParams;
    const userId = request.user!.id;

    const result = await this.learningService.completeLesson(userId, courseId, lessonId);
    reply.send({ success: true, ...result });
  }

  async toggleFavorite(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { courseId, lessonId } = request.params as LessonParams;
    const userId = request.user!.id;

    const isFavorite = await this.learningService.toggleFavorite(userId, courseId, lessonId);
    reply.send({ success: true, isFavorite });
  }

  async getNote(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { courseId, lessonId } = request.params as LessonParams;
    const userId = request.user!.id;

    const content = await this.learningService.getNote(userId, courseId, lessonId);
    reply.send({ success: true, content });
  }

  async saveNote(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(saveNoteSchema)(request, reply);
    const { courseId, lessonId } = request.params as LessonParams;
    const body = request.body as { content: string };
    const userId = request.user!.id;

    await this.learningService.saveNote(userId, courseId, lessonId, body.content);
    reply.send({ success: true });
  }
}