import { FastifyInstance } from "fastify";
import { UserController } from "../controller/user.controller";
import { UserService } from "../service/user.service";
import { UserRepository } from "../repository/user.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { optionalAuth } from "../../../middlewares/optionalAuth";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function userRoutes(fastify: FastifyInstance) {
  const userRepository = new UserRepository();
  const userService = new UserService(userRepository);
  const userController = new UserController(userService);

  fastify.get(
    "/api/v1/users/me",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Obter meu perfil completo",
        tags: ["Users"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(userController.me.bind(userController)),
  );

  fastify.get(
    "/api/v1/users/:username",
    {
      preHandler: [optionalAuth],
      schema: {
        summary: "Perfil público de um usuário",
        tags: ["Users"],
      },
    },
    asyncHandler(userController.getPublicProfile.bind(userController)),
  );

  fastify.patch(
    "/api/v1/users/me",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Atualizar meu perfil",
        tags: ["Users"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(userController.updateMe.bind(userController)),
  );

  fastify.delete(
    "/api/v1/users/me",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Deletar minha conta",
        tags: ["Users"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(userController.deleteMe.bind(userController)),
  );
}
