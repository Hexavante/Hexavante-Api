import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { createBullConnection } from '../../config/redis';
import { logger } from '../../config/logger';
import { sendEmail } from '../email';
import { leaderboardCache, LEADERBOARD_REFRESH_MS } from '../cache/leaderboard.cache';
import { PaymentsService } from '../../modules/payments/service/payments.service';
import {
  ensureCurrentSeasonRecord,
  processPreviousSeason,
} from '../../modules/gamification/engine/season';
import {
  JOB_NAMES,
  QUEUE_NAMES,
  getQueue,
  isQueueEnabled,
  type EmailJobData,
  type PaymentReconcileJobData,
} from './index';

/**
 * Workers rodam dentro de cada processo da API (gateway, desktop, mobile).
 * O BullMQ garante que cada job é entregue a um único worker, então rodar em
 * vários processos só aumenta a vazão. `QUEUE_WORKERS=false` desliga os
 * workers em um processo específico (ex.: rodar só em um container).
 */
export function areWorkersEnabled(): boolean {
  if (!isQueueEnabled()) return false;
  const flag = process.env.QUEUE_WORKERS?.trim().toLowerCase();
  return !(flag === 'false' || flag === 'off' || flag === '0');
}

async function processEmail(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, html, text, label } = job.data;
  const result = await sendEmail({ to, subject, html, text });
  if (!result.sent && process.env.RESEND_API_KEY) {
    // Lança para o BullMQ tentar de novo com backoff.
    throw new Error(result.error ?? 'falha no envio');
  }
  logger.info({ jobId: job.id, label, attempt: job.attemptsMade + 1 }, 'email: enviado pela fila');
}

const paymentsService = new PaymentsService();

async function processPayment(job: Job<PaymentReconcileJobData>): Promise<void> {
  await paymentsService.reconcile(job.data.mpPaymentId);
}

/** Fechamento de temporada: idempotente, então rodar de hora em hora é barato. */
const SEASON_CHECK_MS = 60 * 60_000;

async function processMaintenance(job: Job): Promise<void> {
  if (job.name === JOB_NAMES.refreshLeaderboard) {
    const result = await leaderboardCache.rebuild();
    if (result) logger.debug({ members: result.members }, 'leaderboard: reconstruído');
    return;
  }
  if (job.name === JOB_NAMES.processSeason) {
    await ensureCurrentSeasonRecord();
    await processPreviousSeason();
  }
}

let workerConnection: Redis | null = null;
const workers: Worker[] = [];

export async function startQueueWorkers(): Promise<void> {
  if (!areWorkersEnabled() || workers.length > 0) return;

  workerConnection = createBullConnection('worker');
  const connection = workerConnection;

  workers.push(
    new Worker<EmailJobData>(QUEUE_NAMES.email, processEmail, { connection, concurrency: 5 }),
    new Worker<PaymentReconcileJobData>(QUEUE_NAMES.payments, processPayment, {
      connection,
      concurrency: 2,
    }),
    new Worker(QUEUE_NAMES.maintenance, processMaintenance, { connection, concurrency: 1 }),
  );

  for (const worker of workers) {
    worker.on('failed', (job, err) => {
      const finalAttempt = job && job.attemptsMade >= (job.opts.attempts ?? 1);
      const log = finalAttempt ? logger.error.bind(logger) : logger.warn.bind(logger);
      log(
        { err, queue: worker.name, jobId: job?.id, job: job?.name, attempt: job?.attemptsMade },
        finalAttempt ? 'job falhou definitivamente' : 'job falhou — nova tentativa agendada',
      );
    });
    worker.on('error', (err) => logger.error({ err, queue: worker.name }, 'worker error'));
  }

  void scheduleMaintenanceJobs();
  logger.info('Workers de fila iniciados (email, payments, maintenance)');
}

const SCHEDULE_RETRY_MS = 30_000;
let scheduleTimer: NodeJS.Timeout | null = null;

/**
 * Agendamentos idempotentes (ranking a cada minuto, temporada a cada hora):
 * vários processos chamando isto mantêm UM único
 * agendador por chave no Redis. Se o Redis ainda não conectou no boot,
 * tenta de novo a cada 30s sem bloquear o servidor.
 */
async function scheduleMaintenanceJobs(): Promise<void> {
  scheduleTimer = null;
  if (workers.length === 0) return;
  try {
    const maintenance = getQueue('maintenance');
    await maintenance.upsertJobScheduler(
      JOB_NAMES.refreshLeaderboard,
      { every: LEADERBOARD_REFRESH_MS },
      { name: JOB_NAMES.refreshLeaderboard },
    );
    await maintenance.upsertJobScheduler(
      JOB_NAMES.processSeason,
      { every: SEASON_CHECK_MS, immediately: true },
      { name: JOB_NAMES.processSeason },
    );
  } catch (err) {
    logger.warn({ err }, 'não foi possível agendar os jobs de manutenção — nova tentativa em 30s');
    scheduleTimer = setTimeout(() => void scheduleMaintenanceJobs(), SCHEDULE_RETRY_MS);
    scheduleTimer.unref();
  }
}

export async function stopQueueWorkers(): Promise<void> {
  if (scheduleTimer) clearTimeout(scheduleTimer);
  scheduleTimer = null;
  await Promise.allSettled(workers.map((w) => w.close()));
  workers.length = 0;
  if (workerConnection) {
    workerConnection.disconnect();
    workerConnection = null;
  }
}
