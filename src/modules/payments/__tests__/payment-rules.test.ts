import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canTransition,
  computePremiumExpiry,
  computePremiumRefund,
  extractWebhookRef,
  isUniqueViolation,
  isValidWebhookSignature,
  mapMpStatus,
  toPublicStatus,
} from '../service/payment-rules';
import {
  COIN_PACKS,
  PREMIUM_PRODUCT,
  centsToBrl,
  findCatalogProduct,
  getPaymentsCatalog,
  priceToCents,
} from '../../../config/commerce';

/**
 * Regras puras do módulo de pagamentos — sem Prisma, sem rede.
 */
describe('payments: regras de status', () => {
  it('mapeia os status do Mercado Pago para o enum do banco', () => {
    expect(mapMpStatus('approved')).toBe('APPROVED');
    expect(mapMpStatus('rejected')).toBe('REJECTED');
    expect(mapMpStatus('cancelled')).toBe('CANCELLED');
    expect(mapMpStatus('canceled')).toBe('CANCELLED');
    expect(mapMpStatus('expired')).toBe('CANCELLED');
    expect(mapMpStatus('refunded')).toBe('REFUNDED');
    expect(mapMpStatus('charged_back')).toBe('REFUNDED');
    expect(mapMpStatus('pending')).toBe('PENDING');
    expect(mapMpStatus('in_process')).toBe('PENDING');
    expect(mapMpStatus('authorized')).toBe('PENDING');
    expect(mapMpStatus('in_mediation')).toBe('PENDING');
    // desconhecido/nulo nunca aprova por acidente
    expect(mapMpStatus('algo_novo')).toBe('PENDING');
    expect(mapMpStatus(null)).toBe('PENDING');
    expect(mapMpStatus(undefined)).toBe('PENDING');
    expect(mapMpStatus('APPROVED')).toBe('APPROVED'); // case-insensitive
  });

  it('expõe o status no shape público do contrato (lowercase)', () => {
    expect(toPublicStatus('PENDING')).toBe('pending');
    expect(toPublicStatus('APPROVED')).toBe('approved');
    expect(toPublicStatus('REJECTED')).toBe('rejected');
    expect(toPublicStatus('CANCELLED')).toBe('cancelled');
    expect(toPublicStatus('REFUNDED')).toBe('refunded');
    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED'] as const) {
      expect(mapMpStatus(toPublicStatus(status))).toBe(status);
    }
  });

  it('máquina de estados: não regride pagamento liquidado nem repete aprovação', () => {
    expect(canTransition('PENDING', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING', 'REJECTED')).toBe(true);
    expect(canTransition('REJECTED', 'PENDING')).toBe(true);
    expect(canTransition('APPROVED', 'REFUNDED')).toBe(true);

    // reentrega do webhook (idempotência em nível de estado)
    expect(canTransition('APPROVED', 'APPROVED')).toBe(false);
    expect(canTransition('REFUNDED', 'REFUNDED')).toBe(false);
    expect(canTransition('PENDING', 'PENDING')).toBe(false);

    // downgrade bloqueado
    expect(canTransition('APPROVED', 'PENDING')).toBe(false);
    expect(canTransition('APPROVED', 'REJECTED')).toBe(false);
    expect(canTransition('APPROVED', 'CANCELLED')).toBe(false);
    expect(canTransition('REFUNDED', 'APPROVED')).toBe(false);
  });
});

describe('payments: extensão de premium', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');
  const day = 24 * 60 * 60 * 1000;

  it('novo usuário (sem premium) começa agora + 30 dias', () => {
    expect(computePremiumExpiry(null, 30, now).getTime()).toBe(now.getTime() + 30 * day);
    expect(computePremiumExpiry(undefined, 30, now).getTime()).toBe(now.getTime() + 30 * day);
  });

  it('já premium no futuro: acumula por cima (compra empilha)', () => {
    const current = new Date(now.getTime() + 10 * day);
    expect(computePremiumExpiry(current, 30, now).getTime()).toBe(now.getTime() + 40 * day);
  });

  it('premium expirado: reinicia a contagem a partir de agora', () => {
    const expired = new Date(now.getTime() - 5 * day);
    expect(computePremiumExpiry(expired, 30, now).getTime()).toBe(now.getTime() + 30 * day);
  });

  it('estorno subtrai 30 dias; sem registro → null', () => {
    const current = new Date(now.getTime() + 60 * day);
    expect(computePremiumRefund(current, 30)?.getTime()).toBe(now.getTime() + 30 * day);

    const expiringSoon = new Date(now.getTime() + 10 * day);
    expect(computePremiumRefund(expiringSoon, 30)?.getTime()).toBe(now.getTime() - 20 * day);

    expect(computePremiumRefund(null, 30)).toBeNull();
    expect(computePremiumRefund(undefined, 30)).toBeNull();
  });
});

describe('payments: catálogo (shape do contrato)', () => {
  it('devolve packs[] e premium com os campos que o front valida', () => {
    const catalog = getPaymentsCatalog();

    expect(Array.isArray(catalog.packs)).toBe(true);
    expect(catalog.packs).toEqual(COIN_PACKS);
    for (const pack of catalog.packs) {
      expect(typeof pack.id).toBe('string');
      expect(typeof pack.coins).toBe('number');
      expect(typeof pack.priceBrl).toBe('number');
      expect(typeof pack.label).toBe('string');
    }

    expect(catalog.premium).toEqual({
      id: 'hexa_premium',
      priceBrl: 29.0,
      days: 30,
      label: 'Hexa ✦ Premium (30 dias)',
    });
    expect(catalog.premium.id).toBe(PREMIUM_PRODUCT.id);
  });

  it('resolve produtos conhecidos e rejeita desconhecidos', () => {
    expect(findCatalogProduct('coins_100')).toMatchObject({ kind: 'pack' });
    expect(findCatalogProduct('hexa_premium')).toMatchObject({ kind: 'premium' });
    expect(findCatalogProduct('produto_inexistente')).toBeNull();
    expect(findCatalogProduct('')).toBeNull();
  });

  it('converte preços em centavos (amount do banco) e volta para BRL', () => {
    expect(priceToCents(4.9)).toBe(490);
    expect(priceToCents(19.9)).toBe(1990);
    expect(priceToCents(39.9)).toBe(3990);
    expect(priceToCents(29.0)).toBe(2900);
    expect(centsToBrl(490)).toBe(4.9);
    expect(centsToBrl(2900)).toBe(29);
  });
});

describe('payments: extração do webhook', () => {
  it('lê IPN clássico (?type=payment&id=123)', () => {
    expect(extractWebhookRef({ type: 'payment', id: '123' }, undefined)).toEqual({
      type: 'payment',
      id: '123',
    });
  });

  it('lê data.id na query e no body', () => {
    expect(extractWebhookRef({ type: 'payment', data: { id: 456 } }, undefined)).toEqual({
      type: 'payment',
      id: '456',
    });
    expect(extractWebhookRef(undefined, { type: 'payment', data: { id: '789' } })).toEqual({
      type: 'payment',
      id: '789',
    });
  });

  it('lê body JSON crudo e devolve null quando não há id', () => {
    expect(extractWebhookRef(undefined, '{"type":"payment","data":{"id":"99"}}')).toEqual({
      type: 'payment',
      id: '99',
    });
    expect(extractWebhookRef({}, {}).id).toBeNull();
    expect(extractWebhookRef({ type: 'merchant_order' }, undefined).id).toBeNull();
  });
});

describe('payments: assinatura x-signature', () => {
  const secret = 'whsec_test_123';
  const dataId = '123456789';
  const requestId = 'req-abc';
  const ts = '1791043200';

  function sign(value: string, id = dataId): string {
    const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
    return createHmac('sha256', value).update(manifest).digest('hex');
  }

  it('aceita assinatura válida (HMAC-SHA256 hex sobre o manifest)', () => {
    const headers = {
      'x-signature': `ts=${ts},v1=${sign(secret)}`,
      'x-request-id': requestId,
    };
    expect(isValidWebhookSignature(headers, dataId, secret)).toBe(true);
  });

  it('rejeita assinatura com segredo errado', () => {
    const headers = {
      'x-signature': `ts=${ts},v1=${sign('outro_segredo')}`,
      'x-request-id': requestId,
    };
    expect(isValidWebhookSignature(headers, dataId, secret)).toBe(false);
  });

  it('rejeita id diferente do assinado (manifest trocado)', () => {
    const headers = {
      'x-signature': `ts=${ts},v1=${sign(secret)}`,
      'x-request-id': requestId,
    };
    expect(isValidWebhookSignature(headers, 'outro-id', secret)).toBe(false);
  });

  it('rejeita header ausente ou malformado', () => {
    expect(isValidWebhookSignature({}, dataId, secret)).toBe(false);
    expect(isValidWebhookSignature({ 'x-signature': 'garbage' }, dataId, secret)).toBe(false);
    expect(isValidWebhookSignature({ 'x-signature': `ts=${ts}` }, dataId, secret)).toBe(false);
  });

  it('rejeita request-id diferente do assinado', () => {
    const headers = {
      'x-signature': `ts=${ts},v1=${sign(secret)}`,
      'x-request-id': 'outro-request',
    };
    expect(isValidWebhookSignature(headers, dataId, secret)).toBe(false);
  });
});

describe('payments: isUniqueViolation', () => {
  it('reconhece P2002 e ignora outros erros', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });
});
