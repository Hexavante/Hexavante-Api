import { FastifyRequest, FastifyReply } from "fastify";
import { InstructorService } from "../service/instructor.service";
import { validateBody } from "../../../lib/validation/validate";
import { applyInstructorSchema } from "../schemas/instructor.schemas";

export class InstructorController {
  constructor(private readonly instructorService: InstructorService) {}

  async getStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;
    const status = await this.instructorService.getStatus(userId);
    reply.send({ ...status, success: true });
  }

  async apply(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(applyInstructorSchema)(request, reply);
    const userId = request.user!.id;
    const body = request.body as {
      motivation: string;
      experience: string;
      portfolioUrl?: string | null;
    };

    const application = await this.instructorService.apply(userId, body);
    reply.status(201).send({ success: true, application });
  }

  async getCategories(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const categories = await this.instructorService.getCategories();
    reply.send({ success: true, categories });
  }

  async getMyCourses(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;
    const courses = await this.instructorService.getMyCourses(userId);
    reply.send({ success: true, courses });
  }
}