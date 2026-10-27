import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../packages/core/src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    trustedDevice: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    deviceVerificationCode: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../../../packages/core/src/lib/session", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessionsByUserId: vi.fn(),
  validateSession: vi.fn(),
  parseSessionToken: vi.fn(),
  extractSessionToken: vi.fn(),
}));

vi.mock("../../../../packages/core/src/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: true }),
  deviceCodeEmailHtml: vi.fn(() => "<html/>"),
  emailVerifyHtml: vi.fn(() => "<html/>"),
  twoFactorEmailHtml: vi.fn(() => "<html/>"),
}));

vi.mock("../../../../packages/core/src/modules/shop/service/shop.service", () => ({
  ShopService: class {
    ensureActiveTheme = vi.fn().mockResolvedValue(undefined);
  },
}));

import { SecurityService } from "../service/security.service";
import { prisma } from "../../../../packages/core/src/config/prisma";
import { createSession } from "../../../../packages/core/src/lib/session";
import { BadRequestError } from "../../../../packages/core/src/lib/errors/AppError";

const future = () => new Date(Date.now() + 10 * 60 * 1000);

function codeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "vid-1",
    userId: "user-1",
    fingerprint: "fp-1",
    purpose: "DEVICE",
    code: "123456",
    attempts: 0,
    used: false,
    expiresAt: future(),
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
    ...overrides,
  };
}

function userRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    fullName: "User",
    username: "user",
    avatarUrl: null,
    twoFactorEnabled: false,
    emailVerified: true,
    roles: [{ role: { name: "USER" } }],
    ...overrides,
  };
}

describe("2FA no login", () => {
  let security: SecurityService;

  beforeEach(() => {
    vi.clearAllMocks();
    security = new SecurityService();
  });

  it("código DEVICE com 2FA ativo NÃO cria sessão e pede o segundo fator", async () => {
    vi.mocked(prisma.deviceVerificationCode.findUnique).mockResolvedValue(
      codeRecord({ purpose: "DEVICE" }) as any,
    );
    vi.mocked(prisma.deviceVerificationCode.update).mockResolvedValue({} as any);
    vi.mocked(prisma.deviceVerificationCode.create).mockResolvedValue({ id: "vid-2" } as any);
    vi.mocked(prisma.trustedDevice.upsert).mockResolvedValue({} as any);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userRecord({ twoFactorEnabled: true }) as any,
    );

    const result = await security.finishDeviceVerification(
      "vid-1",
      "123456",
      "test-agent",
      "203.0.113.1",
    );

    expect(result).toMatchObject({
      requiresVerification: true,
      verificationId: "vid-2",
      reason: "TWO_FACTOR",
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(prisma.deviceVerificationCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        purpose: "TWO_FACTOR_LOGIN",
      }),
    });
  });

  it("código TWO_FACTOR_LOGIN conclui o login e cria sessão", async () => {
    vi.mocked(prisma.deviceVerificationCode.findUnique).mockResolvedValue(
      codeRecord({ purpose: "TWO_FACTOR_LOGIN" }) as any,
    );
    vi.mocked(prisma.deviceVerificationCode.update).mockResolvedValue({} as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userRecord({ twoFactorEnabled: true }) as any,
    );
    vi.mocked(createSession).mockResolvedValue({
      id: "session-1",
      token: "token-1",
      userId: "user-1",
      expiresAt: future(),
    } as any);

    const result = await security.finishDeviceVerification(
      "vid-1",
      "123456",
      "test-agent",
      "203.0.113.1",
    );

    expect(result).toMatchObject({
      user: { id: "user-1" },
      session: { token: "token-1" },
    });
    // Dispositivo já era confiável: não deve ser re-inserido nem re-marcado.
    expect(prisma.trustedDevice.upsert).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("código de configurar 2FA (TWO_FACTOR) não vira sessão", async () => {
    vi.mocked(prisma.deviceVerificationCode.findUnique).mockResolvedValue(
      codeRecord({ purpose: "TWO_FACTOR" }) as any,
    );

    await expect(
      security.finishDeviceVerification("vid-1", "123456"),
    ).rejects.toThrow(BadRequestError);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("código de reset de senha não vira sessão", async () => {
    vi.mocked(prisma.deviceVerificationCode.findUnique).mockResolvedValue(
      codeRecord({ purpose: "PASSWORD_RESET" }) as any,
    );

    await expect(
      security.finishDeviceVerification("vid-1", "123456"),
    ).rejects.toThrow(BadRequestError);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("confirmTwoFactor", () => {
  let security: SecurityService;

  beforeEach(() => {
    vi.clearAllMocks();
    security = new SecurityService();
  });

  it("recusa verificationId de outro usuário sem consumir o código", async () => {
    vi.mocked(prisma.deviceVerificationCode.findUnique).mockResolvedValue({
      userId: "user-2",
    } as any);

    await expect(
      security.confirmTwoFactor("vid-1", "123456", "user-1"),
    ).rejects.toThrow(BadRequestError);

    expect(prisma.deviceVerificationCode.update).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("habilita 2FA para o próprio usuário", async () => {
    vi.mocked(prisma.deviceVerificationCode.findUnique)
      .mockResolvedValueOnce({ userId: "user-1" } as any)
      .mockResolvedValueOnce(codeRecord({ purpose: "TWO_FACTOR" }) as any);
    vi.mocked(prisma.deviceVerificationCode.update).mockResolvedValue({} as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const result = await security.confirmTwoFactor("vid-1", "123456", "user-1");

    expect(result).toEqual({ enabled: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { twoFactorEnabled: true },
    });
  });
});
