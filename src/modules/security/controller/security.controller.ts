import { FastifyRequest, FastifyReply } from "fastify";
import { SecurityService, resolveDeviceFingerprint, resolveDeviceIp } from "../service/security.service";
import {
  verifyDeviceSchema,
  resendDeviceCodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  presenceSchema,
  heartbeatSchema,
} from "../schemas/security.schemas";
import { validateBody } from "../../../lib/validation/validate";
import { asyncHandler } from "../../../lib/errors/errorHandler";

export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  verifyDevice = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateBody(verifyDeviceSchema)(request, reply);
    const body = request.body as { verificationId: string; code: string; deviceUa?: string; deviceIp?: string; deviceId?: string };
    const userAgent = body.deviceUa || (request.headers["user-agent"] as string | undefined);
    // P1-5: o IP do body só vale se for IP válido; senão, IP do servidor.
    const ip = resolveDeviceIp(body.deviceIp, request.ip);
    const result = await this.securityService.finishDeviceVerification(
      body.verificationId,
      body.code,
      userAgent,
      ip,
      body.deviceId,
    );
    reply.send(result);
  });

  resendCode = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateBody(resendDeviceCodeSchema)(request, reply);
    const body = request.body as { verificationId: string };
    // userId validado via código ainda não usado
    const { userId } = await this.securityService.peekVerificationOwner(body.verificationId);
    const result = await this.securityService.resendCode(body.verificationId, userId);
    reply.send({ verificationId: result.verificationId });
  });

  forgotPassword = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateBody(forgotPasswordSchema)(request, reply);
    const body = request.body as { email: string };
    const result = await this.securityService.requestPasswordReset(body.email);
    reply.send({ ok: true, verificationId: result.verificationId });
  });

  resetPassword = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateBody(resetPasswordSchema)(request, reply);
    const body = request.body as { verificationId: string; code: string; password: string };
    await this.securityService.resetPassword(body.verificationId, body.code, body.password);
    reply.send({ ok: true });
  });

  listDevices = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const devices = await this.securityService.listDevices(userId);
    reply.send({ devices });
  });

  revokeDevice = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { deviceUa?: string; deviceIp?: string; deviceId?: string };
    const userAgent = body.deviceUa || (request.headers["user-agent"] as string | undefined);
    // P1-5: o IP do body só vale se for IP válido; senão, IP do servidor.
    const ip = resolveDeviceIp(body.deviceIp, request.ip);
    const current = resolveDeviceFingerprint({ deviceId: body.deviceId, userAgent, ip });
    const result = await this.securityService.revokeDevice(userId, id, current);
    reply.send(result);
  });

  enableTwoFactor = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const result = await this.securityService.setTwoFactor(userId, true);
    reply.send(result);
  });

  confirmTwoFactor = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateBody(verifyDeviceSchema)(request, reply);
    const body = request.body as { verificationId: string; code: string };
    const result = await this.securityService.confirmTwoFactor(
      body.verificationId,
      body.code,
      request.user!.id,
    );
    reply.send(result);
  });

  disableTwoFactor = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const result = await this.securityService.setTwoFactor(userId, false);
    reply.send(result);
  });

  setPresence = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateBody(presenceSchema)(request, reply);
    const userId = request.user!.id;
    const body = request.body as { status: "ONLINE" | "AWAY" | "STUDYING" | "DND" | "INVISIBLE" };
    const result = await this.securityService.setPresence(userId, body.status);
    reply.send(result);
  });

  heartbeat = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    await validateBody(heartbeatSchema)(request, reply);
    const userId = request.user!.id;
    const body = request.body as { status?: "ONLINE" | "AWAY" | "STUDYING" | "DND" | "INVISIBLE" };
    const result = await this.securityService.heartbeat(userId, body.status);
    reply.send(result);
  });
}
