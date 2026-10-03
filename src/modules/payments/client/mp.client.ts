import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { AppError } from '../../../lib/errors/AppError';
import type {
  MpGateway,
  MpPaymentSnapshot,
  MpPreferenceInput,
  MpPreferenceResult,
} from '../types/payments.types';

/**
 * Cliente Mercado Pago (SDK v3) isolado atrás de `MpGateway`.
 *
 * Todo acesso ao SDK mora AQUI: os testes do serviço injetam um gateway
 * fake e nunca fazem rede. O token é lido por `requireMpAccessToken()`
 * no momento da construção (env ausente → 500 claro, sem crash no boot).
 */
export class MercadoPagoGateway implements MpGateway {
  private readonly preferenceClient: Preference;
  private readonly paymentClient: Payment;

  constructor(accessToken: string) {
    const config = new MercadoPagoConfig({ accessToken });
    this.preferenceClient = new Preference(config);
    this.paymentClient = new Payment(config);
  }

  async createPreference(input: MpPreferenceInput): Promise<MpPreferenceResult> {
    const response = await this.preferenceClient.create({
      body: {
        items: [
          {
            id: input.externalReference,
            title: input.title,
            quantity: 1,
            unit_price: input.unitPriceBrl,
            currency_id: 'BRL',
          },
        ],
        external_reference: input.externalReference,
        back_urls: {
          success: input.returnUrl,
          failure: input.returnUrl,
          pending: input.returnUrl,
        },
        // auto_return só para https (exigência do MP); fora disso o comprador
        // cai nas back_urls e o front consulta GET /payments/:id.
        ...(canAutoReturn(input.returnUrl) ? { auto_return: 'approved' } : {}),
        notification_url: input.notificationUrl,
        metadata: { external_reference: input.externalReference },
      },
    });

    const checkoutUrl = response.init_point;
    if (!checkoutUrl) {
      throw new AppError(502, 'Mercado Pago não retornou o link de checkout', 'MP_NO_INIT_POINT');
    }

    return {
      preferenceId: response.id ?? null,
      checkoutUrl,
    };
  }

  async getPayment(id: string): Promise<MpPaymentSnapshot> {
    const payment = await this.paymentClient.get({ id });

    if (payment.id === undefined || payment.id === null) {
      throw new AppError(502, 'Mercado Pago retornou pagamento sem id', 'MP_NO_PAYMENT_ID');
    }

    return {
      id: String(payment.id),
      status: String(payment.status ?? 'pending'),
      statusDetail: payment.status_detail ?? null,
      externalReference: payment.external_reference ?? null,
      transactionAmount:
        typeof payment.transaction_amount === 'number' ? payment.transaction_amount : null,
      dateApproved: payment.date_approved ?? null,
      // O SDK devolve JSON puro (JSON.parse) — pronto para a coluna `raw`.
      raw: payment as unknown as Record<string, unknown>,
    };
  }
}

/**
 * `auto_return` só quando o retorno é https (requisito do MP).
 * Exportado para teste unitário.
 */
export function canAutoReturn(returnUrl: string): boolean {
  return returnUrl.startsWith('https://');
}
