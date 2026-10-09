import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

let desktop: FastifyInstance;
let mobile: FastifyInstance;
const desktopHeaders = { "x-hexavante-client": "desktop", "x-hexavante-client-version": "test" };
const mobileHeaders = { "x-hexavante-client": "mobile", "x-hexavante-client-version": "test" };

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DESKTOP_AUTH_SECRET = "desktop-auth-test-secret-with-32-characters";
  process.env.DESKTOP_TOKEN_SECRET = "desktop-token-test-secret-with-32-characters";
  process.env.MOBILE_AUTH_SECRET = "mobile-auth-test-secret-with-32-characters";
  process.env.MOBILE_TOKEN_SECRET = "mobile-token-test-secret-with-32-characters";
  desktop = await (await import("../apps/api-desktop/src/server")).buildApp();
  mobile = await (await import("../apps/api-mobile/src/server")).buildApp();
});
afterAll(async () => { await Promise.all([desktop?.close(), mobile?.close()].filter(Boolean)); });

describe("contratos HTTP separados", () => {
  it("expõe identidade e healthcheck independentes", async () => {
    expect((await desktop.inject({ method: "GET", url: "/" })).json().platform).toBe("desktop");
    expect((await mobile.inject({ method: "GET", url: "/" })).json().platform).toBe("mobile");
  });
  it("preserva auth nas duas APIs e exige o cabeçalho da plataforma", async () => {
    expect((await desktop.inject({ method: "GET", url: "/api/v1/auth/session", headers: desktopHeaders })).statusCode).toBe(401);
    expect((await mobile.inject({ method: "GET", url: "/api/v1/auth/session", headers: mobileHeaders })).statusCode).toBe(401);
    expect((await desktop.inject({ method: "GET", url: "/api/v1/auth/session", headers: mobileHeaders })).statusCode).toBe(403);
  });
  it("mantém moderação somente no contrato Desktop", async () => {
    expect((await desktop.inject({ method: "GET", url: "/api/v1/moderation/stats", headers: desktopHeaders })).statusCode).toBe(401);
    expect((await mobile.inject({ method: "GET", url: "/api/v1/moderation/stats", headers: mobileHeaders })).statusCode).toBe(404);
  });
});
