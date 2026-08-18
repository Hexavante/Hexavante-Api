import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRepository } from "../repository/user.repository";
import { prisma } from "../../../config/prisma";

// Mock prisma
vi.mock("../../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("UserRepository", () => {
  let userRepository: UserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    userRepository = new UserRepository();
  });

  describe("findById", () => {
    it("should return user when found", async () => {
      const mockUser = {
        id: "user-1",
        username: "testuser",
        fullName: "Test User",
        email: "test@example.com",
        avatarUrl: null,
        birthDate: "2000-01-01",
        phone: null,
        city: null,
        state: null,
        bio: null,
        profileVisibility: "public",
        isVerified: false,
        isPremium: false,
        coins: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await userRepository.findById("user-1");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
      expect(result).toEqual(mockUser);
    });

    it("should return null when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await userRepository.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findByUsername", () => {
    it("should return user id when found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
      } as any);

      const result = await userRepository.findByUsername("testuser");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: "testuser" },
        select: { id: true },
      });
      expect(result).toEqual({ id: "user-1" });
    });

    it("should return null when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await userRepository.findByUsername("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findPublicProfile", () => {
    it("should return public profile when found", async () => {
      const mockPublicProfile = {
        id: "user-1",
        username: "testuser",
        fullName: "Test User",
        avatarUrl: null,
        bio: null,
        profileVisibility: "public",
        isVerified: false,
        isPremium: false,
        createdAt: new Date(),
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        mockPublicProfile as any
      );

      const result = await userRepository.findPublicProfile("testuser");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: "testuser" },
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
          bio: true,
          profileVisibility: true,
          isVerified: true,
          isPremium: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(mockPublicProfile);
    });

    it("should return null when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await userRepository.findPublicProfile("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("should update user profile", async () => {
      const updateData = {
        fullName: "Updated Name",
      };

      const mockUpdatedUser = {
        id: "user-1",
        username: "testuser",
        fullName: "Updated Name",
        email: "test@example.com",
        avatarUrl: null,
        birthDate: "2000-01-01",
        phone: null,
        city: null,
        state: null,
        bio: null,
        profileVisibility: "public",
        isVerified: false,
        isPremium: false,
        coins: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.update).mockResolvedValue(mockUpdatedUser as any);

      const result = await userRepository.update("user-1", updateData);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          fullName: "Updated Name",
        },
      });
      expect(result.fullName).toBe("Updated Name");
    });

    it("should update birthDate as string", async () => {
      const updateData = {
        birthDate: "1995-05-15",
      };

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: "user-1",
        birthDate: "1995-05-15",
      } as any);

      await userRepository.update("user-1", updateData);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          birthDate: "1995-05-15",
        },
      });
    });

    it("should update birthDate as Date object", async () => {
      const updateData = {
        birthDate: new Date("1995-05-15"),
      };

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: "user-1",
        birthDate: "1995-05-15",
      } as any);

      await userRepository.update("user-1", updateData);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          birthDate: "1995-05-15",
        },
      });
    });

    it("should only update provided fields", async () => {
      const updateData = {
        fullName: "Updated Name",
      };

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: "user-1",
        fullName: "Updated Name",
      } as any);

      await userRepository.update("user-1", updateData);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          fullName: "Updated Name",
        },
      });
    });
  });

  describe("softDelete", () => {
    it("should soft delete user by anonymizing data", async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({} as any);

      await userRepository.softDelete("user-1");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          username: "deleted_user-1",
          email: "deleted_user-1@deleted.hexavante.com",
          passwordHash: null,
          phone: null,
          city: null,
          state: null,
          bio: null,
          avatarUrl: null,
        },
      });
    });

    it("should handle multiple soft deletes", async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({} as any);

      await userRepository.softDelete("user-1");
      await userRepository.softDelete("user-2");

      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });
  });
});
