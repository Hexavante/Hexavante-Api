import { prisma } from '../../../config/prisma';

export class AuthRepository {
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });
  }

  async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });
  }

  async createUser(data: any) {
    return prisma.user.create({
      data,
      include: {
        roles: {
          include: { role: true },
        },
      },
    });
  }

  async updateUserLastLogin(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }
}
