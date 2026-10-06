import { describe, it, expect, afterEach, vi } from "vitest";
import {
  requireAuthSecret,
  resolveDocsAuth,
  MIN_AUTH_SECRET_LENGTH,
} from "../env";

/**
 * P1-1: AUTH_SECRET sem fallback previsível em produção.
 * A API deve recusar startup (throw) quando, com NODE_ENV=production,
 * o segredo está ausente ou é curto demais.
 */
describe("requireAuthSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lança em produção sem AUTH_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => requireAuthSecret()).toThrow(/AUTH_SECRET/);
  });

  it("lança em produção com AUTH_SECRET curto", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "curto-demais");
    expect(() => requireAuthSecret()).toThrow(/ao menos/);
  });

  it("aceita em produção com segredo de tamanho mínimo", () => {
    vi.stubEnv("NODE_ENV", "production");
    const secret = "x".repeat(MIN_AUTH_SECRET_LENGTH);
    vi.stubEnv("AUTH_SECRET", secret);
    expect(requireAuthSecret()).toBe(secret);
  });

  it("fora de produção usa o valor definido", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_SECRET", "segredo-de-teste");
    expect(requireAuthSecret()).toBe("segredo-de-teste");
  });

  it("fora de produção tem fallback explícito (nunca em prod)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    const fallback = requireAuthSecret();
    expect(typeof fallback).toBe("string");
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback).toContain("dev-only");
  });
});

/**
 * P1-2: Swagger sem credencial padrão — produção exige env explícita.
 */
describe("resolveDocsAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("produção sem credenciais: docs desabilitado", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SWAGGER_USER", "");
    vi.stubEnv("SWAGGER_PASS", "");
    expect(resolveDocsAuth()).toEqual({
      enabled: false,
      user: null,
      pass: null,
    });
  });

  it("produção com apenas uma credencial: docs desabilitado", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SWAGGER_USER", "alguem");
    vi.stubEnv("SWAGGER_PASS", "");
    expect(resolveDocsAuth().enabled).toBe(false);
  });

  it("produção com as duas credenciais: docs habilitado e protegido", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SWAGGER_USER", "docs-user");
    vi.stubEnv("SWAGGER_PASS", "docs-pass-forte");
    expect(resolveDocsAuth()).toEqual({
      enabled: true,
      user: "docs-user",
      pass: "docs-pass-forte",
    });
  });

  it("fora de produção sem credenciais: docs habilitado e aberto", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SWAGGER_USER", "");
    vi.stubEnv("SWAGGER_PASS", "");
    expect(resolveDocsAuth()).toEqual({
      enabled: true,
      user: null,
      pass: null,
    });
  });

  it("fora de produção com credenciais: docs habilitado e protegido", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SWAGGER_USER", "dev-user");
    vi.stubEnv("SWAGGER_PASS", "dev-pass");
    expect(resolveDocsAuth().enabled).toBe(true);
    expect(resolveDocsAuth().user).toBe("dev-user");
  });
});
