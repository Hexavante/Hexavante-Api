import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthController } from "../controller/auth.controller";
import { AuthService } from "../service/auth.service";
import { UnauthorizedError } from "../../../lib/errors/AppError";

// Mock dependencies
vi.mock("../service/auth.service", () => ({
  AuthService: vi.fn().mockImplementation(() => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    getUserById: vi.fn(),
  })),
}));

vi.mock("../../../lib/validation/validate", () => ({
  validateBody: vi.fn().mockReturnValue(async () => {}),
}));

const SESSION_COOKIE = "__Secure-hexavante.session_token=test-token";

describe("AuthController", () => {
  let authController: AuthController;
  let mockAuthService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthService = {
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUserById: vi.fn(),
    };

    authController = new AuthController(mockAuthService);

    mockRequest = {
      body: {},
      headers: { cookie: SESSION_COOKIE, "user-agent": "vitest" },
      ip: "127.0.0.1",
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setCookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };
  });

  describe("login", () => {
    it("should return user and session when login is successful", async () => {
      mockRequest.body = { email: "test@example.com", password: "password123" };
      mockAuthService.signIn.mockResolvedValue({
        user: { id: "user-1", name: "Test User", email: "test@example.com" },
        session: { token: "tok-1", expiresAt: "2026-01-01" },
      });

      await authController.login(mockRequest, mockReply);

      expect(mockAuthService.signIn).toHaveBeenCalledWith(
        "test@example.com",
        "password123",
        "127.0.0.1",
        "vitest"
      );
      expect(mockReply.setCookie).toHaveBeenCalledWith(
        "__Secure-hexavante.session_token",
        "tok-1",
        expect.objectContaining({ httpOnly: true, path: "/" })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        user: { id: "user-1", name: "Test User", email: "test@example.com" },
        session: { token: "tok-1", expiresAt: "2026-01-01" },
      });
    });

    it("should return 202 when device verification is required", async () => {
      mockRequest.body = { email: "test@example.com", password: "password123" };
      mockAuthService.signIn.mockResolvedValue({
        requiresVerification: true,
        verificationId: "ver-1",
        reason: "DEVICE",
      });

      await authController.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith({
        requiresVerification: true,
        verificationId: "ver-1",
        reason: "DEVICE",
      });
    });

    it("should throw UnauthorizedError when credentials are invalid", async () => {
      mockRequest.body = { email: "test@example.com", password: "wrong" };
      mockAuthService.signIn.mockResolvedValue(null);

      await expect(authController.login(mockRequest, mockReply)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  describe("register", () => {
    it("should create a new user and return 201", async () => {
      mockRequest.body = {
        email: "new@example.com",
        username: "newuser",
        password: "password123",
        fullName: "New User",
        birthDate: "2000-01-01",
      };
      mockAuthService.signUp.mockResolvedValue({
        id: "user-1",
        username: "newuser",
        email: "new@example.com",
        fullName: "New User",
      });

      await authController.register(mockRequest, mockReply);

      expect(mockAuthService.signUp).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        user: {
          id: "user-1",
          name: "New User",
          email: "new@example.com",
          username: "newuser",
          roles: ["USER"],
        },
      });
    });
  });

  describe("logout", () => {
    it("should sign out and clear the cookie", async () => {
      await authController.logout(mockRequest, mockReply);

      expect(mockAuthService.signOut).toHaveBeenCalledWith("test-token");
      expect(mockReply.clearCookie).toHaveBeenCalledWith(
        "__Secure-hexavante.session_token",
        expect.objectContaining({ path: "/" })
      );
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });

    it("should succeed even without a session cookie", async () => {
      mockRequest.headers = {};

      await authController.logout(mockRequest, mockReply);

      expect(mockAuthService.signOut).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("session", () => {
    it("should return user and session when valid", async () => {
      mockAuthService.getSession.mockResolvedValue({
        user: { id: "user-1" },
        expiresAt: "2026-01-01",
      });
      mockAuthService.getUserById.mockResolvedValue({
        id: "user-1",
        fullName: "Test User",
        email: "test@example.com",
        username: "testuser",
        avatarUrl: null,
        roles: [{ role: { name: "USER" } }],
      });

      await authController.session(mockRequest, mockReply);

      expect(mockAuthService.getSession).toHaveBeenCalledWith("test-token");
      expect(mockReply.send).toHaveBeenCalledWith({
        user: {
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
          username: "testuser",
          avatarUrl: null,
          roles: ["USER"],
        },
        session: { expiresAt: "2026-01-01" },
      });
    });

    it("should throw UnauthorizedError without cookie", async () => {
      mockRequest.headers = {};

      await expect(authController.session(mockRequest, mockReply)).rejects.toThrow(
        UnauthorizedError
      );
    });

    it("should throw UnauthorizedError when session is invalid", async () => {
      mockAuthService.getSession.mockResolvedValue(null);

      await expect(authController.session(mockRequest, mockReply)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });
});
