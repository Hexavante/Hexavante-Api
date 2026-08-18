import { z } from 'zod'

export const examQuerySchema = z.object({
  tipo: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(['recent', 'popular']).optional(),
})

export const historyQuerySchema = z.object({
  tipo: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
})
