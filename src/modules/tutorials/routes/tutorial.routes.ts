import { FastifyInstance } from "fastify";
import { TutorialController } from "../controller/tutorial.controller";
import { TutorialService } from "../service/tutorial.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function tutorialRoutes(fastify: FastifyInstance) {
  const tutorialService = new TutorialService();
  const tutorialController = new TutorialController(tutorialService);

  fastify.get(
    "/api/v1/tutorials",
    { schema: { summary: "Listar tutoriais", tags: ["Tutorials"] } },
    asyncHandler(tutorialController.list.bind(tutorialController)),
  );

  fastify.get(
    "/api/v1/tutorials/:id",
    { schema: { summary: "Detalhes do tutorial", tags: ["Tutorials"] } },
    asyncHandler(tutorialController.getById.bind(tutorialController)),
  );

  fastify.post(
    "/api/v1/tutorials/:id/view",
    { schema: { summary: "Registrar visualização", tags: ["Tutorials"] } },
    asyncHandler(tutorialController.incrementViews.bind(tutorialController)),
  );
}
