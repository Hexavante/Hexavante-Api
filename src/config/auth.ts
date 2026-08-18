import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';
import { prisma } from './prisma';
import { getRedisClient } from './redis';

const redis = getRedisClient();
const isProduction = process.env.NODE_ENV === 'production';

// Security: Validate required secrets in production
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

function generateUsername(name?: string): string {
  const base = (name || 'user')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20) || 'user';
  return `${base}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    cookiePrefix: 'hexavante',
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
    ...(isProduction ? ['https://hexavante.com.br', 'https://www.hexavante.com.br'] : []),
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      mapProfile: async (user: { name?: string; given_name?: string; family_name?: string; picture?: string; email_verified?: boolean }) => {
        const name = user.name || '';
        const fullName = [user.given_name, user.family_name].filter(Boolean).join(' ').trim() || name;
        return {
          fullName,
          username: generateUsername(name),
          image: user.picture,
          emailVerified: user.email_verified ?? false,
        };
      },
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      mapProfile: async (user: { name?: string; login?: string; avatar_url?: string }) => {
        const name = user.name || user.login || '';
        return {
          fullName: name,
          username: generateUsername(name),
          image: user.avatar_url,
          emailVerified: true,
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
