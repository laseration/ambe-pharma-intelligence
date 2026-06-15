import { env } from './config/env';
import { db } from './lib/db';
import { logger } from './lib/logger';
import { startWorkerProcess } from './runtime/workerProcess';

startWorkerProcess()
  .then((handle) => {
    const shutdown = (signal: string) => {
      void handle.shutdown(signal).then(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch(async (error: unknown) => {
    logger.error('Polling worker process failed to start', {
      error: error instanceof Error ? error.message : 'Unknown error',
      databaseHost: env.databaseHost,
      databaseUrlDetected: Boolean(env.databaseUrl),
      hint: 'Verify DATABASE_URL points to a reachable PostgreSQL database and migrations are current.',
    });
    await db.$disconnect();
    process.exit(1);
  });
