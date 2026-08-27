import { prisma } from '../config/prisma';
import { randomBytes } from 'crypto';

const SESSION_DURATION_DAYS = 7;
const SESSION_TOKEN_BYTES = 32;

export interface SessionData {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  user: {
    id: string;
    fullName: string;
    email: string;
    username: string | null;
    banned: boolean | null;
    avatarUrl: string | null;
    roles: { role: { name: string } }[];
  };
}

export async function createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<SessionData> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
        },
      },
    },
  });

  return session as SessionData;
}

export async function validateSession(token: string): Promise<SessionData | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (new Date() > session.expiresAt) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session as SessionData;
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function deleteSessionsByUserId(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export function parseSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === '__Secure-hexavante.session_token') {
      return rest.join('=');
    }
  }
  return null;
}
