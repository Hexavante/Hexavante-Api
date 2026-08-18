import { describe, it, expect, vi, beforeEach } from "vitest";
import { authorize } from "../authorize";
import { prisma } from "../../config/prisma";
import { ForbiddenError, UnauthorizedError } from "../../lib/errors/AppError";

// Mock dependencies
vi.mock("../../config/prisma", () => ({
  prisma: {
    userRole: {
      findMany: vi.fn(),
    },
  },
}));

describe("authorize middleware", () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
      },
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  it("should allow access when user has required role", async () => {
    const mockUserRoles = [
      {
        role: {
          name: "admin",
        },
      },
    ];

    vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

    const middleware = authorize(["admin"]);

    await middleware(mockRequest, mockReply);

    expect(prisma.userRole.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { role: { select: { name: true } } },
    });
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should allow access when user has one of multiple allowed roles", async () => {
    const mockUserRoles = [
      {
        role: {
          name: "moderator",
        },
      },
    ];

    vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

    const middleware = authorize(["admin", "moderator"]);

    await middleware(mockRequest, mockReply);

    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it("should throw ForbiddenError when user lacks required role", async () => {
    const mockUserRoles = [
      {
        role: {
          name: "user",
        },
      },
    ];

    vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

    const middleware = authorize(["admin"]);

    await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("should throw ForbiddenError when user has no roles", async () => {
    vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

    const middleware = authorize(["admin"]);

    await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("should throw UnauthorizedError when user is not authenticated", async () => {
    mockRequest.user = null;

    const middleware = authorize(["admin"]);

    await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
      UnauthorizedError
    );
  });

  it("should throw UnauthorizedError when user is undefined", async () => {
    mockRequest.user = undefined;

    const middleware = authorize(["admin"]);

    await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
      UnauthorizedError
    );
  });

  it("should handle database errors", async () => {
    vi.mocked(prisma.userRole.findMany).mockRejectedValue(
      new Error("Database error")
    );

    const middleware = authorize(["admin"]);

    await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
      "Database error"
    );
  });

  it("should work with empty allowed roles array", async () => {
    const mockUserRoles = [
      {
        role: {
          name: "user",
        },
      },
    ];

    vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

    const middleware = authorize([]);

    // Should throw ForbiddenError since no roles are allowed
    await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("should be case-sensitive with role names", async () => {
    const mockUserRoles = [
      {
        role: {
          name: "Admin",
        },
      },
    ];

    vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

    const middleware = authorize(["admin"]);

    await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
      ForbiddenError
    );
  });
});
