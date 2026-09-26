import { describe, it, expect, vi, beforeEach } from "vitest";
import { optionalAuth } from "../optionalAuth";

vi.mock("../../lib/session", () => ({
  parseSessionToken: vi.fn(),
  validateSession: vi.fn(),
}));

import { parseSessionToken, validateSession } from "../../lib/session";

const COOKIE = "__Secure-hexavante.session_token=test-token";

describe("optionalAuth middleware", () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { headers: { cookie: COOKIE }, auth: null, user: null };
    mockReply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  });

  it("should attach user with valid session", async () => {
    vi.mocked(parseSessionToken).mockReturnValue("test-token");
    vi.mocked(validateSession).mockResolvedValue({
      user: { id: "user-1" },
      expiresAt: "2026-01-01",
    } as any);

    await optionalAuth(mockRequest, mockReply);

    expect(mockRequest.user).toEqual({ id: "user-1" });
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should continue silently without cookie", async () => {
    mockRequest.headers = {};
    vi.mocked(parseSessionToken).mockReturnValue(null);

    await optionalAuth(mockRequest, mockReply);

    expect(mockRequest.user).toBeNull();
    expect(mockReply.status).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it("should continue silently with invalid session", async () => {
    vi.mocked(parseSessionToken).mockReturnValue("bad-token");
    vi.mocked(validateSession).mockResolvedValue(null);

    await optionalAuth(mockRequest, mockReply);

    expect(mockRequest.user).toBeNull();
    expect(mockReply.status).not.toHaveBeenCalled();
  });
});
