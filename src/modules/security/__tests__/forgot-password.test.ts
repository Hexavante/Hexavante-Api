import { describe, it, expect, vi, beforeEach } from "vitest";
import { SecurityService } from "../service/security.service";
import { prisma } from "../../../config/prisma";
import { BadRequestError } from "../../../lib/errors/AppError";

// Banco mockado (padrão do repo para testes de service).
vi.mock("../../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    deviceVerificationCode: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    trustedDevice: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// E-mail mockado: sem rede, sem RESEND_API_KEY.
vi.mock("../../../lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: true }),
  deviceCodeEmailHtml: vi.fn().mockReturnValue("<html></html>"),
  emailVerifyHtml: vi.fn().mockReturnValue("<html></html>"),
  twoFactorEmailHtml: vi.fn().mockReturnValue("<html></html>"),
}));

vi.mock("../../../lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-new-password"),
  verifyPassword: vi.fn(),
}));

import { sendEmail } from "../../../lib/email";

/**
 * P1-3: forgot-password sem enumeração de e-mail.
 * Usuário existente e inexistente recebem resposta externa equivalente:
 * `{ verificationId: <uuid> }` — o UUID falso não cria registro, não envia
 * e-mail e falha no reset com a mesma mensagem genérica.
 */
describe("forgot-password anti-enumeração", () => {
  const service = new SecurityService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("e-mail existente: retorna UUID real, cria registro e envia e-mail", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "existe@example.com",
    } as any);
    vi.mocked(prisma.deviceVerificationCode.create).mockResolvedValue({
      id: "ver-real-1",
    } as any);

    const result = await service.requestPasswordReset("existe@example.com");

    expect(result).toEqual({ verificationId: "ver-real-1" });
    expect(prisma.deviceVerificationCode.create).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("e-mail inexistente: retorna UUID válido, SEM registro e SEM e-mail", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await service.requestPasswordReset("nao-existe@example.com");

    // Mesmo shape externo do caso existente: objeto com UUID string.
    expect(Object.keys(result)).toEqual(["verificationId"]);
    expect(typeof result.verificationId).toBe("string");
    expect(result.verificationId.length).toBeGreaterThan(0);
    expect(prisma.deviceVerificationCode.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("UUID falso falha no reset com a mesma mensagem do código errado", async () => {
    // UUID falso: nenhum registro no banco.
    vi.mocked(prisma.deviceVerificationCode.findUnique).mockResolvedValue(null);

    const fakeAttempt = service.resetPassword("uuid-falso-qualquer", "123456", "NovaSenha123!");
    await expect(fakeAttempt).rejects.toThrow(BadRequestError);
    await expect(fakeAttempt).rejects.toThrow("Código inválido ou expirado.");

    // ID real + código errado: mesma mensagem (sem oráculo).
    vi.mocked(prisma.deviceVerificationCode.findUnique).mockResolvedValue({
      id: "ver-real-1",
      userId: "user-1",
      code: "654321",
      used: false,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      purpose: "PASSWORD_RESET",
    } as any);

    const wrongCodeAttempt = service.resetPassword("ver-real-1", "123456", "NovaSenha123!");
    await expect(wrongCodeAttempt).rejects.toThrow(BadRequestError);
    await expect(wrongCodeAttempt).rejects.toThrow("Código inválido ou expirado.");
  });
});
