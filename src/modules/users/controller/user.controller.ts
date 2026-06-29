import { FastifyRequest, FastifyReply } from "fastify";
import { UserService } from "../service/user.service";
import { updateProfileSchema } from "../schemas/user.schemas";
import { validateBody } from "../../../lib/validation/validate";

export class UserController {
  constructor(private readonly userService: UserService) {}

  async me(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;

    const profile = await this.userService.getProfile(userId);

    reply.send({ user: profile });
  }

  async updateMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(updateProfileSchema)(request, reply);

    const userId = request.user!.id;
    const body = request.body as any;

    const profile = await this.userService.updateProfile(userId, body);

    reply.send({ user: profile });
  }

  async deleteMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;

    await this.userService.softDelete(userId);

    reply.send({ success: true });
  }
}
