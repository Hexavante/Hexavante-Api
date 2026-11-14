import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../../packages/core/src/config/prisma";
import { ExamService } from "../../../../packages/core/src/modules/exams/service/exam.service";
import {
  awardCoins,
  awardXp,
  recordSocialActivity,
} from "../../../../packages/core/src/modules/gamification/engine";

vi.mock("../../../../packages/core/src/config/prisma", () => ({
  prisma: {
    examAttempt: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    examAnswer: { createMany: vi.fn() },
  },
}));

vi.mock("../../../../packages/core/src/modules/gamification/engine", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    awardXp: vi.fn(async (_u: string, amount: number) => ({ amount, description: "", leveledUp: false })),
    awardCoins: vi.fn(async (_u: string, amount: number) => ({ amount, description: "", multiplier: 1, balance: 0 })),
    recordSocialActivity: vi.fn(),
  };
});

function question(id: string, correctAlt: string) {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    points: 1,
    alternatives: [
      { id: correctAlt, isCorrect: true },
      { id: `${id}-wrong`, isCorrect: false },
    ],
  };
}

function attempt() {
  return {
    id: "att1",
    userId: "u1",
    finishedAt: null,
    exam: {
      title: "Simulado X",
      slug: "simulado-x",
      questions: [question("q1", "a1"), question("q2", "a2"), question("q3", "a3")],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(attempt() as never);
  vi.mocked(prisma.examAttempt.count).mockResolvedValue(0); // 1º simulado do dia → x1
});

describe("ExamService.submitExam — recompensas pelo motor único", () => {
  it("aprovado: XP base + bônus, moedas POR QUESTÃO certa (mesmos sourceIds do Web)", async () => {
    const res = await new ExamService().submitExam("u1", {
      attemptId: "att1",
      answers: [
        { questionId: "q1", alternativeId: "a1" },
        { questionId: "q2", alternativeId: "a2" },
        { questionId: "q3", alternativeId: "a3" },
      ],
    } as never);

    expect(vi.mocked(awardXp).mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      [20, "EXAM", "att1"],
      [30, "EXAM", "att1-pass"],
    ]);
    expect(vi.mocked(awardCoins).mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      [5, "EXAM_CORRECT", "att1-q-q1"],
      [5, "EXAM_CORRECT", "att1-q-q2"],
      [5, "EXAM_CORRECT", "att1-q-q3"],
    ]);
    expect(recordSocialActivity).toHaveBeenCalledWith(
      "u1",
      "SIMULADO_PASSED",
      { simulado: "Simulado X", simuladoSlug: "simulado-x", score: 100 },
      "exam:att1",
    );
    expect(res.xpAwarded).toBe(50);
    expect(res.coinsAwarded).toBe(15);
  });

  it("reprovado: só XP base, sem bônus nem feed", async () => {
    await new ExamService().submitExam("u1", {
      attemptId: "att1",
      answers: [
        { questionId: "q1", alternativeId: "a1" },
        { questionId: "q2", alternativeId: "q2-wrong" },
        { questionId: "q3", alternativeId: "q3-wrong" },
      ],
    } as never);

    expect(vi.mocked(awardXp).mock.calls.map((c) => c[3])).toEqual(["att1"]);
    expect(awardCoins).toHaveBeenCalledTimes(1);
    expect(recordSocialActivity).not.toHaveBeenCalled();
  });

  it("2º simulado do dia: multiplicador diário 0.35 com arredondamento do Web", async () => {
    vi.mocked(prisma.examAttempt.count).mockResolvedValue(1);
    await new ExamService().submitExam("u1", {
      attemptId: "att1",
      answers: [{ questionId: "q1", alternativeId: "a1" }],
    } as never);

    // 20×0.35=7 ; 5×0.35=1.75→2. Booster fica a cargo do motor.
    expect(vi.mocked(awardXp).mock.calls[0][1]).toBe(7);
    expect(vi.mocked(awardCoins).mock.calls[0][1]).toBe(2);
  });
});
