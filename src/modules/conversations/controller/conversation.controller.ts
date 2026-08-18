import type { FastifyRequest, FastifyReply } from "fastify";
import { ConversationService } from "../service/conversation.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export class ConversationController {
  constructor(private service: ConversationService) {}

  getInbox = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const inbox = await this.service.getInbox(userId);

    return reply.send({
      success: true,
      conversations: inbox.conversations,
      unreadCount: inbox.unreadCount,
    });
  });

  createConversation = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { recipientUserId, username } = request.body as { recipientUserId?: string; username?: string };
    const result = await this.service.createConversation(userId, { recipientUserId, username });

    return reply.status(201).send({
      success: true,
      conversationId: result.conversationId,
      otherUser: result.otherUser,
    });
  });

  getMessages = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { conversationId } = request.params as { conversationId: string };
    const { since, limit = 50 } = request.query as { since?: string; limit?: string };

    const messages = await this.service.getMessages(conversationId, userId, {
      since: since ? new Date(since) : undefined,
      limit: Number(limit),
    });

    return reply.send({
      success: true,
      messages,
    });
  });

  markAsRead = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { conversationId } = request.params as { conversationId: string };

    const count = await this.service.markAsRead(conversationId, userId);

    return reply.send({
      success: true,
      count,
    });
  });

  sendMessage = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { conversationId } = request.params as { conversationId: string };
    const { body } = request.body as { body: string };

    const message = await this.service.sendMessage(conversationId, userId, body);

    return reply.status(201).send({
      success: true,
      message,
    });
  });
}