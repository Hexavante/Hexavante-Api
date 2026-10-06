import { FastifyInstance } from "fastify";
import { SecurityController } from "../controller/security.controller";
import { SecurityService } from "../service/security.service";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export async function securityRoutes(fastify: FastifyInstance) {
  const securityService = new SecurityService();
  const securityController = new SecurityController(securityService);

  // Limites próprios via `config.rateLimit` (mesmo padrão de login/register/
  // /oauth/exchange): o rate-limit global do escopo raiz usa um contador
  // próprio por rota e NÃO incrementa o global. NÃO registrar o plugin aqui.
  fastify.post(
    "/api/v1/auth/forgot-password",
    {
      // Pública + envia e-mail: 5 solicitações/min por IP.
      config: { rateLimit: { max: 5, timeWindow: 60 * 1000 } },
      schema: {
        summary: "Solicitar código de redefinição de senha",
        tags: ["Security"],
      },
    },
    asyncHandler(securityController.forgotPassword.bind(securityController)),
  );

  fastify.post(
    "/api/v1/auth/reset-password",
    {
      // Tentativa de código: 10/min por IP (além do teto de 5 tentativas
      // por registro em consumeCode).
      config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } },
      schema: {
        summary: "Redefinir senha com código",
        tags: ["Security"],
      },
    },
    asyncHandler(securityController.resetPassword.bind(securityController)),
  );

  fastify.post(
    "/api/v1/auth/verify-device",
    {
      // Tentativa de código: 10/min por IP (além do teto por registro).
      config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } },
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
      // Reenvio de e-mail (já com cooldown de 60s): 5/min por IP.
      config: { rateLimit: { max: 5, timeWindow: 60 * 1000 } },
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
