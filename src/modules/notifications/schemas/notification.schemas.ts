import { z } from "zod";

export const listNotificationsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(20),
    unreadOnly: z.coerce.boolean().optional().default(false),
  }),
});

export const markReadSchema = z.object({
  params: z.object({
    id: z.string().min(1, "ID da notificação é obrigatório"),
  }),
});

export const markAllReadSchema = z.object({});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>["query"];
export type MarkReadParams = z.infer<typeof markReadSchema>["params"];