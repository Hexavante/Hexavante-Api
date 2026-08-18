import { describe, it, expect, vi, beforeEach } from "vitest";
import { optionalAuth } from "../optionalAuth";
import { auth } from "../../config/auth";

// Mock dependencies
vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe("optionalAuth middleware", () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      headers: {
        cookie: "hexavante.session_token=test-token",
      },
      auth: null,
      user: null,
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  it("should set auth and user when session exists", async () => {
    const mockSession = {
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
      },
      session: {
        id: "session-1",
        token: "test-token",
      },
    };

    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any);

    await optionalAuth(mockRequest, mockReply);

    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: mockRequest.headers,
    });
    expect(mockRequest.auth).toEqual(mockSession);
    expect(mockRequest.user).toEqual(mockSession.user);
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should not set auth when session is null", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await optionalAuth(mockRequest, mockReply);

    expect(mockRequest.auth).toBeNull();
    expect(mockRequest.user).toBeNull();
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should not set auth when session is undefined", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(undefined as any);

    await optionalAuth(mockRequest, mockReply);

    expect(mockRequest.auth).toBeNull();
    expect(mockRequest.user).toBeNull();
  });

  it("should continue without blocking when getSession throws", async () => {
    vi.mocked(auth.api.getSession).mockRejectedValue(new Error("DB error"));

    // Should not throw
    await expect(
      optionalAuth(mockRequest, mockReply)
    ).resolves.toBeUndefined();

    expect(mockRequest.auth).toBeNull();
    expect(mockRequest.user).toBeNull();
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should continue without blocking when session is expired", async () => {
    vi.mocked(auth.api.getSession).mockRejectedValue(
      new Error("Session expired")
    );

    await expect(
      optionalAuth(mockRequest, mockReply)
    ).resolves.toBeUndefined();

    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should pass headers to getSession", async () => {
    const customHeaders = {
      authorization: "Bearer custom-token",
      "x-custom-header": "value",
    };

    mockRequest.headers = customHeaders;
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await optionalAuth(mockRequest, mockReply);

    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: customHeaders,
    });
  });

  it("should handle empty headers", async () => {
    mockRequest.headers = {};
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await optionalAuth(mockRequest, mockReply);

    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: {},
    });
  });

  it("should not modify reply when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await optionalAuth(mockRequest, mockReply);

    expect(mockReply.status).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });
});
