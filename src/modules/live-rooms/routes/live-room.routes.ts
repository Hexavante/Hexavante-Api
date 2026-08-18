import { FastifyInstance } from "fastify";
import { LiveRoomController } from "../controller/live-room.controller";
import { LiveRoomService } from "../service/live-room.service";
import { LiveRoomRepository } from "../repository/live-room.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function liveRoomRoutes(fastify: FastifyInstance) {
  const repository = new LiveRoomRepository();
  const service = new LiveRoomService(repository);
  const controller = new LiveRoomController(service);

  fastify.get(
    "/api/v1/live-rooms",
    asyncHandler(controller.list.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/instructor",
    { preHandler: [authenticate] },
    asyncHandler(controller.instructorRooms.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/instructor/courses",
    { preHandler: [authenticate] },
    asyncHandler(controller.instructorCourses.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms",
    { preHandler: [authenticate] },
    asyncHandler(controller.create.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/:id",
    { preHandler: [authenticate] },
    asyncHandler(controller.detail.bind(controller)),
  );

  fastify.patch(
    "/api/v1/live-rooms/:id",
    { preHandler: [authenticate] },
    asyncHandler(controller.update.bind(controller)),
  );

  fastify.delete(
    "/api/v1/live-rooms/:id",
    { preHandler: [authenticate] },
    asyncHandler(controller.cancel.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/start",
    { preHandler: [authenticate] },
    asyncHandler(controller.start.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/end",
    { preHandler: [authenticate] },
    asyncHandler(controller.end.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/join",
    { preHandler: [authenticate] },
    asyncHandler(controller.join.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/leave",
    { preHandler: [authenticate] },
    asyncHandler(controller.leave.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/:id/messages",
    { preHandler: [authenticate] },
    asyncHandler(controller.messages.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/messages",
    { preHandler: [authenticate] },
    asyncHandler(controller.send.bind(controller)),
  );
}