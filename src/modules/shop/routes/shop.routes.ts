import { FastifyInstance } from 'fastify'
import { ShopController } from '../controller/shop.controller'
import { ShopService } from '../service/shop.service'
import { authenticate } from '../../../middlewares/authenticate'
import { asyncHandler } from '../../../lib/errors/errorHandler'

export async function shopRoutes(fastify: FastifyInstance) {
  const shopService = new ShopService()
  const shopController = new ShopController(shopService)

  fastify.get(
    '/api/v1/shop',
    { preHandler: [authenticate], schema: { summary: 'Loja', tags: ['Shop'], security: [{ session: [] }] } },
    asyncHandler(shopController.getShopState.bind(shopController)),
  )

  fastify.post(
    '/api/v1/shop/purchase',
    { preHandler: [authenticate], schema: { summary: 'Comprar item', tags: ['Shop'], security: [{ session: [] }] } },
    asyncHandler(shopController.purchaseItem.bind(shopController)),
  )

  fastify.post(
    '/api/v1/shop/equip',
    { preHandler: [authenticate], schema: { summary: 'Equipar/desquipar item', tags: ['Shop'], security: [{ session: [] }] } },
    asyncHandler(shopController.equipItem.bind(shopController)),
  )

  fastify.get(
    '/api/v1/inventory',
    { preHandler: [authenticate], schema: { summary: 'Inventário', tags: ['Shop'], security: [{ session: [] }] } },
    asyncHandler(shopController.getInventory.bind(shopController)),
  )

  fastify.post(
    '/api/v1/shop/premium/trial',
    { preHandler: [authenticate], schema: { summary: 'Ativar trial Premium (30 dias)', tags: ['Shop'], security: [{ session: [] }] } },
    asyncHandler(shopController.activatePremiumTrial.bind(shopController)),
  )
}
