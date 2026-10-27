import { createHash, randomInt, randomUUID } from "crypto";
import { isIP } from "node:net";
import { prisma } from "../../../config/prisma";
import { createSession } from "../../../lib/session";
import { hashPassword } from "../../../lib/password";
import { sendEmail, deviceCodeEmailHtml, emailVerifyHtml, twoFactorEmailHtml } from "../../../lib/email";
import { AppError, NotFoundError, BadRequestError } from "../../../lib/errors/AppError";
import { ShopService } from "../../shop/service/shop.service";

export const PRESENCE_STATUSES = ["ONLINE", "AWAY", "STUDYING", "DND", "INVISIBLE"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const OFFLINE_AFTER_MS = 5 * 60 * 1000;

/**
 * `TWO_FACTOR` habilita o 2FA nas configurações (exige sessão).
 * `TWO_FACTOR_LOGIN` é o desafio de 2FA durante o login (não cria sessão
 * sozinho além do próprio login e não pode ser usado para habilitar 2FA).
 * Separar os dois impede que um código de uma finalidade vaze para a outra.
 */
export type CodePurpose =
  | "DEVICE"
  | "TWO_FACTOR"
  | "TWO_FACTOR_LOGIN"
  | "EMAIL_VERIFY"
  | "PASSWORD_RESET";

export function fingerprintDevice(userAgent: string | undefined, ip: string | undefined): string {
  return createHash("sha256")
    .update(`${userAgent ?? "unknown"}|${ip ?? "unknown"}`)
    .digest("hex")
    .slice(0, 64);
}

/**
 * P1-5: IP usado em fingerprint/auditoria. Aceita o repasse do body
 * (`deviceIp`, enviado pelo web server-side que enxergaria só o IP interno
 * do container) SOMENTE se for um IP válido; qualquer outro valor cai para
 * o IP visto pelo servidor (`request.ip`, com `trustProxy`).
 *
 * Nunca é prova de identidade — só metadado para fingerprint/display.
 * A decisão de autenticação continua sendo o código por e-mail.
 */
export function resolveDeviceIp(
  forwardedIp: string | undefined,
  requestIp: string,
): string {
  return forwardedIp && isIP(forwardedIp) !== 0 ? forwardedIp : requestIp;
}

/**
 * P1-6: identidade de dispositivo opt-in via `deviceId` do cliente.
 *
 * O fingerprint legado `SHA256(userAgent + IP)` é instável (IP dinâmico,
 * UA genérico no SSR) e falsificável. Clientes que geram/persistem um id
 * aleatório (ex.: UUID no storage do app/navegador) podem enviá-lo em
 * `deviceId`: ele vira o fingerprint (`did:<id>`), estável e sem heurística
 * invasiva. Sem `deviceId`, cai para o fingerprint legado — 100% compatível
 * com registros existentes, sem migração e sem mudar o schema.
 *
 * O prefixo `did:` impede colisão com os 64 hex do legado. IP/UA seguem
 * gravados como metadado (display/auditoria), não como identidade.
 */
const DEVICE_ID_PREFIX = "did:";
const MAX_DEVICE_ID_LENGTH = 128;

export function resolveDeviceFingerprint(input: {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
}): string {
  const id = (input.deviceId ?? "").trim();
  if (id) return `${DEVICE_ID_PREFIX}${id.slice(0, MAX_DEVICE_ID_LENGTH)}`;
  return fingerprintDevice(input.userAgent, input.ip);
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
    purpose: CodePurpose;
    deviceName?: string;
  }  ): Promise<{ verificationId: string }> {
    // NOTA: códigos anteriores continuam válidos até expirar (10 min).
    // Invalidá-los a cada reenvio prendia o usuário num loop quando
    // o e-mail demorava ou ele digitava um código antigo.
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
    } else if (input.purpose === "EMAIL_VERIFY") {
      await mailCode(
        input.email,
        "Confirme seu e-mail — Hexavante",
        emailVerifyHtml(code),
        `Confirme seu e-mail na Hexavante com o código: ${code} (expira em 10 minutos)`,
        "email-verify",
      );
    } else if (input.purpose === "PASSWORD_RESET") {
      await mailCode(
        input.email,
        "Redefinir senha — Hexavante",
        emailVerifyHtml(code),
        `Use este código para redefinir sua senha na Hexavante: ${code} (expira em 10 minutos). Se não foi você, ignore este e-mail.`,
        "password-reset",
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
      purpose: record.purpose as CodePurpose,
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
      // Mensagem única (igual à de registro inexistente/expirado): evita
      // oráculo que distingue "código errado p/ ID real" de "ID inválido".
      throw new BadRequestError("Código inválido ou expirado.");
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
    deviceId?: string,
  ) {
    const { userId, fingerprint, purpose } = await this.consumeCode(verificationId, code);

    // Só códigos de login podem virar sessão. PASSWORD_RESET e o TWO_FACTOR
    // de configuração têm fluxos próprios e não autenticam ninguém aqui.
    if (purpose !== "DEVICE" && purpose !== "EMAIL_VERIFY" && purpose !== "TWO_FACTOR_LOGIN") {
      throw new BadRequestError("Verificação inválida.");
    }

    // O fingerprint gravado no login tem precedência (amarra login→verify);
    // sem ele, deviceId do cliente ou legado UA+IP.
    const fp = fingerprint ?? resolveDeviceFingerprint({ deviceId, userAgent, ip });

    if (purpose !== "TWO_FACTOR_LOGIN") {
      await this.trustDevice(userId, fp, userAgent, ip);
      // Confirmar o código prova a posse do e-mail
      await prisma.user.updateMany({
        where: { id: userId, emailVerified: false },
        data: { emailVerified: true },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundError("Usuário não encontrado.");

    // 2FA nunca é pulado: confirmar dispositivo/e-mail ainda não basta.
    // Emite o desafio e só cria a sessão depois do código de 2FA.
    if (user.twoFactorEnabled && purpose !== "TWO_FACTOR_LOGIN") {
      const { verificationId: nextId } = await this.issueCode({
        userId,
        email: user.email,
        fingerprint: fp,
        purpose: "TWO_FACTOR_LOGIN",
      });
      return {
        requiresVerification: true as const,
        verificationId: nextId,
        reason: "TWO_FACTOR" as const,
      };
    }

    await new ShopService().ensureActiveTheme(user.id);
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

  // ── Recuperação de senha ──────────────────────────────
  // Anti-enumeração: a resposta é SEMPRE `{ verificationId: <uuid> }`.
  // Com e-mail existente, cria o registro e envia o código; sem e-mail,
  // devolve um UUID aleatório sem criar registro nem enviar nada — por fora
  // é indistinguível, e o UUID falso é inutilizável no reset (consumeCode
  // responde o mesmo 400 genérico de "código inválido ou expirado").
  async requestPasswordReset(email: string): Promise<{ verificationId: string }> {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true },
    });
    if (!user) return { verificationId: randomUUID() };
    const { verificationId } = await this.issueCode({
      userId: user.id,
      email: user.email,
      purpose: "PASSWORD_RESET",
    });
    return { verificationId };
  }

  async resetPassword(verificationId: string, code: string, newPassword: string): Promise<void> {
    const { userId, purpose } = await this.consumeCode(verificationId, code);
    if (purpose !== "PASSWORD_RESET") {
      throw new BadRequestError("Código inválido para redefinição de senha.");
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    // Invalida sessões existentes por segurança
    await prisma.session.deleteMany({ where: { userId } });
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

  async confirmTwoFactor(verificationId: string, code: string, expectedUserId?: string) {
    // O verificationId vem do corpo: sem checar o dono, qualquer sessão
    // autenticada habilitaria 2FA na conta de outro usuário.
    const record = await prisma.deviceVerificationCode.findUnique({
      where: { id: verificationId },
      select: { userId: true },
    });
    if (!record || (expectedUserId && record.userId !== expectedUserId)) {
      throw new BadRequestError("Verificação inválida.");
    }
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
