import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../service/auth.service';
import { UnauthorizedError } from '../../../lib/errors/AppError';
import { loginSchema, registerSchema } from '../schemas/auth.schemas';
import { validateBody } from '../../../lib/validation/validate';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async login(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(loginSchema)(request, reply);
    const body = request.body as { email: string; password: string };

    const user = await this.authService.signIn(body.email, body.password);
    if (!user) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    reply.send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        roles: user.roles,
      },
    });
  }

  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(registerSchema)(request, reply);
    const body = request.body as any;

    const user = await this.authService.signUp(body);

    reply.status(201).send({
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        username: user.username,
        roles: ['USER'],
      },
    });
  }

  async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await this.authService.signOut(request.headers as any);
    reply.send({ success: true });
  }

  async session(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = await this.authService.getSession(request.headers as any);
    if (!session) {
      throw new UnauthorizedError('Sessão inválida ou expirada');
    }

    const user = await this.authService.getUserById(session.user.id);
    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado');
    }

    reply.send({
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        username: user.username,
        roles: user.roles.map((r) => r.role.name),
      },
    });
  }
}
