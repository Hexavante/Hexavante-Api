import { FastifyRequest, FastifyReply } from "fastify";
import { PlatformService } from "../service/platform.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  getStats = asyncHandler(async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = await this.platformService.getStats();
    reply.send(stats);
  });
}
