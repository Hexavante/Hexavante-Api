import type { PaymentStatus } from '@prisma/client';
import type { PaymentsCatalog } from '../../../config/commerce';

/**
 * Tipos do módulo de pagamentos (Mercado Pago).
 *
 * Contrato fixo com o front (web `src/lib/payments.ts` e landing
 * `coin-shop.tsx`) — não mudar sem reportar ao coordenador.
 */

/** Status como exposto na API (lowercase do enum do banco). */
export type PublicPaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';

export interface CheckoutResult {
  checkoutUrl: string;
  paymentId: string;
}

export interface PaymentStatusView {
  status: PublicPaymentStatus;
  productId: string;
  amountBrl: number;
  coins: number;
  paidAt: string | null;
}

/** Preferência criada no checkout Pro. */
export interface MpPreferenceInput {
  externalReference: string;
  title: string;
  unitPriceBrl: number;
  notificationUrl: string;
  returnUrl: string;
}

export interface MpPreferenceResult {
  preferenceId: string | null;
  checkoutUrl: string;
}

/** Pagamento do MP normalizado (fonte da verdade vinda da API do MP). */
export interface MpPaymentSnapshot {
  id: string;
  status: string;
  statusDetail: string | null;
  externalReference: string | null;
  transactionAmount: number | null;
  dateApproved: string | null;
  /** Payload completo retornado pelo MP (serializado em `payments.raw`). */
  raw: Record<string, unknown>;
}

/**
 * Porta do gateway Mercado Pago. Isolada num interface para os testes
 * injetarem um fake sem tocar na rede.
 */
export interface MpGateway {
  createPreference(input: MpPreferenceInput): Promise<MpPreferenceResult>;
  getPayment(id: string): Promise<MpPaymentSnapshot>;
}

export type MpGatewayFactory = () => MpGateway;

/** Entrada crua do webhook (Fastify não garante shape do MP). */
export interface WebhookInput {
  query: unknown;
  body: unknown;
  /** Headers em minúsculas (Fastify normaliza). */
  headers: Record<string, string | string[] | undefined>;
}

export type WebhookOutcome =
  | { handled: false; reason: string }
  | {
      handled: true;
      paymentId: string;
      status: PublicPaymentStatus;
      /** `true` quando ESTA chamada concedeu crédito (moedas/premium). */
      credited: boolean;
    };

export type { PaymentsCatalog, PaymentStatus };
