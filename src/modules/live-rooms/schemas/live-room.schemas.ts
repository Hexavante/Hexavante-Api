import { z } from "zod";

export const createRoomSchema = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres").max(200),
  description: z.string().max(2000).optional(),
  courseId: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  videoProvider: z.string().optional(),
  scheduledAt: z.coerce.date(),
  maxParticipants: z.coerce.number().int().positive().optional(),
});

export const updateRoomSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  courseId: z.string().optional().or(z.literal("")),
  videoUrl: z.string().url().optional().or(z.literal("")),
  videoProvider: z.string().optional().or(z.literal("")),
  scheduledAt: z.coerce.date().optional(),
  maxParticipants: z.coerce.number().int().optional(),
});

export const sendMessageSchema = z.object({
  message: z.string().trim().min(1, "Mensagem vazia").max(1000),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;