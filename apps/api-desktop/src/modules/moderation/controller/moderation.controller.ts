import { FastifyRequest, FastifyReply } from "fastify";
import { ModerationService } from "../service/moderation.service";
import { validateBody } from "../../../lib/validation/validate";
import { moderationActionSchema } from "../schemas/moderation.schemas";

interface ActionBody {
  reason: string;
  durationHours?: number;
}

export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  async listUsers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { search, status, role, limit } = request.query as {
      search?: string;
      status?: string;
      role?: string;
      limit?: string;
    };

    const users = await this.moderationService.listUsers({
      search,
      status,
      role,
      limit: limit ? Number(limit) : undefined,
    });
    reply.send({ success: true, users });
  }

  async getStats(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const stats = await this.moderationService.getStats();
    reply.send({ success: true, stats });
  }

  async ban(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(moderationActionSchema)(request, reply);
    const moderatorId = request.user!.id;
    const { userId } = request.params as { userId: string };
    const body = request.body as ActionBody;

    await this.moderationService.banUser(moderatorId, userId, body);
    reply.send({ success: true });
  }

  async unban(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const moderatorId = request.user!.id;
    const { userId } = request.params as { userId: string };

    await this.moderationService.unbanUser(moderatorId, userId);
    reply.send({ success: true });
  }

  async mute(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(moderationActionSchema)(request, reply);
    const moderatorId = request.user!.id;
    const { userId } = request.params as { userId: string };
    const body = request.body as ActionBody;

    await this.moderationService.muteUser(moderatorId, userId, body);
    reply.send({ success: true });
  }

  async unmute(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const moderatorId = request.user!.id;
    const { userId } = request.params as { userId: string };

    await this.moderationService.unmuteUser(moderatorId, userId);
    reply.send({ success: true });
  }

  async warn(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(moderationActionSchema)(request, reply);
    const moderatorId = request.user!.id;
    const { userId } = request.params as { userId: string };
    const body = request.body as ActionBody;

    await this.moderationService.warnUser(moderatorId, userId, body);
    reply.send({ success: true });
  }
}