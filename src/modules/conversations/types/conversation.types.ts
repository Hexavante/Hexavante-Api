export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  sender: {
    id: string;
    username: string | null;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface Conversation {
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
  messages?: DirectMessage[];
}

export interface InboxConversation {
  id: string;
  otherUser: {
    id: string;
    username: string | null;
    fullName: string;
    avatarUrl: string | null;
  };
  lastMessage: {
    id: string;
    body: string;
    senderId: string;
    createdAt: Date;
    readAt: Date | null;
  } | null;
  unreadCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface InboxResponse {
  conversations: InboxConversation[];
  unreadCount: number;
}

export interface CreateConversationInput {
  recipientUserId?: string;
  username?: string;
}

export interface CreateConversationResponse {
  conversationId: string;
  otherUser: {
    id: string;
    username: string | null;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface SendMessageInput {
  body: string;
}

export interface GetMessagesQuery {
  since?: string;
  limit?: number;
}