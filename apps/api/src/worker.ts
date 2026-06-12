import { env } from './config/env';
import { db } from './lib/db';
import { logger } from './lib/logger';
import { configurePollingWorkerStatusStore } from './polling/status';
import { createAppSettingPollingWorkerStatusStore } from './polling/statusStore';
import {
  createPollingWorkerRuntime,
  stopPollingRuntimeAndDisconnect,
} from './runtime/pollingWorkers';
import { verifyDatabaseReadiness } from './startup/databaseHealth';

async function start() {
  if (!env.databaseUrl) {
    logger.error('Polling worker process failed to start', {
      databaseUrlDetected: false,
      hint: 'Set DATABASE_URL in apps/api/.env. If it is missing there, the worker also checks the repo root .env.',
    });
    process.exit(1);
  }

  await db.$connect();
  await verifyDatabaseReadiness();
  configurePollingWorkerStatusStore(
    createAppSettingPollingWorkerStatusStore(db),
  );

  const pollingRuntime = createPollingWorkerRuntime();

  logger.info('Polling worker process started', {
    databaseHost: env.databaseHost,
    nodeEnv: env.nodeEnv,
    logLevel: env.logLevel,
  });
  pollingRuntime.logConfiguration('worker');

  const startedWorkers = pollingRuntime.startConfiguredWorkers();
  if (startedWorkers.length === 0) {
    logger.warn('Polling worker process has no active workers to start', {
      telegramPollingEnabled: env.telegramPollingEnabled,
      emailInboundPollingEnabled: env.emailInboundPollingEnabled,
    });
  }

  async function shutdown(signal: string) {
    await stopPollingRuntimeAndDisconnect({
      disconnect: () => db.$disconnect(),
      logger,
      processRole: 'worker',
      runtime: pollingRuntime,
      signal,
    });
    process.exit(0);
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

start().catch(async (error: unknown) => {
  logger.error('Polling worker process failed to start', {
    error: error instanceof Error ? error.message : 'Unknown error',
    databaseHost: env.databaseHost,
    databaseUrlDetected: Boolean(env.databaseUrl),
    hint: 'Verify DATABASE_URL points to a reachable PostgreSQL database and migrations are current.',
  });
  await db.$disconnect();
  process.exit(1);
});
