import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { logger } from "../../src/config/logger";

/**
 * Testes de ESCOPO do rate-limit (regressão do bug: o plugin era registrado
 * num contexto filho vazio e nenhuma rota da API era limitada).
 *
 * Dois ajustes só neste arquivo:
 * - `RATE_LIMIT_MAX` forçado para 5 → permitir ver o 429 sem 100 requests;
 *   `buildRateLimitOptions()` lê a env no boot do app (em `buildApp()`/import).
 * - As requests usam `remoteAddress` de TEST-NET: em NODE_ENV=test a allowList
 *   de dev (`127.0.0.1`, `::1`, `localhost`) deixaria tudo passar. O IP ainda é
 *   único por teste/execução → chave isolada no Redis (TTL 60s), sem interferir
 *   nos demais arquivos de teste (que usam 127.0.0.1 e ficam allowlisted).
 */
process.env.RATE_LIMIT_MAX = "5";

// Import DEPOIS de setar a env (o valor é consumido no boot do rate-limit).
const { buildApp } = await import("../../src/server");
const { getRedisClient } = await import("../../src/config/redis");

const RUN = Math.floor(Math.random() * 200) + 20;
let seq = 0;
/** IP único por teste e por execução (evita reusar contador do Redis). */
function uniqueIp(): string {
  seq += 1;
  return `198.51.${((RUN + seq) % 230) + 10}.${(seq % 230) + 10}`;
}

describe("Rate-limit global (escopo raiz)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_MAX;
  });

  it("limita rota sem config própria em escopo filho (/health): 6ª → 429 + headers", async () => {
    const ip = uniqueIp();

    for (let i = 1; i <= 5; i++) {
      const res = await app.inject({
        method: "GET",
        url: "/health",
        remoteAddress: ip,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe("5");
      expect(res.headers["x-ratelimit-remaining"]).toBe(String(5 - i));
    }

    const blocked = await app.inject({
      method: "GET",
      url: "/health",
      remoteAddress: ip,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["x-ratelimit-limit"]).toBe("5");
    expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("limita também a rota registrada direto no escopo raiz (GET /) → 429, não 500", async () => {
    const ip = uniqueIp();

    for (let i = 1; i <= 5; i++) {
      const res = await app.inject({ method: "GET", url: "/", remoteAddress: ip });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe("5");
    }

    const blocked = await app.inject({ method: "GET", url: "/", remoteAddress: ip });
    // Regressão: o handler de erro custom de src/server.ts responderia 500 para
    // o Error genérico do plugin; o 429 vem do errorResponseBuilder (AppError).
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["x-ratelimit-limit"]).toBe("5");
    const body = JSON.parse(blocked.payload);
    expect(body.error).toContain("Rate limit exceeded");
  });

  it("rota com limite próprio (login, 10/min) ignora o global e não dobra a contagem", async () => {
    const ip = uniqueIp();

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {},
        remoteAddress: ip,
      });
      // Limite da ROTA (10) é maior que o global (5): nada de 429 aqui.
      expect(res.statusCode).not.toBe(429);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {},
      remoteAddress: ip,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["x-ratelimit-limit"]).toBe("10");

    // Rota com config usa contador próprio e NÃO consome o contador global.
    expect(await getRedisClient().get(`fastify-rate-limit-${ip}`)).toBeNull();
  });

  it("POST /oauth/exchange mantém escopo próprio: 10 ok + 429 no 11º, contador único", async () => {
    const ip = uniqueIp();

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/oauth/exchange",
        payload: { code: "codigo-invalido" },
        remoteAddress: ip,
      });
      // Código inválido → 400, mas jamais 429 antes da 11ª request.
      expect(res.statusCode).toBe(400);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "codigo-invalido" },
      remoteAddress: ip,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["x-ratelimit-limit"]).toBe("10");
    expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");

    // 11 requests → 11 increments: se o plugin fosse registrado duas vezes no
    // mesmo escopo, seriam 2 increments por request (429 já na 6ª) = 22.
    const routeCount = await getRedisClient().get(
      `fastify-rate-limit-POST/oauth/exchange-${ip}`
    );
    expect(Number(routeCount)).toBe(11);
    // E o contador global continua intocado.
    expect(await getRedisClient().get(`fastify-rate-limit-${ip}`)).toBeNull();
  });

  it("429 emite logger.warn estruturado (observabilidade do docker logs)", async () => {
    const ip = uniqueIp();
    // Spy criado AQUI dentro: só os 429 deste teste interessam (os anteriores
    // já passaram pela função real, sem serem registrados pelo spy).
    const warnSpy = vi.spyOn(logger, "warn");

    try {
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({ method: "GET", url: "/health", remoteAddress: ip });
        expect(res.statusCode).toBe(200);
      }

      const blocked = await app.inject({ method: "GET", url: "/health", remoteAddress: ip });
      expect(blocked.statusCode).toBe(429);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ip,
          method: "GET",
          url: "/health",
          limit: 5,
          max: 5,
          rateLimited: true,
        }),
        "Rate limit exceeded"
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
