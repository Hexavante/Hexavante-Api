import { z } from "zod";

export const permissionSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-z]+\.[a-z]+$/,
      "Deve seguir o padrão 'recurso.acao' (ex: course.create)",
    ),
  resource: z.string().min(1),
  action: z.string().min(1),
  description: z.string().optional(),
});

export const roleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const assignPermissionSchema = z.object({
  userId: z.string().uuid(),
  permissionId: z.string().uuid(),
});

export type PermissionInput = z.infer<typeof permissionSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type AssignPermissionInput = z.infer<typeof assignPermissionSchema>;
