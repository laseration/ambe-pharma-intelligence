import { createApp } from './app';
import { env } from './config/env';
import { db } from './lib/db';
import { logger } from './lib/logger';
import { loadActiveOrganizationConfig } from './organization/activeOrganizationConfig';
import { configurePollingWorkerStatusStore } from './polling/status';
import { createAppSettingPollingWorkerStatusStore } from './polling/statusStore';
import {
  createPollingWorkerRuntime,
  startApiPollingWorkersIfEnabled,
  stopPollingRuntimeAndDisconnect,
} from './runtime/pollingWorkers';
import { verifyDatabaseReadiness } from './startup/databaseHealth';

const app = createApp();

async function start() {
  if (!env.databaseUrl) {
    logger.error('API server failed to start', {
      databaseUrlDetected: false,
      hint: 'Set DATABASE_URL in apps/api/.env. If it is missing there, the API also checks the repo root .env.',
    });
    process.exit(1);
  }

  await db.$connect();
  await verifyDatabaseReadiness();
  try {
    const activeOrganization = await loadActiveOrganizationConfig();
    logger.info('Active organisation config loaded', {
      organizationId: activeOrganization?.organizationId ?? null,
      seeded: Boolean(activeOrganization),
    });
  } catch (error: unknown) {
    logger.warn(
      'Active organisation config not loaded; using environment fallback',
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
  }
  configurePollingWorkerStatusStore(
    createAppSettingPollingWorkerStatusStore(db),
  );
  const pollingRuntime = createPollingWorkerRuntime();

  const server = app.listen(env.port, () => {
    logger.info('API server started', {
      databaseHost: env.databaseHost,
      port: env.port,
      nodeEnv: env.nodeEnv,
      logLevel: env.logLevel,
    });

    pollingRuntime.logConfiguration('api');
    startApiPollingWorkersIfEnabled(pollingRuntime);
  });

  async function shutdown(signal: string) {
    logger.info('API server stopping', { signal });

    server.close(async () => {
      await stopPollingRuntimeAndDisconnect({
        disconnect: () => db.$disconnect(),
        logger,
        processRole: 'api',
        runtime: pollingRuntime,
        signal,
      });
      process.exit(0);
    });
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

start().catch(async (error: unknown) => {
  logger.error('API server failed to start', {
    error: error instanceof Error ? error.message : 'Unknown error',
    databaseHost: env.databaseHost,
    databaseUrlDetected: Boolean(env.databaseUrl),
    hint: 'Verify DATABASE_URL points to a reachable Neon PostgreSQL database with sslmode=require. apps/api/.env is checked first, then the repo root .env.',
  });
  await db.$disconnect();
  process.exit(1);
});
