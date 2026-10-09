import { FastifyRequest, FastifyReply } from "fastify";
import { UserService } from "../service/user.service";
import { updateProfileSchema } from "../schemas/user.schemas";
import { validateBody, validateParams } from "../../../lib/validation/validate";
import { z } from "zod";

const usernameParamSchema = z.object({
  params: z.object({
    username: z.string().min(1, "Nome de usuário é obrigatório"),
  }),
});

export class UserController {
  constructor(private readonly userService: UserService) {}

  async me(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;

    const profile = await this.userService.getProfile(userId);

    reply.send({ user: profile });
  }

  async getPublicProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateParams(usernameParamSchema)(request, reply);

    const { username } = request.params as { username: string };
    const profile = await this.userService.getPublicProfile(username);

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
