import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { handleError } from "../../../lib/errors/errorHandler";
import { gamificationInternalRoutes } from "../gamification.internal.routes";
import { awardCoins, awardXp } from "../../../../packages/core/src/modules/gamification/engine";

vi.mock("../../../../packages/core/src/modules/gamification/engine", () => ({
  awardXp: vi.fn(),
  awardCoins: vi.fn(),
}));

const TOKEN = "t".repeat(40);
const ORIGINAL = process.env.INTERNAL_API_TOKEN;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setErrorHandler((error, request, reply) => handleError(error, request, reply));
  await app.register(gamificationInternalRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_TOKEN = TOKEN;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = ORIGINAL;
});

const xpBody = { userId: "u1", amount: 10, source: "LESSON", sourceId: "lesson-1", description: "Aula" };

describe("POST /internal/v1/gamification/xp", () => {
  it("token válido → chama o motor com o valor base e devolve o award", async () => {
    vi.mocked(awardXp).mockResolvedValue({ amount: 20, description: "Aula", leveledUp: false });

    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/gamification/xp",
      headers: { "x-internal-token": TOKEN },
      payload: xpBody,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ award: { amount: 20, description: "Aula", leveledUp: false } });
    expect(awardXp).toHaveBeenCalledWith("u1", 10, "LESSON", "lesson-1", "Aula");
  });

  it("recompensa já dada → { award: null }", async () => {
    vi.mocked(awardXp).mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/gamification/xp",
      headers: { "x-internal-token": TOKEN },
      payload: xpBody,
    });
    expect(res.json()).toEqual({ award: null });
  });

  it("sem token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/v1/gamification/xp", payload: xpBody });
    expect(res.statusCode).toBe(401);
    expect(awardXp).not.toHaveBeenCalled();
  });

  it("token errado (mesmo tamanho) → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/gamification/xp",
      headers: { "x-internal-token": "x".repeat(40) },
      payload: xpBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it("servidor sem INTERNAL_API_TOKEN → 503 (rota fechada, nunca aberta)", async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/gamification/xp",
      headers: { "x-internal-token": "" },
      payload: xpBody,
    });
    expect(res.statusCode).toBe(503);
  });

  it("token curto demais no servidor é tratado como não configurado", async () => {
    process.env.INTERNAL_API_TOKEN = "curto";
    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/gamification/xp",
      headers: { "x-internal-token": "curto" },
      payload: xpBody,
    });
    expect(res.statusCode).toBe(503);
  });

  it.each([
    ["amount negativo", { ...xpBody, amount: -5 }],
    ["amount fracionado", { ...xpBody, amount: 1.5 }],
    ["source inválido", { ...xpBody, source: "HACK" }],
    ["fonte de moeda em rota de XP", { ...xpBody, source: "EXAM_CORRECT" }],
    ["sem sourceId", { ...xpBody, sourceId: "" }],
  ])("%s → 400", async (_label, payload) => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/gamification/xp",
      headers: { "x-internal-token": TOKEN },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(awardXp).not.toHaveBeenCalled();
  });
});

describe("POST /internal/v1/gamification/coins", () => {
  it("aceita fontes de moeda e devolve o award", async () => {
    vi.mocked(awardCoins).mockResolvedValue({ amount: 10, description: "Questão", multiplier: 2, balance: 50 });
    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/gamification/coins",
      headers: { "x-internal-token": TOKEN },
      payload: { userId: "u1", amount: 5, source: "EXAM_CORRECT", sourceId: "a-q-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().award.balance).toBe(50);
    expect(awardCoins).toHaveBeenCalledWith("u1", 5, "EXAM_CORRECT", "a-q-1", undefined);
  });
});
