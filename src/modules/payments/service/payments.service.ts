import type { Payment, Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { logger } from '../../../config/logger';
import { InternalServerError, NotFoundError } from '../../../lib/errors/AppError';
import { serializeDate } from '../../../lib/serializers/base';
import {
  MP_NOTIFICATION_URL,
  PREMIUM_PRODUCT,
  PREMIUM_PRODUCT_ID,
  centsToBrl,
  findCatalogProduct,
  getPaymentsCatalog,
  getMpWebhookSecret,
  getReturnUrl,
  priceToCents,
  requireMpAccessToken,
  type PaymentsCatalog,
} from '../../../config/commerce';
import { MercadoPagoGateway } from '../client/mp.client';
import {
  canTransition,
  computePremiumExpiry,
  computePremiumRefund,
  extractWebhookRef,
  isUniqueViolation,
  isValidWebhookSignature,
  mapMpStatus,
  toPublicStatus,
} from './payment-rules';
import type {
  CheckoutResult,
  MpGatewayFactory,
  MpPaymentSnapshot,
  PaymentStatusView,
  WebhookInput,
  WebhookOutcome,
} from '../types/payments.types';

/** Usada quando o serviço é instanciado sem injeção (produção). */
const defaultGatewayFactory: MpGatewayFactory = () =>
  new MercadoPagoGateway(requireMpAccessToken());

function toDateOrNull(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class PaymentsService {
  constructor(private readonly gatewayFactory: MpGatewayFactory = defaultGatewayFactory) {}

  /** GET /api/v1/payments/catalog */
  getCatalog(): PaymentsCatalog {
    return getPaymentsCatalog();
  }

  /** POST /api/v1/payments/checkout */
  async checkout(userId: string, productId: string): Promise<CheckoutResult> {
    const product = findCatalogProduct(productId);
    if (!product) throw new NotFoundError('Produto não encontrado');

    // Sem token → 500 com log claro (não derruba o boot).
    const gateway = this.gatewayFactory();

    const priceBrl = product.kind === 'pack' ? product.pack.priceBrl : product.premium.priceBrl;
    const title = product.kind === 'pack' ? product.pack.label : product.premium.label;
    const coins = product.kind === 'pack' ? product.pack.coins : 0;
    const amount = priceToCents(priceBrl);

    const payment = await prisma.payment.create({
      data: { userId, productId, amount, coins, status: 'PENDING' },
    });

    try {
      const preference = await gateway.createPreference({
        externalReference: payment.id,
        title,
        unitPriceBrl: priceBrl,
        notificationUrl: MP_NOTIFICATION_URL,
        returnUrl: getReturnUrl(),
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: { mpPreferenceId: preference.preferenceId },
      });

      logger.info(
        { paymentId: payment.id, userId, productId, amount, coins },
        'checkout: preferência Mercado Pago criada',
      );

      return { checkoutUrl: preference.checkoutUrl, paymentId: payment.id };
    } catch (error) {
      logger.error(
        { err: error, paymentId: payment.id, userId, productId },
        'checkout: falha ao criar preferência no Mercado Pago',
      );
      // Não deixa o registro "pendente" eterno: o front consulta o status.
      await prisma.payment
        .update({
          where: { id: payment.id },
          data: { status: 'CANCELLED', statusDetail: 'preference_error' },
        })
        .catch(() => undefined);
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError('Não foi possível iniciar o pagamento agora');
    }
  }

  /** GET /api/v1/payments/:paymentId — só o dono (404 para os demais). */
  async getPaymentStatus(userId: string, paymentId: string): Promise<PaymentStatusView> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.userId !== userId) throw new NotFoundError('Pagamento não encontrado');

    return {
      status: toPublicStatus(payment.status),
      productId: payment.productId,
      amountBrl: centsToBrl(payment.amount),
      coins: payment.coins,
      paidAt: serializeDate(payment.paidAt),
    };
  }

  /**
   * POST /api/v1/payments/webhook — idempotente, sempre resolve com outcome
   * (o responde 200 é responsabilidade do controller; nunca 5xx pro MP).
   *
   * Autenticidade: o `id` é consultado na API do MP com o NOSSO token — só
   * dados vindos da origem são usados. `x-signature` (quando `MP_WEBHOOK_SECRET`
   * existe) é validação adicional; falha → 200 + warn.
   */
  async handleWebhook(input: WebhookInput): Promise<WebhookOutcome> {
    const { type, id } = extractWebhookRef(input.query, input.body);

    if (!id) return { handled: false, reason: 'sem_id' };
    if (type && type !== 'payment') {
      logger.info({ type }, 'webhook: notificação de outro tipo ignorada');
      return { handled: false, reason: `tipo_${type}` };
    }

    const secret = getMpWebhookSecret();
    if (secret && !isValidWebhookSignature(input.headers, id, secret)) {
      logger.warn(
        { mpNotificationId: id, requestId: input.headers['x-request-id'] },
        'webhook: assinatura x-signature inválida — notificação ignorada',
      );
      return { handled: false, reason: 'assinatura_invalida' };
    }

    // Fonte da verdade: busca na origem com o nosso access token.
    let mpPayment: MpPaymentSnapshot;
    try {
      mpPayment = await this.gatewayFactory().getPayment(id);
    } catch (error) {
      logger.warn(
        { err: error, mpNotificationId: id },
        'webhook: falha ao consultar pagamento no Mercado Pago (o MP reenviará)',
      );
      return { handled: false, reason: 'consulta_mp_falhou' };
    }

    const payment = await this.findLocalPayment(mpPayment);
    if (!payment) {
      logger.warn(
        { mpPaymentId: mpPayment.id, externalReference: mpPayment.externalReference },
        'webhook: pagamento não encontrado localmente',
      );
      return { handled: false, reason: 'pagamento_desconhecido' };
    }

    return this.applyStatus(payment, mpPayment);
  }

  /** Casa o pagamento do MP com o registro nosso (external_reference → cuid). */
  private async findLocalPayment(mpPayment: MpPaymentSnapshot): Promise<Payment | null> {
    if (mpPayment.externalReference) {
      const byReference = await prisma.payment.findUnique({
        where: { id: mpPayment.externalReference },
      });
      if (byReference) return byReference;
    }
    return prisma.payment.findUnique({ where: { mpPaymentId: mpPayment.id } });
  }

  /**
   * Aplica o status do MP na nossa transação — com CAS otimista sobre a
   * coluna `status` (só processa se ninguém mudou desde a leitura) e, dentro
   * da MESMA transação, concede/reverte o benefício. Resultado: duas entregas
   * simultâneas nunca creditam duas vezes.
   */
  private async applyStatus(payment: Payment, mpPayment: MpPaymentSnapshot): Promise<WebhookOutcome> {
    const from = payment.status;
    const to = mapMpStatus(mpPayment.status);

    if (!canTransition(from, to)) {
      logger.info(
        { paymentId: payment.id, mpPaymentId: mpPayment.id, from, to },
        'webhook: transição descartada (idempotente)',
      );
      return {
        handled: true,
        paymentId: payment.id,
        status: toPublicStatus(from),
        credited: false,
      };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const claim = await tx.payment.updateMany({
          where: { id: payment.id, status: from },
          data: {
            status: to,
            statusDetail: mpPayment.statusDetail,
            mpPaymentId: mpPayment.id,
            raw: mpPayment.raw as unknown as Prisma.InputJsonValue,
            ...(to === 'APPROVED'
              ? { paidAt: toDateOrNull(mpPayment.dateApproved) ?? new Date() }
              : {}),
          },
        });

        // Outro webhook processou o mesmo estado antes — não reprocessa.
        if (claim.count === 0) return { claimed: false, credited: false };

        if (to === 'APPROVED') {
          const credited = await this.creditApproval(tx, payment, mpPayment);
          return { claimed: true, credited };
        }

        if (to === 'REFUNDED' && from === 'APPROVED') {
          await this.revertApproval(tx, payment, mpPayment);
        }

        return { claimed: true, credited: false };
      });

      logger.info(
        {
          paymentId: payment.id,
          mpPaymentId: mpPayment.id,
          from,
          status: toPublicStatus(result.claimed ? to : from),
          claimed: result.claimed,
          credited: result.credited,
        },
        'webhook: status processado',
      );

      return {
        handled: true,
        paymentId: payment.id,
        status: toPublicStatus(result.claimed ? to : from),
        credited: result.credited,
      };
    } catch (error) {
      // Segunda linha de idempotência: corrida perdida no
      // `@@unique([userId, source, sourceId])` → a transação inteira
      // (inclusive o incremento de moedas) é desfeita. Não duplica crédito.
      if (isUniqueViolation(error)) {
        logger.warn(
          { paymentId: payment.id, mpPaymentId: mpPayment.id },
          'webhook: corrida de idempotência detectada — nenhum crédito duplicado',
        );
        return {
          handled: true,
          paymentId: payment.id,
          status: toPublicStatus(payment.status),
          credited: false,
        };
      }
      throw error;
    }
  }

  /**
   * Crédito pós-aprovação (exatamente uma vez):
   * - pacote de moedas → incrementa saldo + lança `CoinTransaction`
   *   (`source: PAYMENT`, `sourceId: mpPaymentId` — a unique impede duplicar);
   * - `hexa_premium` → `isPremium` + extensão acumulativa de 30 dias.
   */
  private async creditApproval(
    tx: Prisma.TransactionClient,
    payment: Payment,
    mpPayment: MpPaymentSnapshot,
  ): Promise<boolean> {
    if (payment.productId === PREMIUM_PRODUCT_ID) {
      const user = await tx.user.findUnique({
        where: { id: payment.userId },
        select: { premiumExpiresAt: true },
      });
      if (!user) throw new NotFoundError('Usuário do pagamento não encontrado');

      const expiresAt = computePremiumExpiry(user.premiumExpiresAt, PREMIUM_PRODUCT.days);
      await tx.user.update({
        where: { id: payment.userId },
        data: { isPremium: true, premiumExpiresAt: expiresAt },
      });

      logger.info(
        {
          paymentId: payment.id,
          mpPaymentId: mpPayment.id,
          userId: payment.userId,
          previousExpiry: user.premiumExpiresAt,
          premiumExpiresAt: expiresAt,
          days: PREMIUM_PRODUCT.days,
        },
        'pagamento aprovado: premium ativado/estendido',
      );
      return true;
    }

    if (payment.coins <= 0) return false;

    const sourceId = mpPayment.id;
    const existing = await tx.coinTransaction.findUnique({
      where: { userId_source_sourceId: { userId: payment.userId, source: 'PAYMENT', sourceId } },
      select: { id: true },
    });
    if (existing) {
      logger.info(
        { paymentId: payment.id, mpPaymentId: sourceId, userId: payment.userId },
        'pagamento aprovado: crédito de moedas já registrado (idempotente)',
      );
      return false;
    }

    await tx.user.update({
      where: { id: payment.userId },
      data: { coins: { increment: payment.coins } },
    });
    await tx.coinTransaction.create({
      data: {
        userId: payment.userId,
        amount: payment.coins,
        type: 'EARN',
        source: 'PAYMENT',
        sourceId,
        description: `Compra Mercado Pago: ${payment.productId}`,
      },
    });

    logger.info(
      {
        paymentId: payment.id,
        mpPaymentId: sourceId,
        userId: payment.userId,
        coins: payment.coins,
      },
      'pagamento aprovado: moedas creditadas',
    );
    return true;
  }

  /**
   * Estorno de um pagamento APPROVED (simplificação documentada):
   * - moedas: subtrai até o saldo atual — NUNCA fica negativo (o restante
   *   que o usuário já gastou é perdido; lançamento `SPEND` no histórico);
   * - premium: subtrai 30 dias de `premiumExpiresAt`; se a data resultante
   *   já venceu, `isPremium` volta para `false` (desativa).
   *
   * Não rastreamos "crédito original" por linha além da própria transação de
   * moedas — a guarda contra estorno duplo é o CAS de status (só APPROVED →
   * REFUNDED acontece uma vez).
   */
  private async revertApproval(
    tx: Prisma.TransactionClient,
    payment: Payment,
    mpPayment: MpPaymentSnapshot,
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: payment.userId },
      select: { coins: true, isPremium: true, premiumExpiresAt: true },
    });
    if (!user) {
      logger.warn(
        { paymentId: payment.id, userId: payment.userId },
        'estorno: usuário não encontrado — nada a reverter',
      );
      return;
    }

    if (payment.productId === PREMIUM_PRODUCT_ID) {
      const nextExpiry = computePremiumRefund(user.premiumExpiresAt, PREMIUM_PRODUCT.days);
      if (!nextExpiry) {
        logger.warn(
          { paymentId: payment.id, userId: payment.userId },
          'estorno: usuário sem premiumExpiresAt — nada a reverter',
        );
        return;
      }
      const now = new Date();
      const stillActive = nextExpiry.getTime() > now.getTime();
      await tx.user.update({
        where: { id: payment.userId },
        data: { isPremium: stillActive, premiumExpiresAt: nextExpiry },
      });
      logger.info(
        {
          paymentId: payment.id,
          mpPaymentId: mpPayment.id,
          userId: payment.userId,
          previousExpiry: user.premiumExpiresAt,
          premiumExpiresAt: nextExpiry,
          isPremium: stillActive,
        },
        'estorno: premium subtraído',
      );
      return;
    }

    if (payment.coins <= 0) return;

    const subtracted = Math.min(user.coins, payment.coins); // nunca negativo
    const nextCoins = Math.max(0, user.coins - payment.coins);
    await tx.user.update({ where: { id: payment.userId }, data: { coins: nextCoins } });

    if (subtracted > 0) {
      const refundSourceId = `${mpPayment.id}:refund`;
      const existing = await tx.coinTransaction.findUnique({
        where: {
          userId_source_sourceId: { userId: payment.userId, source: 'PAYMENT', sourceId: refundSourceId },
        },
        select: { id: true },
      });
      if (!existing) {
        await tx.coinTransaction.create({
          data: {
            userId: payment.userId,
            amount: subtracted,
            type: 'SPEND',
            source: 'PAYMENT',
            sourceId: refundSourceId,
            description: `Estorno Mercado Pago: ${payment.productId}`,
          },
        });
      }
    }

    logger.info(
      {
        paymentId: payment.id,
        mpPaymentId: mpPayment.id,
        userId: payment.userId,
        previousCoins: user.coins,
        nextCoins,
        refundedCoins: subtracted,
        requestedCoins: payment.coins,
      },
      'estorno: moedas subtraídas (saldo nunca fica negativo)',
    );
  }
}
