import { z } from "zod";

export const applyInstructorSchema = z.object({
  motivation: z.string().min(20, "Conte-nos um pouco mais sobre sua motivação (mín. 20 caracteres)").max(2000),
  experience: z.string().min(20, "Descreva sua experiência (mín. 20 caracteres)").max(2000),
  portfolioUrl: z
    .string()
    .url("Portfólio inválido")
    .optional()
    .or(z.literal("")),
});

export type ApplyInstructorInput = z.infer<typeof applyInstructorSchema>;