import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "../service/auth.service";
import { prisma } from "../../../config/prisma";
import { auth } from "../../../config/auth";
import { BadRequestError, ConflictError } from "../../../lib/errors/AppError";

// Mock dependencies
vi.mock("../../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../../config/auth", () => ({
  auth: {
    api: {
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@better-auth/utils/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  verifyPassword: vi.fn(),
}));

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: vi.fn().mockReturnValue({}),
}));

describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService();
  });

  describe("signIn", () => {
    it("should return user data when credentials are valid", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        fullName: "Test User",
        username: "testuser",
        passwordHash: "hashed-password",
        roles: [{ role: { name: "user" } }],
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      const { verifyPassword } = await import("@better-auth/utils/password");
      vi.mocked(verifyPassword).mockResolvedValue(true as any);

      const result = await authService.signIn(
        "test@example.com",
        "password123"
      );

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        include: { roles: { include: { role: true } } },
      });
      expect(result).toEqual({
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        username: "testuser",
        roles: ["user"],
      });
    });

    it("should return null when user does not exist", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await authService.signIn(
        "nonexistent@example.com",
        "password123"
      );

      expect(result).toBeNull();
    });

    it("should return null when password is incorrect", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        passwordHash: "hashed-password",
        roles: [],
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      const { verifyPassword } = await import("@better-auth/utils/password");
      vi.mocked(verifyPassword).mockResolvedValue(false as any);

      const result = await authService.signIn(
        "test@example.com",
        "wrongpassword"
      );

      expect(result).toBeNull();
    });

    it("should return null when user has no password hash", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        passwordHash: null,
        roles: [],
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await authService.signIn(
        "test@example.com",
        "password123"
      );

      expect(result).toBeNull();
    });
  });

  describe("signUp", () => {
    it("should create a new user successfully", async () => {
      const userData = {
        email: "new@example.com",
        username: "newuser",
        password: "password123",
        fullName: "New User",
        birthDate: new Date("2000-01-01"),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.role.findUnique).mockResolvedValue({ id: "role-1" } as any);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "user-1",
        ...userData,
      } as any);

      const result = await authService.signUp(userData);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ email: userData.email }, { username: userData.username }],
        },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should throw ConflictError when email already exists", async () => {
      const userData = {
        email: "existing@example.com",
        username: "newuser",
        password: "password123",
        fullName: "New User",
        birthDate: new Date("2000-01-01"),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "existing-user",
        email: "existing@example.com",
      } as any);

      await expect(authService.signUp(userData)).rejects.toThrow(ConflictError);
    });

    it("should throw ConflictError when username already exists", async () => {
      const userData = {
        email: "new@example.com",
        username: "existinguser",
        password: "password123",
        fullName: "New User",
        birthDate: new Date("2000-01-01"),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "existing-user",
        email: "other@example.com",
        username: "existinguser",
      } as any);

      await expect(authService.signUp(userData)).rejects.toThrow(ConflictError);
    });

    it("should throw BadRequestError when user is under 13 years old", async () => {
      const userData = {
        email: "young@example.com",
        username: "younguser",
        password: "password123",
        fullName: "Young User",
        birthDate: new Date(
          Date.now() - 10 * 365 * 24 * 60 * 60 * 1000
        ), // 10 years ago
      };

      await expect(authService.signUp(userData)).rejects.toThrow(
        BadRequestError
      );
    });

    it("should allow users who are exactly 13 years old", async () => {
      // Create a date that is exactly 13 years ago
      const today = new Date();
      const birthDate = new Date(
        today.getFullYear() - 13,
        today.getMonth(),
        today.getDate()
      );

      const userData = {
        email: "teen@example.com",
        username: "teenuser",
        password: "password123",
        fullName: "Teen User",
        birthDate,
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.role.findUnique).mockResolvedValue({ id: "role-1" } as any);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "user-1",
        ...userData,
      } as any);

      const result = await authService.signUp(userData);

      expect(result).toBeDefined();
    });
  });

  describe("signOut", () => {
    it("should call auth.api.signOut", async () => {
      const headers = { cookie: "session_token=test" };

      await authService.signOut(headers);

      expect(auth.api.signOut).toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    it("should return session data", async () => {
      const mockSession = {
        user: { id: "user-1", email: "test@example.com" },
        session: { id: "session-1" },
      };

      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any);

      const result = await authService.getSession({
        cookie: "session_token=test",
      });

      expect(result).toEqual(mockSession);
    });

    it("should return null when session is invalid", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const result = await authService.getSession({
        cookie: "session_token=invalid",
      });

      expect(result).toBeNull();
    });
  });

  describe("getUserById", () => {
    it("should return user by id", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        fullName: "Test User",
        roles: [{ role: { name: "user" } }],
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await authService.getUserById("user-1");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        include: { roles: { include: { role: true } } },
      });
      expect(result).toEqual(mockUser);
    });

    it("should return null when user does not exist", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await authService.getUserById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getUserBasicInfo", () => {
    it("should return basic user info", async () => {
      const mockUser = {
        id: "user-1",
        username: "testuser",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await authService.getUserBasicInfo("user-1");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        select: { id: true, username: true },
      });
      expect(result).toEqual(mockUser);
    });
  });
});
