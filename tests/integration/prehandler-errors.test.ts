import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server";
import { prisma } from "../../src/config/prisma";

/**
 * Regressão: erros lançados em `preHandler` (ex.: validateBody) precisam
 * passar pelo `handleError` — ZodError vira 400 com o envelope da API, nunca
 * 500 genérico do Fastify.
 *
 * Contexto: no Fastify 5, rotas registradas (via `register`, contexto
 * encapsulado) ANTES de `setErrorHandler()` mantêm o handler padrão para
 * erros de hooks. O `setErrorHandler` precisa vir antes dos registros
 * (ver src/server.ts). Este teste quebra se a ordem regredir.
 */

describe("preHandler validation errors (regressão setErrorHandler)", () => {
  let app: FastifyInstance;
  let token: string;
  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const email = `prehandler-${suffix}@example.com`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const user = await prisma.user.create({
      data: { fullName: "PreHandler Test", email, username: `pre_${suffix}` },
      select: { id: true },
    });
    token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const authed = (extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${token}`,
    ...extra,
  });

  it("POST /api/v1/certificates com corpo inválido → 400 (não 500)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/certificates",
      headers: { ...authed(), "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Validation failed");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("POST /api/v1/notifications/register com corpo inválido → 400 (não 500)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/register",
      headers: { ...authed(), "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Validation failed");
  });

  it("POST /api/v1/conversations com corpo inválido → 400 (não 500)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: { ...authed(), "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Validation failed");
  });
});
