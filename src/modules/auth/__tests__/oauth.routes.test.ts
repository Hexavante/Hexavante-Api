import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";

// Módulos com Prisma/Redis — não precisam rodar nestes testes de rota.
vi.mock("../service/oauth.service", () => ({
  findOrCreateOAuthUser: vi.fn(),
}));
vi.mock("../../../lib/session", () => ({
  createSession: vi.fn(),
}));

import { oauthRoutes } from "../routes/oauth.routes";

describe("OAuth routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(oauthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /oauth/providers", () => {
    it("retorna os 4 providers como booleanos", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/oauth/providers",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(Object.keys(body.providers).sort()).toEqual([
        "discord",
        "github",
        "google",
        "microsoft",
      ]);
      for (const value of Object.values(body.providers)) {
        expect(typeof value).toBe("boolean");
      }
      // tests/setup.ts injeta GOOGLE_* e GITHUB_*
      expect(body.providers.google).toBe(true);
      expect(body.providers.github).toBe(true);
      expect(body.providers.microsoft).toBe(false);
      expect(body.providers.discord).toBe(false);
    });

    it("responde tudo false quando nenhuma credencial existe", async () => {
      for (const key of [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "MICROSOFT_CLIENT_ID",
        "MICROSOFT_CLIENT_SECRET",
        "DISCORD_CLIENT_ID",
        "DISCORD_CLIENT_SECRET",
      ]) {
        vi.stubEnv(key, "");
      }

      const response = await app.inject({
        method: "GET",
        url: "/oauth/providers",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        providers: {
          google: false,
          github: false,
          microsoft: false,
          discord: false,
        },
      });
    });

    it("não é capturada pelo wildcard GET /oauth/:provider", async () => {
      // Se o param capturasse a rota, a resposta seria 404 "Provider não
      // suportado" (provider desconhecido) — e não 200 com `providers`.
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
      vi.stubEnv("GITHUB_CLIENT_ID", "");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "");

      const response = await app.inject({
        method: "GET",
        url: "/oauth/providers",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.providers).toBeDefined();
      expect(body.error).toBeUndefined();
    });

    it("continua respondendo mesmo com credenciais parciais", async () => {
      vi.stubEnv("MICROSOFT_CLIENT_ID", "ms-id");
      vi.stubEnv("MICROSOFT_CLIENT_SECRET", "ms-secret");

      const response = await app.inject({
        method: "GET",
        url: "/oauth/providers",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).providers.microsoft).toBe(true);
    });
  });

  describe("GET /oauth/:provider", () => {
    it("retorna 400 quando o provider não tem credenciais", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Provider não configurado",
      });
    });

    it("retorna 404 para provider não suportado", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/oauth/twitter",
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Provider não suportado",
      });
    });

    it("redireciona pro consent do Google com redirect_uri correto", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location as string;
      expect(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth")).toBe(true);
      const url = new URL(location);
      expect(url.searchParams.get("client_id")).toBe("g-id");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost:3045/oauth/callback/google"
      );
      expect(url.searchParams.get("state")).toBeTruthy();
      expect(response.cookies.some((c) => c.name === "oauth_state")).toBe(true);
      expect(response.cookies.some((c) => c.name === "oauth_callback")).toBe(true);
    });

    it("redireciona pro consent do Discord quando configurado", async () => {
      vi.stubEnv("DISCORD_CLIENT_ID", "dc-id");
      vi.stubEnv("DISCORD_CLIENT_SECRET", "dc-secret");

      const response = await app.inject({
        method: "GET",
        url: "/oauth/discord",
      });

      expect(response.statusCode).toBe(302);
      const url = new URL(response.headers.location as string);
      expect(url.origin + url.pathname).toBe(
        "https://discord.com/api/oauth2/authorize"
      );
      expect(url.searchParams.get("scope")).toBe("identify email");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost:3045/oauth/callback/discord"
      );
    });
  });
});
