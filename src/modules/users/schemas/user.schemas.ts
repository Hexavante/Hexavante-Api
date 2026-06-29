import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Nome muito curto").optional(),
  username: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(30, "Máximo 30 caracteres")
    .regex(/^[a-zA-Z0-9_]+$/, "Use apenas letras, números e _")
    .optional(),
  birthDate: z.coerce
    .date({
      error: "Data de nascimento inválida",
    })
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
