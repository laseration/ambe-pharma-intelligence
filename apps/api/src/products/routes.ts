import { Router } from 'express';

import { asyncHandler } from '../http/errors';
import { listLikelyDuplicateProductGroups } from './service';

export const productsRouter = Router();

productsRouter.get('/likely-duplicates', asyncHandler(async (_request, response) => {
  response.json({
    items: await listLikelyDuplicateProductGroups(),
  });
}));
