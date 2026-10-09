import { z } from "zod";

const optionalApplicationText = z.string().trim().max(2000).optional().default("");

export const applyInstructorSchema = z
  .object({
    motivation: optionalApplicationText,
    experience: optionalApplicationText,
    portfolioUrl: z
      .string()
      .trim()
      .url("Portfólio inválido")
      .optional()
      .or(z.literal("")),
  })
  .transform((application) => ({
    ...application,
    // O Mobile historicamente envia apenas `motivation`. Mantemos o campo
    // persistido de experiência preenchido com o mesmo texto quando ele existe.
    experience: application.experience || application.motivation,
  }));

export type ApplyInstructorInput = z.infer<typeof applyInstructorSchema>;
