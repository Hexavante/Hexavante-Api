import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/prisma";
import { validateSession, parseSessionToken } from "../lib/session";

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = parseSessionToken(request.headers.cookie || null);
  if (!token) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }

  const session = await validateSession(token);
  if (!session) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { banned: true },
  });

  if (user?.banned) {
    return reply.status(403).send({ success: false, error: 'Conta banida' });
  }

  request.auth = {
    user: session.user,
    session: { userId: session.user.id, expiresAt: session.expiresAt },
  };
  request.user = session.user;
}
