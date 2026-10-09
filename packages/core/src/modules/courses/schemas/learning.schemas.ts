import { z } from "zod";

export const saveNoteSchema = z.object({
  content: z
    .string()
    .max(5000, "A nota pode ter no máximo 5.000 caracteres.")
    .default(""),
});

export type SaveNoteInput = z.infer<typeof saveNoteSchema>;