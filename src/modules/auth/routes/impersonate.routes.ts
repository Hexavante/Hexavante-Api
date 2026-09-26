import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../config/prisma';
import { createSession, parseSessionToken } from '../../../lib/session';
import { authenticate } from '../../../middlewares/authenticate';
import { asyncHandler } from '../../../lib/errors/errorHandler';
import { ForbiddenError, NotFoundError } from '../../../lib/errors/AppError';
import { validateBody } from '../../../lib/validation/validate';

const impersonateSchema = z.object({
  userId: z.string().min(1, 'Usuário inválido'),
});

function requireAdminId(request: FastifyRequest): string {
  const user = request.user as unknown as {
    id: string;
    roles?: Array<string | { name?: string; role?: { name?: string } }>;
  };
  const roles = Array.isArray(user?.roles)
    ? user.roles.map((r) => (typeof r === 'string' ? r : (r?.role?.name ?? r?.name ?? '')))
    : [];
  if (!roles.includes('ADMIN')) {
    throw new ForbiddenError('Acesso restrito a administradores');
  }
  return user.id;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    domain: process.env.NODE_ENV === 'production' ? '.hexavante.com.br' : undefined,
  };
}

export async function impersonateRoutes(fastify: FastifyInstance) {
  // Paths SEM prefixo /api/v1 — o web já chama exatamente assim.
  fastify.post(
    '/admin/impersonate-user',
    {
      preHandler: [authenticate],
      schema: { summary: 'Impersonar usuário (admin)', tags: ['Admin'], security: [{ session: [] }] },
    },
    asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
      await validateBody(impersonateSchema)(request, reply);
      const adminId = requireAdminId(request);
      const { userId } = request.body as { userId: string };

      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true },
      });
      if (!target) throw new NotFoundError('Usuário não encontrado');

      const session = await createSession(
        target.id,
        request.ip,
        request.headers['user-agent'] as string | undefined,
      );
      await prisma.session.update({
        where: { id: (session as { id: string }).id },
        data: { impersonatedBy: adminId },
      });

      reply.setCookie('__Secure-hexavante.session_token', session.token, sessionCookieOptions());
      reply.send({ success: true, user: target });
    }),
  );

  fastify.post(
    '/admin/stop-impersonating',
    {
      preHandler: [authenticate],
      schema: { summary: 'Encerrar impersonação', tags: ['Admin'], security: [{ session: [] }] },
    },
    asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
      const token = parseSessionToken(request.headers.cookie || null);
      if (token) {
        await prisma.session.deleteMany({ where: { token } });
      }
      reply.clearCookie('__Secure-hexavante.session_token', {
        path: '/',
        domain: process.env.NODE_ENV === 'production' ? '.hexavante.com.br' : undefined,
      });
      reply.send({ success: true });
    }),
  );
}
