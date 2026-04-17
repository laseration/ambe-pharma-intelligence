import { createApp } from './app';
import { env } from './config/env';
import { db } from './lib/db';
import { logger } from './lib/logger';

const app = createApp();

async function start() {
  await db.$connect();

  const server = app.listen(env.port, () => {
    logger.info('API server started', {
      port: env.port,
      nodeEnv: env.nodeEnv,
      logLevel: env.logLevel,
    });
  });

  async function shutdown(signal: string) {
    logger.info('API server stopping', { signal });

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
  });
  await db.$disconnect();
  process.exit(1);
});
