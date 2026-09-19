import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../service/auth.service';
import { UnauthorizedError } from '../../../lib/errors/AppError';
import { loginSchema, registerSchema } from '../schemas/auth.schemas';
import { validateBody } from '../../../lib/validation/validate';
import { parseSessionToken } from '../../../lib/session';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async login(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(loginSchema)(request, reply);
    const body = request.body as { email: string; password: string; deviceUa?: string; deviceIp?: string };

    // O app web repassa UA/IP reais do navegador (o fetch server-side
    // chegaria aqui como UA "node" e IP interno para todo mundo).
    const userAgent = body.deviceUa || (request.headers['user-agent'] as string | undefined);
    const ipAddress = body.deviceIp || request.ip;

    const result = await this.authService.signIn(
      body.email,
      body.password,
      ipAddress,
      userAgent,
    );
    if (!result) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    if ('requiresVerification' in result && result.requiresVerification) {
      reply.status(202).send({
        requiresVerification: true,
        verificationId: result.verificationId,
        reason: result.reason,
      });
      return;
    }

    reply.setCookie('__Secure-hexavante.session_token', result.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      domain: process.env.NODE_ENV === 'production' ? '.hexavante.com.br' : undefined,
    });

    reply.send({
      user: result.user,
      session: {
        token: result.session.token,
        expiresAt: result.session.expiresAt,
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
    const token = parseSessionToken(request.headers.cookie || null);

    if (token) {
      await this.authService.signOut(token);
    }

    reply.clearCookie('__Secure-hexavante.session_token', {
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? '.hexavante.com.br' : undefined,
    });

    reply.send({ success: true });
  }

  async session(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = parseSessionToken(request.headers.cookie || null);

    if (!token) {
      throw new UnauthorizedError('Sessão inválida ou expirada');
    }

    const session = await this.authService.getSession(token);
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
        avatarUrl: user.avatarUrl,
        roles: user.roles.map((r: { role: { name: string } }) => r.role.name),
      },
      session: {
        expiresAt: session.expiresAt,
      },
    });
  }
}
