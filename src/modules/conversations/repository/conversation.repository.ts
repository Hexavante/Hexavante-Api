import { prisma } from "../../../config/prisma";
import type {
  Conversation,
  InboxConversation,
  DirectMessage,
  InboxResponse,
  CreateConversationResponse,
} from "../types/conversation.types";

const USER_PREVIEW = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
} as const;

interface ConversationWithParticipants {
  id: string;
  participantAId: string;
  participantBId: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  participantA: {
    id: string;
    username: string | null;
    fullName: string;
    avatarUrl: string | null;
  };
  participantB: {
    id: string;
    username: string | null;
    fullName: string;
    avatarUrl: string | null;
  };
  messages?: Array<{
    id: string;
    body: string;
    senderId: string;
    createdAt: Date;
    readAt: Date | null;
  }>;
}

function getOtherParticipant(conversation: ConversationWithParticipants, userId: string) {
  return conversation.participantAId === userId ? conversation.participantB : conversation.participantA;
}

function normalizeParticipantPair(userIdA: string, userIdB: string) {
  return userIdA < userIdB
    ? { participantAId: userIdA, participantBId: userIdB }
    : { participantAId: userIdB, participantBId: userIdA };
}

export class ConversationRepository {
  async findInboxConversations(userId: string): Promise<InboxConversation[]> {
    const conversations = await prisma.directConversation.findMany({
      where: {
        OR: [{ participantAId: userId }, { participantBId: userId }],
      },
      include: {
        participantA: { select: USER_PREVIEW },
        participantB: { select: USER_PREVIEW },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            body: true,
            senderId: true,
            createdAt: true,
            readAt: true,
          },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });

    const enriched = await Promise.all(
      conversations.map(async (conversation) => {
        const other = getOtherParticipant(conversation, userId);
        const lastMessage = conversation.messages[0] ?? null;
        const unreadCount = await prisma.directMessage.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            readAt: null,
          },
        });

        return {
          id: conversation.id,
          otherUser: other,
          lastMessage: lastMessage
            ? {
                ...lastMessage,
                createdAt: lastMessage.createdAt,
                readAt: lastMessage.readAt,
              }
            : null,
          unreadCount,
          lastMessageAt: conversation.lastMessageAt,
          createdAt: conversation.createdAt,
        };
      }),
    );

    return enriched;
  }

  async countUnreadMessages(userId: string): Promise<number> {
    return prisma.directMessage.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        conversation: {
          OR: [{ participantAId: userId }, { participantBId: userId }],
        },
      },
    });
  }

  async getInboxWithUnreadCount(userId: string): Promise<InboxResponse> {
    const [conversations, unreadCount] = await Promise.all([
      this.findInboxConversations(userId),
      this.countUnreadMessages(userId),
    ]);
    return { conversations, unreadCount };
  }

  async findConversationByParticipants(userIdA: string, userIdB: string): Promise<Conversation | null> {
    const pair = normalizeParticipantPair(userIdA, userIdB);
    return prisma.directConversation.findUnique({
      where: {
        participantAId_participantBId: {
          participantAId: pair.participantAId,
          participantBId: pair.participantBId,
        },
      },
      include: {
        participantA: { select: USER_PREVIEW },
        participantB: { select: USER_PREVIEW },
      },
    });
  }

  async findConversationById(conversationId: string, userId: string): Promise<Conversation | null> {
    return prisma.directConversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ participantAId: userId }, { participantBId: userId }],
      },
      include: {
        participantA: { select: USER_PREVIEW },
        participantB: { select: USER_PREVIEW },
      },
    });
  }

  async createConversation(userIdA: string, userIdB: string): Promise<CreateConversationResponse> {
    const pair = normalizeParticipantPair(userIdA, userIdB);

    const existing = await prisma.directConversation.findUnique({
      where: {
        participantAId_participantBId: {
          participantAId: pair.participantAId,
          participantBId: pair.participantBId,
        },
      },
      include: {
        participantA: { select: USER_PREVIEW },
        participantB: { select: USER_PREVIEW },
      },
    });

    if (existing) {
      const other = getOtherParticipant(existing, userIdA);
      return { conversationId: existing.id, otherUser: other };
    }

    const conversation = await prisma.directConversation.create({
      data: pair,
      include: {
        participantA: { select: USER_PREVIEW },
        participantB: { select: USER_PREVIEW },
      },
    });

    const other = getOtherParticipant(conversation, userIdA);
    return { conversationId: conversation.id, otherUser: other };
  }

  async createConversationByUsername(initiatorId: string, username: string): Promise<CreateConversationResponse> {
    const recipient = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!recipient) throw new Error("Usuário não encontrado.");
    return this.createConversation(initiatorId, recipient.id);
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    options?: { since?: Date; limit?: number },
  ): Promise<DirectMessage[]> {
    const conversation = await this.findConversationById(conversationId, userId);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);

    return prisma.directMessage.findMany({
      where: {
        conversationId,
        ...(options?.since ? { createdAt: { gt: options.since } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: {
        sender: { select: USER_PREVIEW },
      },
    });
  }

  async markConversationRead(conversationId: string, userId: string): Promise<number> {
    const conversation = await this.findConversationById(conversationId, userId);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const result = await prisma.directMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<DirectMessage> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("A mensagem não pode estar vazia.");
    if (trimmed.length > 2000) throw new Error("A mensagem pode ter no máximo 2000 caracteres.");

    const conversation = await this.findConversationById(conversationId, senderId);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const recipientId =
      conversation.participantAId === senderId
        ? conversation.participantBId
        : conversation.participantAId;

    const [message] = await prisma.$transaction([
      prisma.directMessage.create({
        data: {
          conversationId,
          senderId,
          body: trimmed,
        },
        include: {
          sender: { select: USER_PREVIEW },
        },
      }),
      prisma.directConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  async canMessageUser(senderId: string, recipientId: string): Promise<{ allowed: boolean; reason?: string }> {
    if (senderId === recipientId) {
      return { allowed: false, reason: "Você não pode enviar mensagem para si mesmo." };
    }

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, profileVisibility: true },
    });
    if (!recipient) {
      return { allowed: false, reason: "Usuário não encontrado." };
    }

    if (recipient.profileVisibility === "private") {
      const senderFollows = await prisma.userFollow.findUnique({
        where: { followerId_followingId: { followerId: senderId, followingId: recipientId } },
      });
      const recipientFollows = await prisma.userFollow.findUnique({
        where: { followerId_followingId: { followerId: recipientId, followingId: senderId } },
      });
      if (!senderFollows && !recipientFollows) {
        return {
          allowed: false,
          reason: "Este perfil é privado. Siga o usuário ou seja seguido para enviar mensagens.",
        };
      }
    }

    return { allowed: true };
  }
}