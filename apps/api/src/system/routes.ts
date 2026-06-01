import { Router } from 'express';
import { z } from 'zod';

import {
  getGraphMailPreflightStatus,
  graphMailDryRunService,
} from '../email/graphPreflight';
import { requireInternalAdminAccess } from '../http/auth';
import { asyncHandler } from '../http/errors';
import { parseRequest } from '../http/validation';
import { listPollingWorkerStatusesWithStore } from '../polling/status';
import { systemReadinessService } from './readiness';

export const systemRouter = Router();

const graphMailDryRunQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(10).optional(),
});

systemRouter.get(
  '/readiness',
  asyncHandler(async (_request, response) => {
    response.json({
      item: await systemReadinessService.getReadinessReport(),
    });
  }),
);

systemRouter.get(
  '/workers',
  asyncHandler(async (_request, response) => {
    response.json({
      items: await listPollingWorkerStatusesWithStore(),
    });
  }),
);

systemRouter.get(
  '/graph-mail-preflight',
  asyncHandler(async (_request, response) => {
    response.json({
      item: getGraphMailPreflightStatus(),
    });
  }),
);

systemRouter.get(
  '/graph-mail-dry-run',
  requireInternalAdminAccess,
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof graphMailDryRunQuerySchema>
    >(request, {
      query: graphMailDryRunQuerySchema,
    });

    response.json({
      item: await graphMailDryRunService.runDryRun({ take: query.take }),
    });
  }),
);
