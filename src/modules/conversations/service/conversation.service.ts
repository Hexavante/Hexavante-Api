import { ConversationRepository } from "../repository/conversation.repository";
import type {
  InboxResponse,
  CreateConversationResponse,
  DirectMessage,
  InboxConversation,
} from "../types/conversation.types";
import { AppError } from "../../../lib/errors/AppError";

export class ConversationService {
  private repository: ConversationRepository;

  constructor() {
    this.repository = new ConversationRepository();
  }

  async getInbox(userId: string): Promise<InboxResponse> {
    return this.repository.getInboxWithUnreadCount(userId);
  }

  async createConversation(initiatorId: string, input: { recipientUserId?: string; username?: string }): Promise<CreateConversationResponse> {
    if (input.recipientUserId) {
      const canMessage = await this.repository.canMessageUser(initiatorId, input.recipientUserId);
      if (!canMessage.allowed) {
        throw new AppError(403, canMessage.reason ?? "Não é possível enviar mensagem para este usuário.");
      }
      return this.repository.createConversation(initiatorId, input.recipientUserId);
    } else if (input.username) {
      return this.repository.createConversationByUsername(initiatorId, input.username);
    }
    throw new AppError(400, "Informe recipientUserId ou username");
  }

  async getMessages(conversationId: string, userId: string, options?: { since?: Date; limit?: number }): Promise<DirectMessage[]> {
    return this.repository.getConversationMessages(conversationId, userId, options);
  }

  async markAsRead(conversationId: string, userId: string): Promise<number> {
    return this.repository.markConversationRead(conversationId, userId);
  }

  async sendMessage(conversationId: string, senderId: string, body: string): Promise<DirectMessage> {
    const conversation = await this.repository.findConversationById(conversationId, senderId);
    if (!conversation) throw new AppError(404, "Conversa não encontrada.");

    const recipientId =
      conversation.participantAId === senderId
        ? conversation.participantBId
        : conversation.participantAId;

    const canMessage = await this.repository.canMessageUser(senderId, recipientId);
    if (!canMessage.allowed) {
      throw new AppError(403, canMessage.reason ?? "Não é possível enviar mensagem para este usuário.");
    }

    return this.repository.sendMessage(conversationId, senderId, body);
  }
}