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

export async function createSession(userId: string, ipAddress?: string, userAgent?: string, options?: { impersonatedBy: string; db: Pick<typeof prisma, "session"> }): Promise<SessionData> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const session = await (options?.db ?? prisma).session.create({
    data: {
      token,
      ...(options && { impersonatedBy: options.impersonatedBy }),
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

/**
 * Lê o token de `Authorization: Bearer <token>`.
 *
 * Forma de autenticação usada pelos clientes não-browser (Desktop e Mobile),
 * que não devem depender do armazenamento de cookies de outra origin. O token
 * passa pela MESMA validação do cookie
 * (`validateSession` → sessão no banco, com expiração): nada de confiar no
 * header por si só.
 */
export function parseBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}

/**
 * Extrai a credencial de sessão de uma requisição.
 *
 * Ordem: `Authorization: Bearer` antes do cookie. O header não é enviável
 * por cross-site request forgering (o navegador exige preflight e o site
 * atacante não tem o token), então quando os dois chegam o header é a
 * intenção explícita do cliente e tem precedência. Clientes browser
 * (Web/Landing/Admin) continuam usando só o cookie — contrato inalterado.
 */
export function extractSessionToken(
  headers: { authorization?: string | null; cookie?: string | null },
): string | null {
  return parseBearerToken(headers.authorization ?? null) ?? parseSessionToken(headers.cookie ?? null);
}
