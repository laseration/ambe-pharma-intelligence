import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../http/errors';
import { idParamSchema, parseRequest } from '../http/validation';
import { purchaseOrderService } from '../purchaseOrders/service';
import { listLikelyDuplicateProductGroups } from './service';

export const productsRouter = Router();

productsRouter.get('/likely-duplicates', asyncHandler(async (_request, response) => {
  response.json({
    items: await listLikelyDuplicateProductGroups(),
  });
}));

productsRouter.get('/:id/purchase-history', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });
  const history = await purchaseOrderService.getProductPurchaseHistory(params.id);

  response.json({
    item: history,
  });
}));
