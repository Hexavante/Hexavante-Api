import { FastifyInstance } from "fastify";
import { UserController } from "../controller/user.controller";
import { UserService } from "../service/user.service";
import { UserRepository } from "../repository/user.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function userRoutes(fastify: FastifyInstance) {
  const userRepository = new UserRepository();
  const userService = new UserService(userRepository);
  const userController = new UserController(userService);

  fastify.get(
    "/api/v1/users/me",
    { preHandler: [authenticate] },
    asyncHandler(userController.me.bind(userController)),
  );

  fastify.patch(
    "/api/v1/users/me",
    { preHandler: [authenticate] },
    asyncHandler(userController.updateMe.bind(userController)),
  );

  fastify.delete(
    "/api/v1/users/me",
    { preHandler: [authenticate] },
    asyncHandler(userController.deleteMe.bind(userController)),
  );
}
