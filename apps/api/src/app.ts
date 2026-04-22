import express from 'express';

import { env } from './config/env';
import { requireInternalAdminAccess } from './http/auth';
import { errorHandler } from './http/errors';
import { importsDebugRouter } from './imports/debugRoutes';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      environment: env.nodeEnv,
    });
  });

  if (env.enableDebugRoutes) {
    app.get('/api/debug/env', requireInternalAdminAccess, (_request, response) => {
      response.json({
        databaseUrlDetected: Boolean(env.databaseUrl),
      });
    });
    app.use('/api/debug', requireInternalAdminAccess, importsDebugRouter);
  }

  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
