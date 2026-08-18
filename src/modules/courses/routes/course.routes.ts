import { FastifyInstance } from "fastify";
import { CourseController } from "../controller/course.controller";
import { CourseService } from "../service/course.service";
import { CourseRepository } from "../repository/course.repository";
import { CourseLearningRepository } from "../repository/learning.repository";
import { LearningService } from "../service/learning.service";
import { LearningController } from "../controller/learning.controller";
import { authenticate } from "../../../middlewares/authenticate";
import { optionalAuth } from "../../../middlewares/optionalAuth";
import { permission } from "../../../modules/authorization/middleware/authorization.middleware";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function courseRoutes(fastify: FastifyInstance) {
  const courseRepository = new CourseRepository();
  const courseService = new CourseService(courseRepository);
  const courseController = new CourseController(courseService);

  const learningRepository = new CourseLearningRepository();
  const learningService = new LearningService(learningRepository);
  const learningController = new LearningController(learningService);

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

  fastify.get(
    "/api/v1/courses/:courseId/lessons/:lessonId",
    { preHandler: [authenticate] },
    asyncHandler(learningController.getLesson.bind(learningController)),
  );

  fastify.post(
    "/api/v1/courses/:courseId/lessons/:lessonId/complete",
    { preHandler: [authenticate] },
    asyncHandler(learningController.completeLesson.bind(learningController)),
  );

  fastify.post(
    "/api/v1/courses/:courseId/lessons/:lessonId/favorite",
    { preHandler: [authenticate] },
    asyncHandler(learningController.toggleFavorite.bind(learningController)),
  );

  fastify.get(
    "/api/v1/courses/:courseId/lessons/:lessonId/note",
    { preHandler: [authenticate] },
    asyncHandler(learningController.getNote.bind(learningController)),
  );

  fastify.put(
    "/api/v1/courses/:courseId/lessons/:lessonId/note",
    { preHandler: [authenticate] },
    asyncHandler(learningController.saveNote.bind(learningController)),
  );
}
