import { FastifyInstance } from 'fastify';
import { AuthController } from '../controller/auth.controller';
import { AuthService } from '../service/auth.service';
import { asyncHandler } from '../../../lib/errors/errorHandler';

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService();
  const authController = new AuthController(authService);

  fastify.post('/api/v1/auth/login', asyncHandler(authController.login.bind(authController)));
  fastify.post('/api/v1/auth/register', asyncHandler(authController.register.bind(authController)));
  fastify.post('/api/v1/auth/logout', asyncHandler(authController.logout.bind(authController)));
  fastify.get('/api/v1/auth/session', asyncHandler(authController.session.bind(authController)));
}
