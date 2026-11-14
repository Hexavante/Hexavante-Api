import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../../packages/core/src/config/prisma";
import { awardCoins, awardXp } from "../../../../packages/core/src/modules/gamification/engine/awards";
import { resetGlobalBoosterCache } from "../../../../packages/core/src/modules/gamification/engine/reward-multiplier";
import { applyXp } from "../../../../packages/core/src/modules/gamification/engine/rules";

vi.mock("../../../../packages/core/src/config/prisma", () => {
  const tx = {
    xpTransaction: { findUnique: vi.fn(), create: vi.fn() },
    userXP: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    coinTransaction: { findUnique: vi.fn(), create: vi.fn() },
    user: { update: vi.fn() },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      platformSetting: { findUnique: vi.fn() },
      userNotificationSettings: { findUnique: vi.fn() },
      notification: { findFirst: vi.fn(), create: vi.fn() },
      socialActivity: { upsert: vi.fn() },
      userWallet: { upsert: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

type Tx = {
  xpTransaction: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  userXP: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  coinTransaction: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
};
const tx = (prisma as unknown as { __tx: Tx }).__tx;

const FUTURE = new Date(Date.now() + 3_600_000);
const PAST = new Date(Date.now() - 3_600_000);

function userRow(over: Partial<{ isPremium: boolean; premiumExpiresAt: Date | null; boosterMultiplier: number; boosterExpiresAt: Date | null }> = {}) {
  return { isPremium: false, premiumExpiresAt: null, boosterMultiplier: 1, boosterExpiresAt: null, ...over };
}

function globalBooster(multiplier: number | null) {
  vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(
    multiplier ? ({ value: { multiplier, expiresAt: FUTURE.toISOString() } } as never) : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalBoosterCache();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (t: Tx) => unknown)(tx));
  vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
  globalBooster(null);
  vi.mocked(prisma.userNotificationSettings.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);
  tx.xpTransaction.findUnique.mockResolvedValue(null);
  tx.userXP.findUnique.mockResolvedValue({ level: 1, currentXp: 0, totalXp: 0 });
  tx.coinTransaction.findUnique.mockResolvedValue(null);
  tx.user.update.mockResolvedValue({ coins: 103 });
});

describe("applyXp (regra do Web)", () => {
  it("sobe vários níveis carregando o excedente", () => {
    // nível 1 → precisa 100; nível 2 → precisa 200
    expect(applyXp(1, 50, 50, 300)).toEqual({ level: 3, currentXp: 50, totalXp: 350 });
  });
});

describe("awardXp", () => {
  it("sem booster: grava o valor base e atualiza nível na mesma transação", async () => {
    const award = await awardXp("u1", 10, "LESSON", "lesson-1", "Aula concluída: X");

    expect(award).toEqual({ amount: 10, description: "Aula concluída: X", leveledUp: false, newLevel: undefined });
    expect(tx.xpTransaction.create).toHaveBeenCalledWith({
      data: { userId: "u1", amount: 10, source: "LESSON", sourceId: "lesson-1", description: "Aula concluída: X" },
    });
    expect(tx.userXP.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { level: 1, currentXp: 10, totalXp: 10 },
    });
  });

  it("aplica booster pessoal × global (premium NÃO afeta XP)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userRow({ isPremium: true, boosterMultiplier: 2, boosterExpiresAt: FUTURE }) as never,
    );
    globalBooster(1.5);

    const award = await awardXp("u1", 10, "LESSON", "lesson-1", "Aula");

    expect(award?.amount).toBe(30);
    expect(award?.description).toBe("Aula (booster global x1.5 · pessoal x2)");
  });

  it("booster pessoal expirado é ignorado", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userRow({ boosterMultiplier: 3, boosterExpiresAt: PAST }) as never,
    );
    expect((await awardXp("u1", 10, "LESSON", "l"))?.amount).toBe(10);
  });

  it("mesma fonte duas vezes → null e nada gravado", async () => {
    tx.xpTransaction.findUnique.mockResolvedValue({ id: "x" });

    expect(await awardXp("u1", 10, "LESSON", "lesson-1")).toBeNull();
    expect(tx.xpTransaction.create).not.toHaveBeenCalled();
    expect(tx.userXP.update).not.toHaveBeenCalled();
  });

  it("corrida perdida no unique (P2002) → null, sem erro", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await awardXp("u1", 10, "LESSON", "lesson-1")).toBeNull();
  });

  it("subiu de nível → feed social + notificação LEVEL_UP", async () => {
    tx.userXP.findUnique.mockResolvedValue({ level: 1, currentXp: 95, totalXp: 95 });

    const award = await awardXp("u1", 10, "LESSON", "lesson-1");

    expect(award).toMatchObject({ leveledUp: true, newLevel: 2 });
    expect(prisma.socialActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_sourceKey: { userId: "u1", sourceKey: "level:2" } } }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", type: "LEVEL_UP", title: "Nível 2!", link: "/perfil" }),
    });
  });

  it("respeita a preferência de notificação do usuário", async () => {
    tx.userXP.findUnique.mockResolvedValue({ level: 1, currentXp: 95, totalXp: 95 });
    vi.mocked(prisma.userNotificationSettings.findUnique).mockResolvedValue({ learningProgress: false } as never);

    await awardXp("u1", 10, "LESSON", "lesson-1");
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("valor <= 0 → null sem tocar no banco", async () => {
    expect(await awardXp("u1", 0, "LESSON", "l")).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("awardCoins", () => {
  it("premium dobra moedas e multiplica pelos boosters (regra do Web)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userRow({ isPremium: true, boosterMultiplier: 2, boosterExpiresAt: FUTURE }) as never,
    );
    tx.user.update.mockResolvedValue({ coins: 112 });

    const award = await awardCoins("u1", 3, "LESSON", "lesson-1", "Aula concluída: X");

    expect(award).toEqual({ amount: 12, description: "Aula concluída: X", multiplier: 4, balance: 112 });
    expect(tx.coinTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 12, type: "EARN", description: "Aula concluída: X (x4)" }),
    });
    expect(prisma.userWallet.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", coins: 112 },
      update: { coins: 112 },
    });
  });

  it("premium expirado não multiplica", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userRow({ isPremium: true, premiumExpiresAt: PAST }) as never,
    );
    expect((await awardCoins("u1", 3, "LESSON", "l"))?.amount).toBe(3);
  });

  it("mesma fonte duas vezes → null, saldo intacto", async () => {
    tx.coinTransaction.findUnique.mockResolvedValue({ id: "c" });
    expect(await awardCoins("u1", 3, "LESSON", "l")).toBeNull();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(prisma.userWallet.upsert).not.toHaveBeenCalled();
  });

  it("notificação COIN_EARNED com dedupe de 30 min", async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue({ id: "recente" } as never);
    await awardCoins("u1", 3, "LESSON", "l");

    expect(prisma.notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "COIN_EARNED", link: "/shop" }) }),
    );
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("erro que não é de unicidade propaga (mesmo comportamento do Web)", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("deadlock"));
    await expect(awardCoins("u1", 3, "LESSON", "l")).rejects.toThrow("deadlock");
  });
});
