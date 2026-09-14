import { FastifyInstance } from "fastify";
import { PlatformController } from "../controller/platform.controller";
import { PlatformService } from "../service/platform.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function platformRoutes(fastify: FastifyInstance) {
  const platformService = new PlatformService();
  const platformController = new PlatformController(platformService);

  fastify.get(
    "/api/v1/platform/stats",
    asyncHandler(platformController.getStats.bind(platformController)),
  );
}
