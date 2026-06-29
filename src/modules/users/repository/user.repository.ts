import { prisma } from "../../../config/prisma";
import type { UpdateProfileInput } from "../schemas/user.schemas";
import type { UserProfile } from "../types/user.types";

export interface IUserRepository {
  findById(id: string): Promise<UserProfile | null>;
  findByUsername(username: string): Promise<{ id: string } | null>;
  update(id: string, data: UpdateProfileInput): Promise<UserProfile>;
  softDelete(id: string): Promise<void>;
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
      birthDate: user.birthDate,
      phone: user.phone,
      city: user.city,
      state: user.state,
      bio: user.bio,
      profileVisibility: user.profileVisibility,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
      coins: user.coins,
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

  async update(id: string, data: UpdateProfileInput): Promise<UserProfile> {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.username && { username: data.username }),
        ...(data.birthDate && { birthDate: data.birthDate }),
      },
    });

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      birthDate: user.birthDate,
      phone: user.phone,
      city: user.city,
      state: user.state,
      bio: user.bio,
      profileVisibility: user.profileVisibility,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
      coins: user.coins,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
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
