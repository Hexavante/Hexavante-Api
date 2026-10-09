export interface LiveRoomSummary {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  videoProvider: string | null;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
  maxParticipants: number | null;
  participantCount: number;
  course: { id: string; title: string; slug: string } | null;
  instructor: { id: string; username: string | null; fullName: string };
}

export interface LiveRoomDetail extends LiveRoomSummary {
  isInstructor: boolean;
  isParticipant: boolean;
  activeParticipants: Array<{
    userId: string;
    username: string | null;
    fullName: string;
    joinedAt: string;
  }>;
}

export interface LiveChatMessageDto {
  id: string;
  roomId: string;
  userId: string;
  message: string;
  createdAt: string;
  user: { id: string; username: string | null; fullName: string };
}