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
        required: true,
        input: true,
      },
      birthDate: {
        type: 'string',
        required: true,
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
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
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
