import { auth } from '../../../config/auth';
import { prisma } from '../../../config/prisma';
import { RegisterInput } from '../schemas/auth.schemas';

const MIN_AGE = 13;

function assertMinimumAge(birthDate: Date): void {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < MIN_AGE) {
    throw new Error('É necessário ter no mínimo 13 anos para se cadastrar.');
  }
}

export class AuthService {
  async signIn(email: string, password: string) {
    const { user } = await auth.api.signInEmail({
      body: { email, password },
    });

    if (!user) return null;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!dbUser) return null;

    return {
      id: dbUser.id,
      name: dbUser.fullName,
      email: dbUser.email,
      username: dbUser.username,
      roles: dbUser.roles.map((r) => r.role.name),
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
      if (existing.email === data.email) {
        throw new Error('Este e-mail já está em uso.');
      }
      throw new Error('Este nome de usuário já está em uso.');
    }

    const { user } = await auth.api.signUpEmail({
      body: {
        name: data.fullName,
        email: data.email,
        password: data.password,
      },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });

    const created = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: data.username,
        fullName: data.fullName,
        birthDate: data.birthDate,
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
    await auth.api.signOut({ headers: headers as any });
  }

  async getSession(headers: Record<string, string | string[] | undefined>) {
    return auth.api.getSession({ headers: headers as any });
  }

  async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });
  }
}
