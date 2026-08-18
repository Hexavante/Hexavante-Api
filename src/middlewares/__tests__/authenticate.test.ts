import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticate } from "../authenticate";
import { auth } from "../../config/auth";

// Mock dependencies
vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe("authenticate middleware", () => {
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

  it("should authenticate user with valid session", async () => {
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

    await authenticate(mockRequest, mockReply);

    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: mockRequest.headers,
    });
    expect(mockRequest.auth).toEqual(mockSession);
    expect(mockRequest.user).toEqual(mockSession.user);
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should return 401 when session is null", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await authenticate(mockRequest, mockReply);

    expect(auth.api.getSession).toHaveBeenCalled();
    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: "Unauthorized",
    });
    expect(mockRequest.auth).toBeNull();
    expect(mockRequest.user).toBeNull();
  });

  it("should return 401 when session is undefined", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(undefined as any);

    await authenticate(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: "Unauthorized",
    });
  });

  it("should handle errors from getSession", async () => {
    vi.mocked(auth.api.getSession).mockRejectedValue(new Error("DB error"));

    await expect(
      authenticate(mockRequest, mockReply)
    ).rejects.toThrow("DB error");
  });

  it("should pass headers to getSession", async () => {
    const customHeaders = {
      authorization: "Bearer custom-token",
      "x-custom-header": "value",
    };

    mockRequest.headers = customHeaders;
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await authenticate(mockRequest, mockReply);

    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: customHeaders,
    });
  });
});
