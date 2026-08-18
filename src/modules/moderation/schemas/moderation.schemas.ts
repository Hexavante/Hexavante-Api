import { z } from "zod";

export const moderationActionSchema = z.object({
  reason: z
    .string()
    .min(3, "A razão deve ter pelo menos 3 caracteres")
    .max(500, "A razão pode ter no máximo 500 caracteres"),
  durationHours: z
    .number()
    .int()
    .min(1, "A duração deve ser de pelo menos 1 hora")
    .max(24 * 365, "A duração máxima é de 1 ano")
    .optional(),
});

export type ModerationActionInput = z.infer<typeof moderationActionSchema>;