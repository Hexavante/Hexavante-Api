import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getOAuthConfig,
  parseTokenResponse,
  OAUTH_PROVIDER_IDS,
} from "../../../config/oauth";

/**
 * Configuração dos 4 providers OAuth (Google, GitHub, Microsoft, Discord).
 * `tests/setup.ts` já injeta GOOGLE_* e GITHUB_* — aqui controlamos env por env.
 */
describe("getOAuthConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("expõe os 4 providers suportados", () => {
    expect([...OAUTH_PROVIDER_IDS]).toEqual([
      "google",
      "github",
      "microsoft",
      "discord",
    ]);
    for (const provider of OAUTH_PROVIDER_IDS) {
      expect(getOAuthConfig(provider)).not.toBeNull();
    }
  });

  it("retorna null para provider desconhecido", () => {
    expect(getOAuthConfig("twitter")).toBeNull();
    expect(getOAuthConfig("")).toBeNull();
  });

  describe("google", () => {
    it("usa endpoints/scopes do Google e fica disabled sem credenciais", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

      expect(getOAuthConfig("google")).toEqual({
        clientId: "",
        clientSecret: "",
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        scopes: ["openid", "email", "profile"],
        enabled: false,
      });
    });

    it("fica enabled quando ID e secret estão presentes", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");

      const config = getOAuthConfig("google");
      expect(config?.clientId).toBe("g-id");
      expect(config?.clientSecret).toBe("g-secret");
      expect(config?.enabled).toBe(true);
    });

    it("fica disabled com apenas um dos dois", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

      expect(getOAuthConfig("google")?.enabled).toBe(false);
    });
  });

  describe("github", () => {
    it("usa endpoints/scopes do GitHub e fica disabled sem credenciais", () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "");

      expect(getOAuthConfig("github")).toEqual({
        clientId: "",
        clientSecret: "",
        authorizationEndpoint: "https://github.com/login/oauth/authorize",
        tokenEndpoint: "https://github.com/login/oauth/access_token",
        scopes: ["user:email"],
        enabled: false,
      });
    });

    it("fica enabled quando ID e secret estão presentes", () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");

      expect(getOAuthConfig("github")?.enabled).toBe(true);
    });
  });

  describe("microsoft", () => {
    it("usa endpoints/scopes da Microsoft Graph e fica disabled sem credenciais", () => {
      vi.stubEnv("MICROSOFT_CLIENT_ID", "");
      vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");

      expect(getOAuthConfig("microsoft")).toEqual({
        clientId: "",
        clientSecret: "",
        authorizationEndpoint:
          "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenEndpoint:
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        scopes: ["openid", "email", "profile", "User.Read"],
        enabled: false,
      });
    });

    it("fica enabled quando ID e secret estão presentes", () => {
      vi.stubEnv("MICROSOFT_CLIENT_ID", "ms-id");
      vi.stubEnv("MICROSOFT_CLIENT_SECRET", "ms-secret");

      expect(getOAuthConfig("microsoft")?.enabled).toBe(true);
    });
  });

  describe("discord", () => {
    it("usa endpoints/scopes do Discord e fica disabled sem credenciais", () => {
      vi.stubEnv("DISCORD_CLIENT_ID", "");
      vi.stubEnv("DISCORD_CLIENT_SECRET", "");

      expect(getOAuthConfig("discord")).toEqual({
        clientId: "",
        clientSecret: "",
        authorizationEndpoint: "https://discord.com/api/oauth2/authorize",
        tokenEndpoint: "https://discord.com/api/oauth2/token",
        scopes: ["identify", "email"],
        enabled: false,
      });
    });

    it("fica enabled quando ID e secret estão presentes", () => {
      vi.stubEnv("DISCORD_CLIENT_ID", "dc-id");
      vi.stubEnv("DISCORD_CLIENT_SECRET", "dc-secret");

      expect(getOAuthConfig("discord")?.enabled).toBe(true);
    });
  });
});

/**
 * Token exchange: Google/Microsoft/Discord devolvem JSON, GitHub devolve
 * urlencoded — o parser precisa aceitar os dois em qualquer provider.
 */
describe("parseTokenResponse", () => {
  it("interpreta resposta JSON (Google, Microsoft, Discord)", () => {
    const parsed = parseTokenResponse(
      '{"access_token":"tok-123","token_type":"Bearer","expires_in":3600}'
    );
    expect(parsed.access_token).toBe("tok-123");
    expect(parsed.token_type).toBe("Bearer");
  });

  it("interpreta resposta urlencoded (GitHub)", () => {
    const parsed = parseTokenResponse(
      "access_token=tok-gh&token_type=bearer&scope=user%3Aemail&expires_in=3600"
    );
    expect(parsed.access_token).toBe("tok-gh");
    expect(parsed.scope).toBe("user:email");
  });

  it("aceita corpo vazio sem lançar", () => {
    expect(parseTokenResponse("")).toEqual({});
    expect(parseTokenResponse("   ")).toEqual({});
  });

  it("não lança com corpo malformado", () => {
    const parsed = parseTokenResponse('{"access_token":');
    expect(parsed.access_token).toBeUndefined();
  });
});
