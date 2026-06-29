import { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../config/auth";

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

  request.auth = session;
  request.user = session.user;
}
