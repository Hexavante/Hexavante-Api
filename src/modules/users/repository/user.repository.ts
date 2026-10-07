import { prisma } from "../../../config/prisma";
import type { UpdateProfileInput } from "../schemas/user.schemas";
import type { UserProfile, PublicProfile } from "../types/user.types";

export interface IUserRepository {
  findById(id: string): Promise<UserProfile | null>;
  findByUsername(username: string): Promise<{ id: string } | null>;
  findPublicProfile(username: string): Promise<PublicProfile | null>;
  update(id: string, data: UpdateProfileInput): Promise<UserProfile>;
  softDelete(id: string): Promise<void>;
  findMediaUrls(id: string): Promise<{ avatarUrl: string | null; bannerUrl: string | null }>;
  updateAvatarUrl(id: string, avatarUrl: string): Promise<{ avatarUrl: string | null }>;
  updateBannerUrl(id: string, bannerUrl: string): Promise<{ bannerUrl: string | null }>;
}

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      birthDate: user.birthDate,
      phone: user.phone,
      city: user.city,
      state: user.state,
      bio: user.bio,
      profileVisibility: user.profileVisibility,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
      coins: user.coins,
      twoFactorEnabled: user.twoFactorEnabled,
      presence: user.presence,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findByUsername(username: string): Promise<{ id: string } | null> {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    return user;
  }

  async findPublicProfile(username: string): Promise<PublicProfile | null> {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        profileVisibility: true,
        isVerified: true,
        isPremium: true,
        presence: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    if (!user) return null;

    const { SecurityService } = await import("../../security/service/security.service");
    const presence = SecurityService.effectivePresence({
      presence: user.presence,
      lastSeenAt: user.lastSeenAt,
    });

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      profileVisibility: user.profileVisibility,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
      presence,
      createdAt: user.createdAt,
    };
  }

  async update(id: string, data: UpdateProfileInput): Promise<UserProfile> {
    const birthDateStr = data.birthDate
      ? data.birthDate instanceof Date
        ? data.birthDate.toISOString().split("T")[0]
        : String(data.birthDate)
      : undefined;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.username && { username: data.username }),
        ...(birthDateStr && { birthDate: birthDateStr }),
      },
    });

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      birthDate: user.birthDate,
      phone: user.phone,
      city: user.city,
      state: user.state,
      bio: user.bio,
      profileVisibility: user.profileVisibility,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
      coins: user.coins,
      twoFactorEnabled: user.twoFactorEnabled,
      presence: user.presence,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /** URLs atuais de mídia (para apagar a anterior após troca bem-sucedida). */
  async findMediaUrls(id: string): Promise<{ avatarUrl: string | null; bannerUrl: string | null }> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { avatarUrl: true, bannerUrl: true },
    });
    return { avatarUrl: user?.avatarUrl ?? null, bannerUrl: user?.bannerUrl ?? null };
  }

  /** Persiste o avatar (URL absoluta gerada pelo servidor). */
  async updateAvatarUrl(id: string, avatarUrl: string): Promise<{ avatarUrl: string | null }> {
    const user = await prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: { avatarUrl: true },
    });
    return { avatarUrl: user.avatarUrl };
  }

  /** Persiste o banner (URL absoluta gerada pelo servidor). */
  async updateBannerUrl(id: string, bannerUrl: string): Promise<{ bannerUrl: string | null }> {
    const user = await prisma.user.update({
      where: { id },
      data: { bannerUrl },
      select: { bannerUrl: true },
    });
    return { bannerUrl: user.bannerUrl };
  }

  async softDelete(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        username: `deleted_${id}`,
        email: `deleted_${id}@deleted.hexavante.com`,
        passwordHash: null,
        phone: null,
        city: null,
        state: null,
        bio: null,
        avatarUrl: null,
      },
    });
  }
}
