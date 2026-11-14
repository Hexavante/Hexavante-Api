import { prisma } from "../../../config/prisma";
import { premiumCoinMultiplier } from "./rules";

/**
 * Multiplicadores de recompensa — porta fiel de `getTotalRewardMultiplier`
 * (`Hexavante/src/services/booster.service.ts`) e `getGlobalBoosterState`
 * (`platform-settings.service.ts`) do Web.
 *
 * - XP usa `booster` (pessoal × global).
 * - Moedas usam `total` (premium × pessoal × global).
 */
export interface RewardMultiplier {
  total: number;
  premium: number;
  booster: number;
  global: number;
  boosterExpiresAt: Date | null;
}

type GlobalBoosterValue = { multiplier?: number; expiresAt?: string };

const GLOBAL_CACHE_TTL_MS = 30_000;
let globalCache: { multiplier: number; at: number } | null = null;

export async function getGlobalBoosterMultiplier(): Promise<number> {
  if (globalCache && Date.now() - globalCache.at < GLOBAL_CACHE_TTL_MS) {
    return globalCache.multiplier;
  }
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: "global_booster" } });
    const value = (row?.value ?? {}) as GlobalBoosterValue;
    const expiresAt = value.expiresAt ?? null;
    const active = Boolean(expiresAt && new Date(expiresAt) > new Date());
    const multiplier = active && value.multiplier && value.multiplier > 1 ? value.multiplier : 1;
    globalCache = { multiplier, at: Date.now() };
    return multiplier;
  } catch {
    return 1;
  }
}

/** Só para testes. */
export function resetGlobalBoosterCache(): void {
  globalCache = null;
}

/**
 * Booster pessoal ativo. O Web também zera o booster expirado no banco ao
 * ler; aqui o efeito é o mesmo para o cálculo (expirado → 1) sem escrita.
 */
function personalBooster(user: { boosterMultiplier: number; boosterExpiresAt: Date | null } | null) {
  if (!user?.boosterExpiresAt || user.boosterExpiresAt <= new Date()) {
    return { multiplier: 1, expiresAt: null };
  }
  return {
    multiplier: user.boosterMultiplier > 1 ? user.boosterMultiplier : 1,
    expiresAt: user.boosterExpiresAt,
  };
}

export async function getTotalRewardMultiplier(userId: string): Promise<RewardMultiplier> {
  const [user, global] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        premiumExpiresAt: true,
        boosterMultiplier: true,
        boosterExpiresAt: true,
      },
    }),
    getGlobalBoosterMultiplier(),
  ]);

  const premium = user ? premiumCoinMultiplier(user) : 1;
  const booster = personalBooster(user);
  const combinedBooster = booster.multiplier * global;

  return {
    total: premium * combinedBooster,
    premium,
    booster: combinedBooster,
    global,
    boosterExpiresAt: booster.expiresAt,
  };
}
