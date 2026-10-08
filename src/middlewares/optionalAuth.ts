import { FastifyRequest, FastifyReply } from "fastify";
import { validateSession, extractSessionToken } from "../lib/session";

export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const token = extractSessionToken(request.headers);
    if (!token) return;

    const session = await validateSession(token);
    if (session) {
      request.auth = {
        user: session.user,
        session: { userId: session.user.id, expiresAt: session.expiresAt },
      };
      request.user = session.user;
    }
  } catch {
    // Sem sessão — continua sem bloquear
  }
}
