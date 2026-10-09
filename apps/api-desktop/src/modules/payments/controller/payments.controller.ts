import type { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../../config/logger';
import { validateBody, validateParams } from '../../../lib/validation/validate';
import { checkoutSchema, paymentIdParamSchema } from '../schemas/payments.schemas';
import { PaymentsService } from '../service/payments.service';
import type { CheckoutBody, PaymentIdParams } from '../schemas/payments.schemas';
import type { WebhookInput } from '../types/payments.types';

export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** GET /api/v1/payments/catalog — público. */
  async getCatalog(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.send(this.paymentsService.getCatalog());
  }

  /** POST /api/v1/payments/checkout — autenticado (cookie de sessão). */
  async checkout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(checkoutSchema)(request, reply);
    const { productId } = request.body as CheckoutBody;
    const result = await this.paymentsService.checkout(request.user!.id, productId);
    reply.send(result);
  }

  /** GET /api/v1/payments/:paymentId — autenticado, só o dono. */
  async getPaymentStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateParams(paymentIdParamSchema)(request, reply);
    const { paymentId } = request.params as PaymentIdParams;
    const view = await this.paymentsService.getPaymentStatus(request.user!.id, paymentId);
    reply.send(view);
  }

  /**
   * POST /api/v1/payments/webhook — público (Mercado Pago).
   *
   * SEMPRE responde 200: erro de payload, assinatura inválida, falha do MP ou
   * exceção inesperada viram log + `{ received: true }`. Nada de 5xx pro MP
   * (5xx faria o Mercado Pago reenviar em loop).
   */
  async webhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const input: WebhookInput = {
        query: request.query,
        body: request.body,
        headers: request.headers as WebhookInput['headers'],
      };
      const outcome = await this.paymentsService.handleWebhook(input);
      logger.info({ outcome }, 'webhook: notificação Mercado Pago recebida');
    } catch (error) {
      logger.error({ err: error }, 'webhook: erro inesperado ao processar notificação');
    }

    reply.status(200).send({ received: true });
  }
}
