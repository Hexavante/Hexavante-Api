import { z } from "zod";

export const courseQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  courseType: z.enum(["FREE", "PAID", "PREMIUM"]).optional(),
  categoryId: z.string().optional(),
  search: z.string().optional(),
});

export const createCourseSchema = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres"),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  categoryId: z.string().min(1, "Categoria é obrigatória"),
  shortDescription: z.string().max(255).optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  coverImage: z.string().url().optional().or(z.literal("")),
  courseType: z.enum(["FREE", "PAID", "PREMIUM"]).optional().default("FREE"),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional().default("BEGINNER"),
  estimatedHours: z.coerce.number().int().positive().optional(),
  progressionType: z.enum(["FREE", "PROGRESSIVE"]).optional().default("FREE"),
});

export const updateCourseSchema = z.object({
  title: z.string().min(3).optional(),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  categoryId: z.string().min(1).optional(),
  shortDescription: z.string().max(255).optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  coverImage: z.string().url().optional().or(z.literal("")),
  courseType: z.enum(["FREE", "PAID", "PREMIUM"]).optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  estimatedHours: z.coerce.number().int().positive().optional(),
  progressionType: z.enum(["FREE", "PROGRESSIVE"]).optional(),
  status: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED", "REVISION_REQUIRED"]).optional(),
});

export type CourseQueryInput = z.infer<typeof courseQuerySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
