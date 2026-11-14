import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../../packages/core/src/config/prisma";
import { RankingService } from "../service/ranking.service";
import type { IGamificationRepository } from "../repository/gamification.repository";
import type { ILeaderboardCache } from "../../../../packages/core/src/lib/cache/leaderboard.cache";

vi.mock("../../../../packages/core/src/config/prisma", () => ({
  prisma: { userXP: { findMany: vi.fn(), count: vi.fn() } },
}));

const repo = {
  getCurrentSeason: vi.fn().mockResolvedValue(null),
} as unknown as IGamificationRepository;

function xpRow(userId: string, totalXp: number) {
  return {
    userId,
    totalXp,
    level: Math.floor(Math.sqrt(totalXp / 100)),
    league: "BRONZE",
    user: { id: userId, username: userId, fullName: userId.toUpperCase(), avatarUrl: null },
  };
}

describe("RankingService — ranking geral", () => {
  beforeEach(() => vi.clearAllMocks());

  it("usa a ordem e o total do Redis e hidrata só a página no banco", async () => {
    const cache: ILeaderboardCache = {
      getPage: vi.fn().mockResolvedValue({
        entries: [
          { userId: "bia", totalXp: 900 },
          { userId: "ana", totalXp: 300 },
        ],
        total: 42,
      }),
      rebuild: vi.fn(),
    };
    // Banco devolve fora de ordem — a ordem do Redis prevalece.
    vi.mocked(prisma.userXP.findMany).mockResolvedValue([
      xpRow("ana", 300),
      xpRow("bia", 900),
    ] as never);

    const result = await new RankingService(repo, cache).getLeaderboard(2, 2);

    expect(cache.getPage).toHaveBeenCalledWith(2, 2);
    expect(prisma.userXP.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ["bia", "ana"] } } }),
    );
    expect(prisma.userXP.count).not.toHaveBeenCalled();
    expect(result.data.map((d) => [d.rank, d.userId])).toEqual([
      [3, "bia"],
      [4, "ana"],
    ]);
    expect(result.pagination).toMatchObject({ page: 2, limit: 2, total: 42 });
    expect(result.season).toBeNull();
  });

  it("usuário removido desde a reconstrução é pulado sem quebrar a numeração", async () => {
    const cache: ILeaderboardCache = {
      getPage: vi.fn().mockResolvedValue({
        entries: [
          { userId: "x", totalXp: 900 },
          { userId: "ana", totalXp: 300 },
        ],
        total: 2,
      }),
      rebuild: vi.fn(),
    };
    vi.mocked(prisma.userXP.findMany).mockResolvedValue([xpRow("ana", 300)] as never);

    const result = await new RankingService(repo, cache).getLeaderboard(1, 20);
    expect(result.data.map((d) => [d.rank, d.userId])).toEqual([[2, "ana"]]);
  });

  it("Redis indisponível → consulta original no banco", async () => {
    const cache: ILeaderboardCache = { getPage: vi.fn().mockResolvedValue(null), rebuild: vi.fn() };
    vi.mocked(prisma.userXP.findMany).mockResolvedValue([xpRow("bia", 900)] as never);
    vi.mocked(prisma.userXP.count).mockResolvedValue(1);

    const result = await new RankingService(repo, cache).getLeaderboard(1, 20);

    expect(prisma.userXP.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ totalXp: "desc" }, { level: "desc" }], skip: 0, take: 20 }),
    );
    expect(result.data).toEqual([
      expect.objectContaining({ rank: 1, userId: "bia", totalXp: 900 }),
    ]);
  });
});
