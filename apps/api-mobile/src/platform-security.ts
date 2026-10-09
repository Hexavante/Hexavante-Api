import type { FastifyInstance, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import { validateSession } from "./lib/session";

export const PLATFORM = "mobile" as const;
export const TOKEN_ISSUER = process.env.MOBILE_TOKEN_ISSUER || "https://mobile-api.hexavante.com.br";
export const TOKEN_AUDIENCE = process.env.MOBILE_TOKEN_AUDIENCE || "hexavante-mobile";
const REQUIRED_SCOPE = "mobile:api";
const PUBLIC_PATHS = new Set(["/", "/health"]);
const TOKEN_RESPONSE_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/verify-device",
  "/oauth/exchange",
]);

function secret(): Uint8Array {
  const value = process.env.MOBILE_TOKEN_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-mobile-token-secret-change-me");
  if (value.length < 32) throw new Error("MOBILE_TOKEN_SECRET deve ter ao menos 32 caracteres");
  return new TextEncoder().encode(value);
}

export async function signPlatformClaims(sessionToken: string, userId: string, expiresAt: Date): Promise<string> {
  const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return new SignJWT({ sid: sessionToken, scope: [REQUIRED_SCOPE], platform: PLATFORM })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(secret());
}

export async function signPlatformToken(sessionToken: string): Promise<string> {
  const session = await validateSession(sessionToken);
  if (!session) throw new Error("Sessão inválida ao emitir token da plataforma");
  return signPlatformClaims(sessionToken, session.user.id, session.expiresAt);
}

export async function verifyPlatformToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret(), { issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE, algorithms: ["HS256"] });
  if (payload.platform !== PLATFORM || !Array.isArray(payload.scope) || !payload.scope.includes(REQUIRED_SCOPE) || typeof payload.sid !== "string") {
    throw new Error("Token sem escopo da plataforma");
  }
  return payload.sid;
}

function bearer(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  const match = typeof value === "string" ? /^Bearer[ \t]+(\S+)$/i.exec(value.trim()) : null;
  return match?.[1] ?? null;
}

function routePath(request: FastifyRequest): string {
  return request.routeOptions?.url || request.url.split("?")[0];
}

export function isPlatformClient(headers: Record<string, string | string[] | undefined>): boolean {
  const client = headers["x-hexavante-client"];
  const version = headers["x-hexavante-client-version"];
  return client === PLATFORM && typeof version === "string" && version.trim().length > 0 && version.length <= 64;
}

function headerExempt(request: FastifyRequest): boolean {
  const route = routePath(request);
  return request.method === "OPTIONS" || PUBLIC_PATHS.has(route) || route.startsWith("/docs") || (request.method === "GET" && route.startsWith("/oauth/"));
}

async function replaceSessionTokens(value: unknown): Promise<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = { ...record };
  if (typeof record.token === "string") output.token = await signPlatformToken(record.token);
  if (record.session && typeof record.session === "object" && !Array.isArray(record.session)) {
    const session = { ...(record.session as Record<string, unknown>) };
    if (typeof session.token === "string") session.token = await signPlatformToken(session.token);
    output.session = session;
  }
  return output;
}

export async function registerPlatformSecurity(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (!headerExempt(request)) {
      if (!isPlatformClient(request.headers)) {
        return reply.code(403).send({ success: false, error: "Cliente Hexavante inválido para esta API" });
      }
    }
    // APIs nativas nunca autenticam pelo cookie compartilhado do domínio.
    // Preserva apenas cookies transitórios do OAuth (state/callback).
    if (typeof request.headers.cookie === "string") {
      request.headers.cookie = request.headers.cookie
        .split(";")
        .map((part) => part.trim())
        .filter((part) => !part.startsWith("__Secure-hexavante.session_token="))
        .join("; ");
    }
    const token = bearer(request);
    if (!token) return;
    try {
      const sessionToken = await verifyPlatformToken(token);
      request.headers.authorization = `Bearer ${sessionToken}`;
    } catch {
      return reply.code(401).send({ success: false, error: "Token inválido para esta plataforma" });
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode >= 300 || !TOKEN_RESPONSE_PATHS.has(routePath(request)) || typeof payload !== "string") return payload;
    reply.removeHeader("set-cookie");
    const contentType = String(reply.getHeader("content-type") || "");
    if (!contentType.includes("application/json")) return payload;
    try { return JSON.stringify(await replaceSessionTokens(JSON.parse(payload))); } catch { return payload; }
  });
}
