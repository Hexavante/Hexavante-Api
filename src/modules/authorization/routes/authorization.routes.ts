import { FastifyInstance } from "fastify";
import { AuthorizationController } from "../controller/authorization.controller";
import { AuthorizationService } from "../service/authorization.service";
import { AuthorizationRepository } from "../repository/authorization.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function authorizationRoutes(fastify: FastifyInstance) {
  const repository = new AuthorizationRepository();
  const service = new AuthorizationService(repository);
  const controller = new AuthorizationController(service);

  fastify.addHook("onRequest", async (request) => {
    (request as any).authorizationService = service;
  });

  fastify.get(
    "/api/v1/authorization/context",
    { preHandler: [authenticate] },
    asyncHandler(controller.getContext.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/check/:permission",
    { preHandler: [authenticate] },
    asyncHandler(controller.checkPermission.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/permissions",
    asyncHandler(controller.getUserPermissions.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/permissions/list",
    { preHandler: [authenticate] },
    asyncHandler(controller.listPermissions.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/roles",
    { preHandler: [authenticate] },
    asyncHandler(controller.listRoles.bind(controller)),
  );

  fastify.post(
    "/api/v1/authorization/permissions",
    { preHandler: [authenticate] },
    asyncHandler(controller.createPermission.bind(controller)),
  );

  fastify.post(
    "/api/v1/authorization/roles",
    { preHandler: [authenticate] },
    asyncHandler(controller.createRole.bind(controller)),
  );
}
