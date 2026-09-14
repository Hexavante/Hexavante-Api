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
    asyncHandler(securityController.verifyDevice.bind(securityController)),
  );

  fastify.post(
    "/api/v1/auth/resend-device-code",
    asyncHandler(securityController.resendCode.bind(securityController)),
  );

  fastify.get(
    "/api/v1/users/me/devices",
    { preHandler: [authenticate] },
    asyncHandler(securityController.listDevices.bind(securityController)),
  );

  fastify.delete(
    "/api/v1/users/me/devices/:id",
    { preHandler: [authenticate] },
    asyncHandler(securityController.revokeDevice.bind(securityController)),
  );

  fastify.post(
    "/api/v1/users/me/2fa/enable",
    { preHandler: [authenticate] },
    asyncHandler(securityController.enableTwoFactor.bind(securityController)),
  );

  fastify.post(
    "/api/v1/users/me/2fa/confirm",
    { preHandler: [authenticate] },
    asyncHandler(securityController.confirmTwoFactor.bind(securityController)),
  );

  fastify.delete(
    "/api/v1/users/me/2fa",
    { preHandler: [authenticate] },
    asyncHandler(securityController.disableTwoFactor.bind(securityController)),
  );

  fastify.patch(
    "/api/v1/users/me/presence",
    { preHandler: [authenticate] },
    asyncHandler(securityController.setPresence.bind(securityController)),
  );

  fastify.post(
    "/api/v1/users/me/heartbeat",
    { preHandler: [authenticate] },
    asyncHandler(securityController.heartbeat.bind(securityController)),
  );
}
