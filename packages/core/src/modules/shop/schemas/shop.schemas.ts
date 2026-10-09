import { z } from 'zod'

export const purchaseSchema = z.object({
  storeItemId: z.string().min(1, 'Item inválido'),
})

export const equipSchema = z.object({
  inventoryId: z.string().min(1, 'Item inválido'),
})
