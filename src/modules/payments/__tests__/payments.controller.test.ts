import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PaymentsController } from '../controller/payments.controller';
import type { PaymentsService } from '../service/payments.service';

/**
 * Controller de pagamentos — foco no contrato "webhook SEMPRE 200".
 * O serviço é fake aqui (a lógica de negócio fica em payments.service.test.ts).
 */
function makeReply(): FastifyReply {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as unknown as FastifyReply;
}

function makeController(overrides: Partial<Record<keyof PaymentsService, unknown>> = {}) {
  const service = {
    getCatalog: vi.fn(() => ({ packs: [], premium: { id: 'hexa_premium' } })),
    checkout: vi.fn(),
    getPaymentStatus: vi.fn(),
    handleWebhook: vi.fn(async () => ({ handled: false, reason: 'sem_id' })),
    ...overrides,
  };
  const controller = new PaymentsController(service as unknown as PaymentsService);
  return { controller, service };
}

function webhookRequest(): FastifyRequest {
  return {
    query: { type: 'payment', id: '123' },
    body: {},
    headers: {},
  } as unknown as FastifyRequest;
}

describe('PaymentsController', () => {
  describe('GET /api/v1/payments/catalog', () => {
    it('devolve o catálogo do serviço sem envelope', async () => {
      const { controller, service } = makeController();
      const reply = makeReply();

      await controller.getCatalog(webhookRequest(), reply);

      expect(service.getCatalog).toHaveBeenCalledTimes(1);
      expect(reply.send).toHaveBeenCalledWith({ packs: [], premium: { id: 'hexa_premium' } });
    });
  });

  describe('POST /api/v1/payments/webhook — sempre 200', () => {
    it('responde 200 com { received: true } quando o serviço processa', async () => {
      const { controller } = makeController({
        handleWebhook: vi.fn(async () => ({
          handled: true,
          paymentId: 'pay_1',
          status: 'approved',
          credited: true,
        })),
      });
      const reply = makeReply();

      await controller.webhook(webhookRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ received: true });
    });

    it('responde 200 mesmo quando o serviço LANÇA exceção (nunca 5xx pro MP)', async () => {
      const { controller } = makeController({
        handleWebhook: vi.fn(async () => {
          throw new Error('banco fora do ar');
        }),
      });
      const reply = makeReply();

      await expect(controller.webhook(webhookRequest(), reply)).resolves.toBeUndefined();

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ received: true });
    });

    it('responde 200 para payload sem id / corpo malformado', async () => {
      const { controller, service } = makeController();
      const reply = makeReply();
      const request = {
        query: {},
        body: 'isso-não-é-json',
        headers: {},
      } as unknown as FastifyRequest;

      await controller.webhook(request, reply);

      expect(service.handleWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ query: {}, body: 'isso-não-é-json' }),
      );
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ received: true });
    });
  });
});
