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
    {
      schema: {
        summary: "Listar salas ao vivo",
        tags: ["Live Rooms"],
      },
    },
    asyncHandler(controller.list.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/instructor",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Minhas salas (instrutor)",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.instructorRooms.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/instructor/courses",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Cursos do instrutor",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.instructorCourses.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Criar sala ao vivo",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.create.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/:id",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Detalhes da sala",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.detail.bind(controller)),
  );

  fastify.patch(
    "/api/v1/live-rooms/:id",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Atualizar sala",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.update.bind(controller)),
  );

  fastify.delete(
    "/api/v1/live-rooms/:id",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Cancelar sala",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.cancel.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/start",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Iniciar transmissão",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.start.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/end",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Encerrar transmissão",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.end.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/join",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Entrar na sala",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.join.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/leave",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Sair da sala",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.leave.bind(controller)),
  );

  fastify.get(
    "/api/v1/live-rooms/:id/messages",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Chat da sala",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.messages.bind(controller)),
  );

  fastify.post(
    "/api/v1/live-rooms/:id/messages",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Enviar mensagem no chat",
        tags: ["Live Rooms"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.send.bind(controller)),
  );
}