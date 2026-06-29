import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'change-this-secret-in-production'
);

export interface JWTPayload {
  sub: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export async function signJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT({ roles: payload.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET_KEY);
}

export async function verifyJWT(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return {
      sub: payload.sub as string,
      roles: (payload.roles as string[]) || [],
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}
