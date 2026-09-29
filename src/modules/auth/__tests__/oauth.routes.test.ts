import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";

// Módulos com Prisma/Redis — não precisam rodar nestes testes de rota.
vi.mock("../service/oauth.service", () => ({
  findOrCreateOAuthUser: vi.fn(),
}));
vi.mock("../../../lib/session", () => ({
  createSession: vi.fn(),
  validateSession: vi.fn(),
}));
// trustDevice não é o alvo destes testes — evita bater no Prisma.
vi.mock("../../security/service/security.service", () => ({
  SecurityService: vi.fn().mockImplementation(() => ({
    trustDevice: vi.fn().mockResolvedValue(undefined),
  })),
  fingerprintDevice: vi.fn(() => "fingerprint"),
}));

import { oauthRoutes } from "../routes/oauth.routes";
import { findOrCreateOAuthUser } from "../service/oauth.service";
import { createSession, validateSession } from "../../../lib/session";
import { getRedisClient, closeRedisClient } from "../../../config/redis";
import { getWebUrl } from "../../../config/oauth";

/** Chaves `oauth:native:*` criadas durante os testes (limpeza garantida). */
const nativeKeys: string[] = [];

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
    await closeRedisClient();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    if (nativeKeys.length) {
      const redis = getRedisClient();
      while (nativeKeys.length) {
        await redis.del(nativeKeys.pop() as string);
      }
    }
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

  describe("GET /oauth/:provider — schemes nativos", () => {
    const enableGoogle = () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");
    };

    it("aceita scheme da allowlist (hexavante://) e guarda o valor cru", async () => {
      enableGoogle();

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
        query: { callbackURL: "hexavante://auth/callback" },
      });

      expect(response.statusCode).toBe(302);
      expect(
        (response.headers.location as string).startsWith(
          "https://accounts.google.com/o/oauth2/v2/auth"
        )
      ).toBe(true);

      const callback = response.cookies.find((c) => c.name === "oauth_callback");
      expect(decodeURIComponent(callback?.value ?? "")).toBe(
        "hexavante://auth/callback"
      );
    });

    it("aceita schemes extras listados em OAUTH_NATIVE_SCHEMES", async () => {
      enableGoogle();
      vi.stubEnv("OAUTH_NATIVE_SCHEMES", "hexavante,meuapp");

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
        query: { callbackURL: "meuapp://entrar" },
      });

      expect(response.statusCode).toBe(302);
      const callback = response.cookies.find((c) => c.name === "oauth_callback");
      expect(decodeURIComponent(callback?.value ?? "")).toBe("meuapp://entrar");
    });

    it("rejeita scheme fora da allowlist com 400", async () => {
      enableGoogle();

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
        query: { callbackURL: "foo://x" },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Scheme de callback não permitido",
      });
      expect(
        response.cookies.some((c) => c.name === "oauth_callback")
      ).toBe(false);
    });

    it("mantém o caminho web relativo inalterado", async () => {
      enableGoogle();

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
        query: { callbackURL: "/dashboard" },
      });

      expect(response.statusCode).toBe(302);
      const callback = response.cookies.find((c) => c.name === "oauth_callback");
      expect(decodeURIComponent(callback?.value ?? "")).toBe(
        `${getWebUrl()}/dashboard`
      );
    });

    it("mantém http(s) fora da allowlist de domínios rejeitado", async () => {
      enableGoogle();

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
        query: { callbackURL: "https://evil.com/" },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Domínio de redirecionamento não permitido",
      });
    });

    it("aceita o callback do desktop em api.hexavante.com.br", async () => {
      enableGoogle();

      const response = await app.inject({
        method: "GET",
        url: "/oauth/google",
        query: {
          callbackURL:
            "https://api.hexavante.com.br/api/v1/auth/oauth/success",
        },
      });

      expect(response.statusCode).toBe(302);
      expect(
        (response.headers.location as string).startsWith(
          "https://accounts.google.com/o/oauth2/v2/auth"
        )
      ).toBe(true);

      const callback = response.cookies.find((c) => c.name === "oauth_callback");
      expect(decodeURIComponent(callback?.value ?? "")).toBe(
        "https://api.hexavante.com.br/api/v1/auth/oauth/success"
      );
    });
  });

  describe("GET /oauth/callback/:provider — redirects", () => {
    /** Troca de token + getUserInfo do Google respondem com fixtures. */
    const stubGoogleFetch = (tokenStatus = 200) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("oauth2.googleapis.com/token")) {
            return new Response(
              tokenStatus === 200
                ? JSON.stringify({ access_token: "at-1" })
                : "bad token",
              {
                status: tokenStatus,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          if (url.includes("googleapis.com/oauth2/v2/userinfo")) {
            return new Response(
              JSON.stringify({
                id: "g-1",
                email: "native@example.com",
                name: "Native",
                picture: null,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("not found", { status: 404 });
        })
      );
    };

    it("erro do provider redireciona pro callback nativo", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/oauth/callback/google",
        query: { error: "access_denied" },
        cookies: { oauth_callback: "hexavante://auth/callback" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(
        "hexavante://auth/callback?error=oauth_access_denied"
      );
    });

    it("state inválido redireciona pro callback nativo", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/oauth/callback/google",
        query: { state: "errado" },
        cookies: { oauth_callback: "hexavante://auth/callback" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(
        "hexavante://auth/callback?error=oauth_invalid_state"
      );
    });

    it("falha na troca de token redireciona pro callback nativo", async () => {
      stubGoogleFetch(400);

      const response = await app.inject({
        method: "GET",
        url: "/oauth/callback/google",
        query: { code: "provider-code", state: "state-1" },
        cookies: {
          oauth_state: "state-1",
          oauth_callback: "hexavante://auth/callback",
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(
        "hexavante://auth/callback?error=oauth_token_exchange"
      );
    });

    it("erro do provider continua indo pro /login?error= do web", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/oauth/callback/google",
        query: { error: "access_denied" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(
        `${getWebUrl()}/login?error=oauth_access_denied`
      );
    });

    it("sucesso nativo gera one-time code no Redis e redireciona", async () => {
      stubGoogleFetch();
      vi.mocked(findOrCreateOAuthUser).mockResolvedValue({
        id: "user-native-1",
        fullName: "Native",
        email: "native@example.com",
        username: "native",
        avatarUrl: null,
        roles: ["USER"],
      });
      vi.mocked(createSession).mockResolvedValue({
        id: "sess-1",
        token: "session-token-nativo",
        userId: "user-native-1",
        expiresAt: new Date(Date.now() + 1000),
        user: {
          id: "user-native-1",
          fullName: "Native",
          email: "native@example.com",
          username: "native",
          banned: false,
          avatarUrl: null,
          roles: [{ role: { name: "USER" } }],
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/oauth/callback/google",
        query: { code: "provider-code", state: "state-1" },
        cookies: {
          oauth_state: "state-1",
          oauth_callback: "hexavante://auth/callback",
        },
      });

      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location as string);
      expect(location.protocol).toBe("hexavante:");
      expect(location.host).toBe("auth");
      expect(location.pathname).toBe("/callback");
      expect(location.searchParams.get("provider")).toBe("google");

      const oneTimeCode = location.searchParams.get("code");
      expect(oneTimeCode).toMatch(/^[0-9a-f]{32}$/);
      nativeKeys.push(`oauth:native:${oneTimeCode}`);

      // Sessão criada pelo mesmo caminho do fluxo web (cookie continua sendo setado)
      const sessionCookie = response.cookies.find(
        (c) => c.name === "__Secure-hexavante.session_token"
      );
      expect(sessionCookie?.value).toBe("session-token-nativo");

      const redis = getRedisClient();
      expect(await redis.get(`oauth:native:${oneTimeCode}`)).toBe(
        "session-token-nativo"
      );
      const ttl = await redis.ttl(`oauth:native:${oneTimeCode}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120);
    });

    it("sucesso web continua redirecionando pro callbackURL sem code", async () => {
      stubGoogleFetch();
      vi.mocked(findOrCreateOAuthUser).mockResolvedValue({
        id: "user-web-1",
        fullName: "Web",
        email: "web@example.com",
        username: "web",
        avatarUrl: null,
        roles: ["USER"],
      });
      vi.mocked(createSession).mockResolvedValue({
        id: "sess-2",
        token: "session-token-web",
        userId: "user-web-1",
        expiresAt: new Date(Date.now() + 1000),
        user: {
          id: "user-web-1",
          fullName: "Web",
          email: "web@example.com",
          username: "web",
          banned: false,
          avatarUrl: null,
          roles: [{ role: { name: "USER" } }],
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/oauth/callback/google",
        query: { code: "provider-code", state: "state-1" },
        cookies: {
          oauth_state: "state-1",
          oauth_callback: `${getWebUrl()}/dashboard`,
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`${getWebUrl()}/dashboard`);
    });
  });

  describe("POST /oauth/exchange", () => {
    const validSession = {
      id: "sess-1",
      token: "session-token-nativo",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 1000),
      user: {
        id: "user-1",
        fullName: "Usuário Teste",
        email: "teste@example.com",
        username: "teste",
        banned: false,
        avatarUrl: null,
        roles: [{ role: { name: "USER" } }, { role: { name: "INSTRUCTOR" } }],
      },
    };

    it("retorna 400 para code inexistente", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/oauth/exchange",
        payload: { code: "nao-existe" },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Código inválido ou expirado",
      });
    });

    it("retorna 400 quando o corpo não tem code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/oauth/exchange",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Código de troca inválido",
      });
    });

    it("devolve token+user no shape do login e é uso único", async () => {
      const oneTimeCode = "c".repeat(32);
      const redisKey = `oauth:native:${oneTimeCode}`;
      nativeKeys.push(redisKey);
      await getRedisClient().set(redisKey, "session-token-nativo", "EX", 120);
      vi.mocked(validateSession).mockResolvedValue(validSession);

      const response = await app.inject({
        method: "POST",
        url: "/oauth/exchange",
        payload: { code: oneTimeCode },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        token: "session-token-nativo",
        user: {
          id: "user-1",
          name: "Usuário Teste",
          email: "teste@example.com",
          username: "teste",
          avatarUrl: null,
          roles: ["USER", "INSTRUCTOR"],
        },
      });

      // Uso único: o mesmo code não pode ser trocado de novo
      const reuse = await app.inject({
        method: "POST",
        url: "/oauth/exchange",
        payload: { code: oneTimeCode },
      });

      expect(reuse.statusCode).toBe(400);
      expect(JSON.parse(reuse.payload)).toEqual({
        error: "Código inválido ou expirado",
      });
    });
  });
});
