import { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../config/auth";

export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers as any,
    });
    if (session) {
      request.auth = session;
      request.user = session.user;
    }
  } catch {
    // Sem sessão — continua sem bloquear
  }
}
