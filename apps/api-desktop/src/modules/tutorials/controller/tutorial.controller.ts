import { FastifyRequest, FastifyReply } from "fastify";
import { TutorialService } from "../service/tutorial.service";
import { tutorialQuerySchema } from "../schemas/tutorial.schemas";
import { validateQuery } from "../../../lib/validation/validate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export class TutorialController {
  constructor(private readonly tutorialService: TutorialService) {}

  list = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateQuery(tutorialQuerySchema)(request, reply);
    const result = await this.tutorialService.list(request.query as never);
    reply.send(result);
  });

  getById = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tutorial = await this.tutorialService.getBySlugOrId(id);
    reply.send({ tutorial });
  });

  incrementViews = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tutorial = await this.tutorialService.getBySlugOrId(id);
    await this.tutorialService.incrementViews(tutorial.id);
    reply.send({ success: true });
  });
}
