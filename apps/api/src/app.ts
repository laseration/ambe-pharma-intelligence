import express from 'express';

import { env } from './config/env';
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

  app.use('/api', apiRouter);

  return app;
}
