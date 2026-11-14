import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../../packages/core/src/config/prisma";
import { processPreviousSeason } from "../../../../packages/core/src/modules/gamification/engine/season";

vi.mock("../../../../packages/core/src/config/prisma", () => {
  const tx = {
    rankingSeason: { findUnique: vi.fn(), upsert: vi.fn() },
    userXP: { findMany: vi.fn(), update: vi.fn() },
    rankingSeasonResult: { upsert: vi.fn() },
  };
  return {
    prisma: {
      rankingSeason: { findUnique: vi.fn(), upsert: vi.fn() },
      rankingSeasonResult: { findMany: vi.fn() },
      xpTransaction: { groupBy: vi.fn() },
      userNotificationSettings: { findUnique: vi.fn() },
      notification: { findFirst: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(),
      __tx: tx,
    },
  };
});

type Fn = ReturnType<typeof vi.fn>;
const tx = (prisma as unknown as {
  __tx: {
    rankingSeason: { findUnique: Fn; upsert: Fn };
    userXP: { findMany: Fn; update: Fn };
    rankingSeasonResult: { upsert: Fn };
  };
}).__tx;

// 15/03/2026 → temporada anterior "2026-02"
const NOW = new Date(2026, 2, 15, 12, 0, 0);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (t: typeof tx) => unknown)(tx));
  vi.mocked(prisma.rankingSeason.findUnique).mockResolvedValue(null);
  tx.rankingSeason.findUnique.mockResolvedValue(null);
  vi.mocked(prisma.rankingSeasonResult.findMany).mockResolvedValue([]);
  vi.mocked(prisma.userNotificationSettings.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);
});

function bronzeMembers(count: number) {
  return Array.from({ length: count }, (_, i) => ({ userId: `u${i + 1}`, league: "BRONZE" }));
}

describe("processPreviousSeason", () => {
  it("temporada já processada → não faz nada", async () => {
    vi.mocked(prisma.rankingSeason.findUnique).mockResolvedValue({ processedAt: new Date() } as never);

    expect(await processPreviousSeason(NOW)).toEqual({ seasonKey: "2026-02", processed: false, results: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("promove top 5, rebaixa os 5 últimos (liga com 10+), Bronze não rebaixa", async () => {
    tx.userXP.findMany.mockImplementation(async ({ where }: { where: { league: string } }) =>
      where.league === "BRONZE" ? bronzeMembers(12) : [],
    );
    // u1 tem mais XP (1200), u12 o menor (100)
    vi.mocked(prisma.xpTransaction.groupBy).mockResolvedValue(
      bronzeMembers(12).map((m, i) => ({ userId: m.userId, _sum: { amount: 1200 - i * 100 } })) as never,
    );

    const result = await processPreviousSeason(NOW);
    expect(result.processed).toBe(true);

    // processedAt gravado dentro da transação
    expect(tx.rankingSeason.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { seasonKey: "2026-02" }, update: { processedAt: expect.any(Date) } }),
    );

    const upserts = tx.rankingSeasonResult.upsert.mock.calls.map(([arg]) => arg.create);
    expect(upserts).toHaveLength(12);
    expect(upserts[0]).toMatchObject({ userId: "u1", finalRank: 1, promoted: true, rewardCoins: 50 });
    expect(upserts[4]).toMatchObject({ userId: "u5", finalRank: 5, promoted: true });
    expect(upserts[5]).toMatchObject({ userId: "u6", promoted: false });
    // Bronze é a liga mais baixa: ninguém é rebaixado
    expect(upserts.every((u) => u.demoted === false)).toBe(true);
    // fora do top 10 com XP >= 50 → prêmio de participação
    expect(upserts[11]).toMatchObject({ finalRank: 12, rewardCoins: 5 });

    const promotedTo = tx.userXP.update.mock.calls.map(([arg]) => [arg.where.userId, arg.data.league]);
    expect(promotedTo).toEqual([
      ["u1", "SILVER"],
      ["u2", "SILVER"],
      ["u3", "SILVER"],
      ["u4", "SILVER"],
      ["u5", "SILVER"],
    ]);
  });

  it("outro processo fechou a temporada entre a leitura e a transação → não reprocessa", async () => {
    tx.rankingSeason.findUnique.mockResolvedValue({ processedAt: new Date() });

    expect((await processPreviousSeason(NOW)).processed).toBe(false);
    expect(tx.rankingSeasonResult.upsert).not.toHaveBeenCalled();
    expect(prisma.rankingSeasonResult.findMany).not.toHaveBeenCalled();
  });

  it("notifica quem tem prêmio a resgatar", async () => {
    tx.userXP.findMany.mockResolvedValue([]);
    vi.mocked(prisma.rankingSeasonResult.findMany).mockResolvedValue([
      { userId: "u1", finalRank: 1, league: "SILVER", promoted: true, demoted: false, rewardCoins: 75 },
    ] as never);

    await processPreviousSeason(NOW);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        type: "XP_EARNED",
        title: "Temporada encerrada",
        link: "/ranking",
        message: expect.stringContaining("Você foi promovido! Resgate 75 moedas no ranking."),
      }),
    });
  });

  it("usa timeout longo na transação (job em segundo plano)", async () => {
    tx.userXP.findMany.mockResolvedValue([]);
    await processPreviousSeason(NOW);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 120_000, maxWait: 10_000 });
  });
});
