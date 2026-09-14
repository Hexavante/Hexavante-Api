import { createHash, randomInt } from "crypto";
import { prisma } from "../../../config/prisma";
import { createSession } from "../../../lib/session";
import { sendEmail, deviceCodeEmailHtml, twoFactorEmailHtml } from "../../../lib/email";
import { AppError, NotFoundError, BadRequestError } from "../../../lib/errors/AppError";

export const PRESENCE_STATUSES = ["ONLINE", "AWAY", "STUDYING", "DND", "INVISIBLE"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const OFFLINE_AFTER_MS = 5 * 60 * 1000;

export function fingerprintDevice(userAgent: string | undefined, ip: string | undefined): string {
  return createHash("sha256")
    .update(`${userAgent ?? "unknown"}|${ip ?? "unknown"}`)
    .digest("hex")
    .slice(0, 64);
}

export function deviceDisplayName(userAgent: string | undefined, ip: string | undefined): string {
  const ua = userAgent ?? "";
  const os = /windows/i.test(ua)
    ? "Windows"
    : /macintosh|mac os/i.test(ua)
      ? "macOS"
      : /android/i.test(ua)
        ? "Android"
        : /iphone|ipad/i.test(ua)
          ? "iOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "Dispositivo";
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /chrome/i.test(ua)
      ? "Chrome"
      : /firefox/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : "Navegador";
  return `${browser} em ${os}${ip ? ` · ${ip}` : ""}`;
}

function newCode(): string {
  return String(randomInt(100000, 1000000));
}

async function mailCode(to: string, subject: string, html: string, text: string, logLabel: string) {
  const result = await sendEmail({ to, subject, html, text });
  if (result.sent) {
    console.log(`[security] Código enviado para ${to} (${logLabel})`);
    return;
  }
  if (process.env.RESEND_API_KEY) {
    throw new AppError(502, "Não foi possível enviar o código por e-mail. Tente novamente.");
  }
  console.log(`[security:dev] Código para ${to} (${logLabel})`);
}

export class SecurityService {
  async isDeviceTrusted(userId: string, fingerprint: string): Promise<boolean> {
    const device = await prisma.trustedDevice.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
      select: { revokedAt: true },
    });
    return Boolean(device && !device.revokedAt);
  }

  async trustDevice(
    userId: string,
    fingerprint: string,
    userAgent?: string,
    ip?: string,
  ) {
    return prisma.trustedDevice.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      create: {
        userId,
        fingerprint,
        name: deviceDisplayName(userAgent, ip),
        ipAddress: ip ?? null,
        userAgent: userAgent ?? null,
        lastSeenAt: new Date(),
      },
      update: { revokedAt: null, lastSeenAt: new Date(), ipAddress: ip ?? null },
    });
  }

  async issueCode(input: {
    userId: string;
    email: string;
    fingerprint?: string | null;
    purpose: "DEVICE" | "TWO_FACTOR";
    deviceName?: string;
  }): Promise<{ verificationId: string }> {
    await prisma.deviceVerificationCode.updateMany({
      where: { userId: input.userId, purpose: input.purpose, used: false },
      data: { used: true },
    });

    const code = newCode();
    const record = await prisma.deviceVerificationCode.create({
      data: {
        userId: input.userId,
        fingerprint: input.fingerprint ?? null,
        purpose: input.purpose,
        code,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    if (input.purpose === "DEVICE") {
      await mailCode(
        input.email,
        "Novo dispositivo detectado — Hexavante",
        deviceCodeEmailHtml(code, input.deviceName ?? "um novo dispositivo"),
        `Um acesso à sua conta Hexavante foi feito de ${input.deviceName ?? "um novo dispositivo"}. Código: ${code} (expira em 10 minutos)`,
        "device",
      );
    } else {
      await mailCode(
        input.email,
        "Seu código de verificação — Hexavante",
        twoFactorEmailHtml(code),
        `Seu código de verificação Hexavante: ${code} (expira em 10 minutos)`,
        "2fa",
      );
    }

    return { verificationId: record.id };
  }

  async peekVerificationOwner(verificationId: string): Promise<{ userId: string }> {
    const record = await prisma.deviceVerificationCode.findFirst({
      where: { id: verificationId, used: false },
      select: { userId: true },
    });
    if (!record) throw new BadRequestError("Verificação expirada. Faça login novamente.");
    return { userId: record.userId };
  }

  async resendCode(verificationId: string, userId: string): Promise<{ verificationId: string }> {    const record = await prisma.deviceVerificationCode.findFirst({
      where: { id: verificationId, userId, used: false },
      include: { user: { select: { email: true } } },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestError("Verificação expirada. Faça login novamente.");
    }
    if (Date.now() - record.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - record.createdAt.getTime())) / 1000);
      throw new AppError(429, `Aguarde ${wait}s antes de solicitar um novo código.`);
    }
    return this.issueCode({
      userId,
      email: record.user.email,
      fingerprint: record.fingerprint,
      purpose: record.purpose as "DEVICE" | "TWO_FACTOR",
    });
  }

  async consumeCode(
    verificationId: string,
    code: string,
  ): Promise<{ userId: string; fingerprint: string | null; purpose: string }> {
    const record = await prisma.deviceVerificationCode.findUnique({
      where: { id: verificationId },
    });
    if (!record || record.used || record.expiresAt < new Date()) {
      throw new BadRequestError("Código inválido ou expirado.");
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await prisma.deviceVerificationCode.update({
        where: { id: record.id },
        data: { used: true },
      });
      throw new AppError(429, "Muitas tentativas. Solicite um novo código.");
    }
    if (record.code !== code) {
      await prisma.deviceVerificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestError("Código incorreto.");
    }
    await prisma.deviceVerificationCode.update({
      where: { id: record.id },
      data: { used: true },
    });
    return { userId: record.userId, fingerprint: record.fingerprint, purpose: record.purpose };
  }

  async finishDeviceVerification(
    verificationId: string,
    code: string,
    userAgent?: string,
    ip?: string,
  ) {
    const { userId, fingerprint } = await this.consumeCode(verificationId, code);
    const fp = fingerprint ?? fingerprintDevice(userAgent, ip);
    await this.trustDevice(userId, fp, userAgent, ip);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundError("Usuário não encontrado.");

    return this.buildSession(user.id, ip, userAgent);
  }

  private async buildSession(userId: string, ip?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundError("Usuário não encontrado.");
    const session = await createSession(userId, ip, userAgent);
    return {
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        roles: user.roles.map((r: { role: { name: string } }) => r.role.name),
      },
      session: { token: session.token, expiresAt: session.expiresAt },
    };
  }

  async touchDevice(userId: string, fingerprint: string, userAgent?: string, ip?: string) {
    await prisma.trustedDevice.updateMany({
      where: { userId, fingerprint, revokedAt: null },
      data: { lastSeenAt: new Date(), ipAddress: ip ?? undefined },
    });
    await prisma.user.updateMany({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  }

  async listDevices(userId: string) {
    const devices = await prisma.trustedDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
    return devices.map((d) => ({
      id: d.id,
      name: d.name ?? "Dispositivo",
      ipAddress: d.ipAddress,
      lastSeenAt: d.lastSeenAt.toISOString(),
      revoked: Boolean(d.revokedAt),
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async revokeDevice(userId: string, deviceId: string, currentFingerprint?: string) {
    const device = await prisma.trustedDevice.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundError("Dispositivo não encontrado.");
    await prisma.trustedDevice.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });
    // Encerra sessões originadas do mesmo IP/user-agent do dispositivo
    if (device.userAgent || device.ipAddress) {
      await prisma.session.deleteMany({
        where: {
          userId,
          ...(device.ipAddress ? { ipAddress: device.ipAddress } : {}),
          ...(device.userAgent ? { userAgent: device.userAgent } : {}),
        },
      });
    }
    return { revoked: true, currentRevoked: currentFingerprint === device.fingerprint };
  }

  async setTwoFactor(userId: string, enabled: boolean) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundError("Usuário não encontrado.");
    if (enabled && !user.twoFactorEnabled) {
      return this.issueCode({ userId, email: user.email, purpose: "TWO_FACTOR" });
    }
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: enabled } });
    return { enabled };
  }

  async confirmTwoFactor(verificationId: string, code: string) {
    const { userId, purpose } = await this.consumeCode(verificationId, code);
    if (purpose !== "TWO_FACTOR") throw new BadRequestError("Verificação inválida.");
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    return { enabled: true };
  }

  async setPresence(userId: string, status: PresenceStatus) {
    await prisma.user.update({
      where: { id: userId },
      data: { presence: status, presenceUpdatedAt: new Date(), lastSeenAt: new Date() },
    });
    return { status };
  }

  async heartbeat(userId: string, status?: PresenceStatus) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSeenAt: new Date(),
        ...(status ? { presence: status, presenceUpdatedAt: new Date() } : {}),
      },
    });
    return { ok: true };
  }

  static effectivePresence(input: {
    presence: string;
    lastSeenAt: Date | null;
  }): "ONLINE" | "AWAY" | "STUDYING" | "DND" | "OFFLINE" {
    if (input.presence === "INVISIBLE") return "OFFLINE";
    if (!input.lastSeenAt || Date.now() - input.lastSeenAt.getTime() > OFFLINE_AFTER_MS) {
      return "OFFLINE";
    }
    if ((PRESENCE_STATUSES as readonly string[]).includes(input.presence)) {
      return input.presence as "ONLINE" | "AWAY" | "STUDYING" | "DND";
    }
    return "ONLINE";
  }
}
