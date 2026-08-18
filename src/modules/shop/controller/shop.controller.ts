import { FastifyRequest, FastifyReply } from 'fastify'
import { ShopService } from '../service/shop.service'
import { purchaseSchema, equipSchema } from '../schemas/shop.schemas'
import { validateBody } from '../../../lib/validation/validate'

export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  async getShopState(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const state = await this.shopService.getShopState(userId)
    reply.send(state)
  }

  async purchaseItem(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(purchaseSchema)(request, reply)
    const userId = request.user!.id
    const { storeItemId } = request.body as { storeItemId: string }
    await this.shopService.purchaseItem(userId, storeItemId)
    reply.status(201).send({ success: true })
  }

  async equipItem(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(equipSchema)(request, reply)
    const userId = request.user!.id
    const { inventoryId } = request.body as { inventoryId: string }
    await this.shopService.equipItem(userId, inventoryId)
    reply.send({ success: true })
  }

  async getInventory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const inventory = await this.shopService.getUserInventory(userId)
    reply.send({ items: inventory })
  }
}
