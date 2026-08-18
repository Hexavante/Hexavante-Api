import { z } from 'zod'

export const createDiscussionSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(120),
  body: z.string().min(1, 'Conteúdo é obrigatório').max(4000),
  tags: z.array(z.string()).max(3).optional(),
})

export const addCommentSchema = z.object({
  content: z.string().min(1, 'Comentário é obrigatório').max(500),
})

export const reactSchema = z.object({
  type: z.enum(['CLAP', 'FIRE', 'IDEA']),
})

export const reportSchema = z.object({
  reason: z.enum(['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER']),
  details: z.string().max(500).optional(),
})
