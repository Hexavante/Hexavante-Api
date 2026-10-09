import { prisma } from "../../../config/prisma";
import type { LiveRoomStatus } from "@prisma/client";

const roomListInclude = {
  course: { select: { id: true, title: true, slug: true } },
  instructor: { select: { id: true, username: true, fullName: true } },
  _count: { select: { participants: true } },
} as const;

export interface LiveRoomInput {
  title: string;
  description?: string;
  courseId?: string;
  videoUrl?: string;
  videoProvider?: string;
  scheduledAt: Date;
  maxParticipants?: number;
}

export interface ILiveRoomRepository {
  listAvailable(type: string): Promise<unknown[]>;
  listInstructorRooms(instructorId: string): Promise<unknown[]>;
  listInstructorCourses(instructorId: string): Promise<unknown[]>;
  findById(id: string): Promise<unknown | null>;
  create(instructorId: string, data: LiveRoomInput): Promise<unknown>;
  update(roomId: string, data: Partial<LiveRoomInput> & { status?: LiveRoomStatus }): Promise<unknown | null>;
  findOwned(roomId: string, instructorId: string): Promise<{ id: string; status: string } | null>;
  setStatus(roomId: string, status: LiveRoomStatus, startedAt?: Date, endedAt?: Date): Promise<unknown>;
  findParticipant(roomId: string, userId: string): Promise<{ id: string; leftAt: Date | null } | null>;
  createParticipant(roomId: string, userId: string): Promise<unknown>;
  setParticipantActive(participantId: string): Promise<unknown>;
  setParticipantLeft(roomId: string, userId: string): Promise<void>;
  countActiveParticipants(roomId: string): Promise<number>;
  findApprovedCourseForInstructor(courseId: string, instructorId: string): Promise<{ id: string } | null>;
  listMessages(roomId: string, limit?: number): Promise<unknown[]>;
  listMessagesSince(roomId: string, since?: Date): Promise<unknown[]>;
  createMessage(roomId: string, userId: string, message: string): Promise<unknown>;
}

export class LiveRoomRepository implements ILiveRoomRepository {
  async listAvailable(type: string) {
    const statuses: LiveRoomStatus[] =
      type === "scheduled"
        ? ["SCHEDULED"]
        : type === "live"
          ? ["LIVE"]
          : type === "ended"
            ? ["ENDED"]
            : ["SCHEDULED", "LIVE", "ENDED"];

    return prisma.liveRoom.findMany({
      where: { status: { in: statuses } },
      include: roomListInclude,
      orderBy: { scheduledAt: "asc" },
    });
  }

  async listInstructorRooms(instructorId: string) {
    return prisma.liveRoom.findMany({
      where: { instructorId },
      include: roomListInclude,
      orderBy: { scheduledAt: "desc" },
    });
  }

  async listInstructorCourses(instructorId: string) {
    return prisma.course.findMany({
      where: { status: "APPROVED", instructors: { some: { userId: instructorId } } },
      select: { id: true, title: true, slug: true },
      orderBy: { title: "asc" },
    });
  }

  async findById(id: string) {
    return prisma.liveRoom.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        instructor: { select: { id: true, username: true, fullName: true } },
        participants: {
          include: { user: { select: { id: true, username: true, fullName: true } } },
        },
        _count: { select: { participants: true } },
      },
    });
  }

  async create(instructorId: string, data: LiveRoomInput) {
    return prisma.liveRoom.create({
      data: {
        instructorId,
        title: data.title,
        description: data.description,
        courseId: data.courseId || null,
        videoUrl: data.videoUrl || null,
        videoProvider: data.videoProvider || null,
        scheduledAt: data.scheduledAt,
        maxParticipants: data.maxParticipants ?? null,
      },
      include: roomListInclude,
    });
  }

  async update(roomId: string, data: Partial<LiveRoomInput> & { status?: LiveRoomStatus }) {
    return prisma.liveRoom.update({
      where: { id: roomId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.courseId !== undefined ? { courseId: data.courseId || null } : {}),
        ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl || null } : {}),
        ...(data.videoProvider !== undefined ? { videoProvider: data.videoProvider || null } : {}),
        ...(data.scheduledAt !== undefined ? { scheduledAt: data.scheduledAt } : {}),
        ...(data.maxParticipants !== undefined ? { maxParticipants: data.maxParticipants ?? null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: roomListInclude,
    });
  }

  async findOwned(roomId: string, instructorId: string) {
    return prisma.liveRoom.findFirst({
      where: { id: roomId, instructorId },
      select: { id: true, status: true },
    });
  }

  async setStatus(roomId: string, status: LiveRoomStatus, startedAt?: Date, endedAt?: Date) {
    return prisma.liveRoom.update({
      where: { id: roomId },
      data: {
        status,
        ...(startedAt ? { startedAt } : {}),
        ...(endedAt ? { endedAt } : {}),
      },
      include: roomListInclude,
    });
  }

  async findParticipant(roomId: string, userId: string) {
    return prisma.liveRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true, leftAt: true },
    });
  }

  async createParticipant(roomId: string, userId: string) {
    return prisma.liveRoomParticipant.create({
      data: { roomId, userId },
      include: { user: { select: { id: true, username: true, fullName: true } } },
    });
  }

  async setParticipantActive(participantId: string) {
    return prisma.liveRoomParticipant.update({
      where: { id: participantId },
      data: { leftAt: null, joinedAt: new Date() },
    });
  }

  async setParticipantLeft(roomId: string, userId: string) {
    await prisma.liveRoomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
  }

  async countActiveParticipants(roomId: string) {
    return prisma.liveRoomParticipant.count({ where: { roomId, leftAt: null } });
  }

  async findApprovedCourseForInstructor(courseId: string, instructorId: string) {
    return prisma.course.findFirst({
      where: { id: courseId, status: "APPROVED", instructors: { some: { userId: instructorId } } },
      select: { id: true },
    });
  }

  async listMessages(roomId: string, limit = 50) {
    return prisma.liveChatMessage.findMany({
      where: { roomId },
      include: { user: { select: { id: true, username: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  async listMessagesSince(roomId: string, since?: Date) {
    return prisma.liveChatMessage.findMany({
      where: { roomId, ...(since ? { createdAt: { gt: since } } : {}) },
      include: { user: { select: { id: true, username: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }

  async createMessage(roomId: string, userId: string, message: string) {
    return prisma.liveChatMessage.create({
      data: { roomId, userId, message },
      include: { user: { select: { id: true, username: true, fullName: true } } },
    });
  }
}