import { auth } from '../../../config/auth';
import { prisma } from '../../../config/prisma';
import { RegisterInput } from '../schemas/auth.schemas';
import { BadRequestError, ConflictError } from '../../../lib/errors/AppError';
import { hashPassword, verifyPassword } from '@better-auth/utils/password';
import { fromNodeHeaders } from 'better-auth/node';

const MIN_AGE = 13;

function assertMinimumAge(birthDate: Date): void {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < MIN_AGE) {
    throw new BadRequestError('É necessário ter no mínimo 13 anos para se cadastrar.');
  }
}

export class AuthService {
  async signIn(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!user || !user.passwordHash) return null;

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) return null;

    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      username: user.username,
      roles: user.roles.map((r) => r.role.name),
    };
  }

  async signUp(data: RegisterInput) {
    assertMinimumAge(data.birthDate);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existing) {
      throw new ConflictError('Este e-mail ou nome de usuário já está em uso.');
    }

    const passwordHash = await hashPassword(data.password);
    const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });

    const created = await prisma.user.create({
      data: {
        username: data.username,
        fullName: data.fullName,
        email: data.email,
        passwordHash,
        birthDate: data.birthDate.toISOString().split('T')[0],
        ...(userRole && {
          roles: {
            create: { roleId: userRole.id },
          },
        }),
        xp: { create: {} },
        wallet: { create: {} },
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
      },
    });

    return created;
  }

  async signOut(headers: Record<string, string | string[] | undefined>) {
    await auth.api.signOut({ headers: fromNodeHeaders(headers) });
  }

  async getSession(headers: Record<string, string | string[] | undefined>) {
    return auth.api.getSession({ headers: fromNodeHeaders(headers) });
  }

  async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
      },
    });
  }

  async getUserBasicInfo(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
  }
}
