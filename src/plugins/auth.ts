import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { auth } from '../config/auth';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: typeof auth.$Infer.Session;
    user?: typeof auth.$Infer.Session.user;
  }
}

export const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const response = await auth.handler(request.raw as any);
      reply.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        reply.header(key, value);
      }
      if (response.body) {
        reply.send(response.body);
      } else {
        reply.send();
      }
    },
  });

  fastify.decorate('auth', auth);

  fastify.addHook('preHandler', async (request, reply) => {
    try {
      const session = await auth.api.getSession({
        headers: request.headers as any,
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
