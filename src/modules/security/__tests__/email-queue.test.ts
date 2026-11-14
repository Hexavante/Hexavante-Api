import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityService } from "../service/security.service";
import { prisma } from "../../../../packages/core/src/config/prisma";
import { sendEmail } from "../../../../packages/core/src/lib/email";
import { enqueueEmail } from "../../../../packages/core/src/lib/queue";
import { AppError } from "../../../lib/errors/AppError";

vi.mock("../../../../packages/core/src/config/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    deviceVerificationCode: { create: vi.fn() },
  },
}));

vi.mock("../../../../packages/core/src/lib/email", () => ({
  sendEmail: vi.fn(),
  deviceCodeEmailHtml: vi.fn().mockReturnValue("<html></html>"),
  emailVerifyHtml: vi.fn().mockReturnValue("<html></html>"),
  twoFactorEmailHtml: vi.fn().mockReturnValue("<html></html>"),
}));

vi.mock("../../../../packages/core/src/lib/queue", () => ({
  enqueueEmail: vi.fn(),
}));

const ORIGINAL_KEY = process.env.RESEND_API_KEY;

describe("envio de códigos por e-mail via fila", () => {
  const service = new SecurityService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "a@ex.com" } as never);
    vi.mocked(prisma.deviceVerificationCode.create).mockResolvedValue({ id: "ver-1" } as never);
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = ORIGINAL_KEY;
  });

  it("com Resend configurado e fila disponível: enfileira e não envia direto", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.mocked(enqueueEmail).mockResolvedValue(true);

    await expect(service.requestPasswordReset("a@ex.com")).resolves.toEqual({ verificationId: "ver-1" });

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@ex.com", label: expect.any(String) }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("fila indisponível: envia direto (comportamento antigo)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.mocked(enqueueEmail).mockResolvedValue(false);
    vi.mocked(sendEmail).mockResolvedValue({ sent: true });

    await service.requestPasswordReset("a@ex.com");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("fila indisponível e Resend falhando: mantém o 502", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.mocked(enqueueEmail).mockResolvedValue(false);
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, error: "500" });

    await expect(service.requestPasswordReset("a@ex.com")).rejects.toBeInstanceOf(AppError);
  });

  it("sem RESEND_API_KEY (dev): não usa fila, só registra", async () => {
    delete process.env.RESEND_API_KEY;
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, error: "sem chave" });

    await service.requestPasswordReset("a@ex.com");
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
