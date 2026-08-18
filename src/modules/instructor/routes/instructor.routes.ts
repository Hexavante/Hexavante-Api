import { FastifyInstance } from "fastify";
import { InstructorController } from "../controller/instructor.controller";
import { InstructorService } from "../service/instructor.service";
import { InstructorRepository } from "../repository/instructor.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function instructorRoutes(fastify: FastifyInstance) {
  const repository = new InstructorRepository();
  const service = new InstructorService(repository);
  const controller = new InstructorController(service);

  fastify.get(
    "/api/v1/instructor/status",
    { preHandler: [authenticate] },
    asyncHandler(controller.getStatus.bind(controller)),
  );

  fastify.post(
    "/api/v1/instructor/apply",
    { preHandler: [authenticate] },
    asyncHandler(controller.apply.bind(controller)),
  );

  fastify.get(
    "/api/v1/courses/categories",
    asyncHandler(controller.getCategories.bind(controller)),
  );

  fastify.get(
    "/api/v1/instructor/courses",
    { preHandler: [authenticate] },
    asyncHandler(controller.getMyCourses.bind(controller)),
  );
}