import { z } from "zod";

export const tutorialQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  q: z.string().optional(),
  categoryId: z.string().optional(),
  sort: z.enum(["recent", "popular"]).optional().default("recent"),
});

export type TutorialQueryInput = z.infer<typeof tutorialQuerySchema>;
