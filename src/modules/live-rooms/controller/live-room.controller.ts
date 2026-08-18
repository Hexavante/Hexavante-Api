import { FastifyRequest, FastifyReply } from "fastify";
import { LiveRoomService } from "../service/live-room.service";
import { validateBody } from "../../../lib/validation/validate";
import {
  createRoomSchema,
  updateRoomSchema,
  sendMessageSchema,
} from "../schemas/live-room.schemas";

export class LiveRoomController {
  constructor(private readonly liveRoomService: LiveRoomService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = (request.query ?? {}) as { status?: string };
    const rooms = await this.liveRoomService.list(query.status ?? "all");
    reply.send({ rooms, success: true });
  }

  async instructorRooms(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;
    const rooms = await this.liveRoomService.listInstructorRooms(userId);
    reply.send({ rooms, success: true });
  }

  async instructorCourses(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;
    const courses = await this.liveRoomService.listInstructorCourses(userId);
    reply.send({ courses, success: true });
  }

  async detail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const room = await this.liveRoomService.getDetail(id, userId);
    reply.send({ room, success: true });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(createRoomSchema)(request, reply);
    const body = request.body as any;
    const userId = request.user!.id;
    const room = await this.liveRoomService.create(userId, body);
    reply.status(201).send({ room, success: true });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(updateRoomSchema)(request, reply);
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const userId = request.user!.id;
    const room = await this.liveRoomService.update(id, userId, body);
    reply.send({ room, success: true });
  }

  async cancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    await this.liveRoomService.cancel(id, userId);
    reply.send({ success: true });
  }

  async start(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const room = await this.liveRoomService.start(id, userId);
    reply.send({ room, success: true });
  }

  async end(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const room = await this.liveRoomService.end(id, userId);
    reply.send({ room, success: true });
  }

  async join(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    await this.liveRoomService.join(id, userId);
    reply.send({ success: true });
  }

  async leave(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    await this.liveRoomService.leave(id, userId);
    reply.send({ success: true });
  }

  async messages(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const query = (request.query ?? {}) as { since?: string };
    const since = query.since && !Number.isNaN(new Date(query.since).getTime())
      ? new Date(query.since)
      : undefined;
    const messages = await this.liveRoomService.listMessagesSince(id, userId, since);
    reply.send({ messages, success: true });
  }

  async send(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(sendMessageSchema)(request, reply);
    const { id } = request.params as { id: string };
    const body = request.body as { message: string };
    const userId = request.user!.id;
    const message = await this.liveRoomService.sendMessage(id, userId, body.message);
    reply.status(201).send({ message, success: true });
  }
}