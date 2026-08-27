import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../service/auth.service';
import { UnauthorizedError } from '../../../lib/errors/AppError';
import { loginSchema, registerSchema } from '../schemas/auth.schemas';
import { validateBody } from '../../../lib/validation/validate';
import { auth } from '../../../config/auth';
import { fromNodeHeaders } from 'better-auth/node';

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

  async loginWithSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(loginSchema)(request, reply);
    const body = request.body as { email: string; password: string; rememberMe?: boolean };

    const user = await this.authService.signIn(body.email, body.password);
    if (!user) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    const authContext = await auth.$context;
    const session = await authContext.internalAdapter.createSession(user.id, body.rememberMe === false);
    if (!session) {
      throw new UnauthorizedError('Falha ao criar sessão');
    }

    const cookieName = authContext.authCookies.sessionToken.name;
    const cookieAttributes = authContext.authCookies.sessionToken.attributes;
    const maxAge = body.rememberMe === false ? undefined : cookieAttributes.maxAge;

    // Sign the cookie with the auth secret (same as Better Auth's setSignedCookie)
    reply.setCookie(cookieName, session.token, {
      ...cookieAttributes,
      sameSite: (cookieAttributes.sameSite?.toLowerCase() as 'lax' | 'strict' | 'none') ?? 'lax',
      maxAge,
      signed: true,
    });

    if (body.rememberMe === false) {
      const dontRememberAttrs = authContext.authCookies.dontRememberToken.attributes;
      reply.setCookie(authContext.authCookies.dontRememberToken.name, 'true', {
        ...dontRememberAttrs,
        sameSite: (dontRememberAttrs.sameSite?.toLowerCase() as 'lax' | 'strict' | 'none') ?? 'lax',
        signed: true,
      } as const);
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

    const impersonatorId = (session.session as { impersonatedBy?: string } | undefined)?.impersonatedBy;

    let impersonator: { id: string; username: string | null } | null = null;
    if (impersonatorId) {
      impersonator = await this.authService.getUserBasicInfo(impersonatorId);
    }

    reply.send({
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        username: user.username,
        roles: user.roles.map((r) => r.role.name),
      },
      session: {
        impersonatedBy: impersonatorId ?? null,
        impersonator: impersonator
          ? { id: impersonator.id, username: impersonator.username }
          : null,
      },
    });
  }
}
