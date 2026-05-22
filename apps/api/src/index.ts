import { createApp } from './app';
import { env } from './config/env';
import {
  createEmailInboundPollingWorker,
  isEmailInboundPollingActive,
} from './email/polling';
import { db } from './lib/db';
import { logger } from './lib/logger';
import { verifyDatabaseReadiness } from './startup/databaseHealth';
import {
  createTelegramPollingWorker,
  isTelegramPollingActive,
} from './telegram/polling';

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
  const telegramPollingWorker = createTelegramPollingWorker();
  const emailInboundPollingWorker = createEmailInboundPollingWorker();

  const server = app.listen(env.port, () => {
    logger.info('API server started', {
      databaseHost: env.databaseHost,
      port: env.port,
      nodeEnv: env.nodeEnv,
      logLevel: env.logLevel,
    });

    logger.info('Telegram polling configuration', {
      enabled: isTelegramPollingActive(),
      intervalMs: env.telegramPollingIntervalMs,
    });
    logger.info('Email inbox polling configuration', {
      enabled: isEmailInboundPollingActive(),
      intervalMs: env.emailInboundPollingIntervalMs,
      mailbox: env.microsoftGraphSenderMailbox || null,
    });

    if (env.telegramPollingEnabled && !env.telegramBotToken) {
      logger.warn(
        'Telegram polling is enabled but TELEGRAM_BOT_TOKEN is missing',
      );
    }

    if (isTelegramPollingActive()) {
      telegramPollingWorker.start();
    }

    if (isEmailInboundPollingActive()) {
      emailInboundPollingWorker.start();
    }
  });

  async function shutdown(signal: string) {
    logger.info('API server stopping', { signal });
    telegramPollingWorker.stop();
    emailInboundPollingWorker.stop();

    server.close(async () => {
      await db.$disconnect();
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
