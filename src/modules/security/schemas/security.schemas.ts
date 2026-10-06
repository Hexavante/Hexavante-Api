import { z } from "zod";

export const verifyDeviceSchema = z.object({
  verificationId: z.string().min(1, "Identificador inválido"),
  code: z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
  deviceUa: z.string().max(500).optional(),
  deviceIp: z.string().max(45).optional(),
  // P1-6: mesmo deviceId do login — amarra a verificação ao mesmo
  // identificador estável. Opt-in; sem ele vale o fingerprint legado.
  deviceId: z.string().max(128).optional(),
});

export const resendDeviceCodeSchema = z.object({
  verificationId: z.string().min(1, "Identificador inválido"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("E-mail inválido").transform((v) => v.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  verificationId: z.string().min(1, "Identificador inválido"),
  code: z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
});

export const presenceSchema = z.object({
  status: z.enum(["ONLINE", "AWAY", "STUDYING", "DND", "INVISIBLE"]),
});

export const heartbeatSchema = z.object({
  status: z.enum(["ONLINE", "AWAY", "STUDYING", "DND", "INVISIBLE"]).optional(),
});

export type VerifyDeviceInput = z.infer<typeof verifyDeviceSchema>;
export type PresenceInput = z.infer<typeof presenceSchema>;
