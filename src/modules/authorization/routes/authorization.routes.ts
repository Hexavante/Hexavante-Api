import { FastifyInstance } from "fastify";
import { AuthorizationController } from "../controller/authorization.controller";
import { AuthorizationService } from "../service/authorization.service";
import { AuthorizationRepository } from "../repository/authorization.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { authorize } from "../../../middlewares/authorize";
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
    {
      preHandler: [authenticate],
      schema: {
        summary: "Contexto de autorização do usuário",
        tags: ["Authorization"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.getContext.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/check/:permission",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Verificar se tenho uma permissão",
        tags: ["Authorization"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.checkPermission.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/permissions",
    {
      schema: {
        summary: "Permissões de um usuário (query: userId)",
        tags: ["Authorization"],
      },
    },
    asyncHandler(controller.getUserPermissions.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/permissions/list",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Listar todas as permissões definidas",
        tags: ["Authorization"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.listPermissions.bind(controller)),
  );

  fastify.get(
    "/api/v1/authorization/roles",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Listar todas as roles",
        tags: ["Authorization"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.listRoles.bind(controller)),
  );

  fastify.post(
    "/api/v1/authorization/permissions",
    {
      preHandler: [authenticate, authorize(["ADMIN"])],
      schema: {
        summary: "Criar nova permissão (admin)",
        tags: ["Authorization"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.createPermission.bind(controller)),
  );

  fastify.post(
    "/api/v1/authorization/roles",
    {
      preHandler: [authenticate, authorize(["ADMIN"])],
      schema: {
        summary: "Criar nova role (admin)",
        tags: ["Authorization"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.createRole.bind(controller)),
  );
}
