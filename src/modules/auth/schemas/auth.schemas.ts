import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('E-mail inválido').transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Informe a senha'),
});

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Use apenas letras, números e _'),
  fullName: z.string().min(2, 'Nome muito curto'),
  email: z.email('E-mail inválido').transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  birthDate: z.coerce.date({
    error: 'Data de nascimento inválida',
  }),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Token inválido'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
