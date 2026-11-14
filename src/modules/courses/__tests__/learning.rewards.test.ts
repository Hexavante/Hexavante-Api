import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LearningService,
  type RewardEngine,
} from "../../../../packages/core/src/modules/courses/service/learning.service";
import type { ILearningRepository } from "../../../../packages/core/src/modules/courses/repository/learning.repository";

vi.mock("../../../../packages/core/src/config/prisma", () => ({ prisma: {} }));

function lesson(id: string, orderNumber: number) {
  return {
    id,
    title: `Aula ${id}`,
    description: null,
    videoUrl: null,
    videoProvider: null,
    duration: 10,
    orderNumber,
  };
}

const course = {
  id: "c1",
  title: "Curso X",
  status: "APPROVED",
  progressionType: "FREE",
  modules: [
    { id: "m1", title: "Módulo 1", orderNumber: 1, materials: [], lessons: [lesson("l1", 1), lesson("l2", 2)] },
  ],
};

function makeRepo(over: Partial<Record<string, unknown>> = {}) {
  return {
    getUserCourse: vi.fn().mockResolvedValue(course),
    findEnrollment: vi.fn().mockResolvedValue({ id: "e1", completedAt: null, lessonProgresses: [] }),
    upsertLessonProgress: vi.fn(),
    countCompletedLessonProgress: vi.fn().mockResolvedValue(1),
    updateEnrollment: vi.fn(),
    countCompletedInModule: vi.fn().mockResolvedValue(1),
    getUserXpProfile: vi.fn().mockResolvedValue({ level: 1, currentXp: 0, totalXp: 0 }),
    ...over,
  } as unknown as ILearningRepository;
}

function makeEngine(): RewardEngine & { awardXp: ReturnType<typeof vi.fn>; awardCoins: ReturnType<typeof vi.fn> } {
  return {
    // simula booster x2 aplicado DENTRO do motor
    awardXp: vi.fn(async (_u, amount: number) => ({ amount: amount * 2, description: "", leveledUp: false })),
    awardCoins: vi.fn(async (_u, amount: number) => ({ amount: amount * 2, description: "", multiplier: 2, balance: 0 })),
  };
}

describe("LearningService.completeLesson — recompensas pelo motor único", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passa valores BASE ao motor (booster não é aplicado duas vezes)", async () => {
    const engine = makeEngine();
    const result = await new LearningService(makeRepo(), engine).completeLesson("u1", "c1", "l1");

    expect(engine.awardXp).toHaveBeenCalledTimes(1);
    expect(engine.awardXp).toHaveBeenCalledWith("u1", 10, "LESSON", "l1", "Aula concluída: Aula l1");
    expect(engine.awardCoins).toHaveBeenCalledWith("u1", 3, "LESSON", "l1", "Aula concluída: Aula l1");
    // o total devolvido é o que o motor efetivamente concedeu
    expect(result.xpAwarded).toBe(20);
    expect(result.coinsAwarded).toBe(6);
  });

  it("última aula: módulo e curso também premiados com os mesmos sourceIds do Web", async () => {
    const engine = makeEngine();
    const repo = makeRepo({
      countCompletedLessonProgress: vi.fn().mockResolvedValue(2),
      countCompletedInModule: vi.fn().mockResolvedValue(2),
    });

    await new LearningService(repo, engine).completeLesson("u1", "c1", "l2");

    expect(engine.awardXp.mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      [10, "LESSON", "l2"],
      [25, "MODULE", "m1"],
      [100, "COURSE", "c1"],
    ]);
    expect(engine.awardCoins.mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      [3, "LESSON", "l2"],
      [10, "MODULE", "m1"],
      [25, "COURSE", "c1"],
    ]);
  });

  it("recompensa já concedida (motor devolve null) conta como 0", async () => {
    const engine = makeEngine();
    engine.awardXp.mockResolvedValue(null);
    engine.awardCoins.mockResolvedValue(null);

    const result = await new LearningService(makeRepo(), engine).completeLesson("u1", "c1", "l1");
    expect(result.xpAwarded).toBe(0);
    expect(result.coinsAwarded).toBe(0);
  });

  it("aula já concluída antes → nenhuma recompensa", async () => {
    const engine = makeEngine();
    const repo = makeRepo({
      findEnrollment: vi.fn().mockResolvedValue({
        id: "e1",
        completedAt: null,
        lessonProgresses: [{ lessonId: "l1", completed: true }],
      }),
    });

    await new LearningService(repo, engine).completeLesson("u1", "c1", "l1");
    expect(engine.awardXp).not.toHaveBeenCalled();
    expect(engine.awardCoins).not.toHaveBeenCalled();
  });
});
