import express from 'express';

import { env } from './config/env';
import { requireInternalAdminAccess } from './http/auth';
import { errorHandler } from './http/errors';
import { requestContextMiddleware } from './http/requestContext';
import { importsDebugRouter } from './imports/debugRoutes';
import { apiRouter } from './routes';
import { publicTradeEnquiriesRouter } from './tradeEnquiries/routes';

export function createApp() {
  const app = express();

  app.use(requestContextMiddleware);

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      environment: env.nodeEnv,
    });
  });

  if (env.enableDebugRoutes) {
    app.get(
      '/api/debug/env',
      requireInternalAdminAccess,
      (_request, response) => {
        response.json({
          databaseUrlDetected: Boolean(env.databaseUrl),
        });
      },
    );
    app.use('/api/debug', requireInternalAdminAccess, importsDebugRouter);
  }

  app.use(
    '/public',
    express.json({ limit: '16kb', strict: true }),
    publicTradeEnquiriesRouter,
  );
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
