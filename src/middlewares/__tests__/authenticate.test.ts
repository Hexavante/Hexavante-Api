import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticate } from "../authenticate";

vi.mock("../../config/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("../../lib/session", () => ({
  parseSessionToken: vi.fn(),
  validateSession: vi.fn(),
}));

import { prisma } from "../../config/prisma";
import { parseSessionToken, validateSession } from "../../lib/session";

const COOKIE = "__Secure-hexavante.session_token=test-token";

describe("authenticate middleware", () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { headers: { cookie: COOKIE }, auth: null, user: null };
    mockReply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  });

  it("should authenticate user with valid session", async () => {
    vi.mocked(parseSessionToken).mockReturnValue("test-token");
    vi.mocked(validateSession).mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
      expiresAt: "2026-01-01",
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ banned: false } as any);

    await authenticate(mockRequest, mockReply);

    expect(mockRequest.user).toEqual({ id: "user-1", email: "test@example.com" });
    expect(mockRequest.auth.session).toEqual({ userId: "user-1", expiresAt: "2026-01-01" });
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should return 401 without cookie", async () => {
    mockRequest.headers = {};
    vi.mocked(parseSessionToken).mockReturnValue(null);

    await authenticate(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ success: false, error: "Unauthorized" });
  });

  it("should return 401 with invalid session", async () => {
    vi.mocked(parseSessionToken).mockReturnValue("bad-token");
    vi.mocked(validateSession).mockResolvedValue(null);

    await authenticate(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
  });

  it("should return 403 for banned users", async () => {
    vi.mocked(parseSessionToken).mockReturnValue("test-token");
    vi.mocked(validateSession).mockResolvedValue({
      user: { id: "user-1" },
      expiresAt: "2026-01-01",
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ banned: true } as any);

    await authenticate(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({ success: false, error: "Conta banida" });
  });
});
