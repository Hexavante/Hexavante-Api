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

export const submitExamSchema = z.object({
  attemptId: z.string().min(1),
  answers: z.array(z.object({
    questionId: z.string().min(1),
    alternativeId: z.string().optional(),
    essayAnswer: z.string().optional(),
  })),
})
