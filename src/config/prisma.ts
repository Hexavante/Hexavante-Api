import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

prisma.$connect()
  .then(() => {
    logger.info('Database connected');
  })
  .catch((err) => {
    logger.error({ err }, 'Database connection error');
    process.exit(1);
  });

export { prisma };

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
