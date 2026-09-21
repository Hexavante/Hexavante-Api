import { FastifyInstance } from "fastify";
import { ConversationController } from "../controller/conversation.controller";
import { ConversationService } from "../service/conversation.service";
import { ConversationRepository } from "../repository/conversation.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";
import {
  createConversationSchema,
  sendMessageSchema,
  getMessagesSchema,
  markReadSchema,
} from "../schemas/conversation.schemas";
import { validateBody, validateParams, validateQuery } from "../../../lib/validation/validate";

export async function conversationRoutes(fastify: FastifyInstance) {
  const repository = new ConversationRepository();
  const service = new ConversationService();
  const controller = new ConversationController(service);

  fastify.get(
    "/api/v1/conversations",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Caixa de entrada",
        tags: ["Conversations"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.getInbox.bind(controller)),
  );

  fastify.post(
    "/api/v1/conversations",
    {
      preHandler: [authenticate, validateBody(createConversationSchema)],
      schema: {
        summary: "Iniciar conversa",
        tags: ["Conversations"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.createConversation.bind(controller)),
  );

  fastify.get(
    "/api/v1/conversations/:conversationId/messages",
    {
      preHandler: [authenticate, validateParams(getMessagesSchema), validateQuery(getMessagesSchema)],
      schema: {
        summary: "Mensagens",
        tags: ["Conversations"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.getMessages.bind(controller)),
  );

  fastify.patch(
    "/api/v1/conversations/:conversationId/read",
    {
      preHandler: [authenticate, validateParams(markReadSchema)],
      schema: {
        summary: "Marcar como lida",
        tags: ["Conversations"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.markAsRead.bind(controller)),
  );

  fastify.post(
    "/api/v1/conversations/:conversationId/messages",
    {
      preHandler: [authenticate, validateParams(sendMessageSchema), validateBody(sendMessageSchema)],
      schema: {
        summary: "Enviar mensagem",
        tags: ["Conversations"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(controller.sendMessage.bind(controller)),
  );
}