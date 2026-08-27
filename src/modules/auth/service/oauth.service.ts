import { prisma } from '../../../config/prisma';
import { generateUsername } from '../../../config/oauth';

export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface OAuthUser {
  id: string;
  fullName: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  roles: string[];
}

export async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<OAuthUser> {
  // 1. Procura account existente pelo provider+providerId
  const existingAccount = await prisma.account.findUnique({
    where: {
      providerId_accountId: {
        providerId: profile.provider,
        accountId: profile.providerId,
      },
    },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
        },
      },
    },
  });

  if (existingAccount) {
    return formatUser(existingAccount.user);
  }

  // 2. Procura user existente pelo email
  let user = await prisma.user.findUnique({
    where: { email: profile.email },
    include: {
      roles: { include: { role: true } },
    },
  });

  if (user) {
    // Vincula a account ao user existente
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: profile.provider,
        accountId: profile.providerId,
      },
    });

    // Atualiza avatar se não tinha
    if (profile.avatarUrl && !user.avatarUrl) {
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: profile.avatarUrl },
      });
      user.avatarUrl = profile.avatarUrl;
    }

    return formatUser(user);
  }

  // 3. Cria user novo + account
  const username = generateUsername(profile.name, profile.email);
  const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });

  user = await prisma.user.create({
    data: {
      email: profile.email,
      fullName: profile.name || username,
      username,
      emailVerified: true,
      avatarUrl: profile.avatarUrl,
      provider: profile.provider,
      providerId: profile.providerId,
      birthDate: '2000-01-01',
      xp: { create: {} },
      wallet: { create: {} },
      ...(userRole && { roles: { create: { roleId: userRole.id } } }),
    },
    include: {
      roles: { include: { role: true } },
    },
  });

  // Cria a account
  await prisma.account.create({
    data: {
      userId: user.id,
      providerId: profile.provider,
      accountId: profile.providerId,
    },
  });

  return formatUser(user);
}

function formatUser(user: any): OAuthUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    roles: user.roles.map((r: any) => r.role.name),
  };
}
