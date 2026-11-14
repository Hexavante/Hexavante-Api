import { Queue, type JobsOptions } from 'bullmq';
import type Redis from 'ioredis';
import { createBullConnection } from '../../config/redis';
import { logger } from '../../config/logger';

/**
 * Filas de trabalho em segundo plano (BullMQ sobre Redis).
 *
 * Regra: o MariaDB continua sendo a fonte da verdade. A fila só garante que
 * tarefas lentas ou sujeitas a falha externa (Resend, Mercado Pago) sejam
 * executadas fora da requisição HTTP, com nova tentativa automática.
 *
 * Produtores nunca travam a requisição: se o Redis estiver fora, `enqueue*`
 * devolve `false` em até ENQUEUE_TIMEOUT_MS e o chamador usa o caminho direto.
 */

export const QUEUE_NAMES = {
  email: 'hx-email',
  payments: 'hx-payments',
  maintenance: 'hx-maintenance',
} as const;

export const JOB_NAMES = {
  sendEmail: 'send-email',
  reconcilePayment: 'reconcile-payment',
  refreshLeaderboard: 'refresh-leaderboard',
  processSeason: 'process-season',
} as const;

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Rótulo só para log (nunca contém o código enviado). */
  label?: string;
}

export interface PaymentReconcileJobData {
  mpPaymentId: string;
}

const ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * Filas ligadas por padrão, desligadas em `NODE_ENV=test` (testes unitários
 * não dependem de Redis). `QUEUE_ENABLED=true|false` força o comportamento.
 */
export function isQueueEnabled(): boolean {
  const flag = process.env.QUEUE_ENABLED?.trim().toLowerCase();
  if (flag === 'false' || flag === 'off' || flag === '0') return false;
  if (flag === 'true' || flag === 'on' || flag === '1') return true;
  return process.env.NODE_ENV !== 'test';
}

const DEFAULT_JOB_OPTIONS: Record<keyof typeof QUEUE_NAMES, JobsOptions> = {
  // E-mails carregam códigos de verificação: nada fica guardado depois de
  // enviado; falhas ficam 24h para diagnóstico.
  email: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: true,
    removeOnFail: { age: 24 * 3600 },
  },
  // ~30s, 1min, 2min, 4min ... até ~1h — cobre indisponibilidades do MP.
  payments: {
    attempts: 8,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
  maintenance: {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 50,
  },
};

let producerConnection: Redis | null = null;
const queues = new Map<keyof typeof QUEUE_NAMES, Queue>();

export function getQueue(kind: keyof typeof QUEUE_NAMES): Queue {
  const existing = queues.get(kind);
  if (existing) return existing;

  producerConnection ??= createBullConnection('producer');
  const queue = new Queue(QUEUE_NAMES[kind], {
    connection: producerConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS[kind],
  });
  queue.on('error', (err) => logger.error({ err, queue: QUEUE_NAMES[kind] }, 'queue error'));
  queues.set(kind, queue);
  return queue;
}

async function addJob(
  kind: keyof typeof QUEUE_NAMES,
  name: string,
  data: object,
  opts?: JobsOptions,
): Promise<boolean> {
  if (!isQueueEnabled()) return false;

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      getQueue(kind).add(name, data, opts),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('enqueue timeout')), ENQUEUE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (err) {
    logger.warn({ err, queue: QUEUE_NAMES[kind], job: name }, 'falha ao enfileirar — usando caminho direto');
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Enfileira um e-mail transacional. `false` → chamador deve enviar direto. */
export function enqueueEmail(data: EmailJobData): Promise<boolean> {
  return addJob('email', JOB_NAMES.sendEmail, data);
}

/**
 * Agenda nova consulta de um pagamento no Mercado Pago. O jobId evita
 * duplicar a mesma reconciliação quando o MP reentrega a notificação.
 */
export function enqueuePaymentReconcile(mpPaymentId: string): Promise<boolean> {
  return addJob(
    'payments',
    JOB_NAMES.reconcilePayment,
    { mpPaymentId } satisfies PaymentReconcileJobData,
    { jobId: `mp-${mpPaymentId}` },
  );
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
  if (producerConnection) {
    producerConnection.disconnect();
    producerConnection = null;
  }
}
