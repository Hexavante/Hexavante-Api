import { FastifyInstance } from "fastify";
import { CourseController } from "../controller/course.controller";
import { CourseService } from "../service/course.service";
import { CourseRepository } from "../repository/course.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { optionalAuth } from "../../../middlewares/optionalAuth";
import { permission } from "../../../modules/authorization/middleware/authorization.middleware";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function courseRoutes(fastify: FastifyInstance) {
  const courseRepository = new CourseRepository();
  const courseService = new CourseService(courseRepository);
  const courseController = new CourseController(courseService);

  fastify.get(
    "/api/v1/courses",
    { preHandler: [optionalAuth] },
    asyncHandler(courseController.list.bind(courseController)),
  );

  fastify.get(
    "/api/v1/courses/:id",
    asyncHandler(courseController.getById.bind(courseController)),
  );

  fastify.post(
    "/api/v1/courses",
    { preHandler: [authenticate, permission("course.create")] },
    asyncHandler(courseController.create.bind(courseController)),
  );

  fastify.patch(
    "/api/v1/courses/:id",
    { preHandler: [authenticate, permission("course.update")] },
    asyncHandler(courseController.update.bind(courseController)),
  );

  fastify.delete(
    "/api/v1/courses/:id",
    { preHandler: [authenticate, permission("course.delete")] },
    asyncHandler(courseController.delete.bind(courseController)),
  );

  fastify.post(
    "/api/v1/courses/:id/enroll",
    { preHandler: [authenticate] },
    asyncHandler(courseController.enroll.bind(courseController)),
  );

  fastify.get(
    "/api/v1/courses/:id/progress",
    { preHandler: [authenticate] },
    asyncHandler(courseController.getProgress.bind(courseController)),
  );
}
