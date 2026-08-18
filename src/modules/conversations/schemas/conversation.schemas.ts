import { z } from "zod";

export const createConversationSchema = z.object({
  body: z
    .object({
      recipientUserId: z.string().min(1).optional(),
      username: z.string().min(1).optional(),
    })
    .refine((data) => data.recipientUserId || data.username, {
      message: "Informe recipientUserId ou username",
    }),
});

export const sendMessageSchema = z.object({
  params: z.object({
    conversationId: z.string().min(1, "ID da conversa é obrigatório"),
  }),
  body: z.object({
    body: z.string().min(1, "A mensagem não pode estar vazia.").max(2000, "A mensagem pode ter no máximo 2000 caracteres."),
  }),
});

export const getMessagesSchema = z.object({
  params: z.object({
    conversationId: z.string().min(1, "ID da conversa é obrigatório"),
  }),
  query: z.object({
    since: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).optional().default(50),
  }),
});

export const markReadSchema = z.object({
  params: z.object({
    conversationId: z.string().min(1, "ID da conversa é obrigatório"),
  }),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>["body"];
export type SendMessageInput = z.infer<typeof sendMessageSchema>["body"];
export type GetMessagesParams = z.infer<typeof getMessagesSchema>["params"];
export type GetMessagesQuery = z.infer<typeof getMessagesSchema>["query"];
export type MarkReadParams = z.infer<typeof markReadSchema>["params"];