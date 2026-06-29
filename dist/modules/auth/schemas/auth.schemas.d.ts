import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodEmail, z.ZodTransform<string, string>>;
    password: z.ZodString;
}, z.core.$strip>;
export declare const registerSchema: z.ZodObject<{
    username: z.ZodString;
    fullName: z.ZodString;
    email: z.ZodPipe<z.ZodEmail, z.ZodTransform<string, string>>;
    password: z.ZodString;
    birthDate: z.ZodCoercedDate<unknown>;
}, z.core.$strip>;
export declare const refreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, z.core.$strip>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
//# sourceMappingURL=auth.schemas.d.ts.map