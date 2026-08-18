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
    getUserBasicInfo: vi.fn(),
  })),
}));

vi.mock("../../../lib/validation/validate", () => ({
  validateBody: vi.fn().mockReturnValue(async () => {}),
}));

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
      getUserBasicInfo: vi.fn(),
    };

    authController = new AuthController(mockAuthService);

    mockRequest = {
      body: {},
      headers: {
        cookie: "hexavante.session_token=test-token",
      },
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe("login", () => {
    it("should return user data when login is successful", async () => {
      const mockUser = {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        username: "testuser",
        roles: ["user"],
      };

      mockRequest.body = {
        email: "test@example.com",
        password: "password123",
      };

      mockAuthService.signIn.mockResolvedValue(mockUser);

      await authController.login(mockRequest, mockReply);

      expect(mockAuthService.signIn).toHaveBeenCalledWith(
        "test@example.com",
        "password123"
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockUser,
      });
    });

    it("should throw UnauthorizedError when credentials are invalid", async () => {
      mockRequest.body = {
        email: "test@example.com",
        password: "wrongpassword",
      };

      mockAuthService.signIn.mockResolvedValue(null);

      await expect(
        authController.login(mockRequest, mockReply)
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("register", () => {
    it("should create a new user and return user data", async () => {
      const mockUser = {
        id: "user-1",
        fullName: "New User",
        email: "new@example.com",
        username: "newuser",
      };

      mockRequest.body = {
        email: "new@example.com",
        username: "newuser",
        password: "password123",
        fullName: "New User",
        birthDate: "2000-01-01",
      };

      mockAuthService.signUp.mockResolvedValue(mockUser);

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
    it("should call signOut and return success", async () => {
      await authController.logout(mockRequest, mockReply);

      expect(mockAuthService.signOut).toHaveBeenCalledWith(mockRequest.headers);
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("session", () => {
    it("should return session data when session is valid", async () => {
      const mockSession = {
        user: { id: "user-1" },
        session: { id: "session-1" },
      };

      const mockUser = {
        id: "user-1",
        fullName: "Test User",
        email: "test@example.com",
        username: "testuser",
        roles: [{ role: { name: "user" } }],
      };

      mockAuthService.getSession.mockResolvedValue(mockSession);
      mockAuthService.getUserById.mockResolvedValue(mockUser);

      await authController.session(mockRequest, mockReply);

      expect(mockAuthService.getSession).toHaveBeenCalled();
      expect(mockAuthService.getUserById).toHaveBeenCalledWith("user-1");
      expect(mockReply.send).toHaveBeenCalledWith({
        user: {
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
          username: "testuser",
          roles: ["user"],
        },
        session: {
          impersonatedBy: null,
          impersonator: null,
        },
      });
    });

    it("should throw UnauthorizedError when session is invalid", async () => {
      mockAuthService.getSession.mockResolvedValue(null);

      await expect(
        authController.session(mockRequest, mockReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it("should throw UnauthorizedError when user is not found", async () => {
      const mockSession = {
        user: { id: "user-1" },
        session: { id: "session-1" },
      };

      mockAuthService.getSession.mockResolvedValue(mockSession);
      mockAuthService.getUserById.mockResolvedValue(null);

      await expect(
        authController.session(mockRequest, mockReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it("should return impersonator data when session is impersonated", async () => {
      const mockSession = {
        user: { id: "user-1" },
        session: { id: "session-1", impersonatedBy: "admin-1" },
      };

      const mockUser = {
        id: "user-1",
        fullName: "Test User",
        email: "test@example.com",
        username: "testuser",
        roles: [{ role: { name: "user" } }],
      };

      const mockImpersonator = {
        id: "admin-1",
        username: "admin",
      };

      mockAuthService.getSession.mockResolvedValue(mockSession);
      mockAuthService.getUserById.mockResolvedValue(mockUser);
      mockAuthService.getUserBasicInfo.mockResolvedValue(mockImpersonator);

      await authController.session(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          session: {
            impersonatedBy: "admin-1",
            impersonator: {
              id: "admin-1",
              username: "admin",
            },
          },
        })
      );
    });
  });
});
