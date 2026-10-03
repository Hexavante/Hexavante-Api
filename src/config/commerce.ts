import { InternalServerError } from '../lib/errors/AppError';
import { logger } from './logger';

/**
 * Catálogo e configuração de comércio (Hexa Premium + pacotes de moedas).
 *
 * Fonte ÚNICA de preços/ids: o web (`src/lib/payments.ts`) e a landing
 * (`coin-shop.tsx`) consomem `/api/v1/payments/catalog` — nunca hardcoded.
 * Preços são provisórios até confirmação do usuário; edite aqui.
 */

export interface CoinPack {
  id: string;
  coins: number;
  priceBrl: number;
  label: string;
}

export interface PremiumProduct {
  id: string;
  priceBrl: number;
  days: number;
  label: string;
}

/** productId fixo do plano premium (contrato com o front). */
export const PREMIUM_PRODUCT_ID = 'hexa_premium';

export const PREMIUM_PRODUCT: PremiumProduct = {
  id: PREMIUM_PRODUCT_ID,
  priceBrl: 29.0,
  days: 30,
  label: 'Hexa ✦ Premium (30 dias)',
};

export const COIN_PACKS: CoinPack[] = [
  { id: 'coins_100', coins: 100, priceBrl: 4.9, label: 'Pacote de 100 moedas' },
  { id: 'coins_500', coins: 500, priceBrl: 19.9, label: 'Pacote de 500 moedas' },
  { id: 'coins_1200', coins: 1200, priceBrl: 39.9, label: 'Pacote de 1.200 moedas' },
];

export interface PaymentsCatalog {
  packs: CoinPack[];
  premium: PremiumProduct;
}

/** Shape público do catálogo (contrato GET /api/v1/payments/catalog). */
export function getPaymentsCatalog(): PaymentsCatalog {
  return {
    packs: COIN_PACKS.map((pack) => ({ ...pack })),
    premium: { ...PREMIUM_PRODUCT },
  };
}

export type CatalogProduct =
  | { kind: 'pack'; pack: CoinPack }
  | { kind: 'premium'; premium: PremiumProduct };

/** Resolve um `productId` do checkout; `null` quando não existe no catálogo. */
export function findCatalogProduct(productId: string): CatalogProduct | null {
  const pack = COIN_PACKS.find((candidate) => candidate.id === productId);
  if (pack) return { kind: 'pack', pack };
  if (PREMIUM_PRODUCT.id === productId) return { kind: 'premium', premium: PREMIUM_PRODUCT };
  return null;
}

/** Preço em reais → centavos (coluna `payments.amount`). */
export function priceToCents(priceBrl: number): number {
  return Math.round(priceBrl * 100);
}

/** Centavos (banco) → reais (`amountBrl` do contrato de status). */
export function centsToBrl(amountCents: number): number {
  return amountCents / 100;
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

/** Token sandbox do Mercado Pago, ou `null` se a env estiver ausente. */
export function getMpAccessToken(): string | null {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  return token ? token : null;
}

/**
 * Exige o token para chamadas ao MP. Falha COM mensagem clara no log (pt-BR)
 * e 500 no request — nunca derruba o boot (a env é lida sob demanda).
 */
export function requireMpAccessToken(): string {
  const token = getMpAccessToken();
  if (!token) {
    logger.error(
      { env: 'MP_ACCESS_TOKEN' },
      'Mercado Pago não configurado: env MP_ACCESS_TOKEN ausente — checkout indisponível até a env ser definida',
    );
    throw new InternalServerError(
      'Pagamento indisponível: credencial do Mercado Pago não configurada no servidor',
    );
  }
  return token;
}

/** Segredo do webhook (opcional) — usado para validar o header `x-signature`. */
export function getMpWebhookSecret(): string | null {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

/** Base do app (back_urls do checkout Pro). */
export function getAppBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://app.hexavante.com.br';
  return base.replace(/\/+$/, '');
}

/** Para onde o MP devolve o comprador após pagar/cancelar. */
export function getReturnUrl(): string {
  return `${getAppBaseUrl()}/pagamento/retorno`;
}

/**
 * URL fixa que recebe as notificações do MP.
 * (Não é URL de ambiente: é o endpoint público desta API em produção.)
 */
export const MP_NOTIFICATION_URL = 'https://api.hexavante.com.br/api/v1/payments/webhook';
