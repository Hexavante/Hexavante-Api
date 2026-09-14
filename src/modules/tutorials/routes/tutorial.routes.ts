import { FastifyInstance } from "fastify";
import { TutorialController } from "../controller/tutorial.controller";
import { TutorialService } from "../service/tutorial.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function tutorialRoutes(fastify: FastifyInstance) {
  const tutorialService = new TutorialService();
  const tutorialController = new TutorialController(tutorialService);

  fastify.get(
    "/api/v1/tutorials",
    asyncHandler(tutorialController.list.bind(tutorialController)),
  );

  fastify.get(
    "/api/v1/tutorials/:id",
    asyncHandler(tutorialController.getById.bind(tutorialController)),
  );

  fastify.post(
    "/api/v1/tutorials/:id/view",
    asyncHandler(tutorialController.incrementViews.bind(tutorialController)),
  );
}
