import { FastifyInstance } from "fastify";
import { MediaController } from "../controller/media.controller";
import { MediaService } from "../service/media.service";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function mediaRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService();
  const mediaController = new MediaController(mediaService);

  // Uploads são pesados e públicos-autenticados: limite próprio por rota
  // (contador independente, sem re-registrar o plugin — padrão do repo).
  fastify.post(
    "/api/v1/users/me/avatar",
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } },
      schema: {
        summary: "Enviar avatar (multipart, máx. 5MB)",
        tags: ["Users"],
        security: [{ session: [] }, { bearerAuth: [] }],
        consumes: ["multipart/form-data"],
        response: {
          200: {
            type: "object",
            properties: {
              avatarUrl: { type: "string" },
            },
          },
        },
      },
    },
    asyncHandler(mediaController.updateAvatar.bind(mediaController)),
  );

  fastify.post(
    "/api/v1/users/me/banner",
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } },
      schema: {
        summary: "Enviar banner (multipart, máx. 8MB)",
        tags: ["Users"],
        security: [{ session: [] }, { bearerAuth: [] }],
        consumes: ["multipart/form-data"],
        response: {
          200: {
            type: "object",
            properties: {
              bannerUrl: { type: "string" },
            },
          },
        },
      },
    },
    asyncHandler(mediaController.updateBanner.bind(mediaController)),
  );
}
