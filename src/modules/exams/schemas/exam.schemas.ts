import { z } from 'zod'

const examTypeEnum = z.enum(['ENEM', 'VESTIBULAR', 'TECNOLOGIA'])

export const examQuerySchema = z.object({
  tipo: examTypeEnum.optional(),
  q: z.string().optional(),
  sort: z.enum(['recent', 'popular']).optional(),
})

export const historyQuerySchema = z.object({
  tipo: examTypeEnum.optional(),
  page: z.coerce.number().int().positive().optional(),
})
