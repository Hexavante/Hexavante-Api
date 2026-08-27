import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { validateSession, parseSessionToken } from '../lib/session';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user: {
        id: string;
        fullName: string;
        email: string;
        username: string | null;
        banned: boolean | null;
        avatarUrl: string | null;
        roles: { role: { name: string } }[];
      };
      session: { userId: string; expiresAt: Date };
    };
    user?: {
      id: string;
      fullName: string;
      email: string;
      username: string | null;
      banned: boolean | null;
      avatarUrl: string | null;
      roles: { role: { name: string } }[];
    };
  }
}

export const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', async (request) => {
    try {
      const token = parseSessionToken(request.headers.cookie || null);
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
      // No session - continue without auth
    }
  });
};

export default authPlugin;
