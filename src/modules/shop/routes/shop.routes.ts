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
    { preHandler: [authenticate] },
    asyncHandler(shopController.getShopState.bind(shopController)),
  )

  fastify.post(
    '/api/v1/shop/purchase',
    { preHandler: [authenticate] },
    asyncHandler(shopController.purchaseItem.bind(shopController)),
  )

  fastify.post(
    '/api/v1/shop/equip',
    { preHandler: [authenticate] },
    asyncHandler(shopController.equipItem.bind(shopController)),
  )

  fastify.get(
    '/api/v1/inventory',
    { preHandler: [authenticate] },
    asyncHandler(shopController.getInventory.bind(shopController)),
  )
}
