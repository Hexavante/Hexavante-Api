import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { prisma } from '../../../config/prisma';
import { paymentsRoutes } from '../routes/payments.routes';
import type { Payment } from '@prisma/client';

/**
 * Testes de rotas do módulo de pagamentos (instância Fastify isolada —
 * sem Redis, sem DB, sem rate-limit global).
 */

vi.mock('../../../config/prisma', () => ({
  prisma: {
    payment: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    coinTransaction: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({})),
  },
}));

// authenticate → parseSessionToken/validateSession (sem bater em Redis)
vi.mock('../../../lib/session', () => ({
  parseSessionToken: vi.fn((cookie: string | null) => (cookie ? 'session-token' : null)),
  validateSession: vi.fn(async () => ({
    user: { id: 'user_1' },
    expiresAt: new Date(Date.now() + 60_000),
  })),
}));

const AUTH_COOKIE = '__Secure-hexavante.session_token=abc';

function paymentFixture(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_1',
    userId: 'user_1',
    provider: 'mercadopago',
    mpPaymentId: null,
    mpPreferenceId: null,
    productId: 'coins_100',
    amount: 490,
    currency: 'BRL',
    coins: 100,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paidAt: new Date('2026-10-03T10:00:00.000Z'),
    raw: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('payments routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(paymentsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ banned: false } as never);
  });

  describe('GET /api/v1/payments/catalog (público)', () => {
    it('responde 200 sem sessão com packs + premium', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/payments/catalog' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.packs).toHaveLength(3);
      expect(body.packs[0]).toEqual({
        id: 'coins_100',
        coins: 100,
        priceBrl: 4.9,
        label: 'Pacote de 100 moedas',
      });
      expect(body.premium).toEqual({
        id: 'hexa_premium',
        priceBrl: 29,
        days: 30,
        label: 'Hexa ✦ Premium (30 dias)',
      });
    });
  });

  describe('POST /api/v1/payments/checkout (autenticado)', () => {
    it('sem sessão → 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/checkout',
        payload: { productId: 'coins_100' },
      });

      expect(response.statusCode).toBe(401);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('com sessão, productId inválido → 400 (validação Zod)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/checkout',
        headers: { cookie: AUTH_COOKIE },
        payload: { productId: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('com sessão, produto inexistente → 404', async () => {
      // gateway fake: o service só consulta o catálogo antes de usá-lo
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/checkout',
        headers: { cookie: AUTH_COOKIE },
        payload: { productId: 'nao_existe' },
      });

      expect(response.statusCode).toBe(404);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/payments/:paymentId (só o dono)', () => {
    it('sem sessão → 401', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/payments/pay_1' });
      expect(response.statusCode).toBe(401);
    });

    it('dono → 200 com o shape do contrato', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(paymentFixture());

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/pay_1',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'approved',
        productId: 'coins_100',
        amountBrl: 4.9,
        coins: 100,
        paidAt: '2026-10-03T10:00:00.000Z',
      });
    });

    it('não-dono → 404 (não vaza existência)', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(paymentFixture({ userId: 'user_2' }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/pay_1',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/payments/webhook (público)', () => {
    it('sem id → 200 { received: true } (nunca 5xx pro MP)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/webhook',
        payload: { foo: 'bar' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('notificação de outro tipo → 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/webhook',
        query: { type: 'merchant_order', id: '1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
    });
  });
});
