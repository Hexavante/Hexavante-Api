import { FastifyInstance } from 'fastify';
import { AuthController } from '../controller/auth.controller';
import { AuthService } from '../service/auth.service';
import { rateLimitPlugin } from '../../../plugins/rate-limit';
import { asyncHandler } from '../../../lib/errors/errorHandler';
const authService = new AuthService();
const authController = new AuthController(authService);

export async function authRoutes(fastify: FastifyInstance) {
  fastify.register(rateLimitPlugin);

  fastify.post('/api/v1/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: 60 * 1000,
      },
    },
    schema: {
      summary: "Login com e-mail e senha",
      tags: ["Auth"],
    },
  }, asyncHandler(authController.login.bind(authController)));

  fastify.post('/api/v1/auth/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 60 * 1000,
      },
    },
    schema: {
      summary: "Registrar nova conta",
      tags: ["Auth"],
    },
  }, asyncHandler(authController.register.bind(authController)));

  fastify.post('/api/v1/auth/logout', {
    schema: {
      summary: "Encerrar sessão",
      tags: ["Auth"],
    },
  }, asyncHandler(authController.logout.bind(authController)));

  fastify.get('/api/v1/auth/session', {
    schema: {
      summary: "Obter sessão atual",
      tags: ["Auth"],
    },
  }, asyncHandler(authController.session.bind(authController)));

  fastify.get('/api/v1/auth/oauth/success', {
    schema: {
      summary: "Página de sucesso OAuth (popup)",
      tags: ["Auth"],
      hide: true,
    },
  }, async (request, reply) => {
    reply.type('text/html').send(`
      <!DOCTYPE html>
      <html>
        <head><title>Autenticado</title></head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'auth-success' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  });
}
