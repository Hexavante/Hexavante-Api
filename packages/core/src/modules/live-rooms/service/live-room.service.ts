import type { ILiveRoomRepository } from "../repository/live-room.repository";
import type {
  LiveRoomSummary,
  LiveRoomDetail,
  LiveChatMessageDto,
} from "../types/live-room.types";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors/AppError";
import type { CreateRoomInput, UpdateRoomInput } from "../schemas/live-room.schemas";

export class LiveRoomService {
  constructor(private readonly repo: ILiveRoomRepository) {}

  private serializeSummary(room: any): LiveRoomSummary {
    return {
      id: room.id,
      title: room.title,
      description: room.description,
      videoUrl: room.videoUrl,
      videoProvider: room.videoProvider,
      scheduledAt: room.scheduledAt.toISOString(),
      startedAt: room.startedAt?.toISOString() ?? null,
      endedAt: room.endedAt?.toISOString() ?? null,
      status: room.status,
      maxParticipants: room.maxParticipants,
      participantCount: room._count?.participants ?? 0,
      course: room.course ?? null,
      instructor: room.instructor
        ? { id: room.instructor.id, username: room.instructor.username, fullName: room.instructor.fullName }
        : { id: "", username: null, fullName: "" },
    };
  }

  async list(type: string): Promise<LiveRoomSummary[]> {
    const rooms = await this.repo.listAvailable(type);
    return rooms.map((r: any) => this.serializeSummary(r));
  }

  async listInstructorRooms(instructorId: string): Promise<LiveRoomSummary[]> {
    const rooms = await this.repo.listInstructorRooms(instructorId);
    return rooms.map((r: any) => this.serializeSummary(r));
  }

  async listInstructorCourses(instructorId: string) {
    return this.repo.listInstructorCourses(instructorId);
  }

  async getDetail(id: string, userId: string): Promise<LiveRoomDetail> {
    const room: any = await this.repo.findById(id);
    if (!room) throw new NotFoundError("Sala não encontrada");

    const isInstructor = room.instructorId === userId;
    const isParticipant = room.participants.some(
      (p: any) => p.userId === userId && !p.leftAt,
    );
    const activeParticipants = room.participants.filter((p: any) => !p.leftAt);

    return {
      ...this.serializeSummary(room),
      isInstructor,
      isParticipant,
      activeParticipants: activeParticipants.map((p: any) => ({
        userId: p.userId,
        username: p.user.username,
        fullName: p.user.fullName,
        joinedAt: p.joinedAt.toISOString(),
      })),
    };
  }

  async create(instructorId: string, data: CreateRoomInput): Promise<LiveRoomSummary> {
    if (data.courseId) {
      const course = await this.repo.findApprovedCourseForInstructor(data.courseId, instructorId);
      if (!course) throw new ForbiddenError("Curso não encontrado ou sem permissão");
    }
    const room: any = await this.repo.create(instructorId, data);
    return this.serializeSummary(room);
  }

  async update(roomId: string, instructorId: string, data: UpdateRoomInput): Promise<LiveRoomSummary> {
    const owned = await this.repo.findOwned(roomId, instructorId);
    if (!owned) throw new ForbiddenError("Sala não encontrada ou você não é o instrutor");
    if (owned.status !== "SCHEDULED") {
      throw new BadRequestError("Só é possível editar salas agendadas");
    }
    if (data.courseId) {
      const course = await this.repo.findApprovedCourseForInstructor(data.courseId, instructorId);
      if (!course) throw new ForbiddenError("Curso não encontrado ou sem permissão");
    }
    const room: any = await this.repo.update(roomId, data);
    return this.serializeSummary(room);
  }

  async cancel(roomId: string, instructorId: string): Promise<void> {
    const owned = await this.repo.findOwned(roomId, instructorId);
    if (!owned || owned.status !== "SCHEDULED") {
      throw new BadRequestError("Só é possível cancelar salas agendadas");
    }
    await this.repo.update(roomId, { status: "CANCELLED" });
  }

  async start(roomId: string, instructorId: string): Promise<LiveRoomSummary> {
    const owned = await this.repo.findOwned(roomId, instructorId);
    if (!owned) throw new ForbiddenError("Sala não encontrada ou você não é o instrutor");
    if (owned.status !== "SCHEDULED") {
      throw new BadRequestError("Só é possível iniciar salas agendadas");
    }
    const room: any = await this.repo.setStatus(roomId, "LIVE", new Date());
    return this.serializeSummary(room);
  }

  async end(roomId: string, instructorId: string): Promise<LiveRoomSummary> {
    const owned = await this.repo.findOwned(roomId, instructorId);
    if (!owned) throw new ForbiddenError("Sala não encontrada ou você não é o instrutor");
    if (owned.status !== "LIVE") {
      throw new BadRequestError("Só é possível encerrar salas em transmissão");
    }
    const room: any = await this.repo.setStatus(roomId, "ENDED", undefined, new Date());
    return this.serializeSummary(room);
  }

  async join(roomId: string, userId: string): Promise<void> {
    const room: any = await this.repo.findById(roomId);
    if (!room) throw new NotFoundError("Sala não encontrada");
    if (room.status !== "LIVE" && room.status !== "SCHEDULED") {
      throw new BadRequestError("Esta sala não está disponível para entrada");
    }

    const existing = await this.repo.findParticipant(roomId, userId);
    if (existing) {
      if (existing.leftAt) await this.repo.setParticipantActive(existing.id);
      return;
    }

    if (room.maxParticipants) {
      const count = await this.repo.countActiveParticipants(roomId);
      if (count >= room.maxParticipants) throw new BadRequestError("Sala lotada");
    }

    await this.repo.createParticipant(roomId, userId);
  }

  async leave(roomId: string, userId: string): Promise<void> {
    await this.repo.setParticipantLeft(roomId, userId);
  }

  private async canAccessChat(roomId: string, userId: string): Promise<boolean> {
    const room: any = await this.repo.findById(roomId);
    if (!room) return false;
    if (room.instructorId === userId) return true;
    const participant = await this.repo.findParticipant(roomId, userId);
    return Boolean(participant && !participant.leftAt);
  }

  async listMessages(roomId: string, userId: string): Promise<LiveChatMessageDto[]> {
    const allowed = await this.canAccessChat(roomId, userId);
    if (!allowed) throw new ForbiddenError("Você não tem acesso ao chat desta sala");
    const rows: any[] = await this.repo.listMessages(roomId);
    return rows.map((m) => this.serializeMessage(m));
  }

  async listMessagesSince(roomId: string, userId: string, since?: Date): Promise<LiveChatMessageDto[]> {
    const allowed = await this.canAccessChat(roomId, userId);
    if (!allowed) throw new ForbiddenError("Você não tem acesso ao chat desta sala");
    const rows: any[] = await this.repo.listMessagesSince(roomId, since);
    return rows.map((m) => this.serializeMessage(m));
  }

  async sendMessage(roomId: string, userId: string, message: string): Promise<LiveChatMessageDto> {
    const room: any = await this.repo.findById(roomId);
    if (!room) throw new NotFoundError("Sala não encontrada");
    if (room.status !== "LIVE") {
      throw new BadRequestError("O chat só está disponível durante a transmissão ao vivo");
    }
    const allowed = await this.canAccessChat(roomId, userId);
    if (!allowed) throw new ForbiddenError("Você precisa estar na sala para enviar mensagens");

    const row: any = await this.repo.createMessage(roomId, userId, message.trim());
    return this.serializeMessage(row);
  }

  private serializeMessage(row: any): LiveChatMessageDto {
    return {
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      user: { id: row.user.id, username: row.user.username, fullName: row.user.fullName },
    };
  }
}