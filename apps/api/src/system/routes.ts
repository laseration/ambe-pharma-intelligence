import { Router } from 'express';

import { asyncHandler } from '../http/errors';
import { listPollingWorkerStatuses } from '../polling/status';
import { systemReadinessService } from './readiness';

export const systemRouter = Router();

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
      items: listPollingWorkerStatuses(),
    });
  }),
);
