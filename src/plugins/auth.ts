import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { auth } from '../config/auth';
import { fromNodeHeaders } from 'better-auth/node';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: typeof auth.$Infer.Session;
    user?: typeof auth.$Infer.Session.user;
  }
}

export const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Better Auth auth routes (sign-in, sign-up, social OAuth, etc.)
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = fromNodeHeaders(request.headers);

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    },
  });

  // Better Auth admin plugin routes (impersonate, ban, list users, etc.)
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/admin/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = fromNodeHeaders(request.headers);

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    },
  });

  fastify.decorate('auth', auth);

  fastify.addHook('preHandler', async (request) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (session) {
        request.auth = session;
        request.user = session.user;
      }
    } catch {
      // No session - continue without auth
    }
  });
};

export default authPlugin;
