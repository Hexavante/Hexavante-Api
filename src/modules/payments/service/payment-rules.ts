import { WebhookSignatureValidator, InvalidWebhookSignatureError } from 'mercadopago';
import type { PaymentStatus } from '@prisma/client';
import type { PublicPaymentStatus } from '../types/payments.types';

/**
 * Regras puras do fluxo de pagamento — sem Prisma, sem rede.
 * Mantidas separadas para teste unitário direto.
 */

/**
 * Status do Mercado Pago → enum do banco.
 * Status desconhecido vira PENDING (nunca aprova sem certeza).
 */
export function mapMpStatus(status: string | null | undefined): PaymentStatus {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'REJECTED';
    case 'cancelled':
    case 'canceled':
    case 'expired':
      return 'CANCELLED';
    case 'refunded':
    case 'charged_back':
      return 'REFUNDED';
    default:
      // pending | in_process | authorized | in_mediation | draft | desconhecido
      return 'PENDING';
  }
}

/** Enum do banco → shape público do contrato (lowercase). */
export function toPublicStatus(status: PaymentStatus): PublicPaymentStatus {
  switch (status) {
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'CANCELLED':
      return 'cancelled';
    case 'REFUNDED':
      return 'refunded';
    case 'PENDING':
    default:
      return 'pending';
  }
}

/**
 * Máquina de estados: uma notificação só é processada se a transição for
 * válida. Bloqueia "downgrade" (APPROVED/REFUNDED → PENDING/REJECTED/…), que
 * é o que torna reentregas do webhook idempotentes em nível de estado.
 */
export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return false;
  if (to === 'REFUNDED') return true; // estorno é sempre considerado
  if (to === 'APPROVED') return from !== 'REFUNDED';
  // PENDING / REJECTED / CANCELLED nunca regridem um pagamento já liquidado.
  return from !== 'APPROVED' && from !== 'REFUNDED';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Premium: extensão acumulativa.
 * - sem premium vigente (nunca teve ou expirou) → começa de `now`;
 * - premium válido no futuro → soma por cima (compra empilha).
 */
export function computePremiumExpiry(
  currentExpiry: Date | null | undefined,
  days: number,
  now: Date = new Date(),
): Date {
  const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return new Date(base.getTime() + days * MS_PER_DAY);
}

/**
 * Estorno de premium: subtrai `days` de `currentExpiry`.
 * Retorna `null` quando não há premium a reverter (sem data registrada).
 * Quem chama decide `isPremium` comparando o resultado com `now`.
 */
export function computePremiumRefund(
  currentExpiry: Date | null | undefined,
  days: number,
): Date | null {
  if (!currentExpiry) return null;
  return new Date(currentExpiry.getTime() - days * MS_PER_DAY);
}

/** Prisma P2002 (unique violation) — segunda linha de idempotência. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: unknown }).code === 'P2002';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    // Fastify só parseia json/urlencoded; um body exótico pode chegar cru.
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstString(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'bigint') return String(raw);
  return null;
}

function pick(record: Record<string, unknown> | null, path: string[]): string | null {
  let current: unknown = record;
  for (const key of path) {
    current = asRecord(current)?.[key];
  }
  return firstString(current);
}

export interface WebhookRef {
  /** `type` da notificação; ausente quando o MP não envia. */
  type: string | null;
  /** id do recurso (payment id) — buscado na API do MP antes de confiar. */
  id: string | null;
}

/**
 * Extrai `type` e `id` de qualquer formato de notificação do MP:
 * IPN clássico (`?type=payment&id=123`), webhook moderno
 * (`?type=payment&data.id=123` ou body `{ type, data: { id } }`).
 */
export function extractWebhookRef(query: unknown, body: unknown): WebhookRef {
  const q = asRecord(query);
  const b = asRecord(body);
  const type = pick(q, ['type']) ?? pick(b, ['type']);
  const id =
    pick(q, ['data', 'id']) ?? pick(q, ['id']) ?? pick(b, ['data', 'id']) ?? pick(b, ['id']);
  return { type, id };
}

/**
 * Valida `x-signature` (HMAC-SHA256 hex sobre
 * `id:{data.id};request-id:{x-request-id};ts:{ts};`) quando `MP_WEBHOOK_SECRET`
 * está setado. Falha → `false` (o chamador responde 200 e só registra warn).
 *
 * Obs.: a autenticidade REAL vem da busca na origem (`payments.get(id)` com o
 * nosso token) — a assinatura é defesa adicional contra spoofing barato.
 */
export function isValidWebhookSignature(
  headers: Record<string, string | string[] | undefined>,
  dataId: string,
  secret: string,
): boolean {
  try {
    WebhookSignatureValidator.validate({
      xSignature: headers['x-signature'],
      xRequestId: headers['x-request-id'],
      dataId,
      secret,
      // Sem janela de tolerância: reenvios do MP reassinam com ts novo, e um
      // relógio desalinhado derrubaria notificações legítimas.
    });
    return true;
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return false;
    }
    throw error;
  }
}
