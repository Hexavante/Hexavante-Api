import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';
import { prisma } from './prisma';
import { getRedisClient } from './redis';

const redis = getRedisClient();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.AUTH_SECRET) {
    throw new Error('CRITICAL: AUTH_SECRET is required in production');
  }
  if (process.env.AUTH_SECRET.length < 32) {
    throw new Error('CRITICAL: AUTH_SECRET must be at least 32 characters');
  }
}

const adminUserIds = process.env.ADMIN_USER_IDS
  ? process.env.ADMIN_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean)
  : [];

function generateUsername(name: string, email: string): string {
  const base = (name || email.split('@')[0])
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
  return base || 'user' + Date.now().toString(36);
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.AUTH_URL || 'http://localhost:3045',
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  user: {
    fields: {
      name: 'fullName',
      image: 'avatarUrl',
    },
    additionalFields: {
      username: {
        type: 'string',
        required: false,
        input: true,
      },
      birthDate: {
        type: 'string',
        required: false,
        input: true,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const created = user as { id: string };
          const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });
          await prisma.user.update({
            where: { id: created.id },
            data: {
              xp: { create: {} },
              wallet: { create: {} },
              ...(userRole && { roles: { create: { roleId: userRole.id } } }),
            },
          });
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  advanced: {
    cookiePrefix: 'hexavante',
    ipAddress: {
      ipAddressHeaders: ['X-Forwarded-For'],
      trustedProxies: ['127.0.0.1', '::1'],
    },
    ...(isProduction
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: '.hexavante.com.br',
          },
        }
      : {}),
  },
  secret: process.env.AUTH_SECRET!,
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || process.env.AUTH_URL || 'http://localhost:3045',
    'http://localhost:3000',
    'http://localhost:3045',
    ...(isProduction ? ['https://hexavante.com.br', 'https://www.hexavante.com.br', 'https://app.hexavante.com.br'] : []),
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      mapProfile: (profile: any) => {
        const name = profile.name || profile.login || '';
        const email = profile.email || '';
        return {
          name,
          image: profile.picture || profile.avatar_url || null,
          username: generateUsername(name, email),
          birthDate: '2000-01-01',
        };
      },
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      mapProfile: (profile: any) => {
        const name = profile.name || profile.login || '';
        const email = profile.email || '';
        return {
          name,
          image: profile.avatar_url || profile.picture || null,
          username: generateUsername(name, email),
          birthDate: '2000-01-01',
        };
      },
    },
  },
  plugins: [
    admin({
      adminUserIds,
      defaultRole: 'user',
    }),
  ],
  redis: {
    client: redis,
  },
});
