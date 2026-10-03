import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../config/prisma';
import { InternalServerError, NotFoundError } from '../../../lib/errors/AppError';
import { PaymentsService } from '../service/payments.service';
import type {
  MpGateway,
  MpPaymentSnapshot,
  MpPreferenceInput,
  MpPreferenceResult,
} from '../types/payments.types';
import type { Payment } from '@prisma/client';

/**
 * Mock do Prisma (módulo `config/prisma` substituído inteiro — nada de DB).
 * `__tx` expõe os mocks do callback de `prisma.$transaction`.
 */
vi.mock('../../../config/prisma', () => {
  const tx = {
    payment: { updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    coinTransaction: { findUnique: vi.fn(), create: vi.fn() },
  };
  return {
    prisma: {
      payment: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      user: tx.user,
      coinTransaction: tx.coinTransaction,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
    },
  };
});

type TxMock = {
  payment: { updateMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  coinTransaction: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

const tx = (prisma as unknown as { __tx: TxMock }).__tx;

const ORIGINAL_MP_ENV = {
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_local_1',
    userId: 'user_1',
    provider: 'mercadopago',
    mpPaymentId: null,
    mpPreferenceId: null,
    productId: 'coins_500',
    amount: 1990,
    currency: 'BRL',
    coins: 500,
    status: 'PENDING',
    statusDetail: null,
    paidAt: null,
    raw: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

function makeMpPayment(overrides: Partial<MpPaymentSnapshot> = {}): MpPaymentSnapshot {
  return {
    id: 'mp_987',
    status: 'approved',
    statusDetail: 'accredited',
    externalReference: 'pay_local_1',
    transactionAmount: 19.9,
    dateApproved: '2026-10-03T10:00:00.000Z',
    raw: { id: 'mp_987', status: 'approved' },
    ...overrides,
  };
}

function makeGateway(): MpGateway & {
  createPreference: ReturnType<typeof vi.fn>;
  getPayment: ReturnType<typeof vi.fn>;
} {
  return {
    createPreference: vi.fn(
      async (_input: MpPreferenceInput): Promise<MpPreferenceResult> => ({
        preferenceId: 'pref_mp_1',
        checkoutUrl: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref=pref_mp_1',
      }),
    ),
    getPayment: vi.fn(async (id: string): Promise<MpPaymentSnapshot> => makeMpPayment({ id })),
  };
}

function webhookInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    query: { type: 'payment', id: 'mp_987' },
    body: undefined,
    headers: {} as Record<string, string | string[] | undefined>,
    ...overrides,
  };
}

describe('PaymentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.MP_ACCESS_TOKEN = 'TEST-00000000-00000000-00000000-00000000';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.hexavante.com.br';

    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: unknown) => (fn as (t: TxMock) => Promise<unknown>)(tx),
    );
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findUnique.mockResolvedValue(null);
    tx.user.update.mockResolvedValue({});
    tx.coinTransaction.findUnique.mockResolvedValue(null);
    tx.coinTransaction.create.mockResolvedValue({ id: 'ct_1' });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_MP_ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('getCatalog', () => {
    it('devolve packs + premium no shape do contrato', () => {
      const service = new PaymentsService();
      const catalog = service.getCatalog();

      expect(catalog.packs.map((pack) => pack.id)).toEqual([
        'coins_100',
        'coins_500',
        'coins_1200',
      ]);
      expect(catalog.premium.id).toBe('hexa_premium');
      expect(catalog.premium.days).toBe(30);
      expect(catalog.premium.priceBrl).toBe(29);
      for (const pack of catalog.packs) {
        expect(pack.priceBrl).toBeGreaterThan(0);
        expect(pack.coins).toBeGreaterThan(0);
        expect(pack.label).toBeTruthy();
      }
    });
  });

  describe('checkout', () => {
    it('cria o Payment (PENDING, centavos) e devolve checkoutUrl + paymentId', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.create).mockResolvedValue(makePayment());
      vi.mocked(prisma.payment.update).mockResolvedValue(makePayment({ mpPreferenceId: 'pref_mp_1' }));

      const result = await service.checkout('user_1', 'coins_500');

      expect(result).toEqual({
        checkoutUrl: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref=pref_mp_1',
        paymentId: 'pay_local_1',
      });
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: { userId: 'user_1', productId: 'coins_500', amount: 1990, coins: 500, status: 'PENDING' },
      });
      expect(gateway.createPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          externalReference: 'pay_local_1',
          title: 'Pacote de 500 moedas',
          unitPriceBrl: 19.9,
          notificationUrl: 'https://api.hexavante.com.br/api/v1/payments/webhook',
          returnUrl: 'https://app.hexavante.com.br/pagamento/retorno',
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_local_1' },
        data: { mpPreferenceId: 'pref_mp_1' },
      });
    });

    it('produto desconhecido → 404 sem criar Payment nem chamar o MP', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);

      await expect(service.checkout('user_1', 'nao_existe')).rejects.toThrow(NotFoundError);
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(gateway.createPreference).not.toHaveBeenCalled();
    });

    it('sem MP_ACCESS_TOKEN → 500 com log claro (gateway default)', async () => {
      delete process.env.MP_ACCESS_TOKEN;
      const service = new PaymentsService(); // gateway default lê a env

      await expect(service.checkout('user_1', 'coins_100')).rejects.toThrow(InternalServerError);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('falha do MP na preferência → Payment marcado CANCELLED e 500', async () => {
      const gateway = makeGateway();
      gateway.createPreference.mockRejectedValue(new Error('mp fora do ar'));
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.create).mockResolvedValue(makePayment());
      vi.mocked(prisma.payment.update).mockResolvedValue({} as never);

      await expect(service.checkout('user_1', 'coins_500')).rejects.toThrow(InternalServerError);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_local_1' },
        data: { status: 'CANCELLED', statusDetail: 'preference_error' },
      });
    });
  });

  describe('getPaymentStatus', () => {
    it('devolve o shape do contrato (amount em centavos → amountBrl)', async () => {
      const service = new PaymentsService();
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(
        makePayment({ status: 'APPROVED', paidAt: new Date('2026-10-03T10:00:00.000Z') }),
      );

      const view = await service.getPaymentStatus('user_1', 'pay_local_1');

      expect(view).toEqual({
        status: 'approved',
        productId: 'coins_500',
        amountBrl: 19.9,
        coins: 500,
        paidAt: '2026-10-03T10:00:00.000Z',
      });
    });

    it('pagamento de outro usuário → 404 (não vaza existência)', async () => {
      const service = new PaymentsService();
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment({ userId: 'user_2' }));

      await expect(service.getPaymentStatus('user_1', 'pay_local_1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('pagamento inexistente → 404', async () => {
      const service = new PaymentsService();
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

      await expect(service.getPaymentStatus('user_1', 'inexistente')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('handleWebhook — caminho feliz e idempotência', () => {
    it('aprova, credita moedas uma única vez e marca paidAt', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment());

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toEqual({
        handled: true,
        paymentId: 'pay_local_1',
        status: 'approved',
        credited: true,
      });
      expect(gateway.getPayment).toHaveBeenCalledWith('mp_987');
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_local_1', status: 'PENDING' },
          data: expect.objectContaining({
            status: 'APPROVED',
            mpPaymentId: 'mp_987',
            statusDetail: 'accredited',
            paidAt: new Date('2026-10-03T10:00:00.000Z'),
          }),
        }),
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { coins: { increment: 500 } },
      });
      expect(tx.coinTransaction.create).toHaveBeenCalledTimes(1);
      expect(tx.coinTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_1',
          amount: 500,
          type: 'EARN',
          source: 'PAYMENT',
          sourceId: 'mp_987',
        }),
      });
    });

    it('webhook DUPLICADO (status já APPROVED) → nenhum crédito extra', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique)
        .mockResolvedValueOnce(makePayment({ status: 'PENDING' }))
        .mockResolvedValueOnce(makePayment({ status: 'APPROVED' }));

      await service.handleWebhook(webhookInput());
      const second = await service.handleWebhook(webhookInput());

      expect(second).toEqual({
        handled: true,
        paymentId: 'pay_local_1',
        status: 'approved',
        credited: false,
      });
      expect(tx.coinTransaction.create).toHaveBeenCalledTimes(1);
      expect(tx.user.update).toHaveBeenCalledTimes(1);
      expect(tx.payment.updateMany).toHaveBeenCalledTimes(1); // 2ª chamada nem transaciona
    });

    it('webhook CONCORRENTE (CAS perde) → não reprocessa o benefício', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment({ status: 'PENDING' }));
      // 1ª transação vence (count 1), 2ª perde a corrida (count 0)
      tx.payment.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const first = await service.handleWebhook(webhookInput());
      const second = await service.handleWebhook(webhookInput());

      expect(first).toMatchObject({ handled: true, credited: true });
      expect(second).toMatchObject({ handled: true, credited: false });
      expect(tx.coinTransaction.create).toHaveBeenCalledTimes(1);
    });

    it('registro de moedas já existe (pré-check) → aprova sem creditar', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment());
      tx.coinTransaction.findUnique.mockResolvedValue({ id: 'ct_ja_existe' });

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toMatchObject({ handled: true, credited: false });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.coinTransaction.create).not.toHaveBeenCalled();
    });

    it('unique violation na corrida (P2002) → 200 tratado, sem crédito duplicado', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment());
      vi.mocked(prisma.$transaction).mockRejectedValueOnce({ code: 'P2002' });

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toEqual({
        handled: true,
        paymentId: 'pay_local_1',
        status: 'pending',
        credited: false,
      });
    });
  });

  describe('handleWebhook — premium', () => {
    const premiumPayment = makePayment({
      productId: 'hexa_premium',
      coins: 0,
      amount: 2900,
    });

    it('aprovação estende premium a partir da data atual quando expirado/novo', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(premiumPayment);
      tx.user.findUnique.mockResolvedValue({ premiumExpiresAt: null });

      const before = Date.now();
      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toMatchObject({ handled: true, credited: true });
      expect(tx.user.update).toHaveBeenCalledTimes(1);
      const data = vi.mocked(tx.user.update).mock.calls[0][0].data as Record<string, unknown>;
      expect(data.isPremium).toBe(true);
      const expiresAt = data.premiumExpiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000);
      // premium não mexe em moedas
      expect(tx.coinTransaction.create).not.toHaveBeenCalled();
    });

    it('aprovação acumula sobre o premium vigente no futuro', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(premiumPayment);
      const currentExpiry = new Date('2027-01-01T00:00:00.000Z');
      tx.user.findUnique.mockResolvedValue({ premiumExpiresAt: currentExpiry });

      await service.handleWebhook(webhookInput());

      const data = vi.mocked(tx.user.update).mock.calls[0][0].data as Record<string, unknown>;
      expect((data.premiumExpiresAt as Date).getTime()).toBe(
        currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
    });

    it('refunded estorna 30 dias e desativa quando a data cai no passado', async () => {
      const gateway = makeGateway();
      gateway.getPayment.mockResolvedValue(makeMpPayment({ status: 'refunded' }));
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(
        makePayment({ productId: 'hexa_premium', coins: 0, amount: 2900, status: 'APPROVED' }),
      );

      const currentExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      tx.user.findUnique.mockResolvedValue({ premiumExpiresAt: currentExpiry });

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toMatchObject({ handled: true, status: 'refunded' });
      const data = vi.mocked(tx.user.update).mock.calls[0][0].data as Record<string, unknown>;
      expect(data.isPremium).toBe(false); // 10d - 30d < agora → desativa
      expect((data.premiumExpiresAt as Date).getTime()).toBe(
        currentExpiry.getTime() - 30 * 24 * 60 * 60 * 1000,
      );
    });

    it('refunded mantém premium quando ainda sobra validade', async () => {
      const gateway = makeGateway();
      gateway.getPayment.mockResolvedValue(makeMpPayment({ status: 'refunded' }));
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(
        makePayment({ productId: 'hexa_premium', coins: 0, amount: 2900, status: 'APPROVED' }),
      );

      const currentExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      tx.user.findUnique.mockResolvedValue({ premiumExpiresAt: currentExpiry });

      await service.handleWebhook(webhookInput());

      const data = vi.mocked(tx.user.update).mock.calls[0][0].data as Record<string, unknown>;
      expect(data.isPremium).toBe(true); // 60d - 30d ainda no futuro
      expect((data.premiumExpiresAt as Date).getTime()).toBe(
        currentExpiry.getTime() - 30 * 24 * 60 * 60 * 1000,
      );
    });
  });

  describe('handleWebhook — estorno de moedas', () => {
    it('subtrai até zero (nunca deixa saldo negativo) e lança SPEND', async () => {
      const gateway = makeGateway();
      gateway.getPayment.mockResolvedValue(makeMpPayment({ status: 'refunded' }));
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(
        makePayment({ status: 'APPROVED' }),
      );
      tx.user.findUnique.mockResolvedValue({ coins: 300, isPremium: false, premiumExpiresAt: null });

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toMatchObject({ handled: true, status: 'refunded', credited: false });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { coins: 0 }, // 300 - 500 → clamp em 0
      });
      expect(tx.coinTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_1',
          amount: 300,
          type: 'SPEND',
          source: 'PAYMENT',
          sourceId: 'mp_987:refund',
        }),
      });
    });

    it('estorno sem saldo (já gastou tudo) → mantém 0 e não cria lançamento', async () => {
      const gateway = makeGateway();
      gateway.getPayment.mockResolvedValue(makeMpPayment({ status: 'refunded' }));
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(
        makePayment({ status: 'APPROVED' }),
      );
      tx.user.findUnique.mockResolvedValue({ coins: 0, isPremium: false, premiumExpiresAt: null });

      await service.handleWebhook(webhookInput());

      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user_1' }, data: { coins: 0 } });
      expect(tx.coinTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook — segurança e formas suportadas', () => {
    it('assinatura inválida quando MP_WEBHOOK_SECRET está setado → ignorado, sem consulta ao MP', async () => {
      process.env.MP_WEBHOOK_SECRET = 'segredo_webhook';
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toEqual({ handled: false, reason: 'assinatura_invalida' });
      expect(gateway.getPayment).not.toHaveBeenCalled();
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('assinatura válida → segue para a consulta na origem', async () => {
      process.env.MP_WEBHOOK_SECRET = 'segredo_webhook';
      const { createHmac } = await import('node:crypto');
      const ts = '1791043200';
      const requestId = 'req-1';
      const manifest = `id:mp_987;request-id:${requestId};ts:${ts};`;
      const v1 = createHmac('sha256', 'segredo_webhook').update(manifest).digest('hex');

      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment());

      const outcome = await service.handleWebhook(
        webhookInput({
          headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        }),
      );

      expect(outcome).toMatchObject({ handled: true });
      expect(gateway.getPayment).toHaveBeenCalledWith('mp_987');
    });

    it('sem segredo configurado → processa sem validar assinatura', async () => {
      delete process.env.MP_WEBHOOK_SECRET;
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment());

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toMatchObject({ handled: true });
    });

    it('notificação de outro tipo (merchant_order) → 200 e ignora', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);

      const outcome = await service.handleWebhook(webhookInput({ query: { type: 'merchant_order', id: '1' } }));

      expect(outcome).toEqual({ handled: false, reason: 'tipo_merchant_order' });
      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('sem id → ignorado', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);

      expect(await service.handleWebhook(webhookInput({ query: { type: 'payment' } }))).toEqual({
        handled: false,
        reason: 'sem_id',
      });
      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('falha na consulta ao MP → ignorado (o MP reenvia)', async () => {
      const gateway = makeGateway();
      gateway.getPayment.mockRejectedValue(new Error('503 do MP'));
      const service = new PaymentsService(() => gateway);

      expect(await service.handleWebhook(webhookInput())).toEqual({
        handled: false,
        reason: 'consulta_mp_falhou',
      });
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('pagamento desconhecido → ignorado', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

      expect(await service.handleWebhook(webhookInput())).toEqual({
        handled: false,
        reason: 'pagamento_desconhecido',
      });
      expect(tx.payment.updateMany).not.toHaveBeenCalled();
    });

    it('casa pelo external_reference (cuid nosso) primeiro', async () => {
      const gateway = makeGateway();
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment());

      await service.handleWebhook(webhookInput());

      expect(prisma.payment.findUnique).toHaveBeenCalledWith({ where: { id: 'pay_local_1' } });
    });

    it('sem external_reference → cai para o mpPaymentId', async () => {
      const gateway = makeGateway();
      gateway.getPayment.mockResolvedValue(makeMpPayment({ externalReference: null }));
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(
        makePayment({ mpPaymentId: 'mp_987' }),
      );

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toMatchObject({ handled: true, status: 'approved' });
      expect(prisma.payment.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.payment.findUnique).toHaveBeenCalledWith({
        where: { mpPaymentId: 'mp_987' },
      });
    });

    it('status pendente não gera crédito', async () => {
      const gateway = makeGateway();
      gateway.getPayment.mockResolvedValue(makeMpPayment({ status: 'pending' }));
      const service = new PaymentsService(() => gateway);
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(makePayment());

      const outcome = await service.handleWebhook(webhookInput());

      expect(outcome).toMatchObject({ handled: true, status: 'pending', credited: false });
      expect(tx.coinTransaction.create).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });
});
