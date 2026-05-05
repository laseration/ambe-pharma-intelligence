import { Router } from 'express';

import { asyncHandler } from '../http/errors';
import { diagnosticsService } from './service';

type DiagnosticsRouteService = Pick<typeof diagnosticsService, 'getPipelineSummary'>;

export function createDiagnosticsRouter(
  service: DiagnosticsRouteService = diagnosticsService,
): Router {
  const router = Router();

  router.get('/pipeline-summary', asyncHandler(async (_request, response) => {
    response.json(await service.getPipelineSummary());
  }));

  return router;
}

export const diagnosticsRouter = createDiagnosticsRouter();
