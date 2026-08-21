import { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../config/auth";
import { prisma } from "../config/prisma";

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const session = await auth.api.getSession({
    headers: request.headers as any,
  });

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

  request.auth = session;
  request.user = session.user;
}
