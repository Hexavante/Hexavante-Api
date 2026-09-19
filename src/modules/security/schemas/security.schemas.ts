import { z } from "zod";

export const verifyDeviceSchema = z.object({
  verificationId: z.string().min(1, "Identificador inválido"),
  code: z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
  deviceUa: z.string().max(500).optional(),
  deviceIp: z.string().max(45).optional(),
});

export const resendDeviceCodeSchema = z.object({
  verificationId: z.string().min(1, "Identificador inválido"),
});

export const presenceSchema = z.object({
  status: z.enum(["ONLINE", "AWAY", "STUDYING", "DND", "INVISIBLE"]),
});

export const heartbeatSchema = z.object({
  status: z.enum(["ONLINE", "AWAY", "STUDYING", "DND", "INVISIBLE"]).optional(),
});

export type VerifyDeviceInput = z.infer<typeof verifyDeviceSchema>;
export type PresenceInput = z.infer<typeof presenceSchema>;
