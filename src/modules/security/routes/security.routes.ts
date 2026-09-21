import { FastifyInstance } from "fastify";
import { SecurityController } from "../controller/security.controller";
import { SecurityService } from "../service/security.service";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function securityRoutes(fastify: FastifyInstance) {
  const securityService = new SecurityService();
  const securityController = new SecurityController(securityService);

  fastify.post(
    "/api/v1/auth/verify-device",
    {
      schema: {
        summary: "Verificar dispositivo com código",
        tags: ["Security"],
      },
    },
    asyncHandler(securityController.verifyDevice.bind(securityController)),
  );

  fastify.post(
    "/api/v1/auth/resend-device-code",
    {
      schema: {
        summary: "Reenviar código de verificação",
        tags: ["Security"],
      },
    },
    asyncHandler(securityController.resendCode.bind(securityController)),
  );

  fastify.get(
    "/api/v1/users/me/devices",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Listar dispositivos confiáveis",
        tags: ["Security"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(securityController.listDevices.bind(securityController)),
  );

  fastify.delete(
    "/api/v1/users/me/devices/:id",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Revogar dispositivo",
        tags: ["Security"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(securityController.revokeDevice.bind(securityController)),
  );

  fastify.post(
    "/api/v1/users/me/2fa/enable",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Ativar 2FA (gerar segredo)",
        tags: ["Security"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(securityController.enableTwoFactor.bind(securityController)),
  );

  fastify.post(
    "/api/v1/users/me/2fa/confirm",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Confirmar 2FA com código TOTP",
        tags: ["Security"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(securityController.confirmTwoFactor.bind(securityController)),
  );

  fastify.delete(
    "/api/v1/users/me/2fa",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Desativar 2FA",
        tags: ["Security"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(securityController.disableTwoFactor.bind(securityController)),
  );

  fastify.patch(
    "/api/v1/users/me/presence",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Atualizar status de presença",
        tags: ["Security"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(securityController.setPresence.bind(securityController)),
  );

  fastify.post(
    "/api/v1/users/me/heartbeat",
    {
      preHandler: [authenticate],
      schema: {
        summary: "Heartbeat para manter sessão ativa",
        tags: ["Security"],
        security: [{ session: [] }],
      },
    },
    asyncHandler(securityController.heartbeat.bind(securityController)),
  );
}
