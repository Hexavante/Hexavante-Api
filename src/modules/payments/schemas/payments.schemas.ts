import { z } from 'zod';

/** POST /api/v1/payments/checkout — body. */
export const checkoutSchema = z.object({
  productId: z.string().trim().min(1, 'productId é obrigatório').max(64),
});

/** GET /api/v1/payments/:paymentId — params. */
export const paymentIdParamSchema = z.object({
  paymentId: z.string().trim().min(1).max(64),
});

export type CheckoutBody = z.infer<typeof checkoutSchema>;
export type PaymentIdParams = z.infer<typeof paymentIdParamSchema>;
