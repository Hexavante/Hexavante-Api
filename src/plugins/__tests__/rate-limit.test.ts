import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import { buildRateLimitOptions, DEFAULT_RATE_LIMIT_MAX } from "../rate-limit";
import { logger } from "../../config/logger";
import { AppError } from "../../lib/errors/AppError";

/**
 * Testes de UNITÁRIOS do plugin de rate-limit.
 *
 * Cobrem os dois pontos que o deploy 8c5be14 expôs:
 *  - default global apertado (era 100 → agora 1000, com env ainda como override);
 *  - o 429 não era logado (agora `errorResponseBuilder` emite um `warn` estruturado).
 *
 * O Redis é mockado aqui: este arquivo não monta o app nem roda request —
 * só lê as opções e chama o builder. O caminho real (request → 429 → warn)
 * está coberto em tests/integration/rate-limit.test.ts.
 */
vi.mock("../../config/redis", () => ({
  getRedisClient: vi.fn(() => ({}) as never),
  closeRedisClient: vi.fn(async () => undefined),
}));

const ORIGINAL_MAX = process.env.RATE_LIMIT_MAX;

beforeAll(() => {
  delete process.env.RATE_LIMIT_MAX;
});

afterAll(() => {
  if (ORIGINAL_MAX === undefined) delete process.env.RATE_LIMIT_MAX;
  else process.env.RATE_LIMIT_MAX = ORIGINAL_MAX;
});

beforeEach(() => {
  delete process.env.RATE_LIMIT_MAX;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildRateLimitOptions — default do RATE_LIMIT_MAX", () => {
  it("sem env definida → max === 1000 (DEFAULT_RATE_LIMIT_MAX)", () => {
    expect(buildRateLimitOptions().max).toBe(1000);
    expect(buildRateLimitOptions().max).toBe(DEFAULT_RATE_LIMIT_MAX);
    expect(DEFAULT_RATE_LIMIT_MAX).toBe(1000);
  });

  it("env RATE_LIMIT_MAX continua sendo o override", () => {
    process.env.RATE_LIMIT_MAX = "5";
    expect(buildRateLimitOptions().max).toBe(5);

    process.env.RATE_LIMIT_MAX = "2500";
    expect(buildRateLimitOptions().max).toBe(2500);
  });

  it("env inválida cai no default (não vira NaN nem 0)", () => {
    process.env.RATE_LIMIT_MAX = "abc";
    expect(buildRateLimitOptions().max).toBe(1000);
  });
});

describe("errorResponseBuilder — warn no 429", () => {
  const req = {
    ip: "203.0.113.10",
    method: "GET",
    url: "/health",
  } as unknown as FastifyRequest;

  const context = {
    statusCode: 429,
    ban: false,
    after: "42 seconds",
    max: 10,
    ttl: 42,
  };

  it("loga logger.warn com payload estruturado e mensagem identificável", () => {
    const warnSpy = vi.spyOn(logger, "warn");

    const error = buildRateLimitOptions().errorResponseBuilder!(req, context);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: "203.0.113.10",
        method: "GET",
        url: "/health",
        limit: 10,
        max: 10,
        after: "42 seconds",
        ttl: 42,
        rateLimited: true,
      }),
      "Rate limit exceeded"
    );

    // E a resposta continua sendo o AppError(429) de sempre.
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(429);
    expect((error as AppError).code).toBe("RATE_LIMIT_EXCEEDED");
    expect((error as AppError).message).toContain("retry in 42 seconds");
  });
});
