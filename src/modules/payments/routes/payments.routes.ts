import type { FastifyInstance } from 'fastify';
import { asyncHandler } from '../../../lib/errors/errorHandler';
import { authenticate } from '../../../middlewares/authenticate';
import { PaymentsController } from '../controller/payments.controller';
import { PaymentsService } from '../service/payments.service';

/**
 * Rotas de pagamentos (Mercado Pago).
 *
 * O rate-limit GLOBAL já cobre tudo (registrado na raiz em src/server.ts);
 * `config.rateLimit` aqui define contador PRÓPRIO por rota, sem duplicar o
 * plugin (ver src/plugins/rate-limit.ts).
 */
export async function paymentsRoutes(fastify: FastifyInstance) {
  const paymentsService = new PaymentsService();
  const paymentsController = new PaymentsController(paymentsService);

  // Público — consumido pelo web (server-side) e pela landing (credentials: include).
  fastify.get(
    '/api/v1/payments/catalog',
    {
      config: { rateLimit: { max: 60, timeWindow: 60 * 1000 } },
      schema: { summary: 'Catálogo de pagamentos (pacotes + premium)', tags: ['Payments'] },
    },
    asyncHandler(paymentsController.getCatalog.bind(paymentsController)),
  );

  // Autenticado — cria a preferência no Mercado Pago e devolve o link.
  fastify.post(
    '/api/v1/payments/checkout',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } },
      schema: {
        summary: 'Iniciar checkout (Mercado Pago)',
        tags: ['Payments'],
        security: [{ session: [] }],
      },
    },
    asyncHandler(paymentsController.checkout.bind(paymentsController)),
  );

  // Público (Mercado Pago) — idempotente e SEMPRE 200.
  fastify.post(
    '/api/v1/payments/webhook',
    {
      config: { rateLimit: { max: 300, timeWindow: 60 * 1000 } },
      schema: { summary: 'Webhook de notificações do Mercado Pago', tags: ['Payments'] },
    },
    asyncHandler(paymentsController.webhook.bind(paymentsController)),
  );

  // Autenticado — só o dono vê o próprio pagamento (404 para os demais).
  fastify.get(
    '/api/v1/payments/:paymentId',
    {
      preHandler: [authenticate],
      schema: {
        summary: 'Status de um pagamento',
        tags: ['Payments'],
        security: [{ session: [] }],
      },
    },
    asyncHandler(paymentsController.getPaymentStatus.bind(paymentsController)),
  );
}
