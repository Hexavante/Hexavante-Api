import { prisma } from '../../../config/prisma'
import { BadRequestError, NotFoundError } from '../../../lib/errors/AppError'
import type { ShopItemView, ShopState, InventoryEntry } from '../types/shop.types'

type OwnershipStatus = 'available' | 'owned_permanent' | 'active_temporary' | 'expired_temporary'

function getOwnershipStatus(
  isPermanent: boolean,
  entry?: { isEquipped: boolean; expiresAt: Date | null } | null,
): OwnershipStatus {
  if (!entry) return 'available'
  if (isPermanent) return 'owned_permanent'
  if (!entry.expiresAt || entry.expiresAt > new Date()) return 'active_temporary'
  return 'expired_temporary'
}

export class ShopService {
  async getShopState(userId: string): Promise<ShopState> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        coins: true,
        isPremium: true,
        premiumExpiresAt: true,
        boosterMultiplier: true,
        boosterExpiresAt: true,
      },
    })

    if (!user) throw new NotFoundError('Usuário não encontrado')

    const [storeItems, userInventory, coinHistory] = await Promise.all([
      prisma.storeItem.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.userInventory.findMany({
        where: { userId },
        include: { storeItem: true },
      }),
      prisma.coinTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    // Expira booster vencido (espelha clearExpiredBooster do web)
    if (user.boosterExpiresAt && user.boosterExpiresAt < new Date()) {
      await prisma.user.update({
        where: { id: userId },
        data: { boosterMultiplier: 1.0, boosterExpiresAt: null },
      })
      user.boosterMultiplier = 1.0
      user.boosterExpiresAt = null
    }

    const inventoryMap = new Map(userInventory.map((i) => [i.storeItemId, i]))

    const items: ShopItemView[] = storeItems.map((item) => {
      const entry = inventoryMap.get(item.id)
      return {
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        cost: item.cost,
        category: item.category,
        imageUrl: item.imageUrl,
        isPremiumOnly: item.isPremiumOnly,
        isPermanent: item.isPermanent,
        metadata: item.metadata,
        ownershipStatus: getOwnershipStatus(item.isPermanent, entry),
        inventoryId: entry?.id ?? null,
        isEquipped: entry?.isEquipped ?? false,
        expiresAt: entry?.expiresAt?.toISOString() ?? null,
      }
    })

    const inventory: InventoryEntry[] = userInventory.map((entry) => ({
      id: entry.id,
      storeItemId: entry.storeItemId,
      isEquipped: entry.isEquipped,
      purchasedAt: entry.purchasedAt.toISOString(),
      expiresAt: entry.expiresAt?.toISOString() ?? null,
      item: entry.storeItem,
    }))

    const boosterActive =
      user.boosterExpiresAt != null &&
      user.boosterExpiresAt > new Date() &&
      user.boosterMultiplier > 1

    return {
      items,
      inventory,
      coins: user.coins,
      premium: user.isPremium,
      premiumExpiresAt: user.premiumExpiresAt?.toISOString() ?? null,
      coinHistory,
      booster: {
        active: boosterActive,
        multiplier: boosterActive ? user.boosterMultiplier : 1,
        expiresAt: boosterActive ? user.boosterExpiresAt!.toISOString() : null,
      },
    }
  }

  async purchaseItem(userId: string, storeItemId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { coins: true, isPremium: true },
    })
    if (!user) throw new NotFoundError('Usuário não encontrado')

    const item = await prisma.storeItem.findUnique({ where: { id: storeItemId } })
    if (!item || !item.isActive) throw new NotFoundError('Item não encontrado')

    if (item.isPremiumOnly && !user.isPremium) {
      throw new BadRequestError('Este item é exclusivo para assinantes Premium')
    }

    const existing = await prisma.userInventory.findUnique({
      where: { userId_storeItemId: { userId, storeItemId } },
    })

    if (existing && item.isPermanent) {
      throw new BadRequestError('Você já possui este item')
    }

    if (user.coins < item.cost) {
      throw new BadRequestError('Moedas insuficientes')
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { coins: { decrement: item.cost } },
      })

      await tx.coinTransaction.create({
        data: {
          userId,
          amount: item.cost,
          type: 'SPEND',
          source: 'SHOP_PURCHASE',
          sourceId: item.id,
          description: `Compra: ${item.name}`,
        },
      })

      if (existing && !item.isPermanent) {
        await tx.userInventory.update({
          where: { id: existing.id },
          data: {
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            isEquipped: false,
          },
        })
      } else {
        await tx.userInventory.create({
          data: {
            userId,
            storeItemId,
            expiresAt: item.isPermanent ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })
      }
    })

    // Efeitos pós-compra por categoria (espelha applyTemporaryPurchaseEffects do web)
    const meta = (item.metadata ?? {}) as {
      multiplier?: number
      durationHours?: number
      durationDays?: number
      passType?: string
    }
    if (item.category === 'BOOSTER') {
      const hours = Math.max(1, meta.durationHours ?? (meta.durationDays ? meta.durationDays * 24 : 24))
      await prisma.user.update({
        where: { id: userId },
        data: {
          boosterMultiplier: meta.multiplier ?? 2,
          boosterExpiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
        },
      })
    }
    if (item.category === 'PASS' && meta.passType === 'premium_exams') {
      const days = Math.max(1, meta.durationDays ?? 7)
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { isPremium: true, premiumExpiresAt: true },
      })
      const base =
        current?.isPremium && current.premiumExpiresAt && current.premiumExpiresAt > new Date()
          ? current.premiumExpiresAt.getTime()
          : Date.now()
      await prisma.user.update({
        where: { id: userId },
        data: {
          isPremium: true,
          premiumExpiresAt: new Date(base + days * 24 * 60 * 60 * 1000),
        },
      })
    }
  }

  async equipItem(userId: string, inventoryId: string): Promise<void> {
    const entry = await prisma.userInventory.findUnique({
      where: { id: inventoryId },
      include: { storeItem: true },
    })

    if (!entry) throw new NotFoundError('Item não encontrado no inventário')
    if (entry.userId !== userId) throw new BadRequestError('Item não pertence a este usuário')

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      throw new BadRequestError('Este item expirou')
    }

    const { category } = entry.storeItem

    const isBoosterOrPass = category === 'BOOSTER' || category === 'PASS' || category === 'REVIEW_PACK'
    if (isBoosterOrPass) {
      throw new BadRequestError('Este tipo de item não pode ser equipado')
    }

    await prisma.$transaction(async (tx) => {
      await tx.userInventory.updateMany({
        where: {
          userId,
          isEquipped: true,
          storeItem: { category },
        },
        data: { isEquipped: false },
      })

      await tx.userInventory.update({
        where: { id: inventoryId },
        data: { isEquipped: !entry.isEquipped },
      })
    })
  }

  async getUserInventory(userId: string): Promise<InventoryEntry[]> {
    const inventory = await prisma.userInventory.findMany({
      where: { userId },
      include: { storeItem: true },
      orderBy: { purchasedAt: 'desc' },
    })

    return inventory.map((entry) => ({
      id: entry.id,
      storeItemId: entry.storeItemId,
      isEquipped: entry.isEquipped,
      purchasedAt: entry.purchasedAt.toISOString(),
      expiresAt: entry.expiresAt?.toISOString() ?? null,
      item: entry.storeItem,
    }))
  }

  // Trial Premium de 30 dias (mesma regra do web: activatePremiumTrial)
  async activatePremiumTrial(userId: string): Promise<{ premium: boolean; premiumExpiresAt: string | null }> {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isPremium: true, premiumExpiresAt: expiresAt },
      select: { isPremium: true, premiumExpiresAt: true },
    })

    return {
      premium: user.isPremium,
      premiumExpiresAt: user.premiumExpiresAt?.toISOString() ?? null,
    }
  }
}
