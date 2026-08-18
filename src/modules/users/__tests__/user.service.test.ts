import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserService } from "../service/user.service";
import { IUserRepository } from "../repository/user.repository";
import { NotFoundError, ConflictError } from "../../../lib/errors/AppError";

// Mock repository
const mockUserRepository: IUserRepository = {
  findById: vi.fn(),
  findByUsername: vi.fn(),
  findPublicProfile: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
};

describe("UserService", () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService(mockUserRepository);
  });

  describe("getProfile", () => {
    it("should return user profile when user exists", async () => {
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

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      const result = await userService.getProfile("user-1");

      expect(mockUserRepository.findById).toHaveBeenCalledWith("user-1");
      expect(result).toEqual(mockUser);
    });

    it("should throw NotFoundError when user does not exist", async () => {
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      await expect(userService.getProfile("nonexistent")).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("getPublicProfile", () => {
    it("should return public profile when user exists", async () => {
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

      vi.mocked(mockUserRepository.findPublicProfile).mockResolvedValue(
        mockPublicProfile
      );

      const result = await userService.getPublicProfile("testuser");

      expect(mockUserRepository.findPublicProfile).toHaveBeenCalledWith(
        "testuser"
      );
      expect(result).toEqual(mockPublicProfile);
    });

    it("should throw NotFoundError when user does not exist", async () => {
      vi.mocked(mockUserRepository.findPublicProfile).mockResolvedValue(null);

      await expect(
        userService.getPublicProfile("nonexistent")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateProfile", () => {
    it("should update user profile successfully", async () => {
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

      vi.mocked(mockUserRepository.update).mockResolvedValue(mockUpdatedUser);

      const result = await userService.updateProfile("user-1", updateData);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        "user-1",
        updateData
      );
      expect(result.fullName).toBe("Updated Name");
    });

    it("should update username when available", async () => {
      const updateData = {
        username: "newusername",
      };

      vi.mocked(mockUserRepository.findByUsername).mockResolvedValue(null);
      vi.mocked(mockUserRepository.update).mockResolvedValue({
        id: "user-1",
        username: "newusername",
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
      });

      const result = await userService.updateProfile("user-1", updateData);

      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(
        "newusername"
      );
      expect(result.username).toBe("newusername");
    });

    it("should throw ConflictError when username is already taken", async () => {
      const updateData = {
        username: "takenusername",
      };

      vi.mocked(mockUserRepository.findByUsername).mockResolvedValue({
        id: "other-user",
      });

      await expect(
        userService.updateProfile("user-1", updateData)
      ).rejects.toThrow(ConflictError);
    });

    it("should allow keeping same username", async () => {
      const updateData = {
        username: "testuser",
      };

      vi.mocked(mockUserRepository.findByUsername).mockResolvedValue({
        id: "user-1",
      });
      vi.mocked(mockUserRepository.update).mockResolvedValue({
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
      });

      const result = await userService.updateProfile("user-1", updateData);

      expect(result.username).toBe("testuser");
    });

    it("should update birthDate correctly", async () => {
      const updateData = {
        birthDate: new Date("1995-05-15"),
      };

      vi.mocked(mockUserRepository.update).mockResolvedValue({
        id: "user-1",
        username: "testuser",
        fullName: "Test User",
        email: "test@example.com",
        avatarUrl: null,
        birthDate: "1995-05-15",
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
      });

      const result = await userService.updateProfile("user-1", updateData);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        "user-1",
        updateData
      );
    });
  });

  describe("softDelete", () => {
    it("should soft delete user successfully", async () => {
      vi.mocked(mockUserRepository.findById).mockResolvedValue({
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
      });
      vi.mocked(mockUserRepository.softDelete).mockResolvedValue(undefined);

      await userService.softDelete("user-1");

      expect(mockUserRepository.findById).toHaveBeenCalledWith("user-1");
      expect(mockUserRepository.softDelete).toHaveBeenCalledWith("user-1");
    });

    it("should throw NotFoundError when user does not exist", async () => {
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      await expect(userService.softDelete("nonexistent")).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
