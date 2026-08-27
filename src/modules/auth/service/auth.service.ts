import { prisma } from '../../../config/prisma';
import { RegisterInput } from '../schemas/auth.schemas';
import { BadRequestError, ConflictError } from '../../../lib/errors/AppError';
import { hashPassword, verifyPassword } from '../../../lib/password';
import { createSession, deleteSession, validateSession } from '../../../lib/session';

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
  async signIn(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!user || !user.passwordHash) return null;

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return null;

    const session = await createSession(user.id, ipAddress, userAgent);

    return {
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        roles: user.roles.map((r: { role: { name: string } }) => r.role.name),
      },
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
      },
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

  async signOut(token: string) {
    await deleteSession(token);
  }

  async getSession(token: string) {
    return validateSession(token);
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
