import { FastifyRequest, FastifyReply } from "fastify";
import { CourseService } from "../service/course.service";
import {
  courseQuerySchema,
  createCourseSchema,
  updateCourseSchema,
} from "../schemas/course.schemas";
import { validateBody, validateQuery } from "../../../lib/validation/validate";

export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateQuery(courseQuerySchema)(request, reply);
    const query = request.query as any;

    const result = await this.courseService.list(query);
    reply.send(result);
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };

    const course = await this.courseService.getById(id);
    reply.send({ course });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(createCourseSchema)(request, reply);
    const body = request.body as any;
    const userId = request.user!.id;

    const course = await this.courseService.create(body, userId);
    reply.status(201).send({ course });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(updateCourseSchema)(request, reply);
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const course = await this.courseService.update(id, body);
    reply.send({ course });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };

    await this.courseService.delete(id);
    reply.send({ success: true });
  }

  async enroll(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    reply.send({ message: "Not implemented" });
  }

  async getProgress(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const progress = await this.courseService.getProgress(userId, id);
    reply.send({ progress });
  }
}
