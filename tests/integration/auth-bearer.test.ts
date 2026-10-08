import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server";
import { prisma } from "../../src/config/prisma";

/**
 * Autenticação por `Authorization: Bearer <session token>`.
 *
 * Contrato dos clientes nativos: o app guarda o token devolvido por
 * POST /auth/login em armazenamento seguro e envia Bearer, sem depender de
 * cookies de outra origin. O cookie continua sendo o caminho dos clientes
 * browser (Web/Landing/Admin).
 *
 * Em ambos os casos o token passa pela mesma `validateSession` (sessão no
 * banco, com expiração) — o header nunca é aceito por si só.
 */

describe("Bearer session auth (contrato dos clientes nativos)", () => {
  let app: FastifyInstance;
  let token: string;
  let cookie: string;
  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const username = `bearer_${suffix}`;
  const email = `bearer-${suffix}@example.com`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const user = await prisma.user.create({
      data: { fullName: "Bearer Test", email, username },
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
    cookie = `__Secure-hexavante.session_token=${token}`;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const me = (headers: Record<string, string> = {}) =>
    app.inject({ method: "GET", url: "/api/v1/users/me", headers });

  it("200 em rota autenticada com Authorization: Bearer", async () => {
    const response = await me({ authorization: `Bearer ${token}` });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.user?.username ?? body.username).toBe(username);
  });

  it("200 continua funcionando com o cookie (regressão dos clientes browser)", async () => {
    const response = await me({ cookie });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.user?.username ?? body.username).toBe(username);
  });

  it("401 com token Bearer inválido", async () => {
    const response = await me({ authorization: "Bearer token-invalido" });
    expect(response.statusCode).toBe(401);
  });

  it("401 sem nenhuma credencial", async () => {
    const response = await me();
    expect(response.statusCode).toBe(401);
  });

  it("Bearer inválido tem precedência sobre cookie válido (cabeçalho explícito)", async () => {
    const response = await me({
      authorization: "Bearer token-invalido",
      cookie,
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /auth/session aceita Bearer (reativação de sessão no Desktop)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it("POST /auth/logout com Bearer encerra a sessão no servidor", async () => {
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(200);

    const after = await me({ authorization: `Bearer ${token}` });
    expect(after.statusCode).toBe(401);
  });
});
